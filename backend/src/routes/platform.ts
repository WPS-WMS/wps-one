import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hashPassword } from "../lib/auth.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { formatStorageBytes, getTenantUsageSnapshot } from "../lib/platformTenantUsage.js";
import {
  computeNextSubscriptionPaymentAt,
  isSubscriptionPaymentMethodId,
  serializePlan,
  SUBSCRIPTION_PAYMENT_METHODS,
} from "../lib/platformPlans.js";
import {
  findPlatformPlanById,
  listPlatformPlans,
  subscriptionPayloadForTenant,
  TENANT_SUBSCRIPTION_SELECT,
} from "../lib/subscriptionHelpers.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { errorSummary } from "../lib/devLog.js";

export const platformRouter = Router();
platformRouter.use(authMiddleware);

type AuthedUser = { id: string; email: string; role: string; tenantId: string };

async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    if (!(await isPlatformAdmin(user))) {
      res.status(403).json({ error: "Sem permissão para o painel da plataforma." });
      return;
    }
    next();
  } catch (err) {
    console.error("[platform] auth", errorSummary(err));
    res.status(500).json({ error: "Erro ao validar acesso da plataforma." });
  }
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function slugifyTenantName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueTenantSlug(base: string): Promise<string> {
  const root = base || `empresa-${Date.now().toString(36)}`;
  let slug = root;
  let n = 2;
  while (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${n}`.slice(0, 60);
    n += 1;
  }
  return slug;
}

function parseOptionalDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00.000Z` : s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

platformRouter.get("/access", async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    const allowed = await isPlatformAdmin(user);
    res.json({ platformAdmin: allowed });
  } catch (err) {
    console.error("[platform] access", errorSummary(err));
    res.status(500).json({ error: "Erro ao validar acesso." });
  }
});

platformRouter.get("/plans", requirePlatformAdmin, async (_req, res) => {
  try {
    const plans = await listPlatformPlans();
    res.json({ plans: plans.map(serializePlan) });
  } catch (err) {
    console.error("[platform] plans list", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar planos." });
  }
});

platformRouter.post("/plans", requirePlatformAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const priceRaw = Number(body.priceCentsPerUser);
  if (!name) {
    res.status(400).json({ error: "Nome do plano é obrigatório." });
    return;
  }
  if (!Number.isFinite(priceRaw) || priceRaw < 0) {
    res.status(400).json({ error: "Preço por usuário inválido." });
    return;
  }
  const codeRaw = String(body.code ?? "").trim().toUpperCase();
  const code = codeRaw || null;
  try {
    if (code) {
      const exists = await prisma.platformPlan.findUnique({ where: { code }, select: { id: true } });
      if (exists) {
        res.status(400).json({ error: "Já existe um plano com este código." });
        return;
      }
    }
    const maxSort = await prisma.platformPlan.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.platformPlan.create({
      data: {
        name,
        code,
        priceCentsPerUser: Math.round(priceRaw),
        moduleProjetos: body.moduleProjetos !== false,
        moduleFinanceiro: body.moduleFinanceiro !== false,
        modulePortal: body.modulePortal !== false,
        active: body.active !== false,
        sortOrder: Number.isFinite(Number(body.sortOrder))
          ? Math.round(Number(body.sortOrder))
          : (maxSort._max.sortOrder ?? 0) + 10,
      },
    });
    res.status(201).json({ plan: serializePlan(created) });
  } catch (err) {
    console.error("[platform] plans create", errorSummary(err));
    res.status(500).json({ error: "Erro ao criar plano." });
  }
});

platformRouter.patch("/plans/:id", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o plano." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const existing = await findPlatformPlanById(id);
    if (!existing) {
      res.status(404).json({ error: "Plano não encontrado." });
      return;
    }
    const data: {
      name?: string;
      code?: string | null;
      priceCentsPerUser?: number;
      moduleProjetos?: boolean;
      moduleFinanceiro?: boolean;
      modulePortal?: boolean;
      active?: boolean;
      sortOrder?: number;
    } = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        res.status(400).json({ error: "Nome do plano é obrigatório." });
        return;
      }
      data.name = name;
    }
    if (body.code !== undefined) {
      const codeRaw = String(body.code ?? "").trim().toUpperCase();
      data.code = codeRaw || null;
      if (data.code) {
        const clash = await prisma.platformPlan.findFirst({
          where: { code: data.code, NOT: { id } },
          select: { id: true },
        });
        if (clash) {
          res.status(400).json({ error: "Já existe um plano com este código." });
          return;
        }
      }
    }
    if (body.priceCentsPerUser !== undefined) {
      const priceRaw = Number(body.priceCentsPerUser);
      if (!Number.isFinite(priceRaw) || priceRaw < 0) {
        res.status(400).json({ error: "Preço por usuário inválido." });
        return;
      }
      data.priceCentsPerUser = Math.round(priceRaw);
    }
    if (body.moduleProjetos !== undefined) data.moduleProjetos = !!body.moduleProjetos;
    if (body.moduleFinanceiro !== undefined) data.moduleFinanceiro = !!body.moduleFinanceiro;
    if (body.modulePortal !== undefined) data.modulePortal = !!body.modulePortal;
    if (body.active !== undefined) data.active = !!body.active;
    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
      data.sortOrder = Math.round(Number(body.sortOrder));
    }
    const updated = await prisma.platformPlan.update({ where: { id }, data });
    res.json({ plan: serializePlan(updated) });
  } catch (err) {
    console.error("[platform] plans patch", errorSummary(err));
    res.status(500).json({ error: "Erro ao atualizar plano." });
  }
});

