import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken, authMiddleware } from "../lib/auth.js";
import rateLimit from "express-rate-limit";
import { errorSummary } from "../lib/devLog.js";
import { isTenantSignupAllowed } from "../lib/deployEnv.js";
import {
  buildSubscriptionPayload,
  computeNextSubscriptionPaymentAt,
  isPlatformPlanId,
  PLATFORM_PLANS,
} from "../lib/platformPlans.js";
import { getTenantUsageSnapshot } from "../lib/platformTenantUsage.js";

export const tenantsRouter = Router();

type AuthedUser = { id: string; email: string; role: string; tenantId: string };

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de cadastro. Tente novamente em alguns minutos." },
});

function parseOptionalDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00.000Z` : s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Cadastro de novo tenant (organização) com usuário admin inicial.
 * Em produção: desativado salvo `TENANT_SIGNUP_SECRET` + header `X-Tenant-Signup-Key`.
 */
tenantsRouter.post("/signup", signupLimiter, async (req, res) => {
  if (!isTenantSignupAllowed(req)) {
    res.status(404).json({ error: "Não encontrado" });
    return;
  }
  try {
    const { tenantName, tenantSlug, email, name, password } = req.body;
    if (!tenantName || !tenantSlug || !email || !name || !password) {
      res.status(400).json({
        error: "Nome da empresa, slug, e-mail, nome e senha são obrigatórios",
      });
      return;
    }
    const slug = String(tenantSlug).trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({
        error: "Slug deve conter apenas letras minúsculas, números e hífens",
      });
      return;
    }
    const emailNorm = String(email).trim().toLowerCase();

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });
    if (existingTenant) {
      res.status(400).json({ error: "Já existe uma organização com este slug" });
      return;
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (existingEmail) {
      res.status(400).json({ error: "E-mail já cadastrado em outra organização" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { tenant, user } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: String(tenantName).trim(),
          slug,
        },
      });

      const user = await tx.user.create({
        data: {
          email: emailNorm,
          name: String(name).trim(),
          passwordHash,
          role: "SUPER_ADMIN",
          tenantId: tenant.id,
          cargo: "Administrador",
          cargaHorariaSemanal: 40,
        },
      });

      await tx.activity.createMany({
        data: [
          { name: "Desenvolvimento", tenantId: tenant.id },
          { name: "Configuração", tenantId: tenant.id },
          { name: "Reunião", tenantId: tenant.id },
          { name: "Consultoria", tenantId: tenant.id },
        ],
      });

      return { tenant, user };
    });
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "SUPER_ADMIN",
      tenantId: user.tenantId,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "P2002") {
      res.status(400).json({ error: "E-mail ou slug já cadastrado" });
      return;
    }
    console.error("POST /api/tenants/signup error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao criar organização" });
  }
});

/** Assinatura do tenant logado (SUPER_ADMIN). */
tenantsRouter.get("/me/subscription", authMiddleware, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  if (String(user.role || "").toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Apenas o Super administrador pode gerenciar a assinatura." });
    return;
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        subscriptionStartedAt: true,
        subscriptionNextPaymentAt: true,
      },
    });
    if (!tenant) {
      res.status(404).json({ error: "Organização não encontrada." });
      return;
    }
    const usage = await getTenantUsageSnapshot(tenant.id);
    const subscription = buildSubscriptionPayload({
      plan: tenant.subscriptionPlan,
      startedAt: tenant.subscriptionStartedAt,
      nextPaymentAt: tenant.subscriptionNextPaymentAt,
      billableUsersActive: usage.billableUsersActive,
    });
    res.json({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      usage: {
        usersTotal: usage.usersTotal,
        usersActive: usage.usersActive,
        billableUsersActive: usage.billableUsersActive,
      },
      subscription,
      plans: Object.values(PLATFORM_PLANS).map((p) => ({
        id: p.id,
        label: p.label,
        priceCentsPerUser: p.priceCentsPerUser,
        pricePerUserFormatted: (p.priceCentsPerUser / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
      })),
    });
  } catch (err) {
    console.error("[tenants] GET me/subscription", errorSummary(err));
    res.status(500).json({ error: "Erro ao carregar assinatura." });
  }
});

tenantsRouter.patch("/me/subscription", authMiddleware, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  if (String(user.role || "").toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Apenas o Super administrador pode alterar a assinatura." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const planRaw = body.plan;
  let plan: string | null | undefined = undefined;
  if (planRaw !== undefined) {
    if (planRaw === null || planRaw === "" || planRaw === "none") {
      plan = null;
    } else if (isPlatformPlanId(planRaw)) {
      plan = planRaw;
    } else {
      res.status(400).json({ error: "Plano inválido. Use STANDARD ou PREMIUM." });
      return;
    }
  }

  const startedAt = parseOptionalDate(body.startedAt);
  if (body.startedAt !== undefined && startedAt === undefined) {
    res.status(400).json({ error: "Data de início inválida." });
    return;
  }
  const nextPaymentAt = parseOptionalDate(body.nextPaymentAt);
  if (body.nextPaymentAt !== undefined && nextPaymentAt === undefined) {
    res.status(400).json({ error: "Data da próxima parcela inválida." });
    return;
  }

  try {
    const existing = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        subscriptionStartedAt: true,
        subscriptionNextPaymentAt: true,
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Organização não encontrada." });
      return;
    }

    const nextPlan = plan !== undefined ? plan : existing.subscriptionPlan;
    let nextStarted = startedAt !== undefined ? startedAt : existing.subscriptionStartedAt;
    let nextPayment =
      nextPaymentAt !== undefined ? nextPaymentAt : existing.subscriptionNextPaymentAt;

    if (nextPlan && !nextStarted) {
      nextStarted = new Date();
    }
    if (nextPlan && nextStarted && !nextPayment) {
      nextPayment = computeNextSubscriptionPaymentAt(nextStarted);
    }
    if (!nextPlan) {
      nextStarted = null;
      nextPayment = null;
    }

    const updated = await prisma.tenant.update({
      where: { id: existing.id },
      data: {
        subscriptionPlan: nextPlan,
        subscriptionStartedAt: nextStarted,
        subscriptionNextPaymentAt: nextPayment,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        subscriptionStartedAt: true,
        subscriptionNextPaymentAt: true,
      },
    });

    const usage = await getTenantUsageSnapshot(updated.id);
    const subscription = buildSubscriptionPayload({
      plan: updated.subscriptionPlan,
      startedAt: updated.subscriptionStartedAt,
      nextPaymentAt: updated.subscriptionNextPaymentAt,
      billableUsersActive: usage.billableUsersActive,
    });

    res.json({
      tenant: { id: updated.id, name: updated.name, slug: updated.slug },
      usage: {
        usersTotal: usage.usersTotal,
        usersActive: usage.usersActive,
        billableUsersActive: usage.billableUsersActive,
      },
      subscription,
    });
  } catch (err) {
    console.error("[tenants] PATCH me/subscription", errorSummary(err));
    res.status(500).json({ error: "Erro ao atualizar assinatura." });
  }
});
