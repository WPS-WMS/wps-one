import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken, authMiddleware } from "../lib/auth.js";
import rateLimit from "express-rate-limit";
import { errorSummary } from "../lib/devLog.js";
import { isTenantSignupAllowed } from "../lib/deployEnv.js";
import {
  computeNextSubscriptionPaymentAt,
  isSubscriptionPaymentMethodId,
  normalizeAddonSeats,
  resolveNextPaymentAt,
  serializePlan,
  SUBSCRIPTION_PAYMENT_METHODS,
} from "../lib/platformPlans.js";
import {
  findPlatformPlanById,
  listPlatformPlans,
  subscriptionPayloadForTenant,
  TENANT_SUBSCRIPTION_SELECT,
} from "../lib/subscriptionHelpers.js";
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
      select: TENANT_SUBSCRIPTION_SELECT,
    });
    if (!tenant) {
      res.status(404).json({ error: "Organização não encontrada." });
      return;
    }
    const usage = await getTenantUsageSnapshot(tenant.id);
    const subscription = subscriptionPayloadForTenant(tenant, usage.billableUsersActive);
    const plans = await listPlatformPlans({ activeOnly: true });
    res.json({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      usage: {
        usersTotal: usage.usersTotal,
        usersActive: usage.usersActive,
        billableUsersActive: usage.billableUsersActive,
      },
      subscription,
      plans: plans.map(serializePlan),
      paymentMethods: Object.values(SUBSCRIPTION_PAYMENT_METHODS).map((m) => ({
        id: m.id,
        label: m.label,
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
  const planRaw = body.planId ?? body.plan;
  let planId: string | null | undefined = undefined;
  let planRecord = null as Awaited<ReturnType<typeof findPlatformPlanById>>;
  if (planRaw !== undefined) {
    if (planRaw === null || planRaw === "" || planRaw === "none") {
      planId = null;
    } else {
      planRecord = await findPlatformPlanById(String(planRaw));
      if (!planRecord || !planRecord.active) {
        res.status(400).json({ error: "Plano inválido ou inativo." });
        return;
      }
      planId = planRecord.id;
    }
  }

  const methodRaw = body.paymentMethod;
  let paymentMethod: string | null | undefined = undefined;
  if (methodRaw !== undefined) {
    if (methodRaw === null || methodRaw === "") {
      paymentMethod = null;
    } else if (isSubscriptionPaymentMethodId(methodRaw)) {
      paymentMethod = methodRaw;
    } else {
      res.status(400).json({ error: "Forma de pagamento inválida." });
      return;
    }
  }

  const addonSeatsRaw = body.addonSeats;
  const hasAddonSeatsPayload =
    addonSeatsRaw != null && typeof addonSeatsRaw === "object" && !Array.isArray(addonSeatsRaw);

  try {
    const existing = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: TENANT_SUBSCRIPTION_SELECT,
    });
    if (!existing) {
      res.status(404).json({ error: "Organização não encontrada." });
      return;
    }

    // Em cancelamento agendado, não permite trocar plano por aqui — use reativação explícita.
    if (
      existing.subscriptionStatus === "canceling" &&
      planId === undefined &&
      paymentMethod === undefined &&
      !hasAddonSeatsPayload
    ) {
      res.status(400).json({ error: "Assinatura em cancelamento. Nenhuma alteração pendente." });
      return;
    }

    const nextPlanId = planId !== undefined ? planId : existing.subscriptionPlanId;
    let nextStarted = existing.subscriptionStartedAt;
    let nextPayment = existing.subscriptionNextPaymentAt;
    let nextMethod =
      paymentMethod !== undefined ? paymentMethod : existing.subscriptionPaymentMethod;
    let nextStatus = existing.subscriptionStatus ?? (nextPlanId ? "active" : "none");
    let nextCanceledAt = existing.subscriptionCanceledAt;
    let nextAccessUntil = existing.subscriptionAccessUntil;

    if (planId !== undefined) {
      if (nextPlanId) {
        if (!nextStarted) nextStarted = new Date();
        if (nextStarted && !nextPayment) {
          nextPayment = computeNextSubscriptionPaymentAt(nextStarted);
        }
        nextStatus = "active";
        nextCanceledAt = null;
        nextAccessUntil = null;
      } else {
        // Limpar plano imediatamente só se ainda não estava ativo com período.
        nextStarted = null;
        nextPayment = null;
        nextMethod = null;
        nextStatus = "none";
        nextCanceledAt = null;
        nextAccessUntil = null;
      }
    }

    const resolvedPlan =
      planRecord ??
      (nextPlanId ? await findPlatformPlanById(nextPlanId) : null);

    const usage = await getTenantUsageSnapshot(existing.id);
    const nextAddonSeats = nextPlanId
      ? normalizeAddonSeats(
          hasAddonSeatsPayload
            ? (addonSeatsRaw as { sharepoint?: number; comercial?: number; rh?: number })
            : {
                sharepoint: existing.subscriptionAddonSharepointUsers,
                comercial: existing.subscriptionAddonComercialUsers,
                rh: existing.subscriptionAddonRhUsers,
              },
          resolvedPlan,
          usage.billableUsersActive,
        )
      : { sharepoint: 0, comercial: 0, rh: 0 };

    const updated = await prisma.tenant.update({
      where: { id: existing.id },
      data: {
        subscriptionPlanId: nextPlanId,
        subscriptionPlan: resolvedPlan?.code ?? resolvedPlan?.name ?? null,
        subscriptionStartedAt: nextStarted,
        subscriptionNextPaymentAt: nextPayment,
        subscriptionPaymentMethod: nextMethod,
        subscriptionStatus: nextStatus,
        subscriptionCanceledAt: nextCanceledAt,
        subscriptionAccessUntil: nextAccessUntil,
        subscriptionAddonSharepointUsers: nextAddonSeats.sharepoint,
        subscriptionAddonComercialUsers: nextAddonSeats.comercial,
        subscriptionAddonRhUsers: nextAddonSeats.rh,
      },
      select: TENANT_SUBSCRIPTION_SELECT,
    });

    const usageAfter = await getTenantUsageSnapshot(updated.id);
    const subscription = subscriptionPayloadForTenant(updated, usageAfter.billableUsersActive);

    res.json({
      tenant: { id: updated.id, name: updated.name, slug: updated.slug },
      usage: {
        usersTotal: usageAfter.usersTotal,
        usersActive: usageAfter.usersActive,
        billableUsersActive: usageAfter.billableUsersActive,
      },
      subscription,
    });
  } catch (err) {
    console.error("[tenants] PATCH me/subscription", errorSummary(err));
    res.status(500).json({ error: "Erro ao atualizar assinatura." });
  }
});

/** Cancela a assinatura: acesso permanece até a próxima parcela (aniversário). */
tenantsRouter.post("/me/subscription/cancel", authMiddleware, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  if (String(user.role || "").toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Apenas o Super administrador pode cancelar a assinatura." });
    return;
  }
  try {
    const existing = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: TENANT_SUBSCRIPTION_SELECT,
    });
    if (!existing) {
      res.status(404).json({ error: "Organização não encontrada." });
      return;
    }
    if (!existing.subscriptionPlanId) {
      res.status(400).json({ error: "Não há assinatura ativa para cancelar." });
      return;
    }
    if (existing.subscriptionStatus === "locked") {
      res.status(400).json({ error: "A assinatura já está encerrada." });
      return;
    }
    if (existing.subscriptionStatus === "canceling" && existing.subscriptionAccessUntil) {
      const usage = await getTenantUsageSnapshot(existing.id);
      res.json({
        tenant: { id: existing.id, name: existing.name, slug: existing.slug },
        usage: {
          usersTotal: usage.usersTotal,
          usersActive: usage.usersActive,
          billableUsersActive: usage.billableUsersActive,
        },
        subscription: subscriptionPayloadForTenant(existing, usage.billableUsersActive),
        message: "Cancelamento já estava agendado.",
      });
      return;
    }

    const startedAt = existing.subscriptionStartedAt ?? new Date();
    const accessUntil =
      resolveNextPaymentAt({
        startedAt,
        nextPaymentAt: existing.subscriptionNextPaymentAt,
      }) ?? computeNextSubscriptionPaymentAt(startedAt);

    const updated = await prisma.tenant.update({
      where: { id: existing.id },
      data: {
        subscriptionStatus: "canceling",
        subscriptionCanceledAt: new Date(),
        subscriptionAccessUntil: accessUntil,
        subscriptionNextPaymentAt: accessUntil,
      },
      select: TENANT_SUBSCRIPTION_SELECT,
    });

    const usage = await getTenantUsageSnapshot(updated.id);
    res.json({
      tenant: { id: updated.id, name: updated.name, slug: updated.slug },
      usage: {
        usersTotal: usage.usersTotal,
        usersActive: usage.usersActive,
        billableUsersActive: usage.billableUsersActive,
      },
      subscription: subscriptionPayloadForTenant(updated, usage.billableUsersActive),
      message: `Assinatura cancelada. Você pode usar a plataforma até ${accessUntil.toLocaleDateString("pt-BR")}.`,
    });
  } catch (err) {
    console.error("[tenants] POST me/subscription/cancel", errorSummary(err));
    res.status(500).json({ error: "Erro ao cancelar assinatura." });
  }
});