platformRouter.delete("/plans/:id", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o plano." });
    return;
  }
  try {
    const inUse = await prisma.tenant.count({ where: { subscriptionPlanId: id } });
    if (inUse > 0) {
      // Soft-disable em vez de apagar planos em uso.
      const updated = await prisma.platformPlan.update({
        where: { id },
        data: { active: false },
      });
      res.json({ plan: serializePlan(updated), deactivated: true });
      return;
    }
    await prisma.platformPlan.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[platform] plans delete", errorSummary(err));
    res.status(500).json({ error: "Erro ao remover plano." });
  }
});

/**
 * Cadastra empresa (tenant) + SUPER_ADMIN inicial (e-mail informado).
 * Senha temporária gerada; o admin deve trocar no primeiro acesso.
 */
platformRouter.post("/tenants", requirePlatformAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const companyName = String(body.companyName ?? body.name ?? "").trim();
  const emailNorm = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const cnpj = onlyDigits(body.cnpj);
  const phone = onlyDigits(body.phone ?? body.telefone);
  const adminName =
    String(body.adminName ?? "").trim() ||
    companyName ||
    emailNorm.split("@")[0] ||
    "Administrador";

  if (!companyName) {
    res.status(400).json({ error: "Nome da empresa é obrigatório." });
    return;
  }
  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    res.status(400).json({ error: "E-mail do administrador inválido." });
    return;
  }
  if (cnpj.length !== 14) {
    res.status(400).json({ error: "CNPJ deve ter 14 dígitos." });
    return;
  }
  if (phone.length < 10 || phone.length > 13) {
    res.status(400).json({ error: "Telefone inválido." });
    return;
  }

  try {
    const existingEmail = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (existingEmail) {
      res.status(400).json({ error: "E-mail já cadastrado em outra organização." });
      return;
    }

    const slug = await uniqueTenantSlug(slugifyTenantName(companyName));
    const temporaryPassword = `Wps${randomBytes(4).toString("hex")}!`;
    const passwordHash = await hashPassword(temporaryPassword);

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
        },
      });

      await tx.tenantCompanyProfile.create({
        data: {
          tenantId: tenant.id,
          nomeFantasia: companyName,
          razaoSocial: companyName,
          cnpj,
          telefone: phone,
          email: emailNorm,
        },
      });

      const user = await tx.user.create({
        data: {
          email: emailNorm,
          name: adminName,
          passwordHash,
          role: "SUPER_ADMIN",
          tenantId: tenant.id,
          cargo: "Administrador",
          mustChangePassword: true,
          ativo: true,
          cargaHorariaSemanal: 40,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
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

    try {
      await ensureFinanceDefaults(created.tenant.id);
    } catch (seedErr) {
      console.error("[platform] finance defaults", errorSummary(seedErr));
    }

    const usage = await getTenantUsageSnapshot(created.tenant.id);
    const tenantRow = await prisma.tenant.findUnique({
      where: { id: created.tenant.id },
      select: TENANT_SUBSCRIPTION_SELECT,
    });
    const subscription = subscriptionPayloadForTenant(tenantRow!, usage.billableUsersActive);

    res.status(201).json({
      id: created.tenant.id,
      name: created.tenant.name,
      slug: created.tenant.slug,
      createdAt: created.tenant.createdAt.toISOString(),
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription,
      admin: created.user,
      temporaryPassword,
      message:
        "Empresa criada. Envie o e-mail e a senha temporária ao SUPER_ADMIN para o primeiro acesso.",
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      res.status(400).json({ error: "E-mail ou empresa já cadastrados." });
      return;
    }
    console.error("[platform] create tenant", errorSummary(err));
    res.status(500).json({ error: "Erro ao cadastrar empresa." });
  }
});

platformRouter.get("/tenants", requirePlatformAdmin, async (_req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        ...TENANT_SUBSCRIPTION_SELECT,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = await Promise.all(
      tenants.map(async (t) => {
        const usage = await getTenantUsageSnapshot(t.id);
        const subscription = subscriptionPayloadForTenant(t, usage.billableUsersActive);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          usage: {
            ...usage,
            storageFormatted: formatStorageBytes(usage.storageBytes),
          },
          subscription,
        };
      }),
    );

    const totals = items.reduce(
      (acc, row) => {
        acc.tenants += 1;
        acc.subscribedTenants += row.subscription.planId ? 1 : 0;
        acc.usersActive += row.usage.usersActive;
        acc.billableUsersActive += row.usage.billableUsersActive;
        acc.monthlyBillingCents += row.subscription.monthlyAmountCents;
        acc.storageBytes += row.usage.storageBytes;
        return acc;
      },
      {
        tenants: 0,
        subscribedTenants: 0,
        usersActive: 0,
        billableUsersActive: 0,
        monthlyBillingCents: 0,
        storageBytes: 0,
      },
    );

    const plans = await listPlatformPlans({ activeOnly: true });

    res.json({
      items,
      totals: {
        ...totals,
        monthlyBillingFormatted: (totals.monthlyBillingCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        storageFormatted: formatStorageBytes(totals.storageBytes),
      },
      plans: plans.map(serializePlan),
    });
  } catch (err) {
    console.error("[platform] tenants list", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar tenants." });
  }
});

platformRouter.get("/tenants/:id", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o tenant." });
    return;
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        ...TENANT_SUBSCRIPTION_SELECT,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado." });
      return;
    }

    const usage = await getTenantUsageSnapshot(tenant.id);
    const subscription = subscriptionPayloadForTenant(tenant, usage.billableUsersActive);

    const recentUsers = await prisma.user.findMany({
      where: { tenantId: tenant.id, role: { not: "PLATFORM_ADMIN" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        ativo: true,
        updatedAt: true,
      },
    });

    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription,
      recentUsers: recentUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        ativo: u.ativo,
        updatedAt: u.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[platform] tenant detail", errorSummary(err));
    res.status(500).json({ error: "Erro ao carregar tenant." });
  }
});

platformRouter.patch("/tenants/:id/subscription", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o tenant." });
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

  const startedAt = parseOptionalDate(body.startedAt);
  if (body.startedAt !== undefined && startedAt === undefined) {
    res.status(400).json({ error: "Data de início da assinatura inválida." });
    return;
  }
  const nextPaymentAt = parseOptionalDate(body.nextPaymentAt);
  if (body.nextPaymentAt !== undefined && nextPaymentAt === undefined) {
    res.status(400).json({ error: "Data da próxima parcela inválida." });
    return;
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

  try {
    const existing = await prisma.tenant.findUnique({
      where: { id },
      select: TENANT_SUBSCRIPTION_SELECT,
    });
    if (!existing) {
      res.status(404).json({ error: "Tenant não encontrado." });
      return;
    }

    const nextPlanId = planId !== undefined ? planId : existing.subscriptionPlanId;
    let nextStarted =
      startedAt !== undefined ? startedAt : existing.subscriptionStartedAt;
    let nextPayment =
      nextPaymentAt !== undefined ? nextPaymentAt : existing.subscriptionNextPaymentAt;
    let nextMethod =
      paymentMethod !== undefined ? paymentMethod : existing.subscriptionPaymentMethod;

    if (nextPlanId && !nextStarted) {
      nextStarted = new Date();
    }
    if (nextPlanId && nextStarted && !nextPayment) {
      nextPayment = computeNextSubscriptionPaymentAt(nextStarted);
    }
    if (!nextPlanId) {
      nextStarted = null;
      nextPayment = null;
      nextMethod = null;
    }

    const resolvedPlan =
      planRecord ??
      (nextPlanId ? await findPlatformPlanById(nextPlanId) : null);

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        subscriptionPlanId: nextPlanId,
        subscriptionPlan: resolvedPlan?.code ?? resolvedPlan?.name ?? null,
        subscriptionStartedAt: nextStarted,
        subscriptionNextPaymentAt: nextPayment,
        subscriptionPaymentMethod: nextMethod,
        subscriptionStatus: nextPlanId ? "active" : "none",
        subscriptionCanceledAt: null,
        subscriptionAccessUntil: null,
      },
      select: TENANT_SUBSCRIPTION_SELECT,
    });

    const usage = await getTenantUsageSnapshot(updated.id);
    const subscription = subscriptionPayloadForTenant(updated, usage.billableUsersActive);

    res.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription,
    });
  } catch (err) {
    console.error("[platform] subscription patch", errorSummary(err));
    res.status(500).json({ error: "Erro ao atualizar assinatura." });
  }
});
