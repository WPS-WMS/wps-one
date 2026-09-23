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
  listAddonAssigneesFromUsers,
  listPlatformPlans,
  subscriptionPayloadForTenant,
  TENANT_SUBSCRIPTION_SELECT,
} from "../lib/subscriptionHelpers.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { ensureTenantUserProfiles } from "../lib/tenantUserProfiles.js";
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
        moduleSharepoint: body.moduleSharepoint === true,
        moduleComercial: body.moduleComercial === true,
        moduleRh: body.moduleRh === true,
        addonSharepointCentsPerUser:
          body.moduleSharepoint === true
            ? Math.max(0, Math.round(Number(body.addonSharepointCentsPerUser) || 0))
            : 0,
        addonComercialCentsPerUser:
          body.moduleComercial === true
            ? Math.max(0, Math.round(Number(body.addonComercialCentsPerUser) || 0))
            : 0,
        addonRhCentsPerUser:
          body.moduleRh === true
            ? Math.max(0, Math.round(Number(body.addonRhCentsPerUser) || 0))
            : 0,
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
      moduleSharepoint?: boolean;
      moduleComercial?: boolean;
      moduleRh?: boolean;
      addonSharepointCentsPerUser?: number;
      addonComercialCentsPerUser?: number;
      addonRhCentsPerUser?: number;
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
    if (body.moduleSharepoint !== undefined) data.moduleSharepoint = !!body.moduleSharepoint;
    if (body.moduleComercial !== undefined) data.moduleComercial = !!body.moduleComercial;
    if (body.moduleRh !== undefined) data.moduleRh = !!body.moduleRh;

    const nextSharepoint =
      data.moduleSharepoint !== undefined ? data.moduleSharepoint : existing.moduleSharepoint;
    const nextComercial =
      data.moduleComercial !== undefined ? data.moduleComercial : existing.moduleComercial;
    const nextRh = data.moduleRh !== undefined ? data.moduleRh : existing.moduleRh;

    if (body.addonSharepointCentsPerUser !== undefined || body.moduleSharepoint !== undefined) {
      data.addonSharepointCentsPerUser = nextSharepoint
        ? Math.max(
            0,
            Math.round(
              Number(
                body.addonSharepointCentsPerUser !== undefined
                  ? body.addonSharepointCentsPerUser
                  : existing.addonSharepointCentsPerUser,
              ) || 0,
            ),
          )
        : 0;
    }
    if (body.addonComercialCentsPerUser !== undefined || body.moduleComercial !== undefined) {
      data.addonComercialCentsPerUser = nextComercial
        ? Math.max(
            0,
            Math.round(
              Number(
                body.addonComercialCentsPerUser !== undefined
                  ? body.addonComercialCentsPerUser
                  : existing.addonComercialCentsPerUser,
              ) || 0,
            ),
          )
        : 0;
    }
    if (body.addonRhCentsPerUser !== undefined || body.moduleRh !== undefined) {
      data.addonRhCentsPerUser = nextRh
        ? Math.max(
            0,
            Math.round(
              Number(
                body.addonRhCentsPerUser !== undefined
                  ? body.addonRhCentsPerUser
                  : existing.addonRhCentsPerUser,
              ) || 0,
            ),
          )
        : 0;
    }
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

    const planRaw = body.planId ?? body.plan;
    if (planRaw === undefined || planRaw === null || planRaw === "" || planRaw === "none") {
      res.status(400).json({ error: "Selecione o plano inicial da empresa." });
      return;
    }
    const planRecord = await findPlatformPlanById(String(planRaw));
    if (!planRecord || !planRecord.active) {
      res.status(400).json({ error: "Plano inválido ou inativo." });
      return;
    }

    const startedAt = new Date();
    const nextPaymentAt = computeNextSubscriptionPaymentAt(startedAt);

    const portalModuleEnabled =
      body.portalModuleEnabled !== undefined
        ? body.portalModuleEnabled === true
        : !!planRecord.modulePortal;
    const sharepointModuleEnabled =
      body.sharepointModuleEnabled !== undefined
        ? body.sharepointModuleEnabled === true
        : !!planRecord.moduleSharepoint;

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
          subscriptionPlanId: planRecord.id,
          subscriptionPlan: planRecord.code ?? planRecord.name,
          subscriptionStartedAt: startedAt,
          subscriptionNextPaymentAt: nextPaymentAt,
          subscriptionStatus: "active",
          portalModuleEnabled,
          sharepointModuleEnabled,
          signupSource: "platform",
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
          isPrimaryAdmin: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
          isPrimaryAdmin: true,
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
    try {
      await ensureTenantUserProfiles(created.tenant.id);
    } catch (seedErr) {
      console.error("[platform] user profiles", errorSummary(seedErr));
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
    const addonAssignees = await listAddonAssigneesFromUsers(tenant.id);
    const addonSeats = {
      sharepoint: addonAssignees.sharepoint.length,
      comercial: addonAssignees.comercial.length,
      rh: addonAssignees.rh.length,
    };
    const subscription = subscriptionPayloadForTenant(
      tenant,
      usage.billableUsersActive,
      addonSeats,
      addonAssignees,
    );

    const primaryAdmin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isPrimaryAdmin: true },
      select: { id: true, name: true, email: true, role: true, ativo: true },
      orderBy: { createdAt: "asc" },
    });

    const recentUsers = await prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: { not: "PLATFORM_ADMIN" },
        isPrimaryAdmin: false,
      },
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
      signupSource: tenant.signupSource ?? null,
      employeeCountLabel: tenant.employeeCountLabel ?? null,
      companyNeed: tenant.companyNeed ?? null,
      portalModuleEnabled: tenant.portalModuleEnabled !== false,
      sharepointModuleEnabled: tenant.sharepointModuleEnabled === true,
      hasSubscriptionPlan: !!tenant.subscriptionPlanId || !!tenant.platformPlan,
      planModules: {
        portal: !!tenant.platformPlan?.modulePortal,
        sharepoint: !!tenant.platformPlan?.moduleSharepoint,
      },
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription,
      primaryAdmin: primaryAdmin
        ? {
            id: primaryAdmin.id,
            name: primaryAdmin.name,
            email: primaryAdmin.email,
            role: primaryAdmin.role,
            ativo: primaryAdmin.ativo,
          }
        : null,
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

/**
 * Atualiza nome da empresa e/ou e-mail (e nome) do SUPER_ADMIN provisionado pela Platform.
 */
platformRouter.patch("/tenants/:id", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o tenant." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const companyNameRaw = body.companyName ?? body.name;
  const adminEmailRaw = body.adminEmail ?? body.email;
  const adminNameRaw = body.adminName;
  const portalModuleEnabledRaw = body.portalModuleEnabled;
  const sharepointModuleEnabledRaw = body.sharepointModuleEnabled;
  const employeeCountLabelRaw = body.employeeCountLabel ?? body.employees;
  const companyNeedRaw = body.companyNeed ?? body.need;

  const companyName =
    companyNameRaw !== undefined ? String(companyNameRaw ?? "").trim() : undefined;
  const adminEmail =
    adminEmailRaw !== undefined
      ? String(adminEmailRaw ?? "")
          .trim()
          .toLowerCase()
      : undefined;
  const adminName =
    adminNameRaw !== undefined ? String(adminNameRaw ?? "").trim() : undefined;
  const portalModuleEnabled =
    portalModuleEnabledRaw !== undefined ? portalModuleEnabledRaw === true : undefined;
  const sharepointModuleEnabled =
    sharepointModuleEnabledRaw !== undefined ? sharepointModuleEnabledRaw === true : undefined;
  const employeeCountLabel =
    employeeCountLabelRaw !== undefined
      ? String(employeeCountLabelRaw ?? "").trim() || null
      : undefined;
  const companyNeed =
    companyNeedRaw !== undefined ? String(companyNeedRaw ?? "").trim() || null : undefined;

  if (companyName !== undefined && !companyName) {
    res.status(400).json({ error: "Nome da empresa é obrigatório." });
    return;
  }
  if (adminEmail !== undefined) {
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      res.status(400).json({ error: "E-mail do administrador inválido." });
      return;
    }
  }
  if (adminName !== undefined && !adminName) {
    res.status(400).json({ error: "Nome do administrador é obrigatório." });
    return;
  }
  if (employeeCountLabel !== undefined && employeeCountLabel && employeeCountLabel.length > 80) {
    res.status(400).json({ error: "Quantidade de colaboradores inválida." });
    return;
  }
  if (companyNeed !== undefined && companyNeed && companyNeed.length > 2000) {
    res.status(400).json({ error: "Necessidade da empresa muito longa." });
    return;
  }
  if (
    companyName === undefined &&
    adminEmail === undefined &&
    adminName === undefined &&
    portalModuleEnabled === undefined &&
    sharepointModuleEnabled === undefined &&
    employeeCountLabel === undefined &&
    companyNeed === undefined
  ) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado." });
      return;
    }

    const primaryAdmin = await prisma.user.findFirst({
      where: { tenantId: id, isPrimaryAdmin: true },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if ((adminEmail !== undefined || adminName !== undefined) && !primaryAdmin) {
      res.status(400).json({
        error: "Este tenant não tem SUPER_ADMIN provisionado pela plataforma.",
      });
      return;
    }

    if (adminEmail !== undefined && primaryAdmin && adminEmail !== primaryAdmin.email) {
      const conflict = await prisma.user.findFirst({
        where: { email: adminEmail, id: { not: primaryAdmin.id } },
        select: { id: true },
      });
      if (conflict) {
        res.status(400).json({ error: "E-mail já cadastrado em outra organização." });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (
        companyName !== undefined ||
        portalModuleEnabled !== undefined ||
        sharepointModuleEnabled !== undefined ||
        employeeCountLabel !== undefined ||
        companyNeed !== undefined
      ) {
        await tx.tenant.update({
          where: { id },
          data: {
            ...(companyName !== undefined ? { name: companyName } : {}),
            ...(portalModuleEnabled !== undefined ? { portalModuleEnabled } : {}),
            ...(sharepointModuleEnabled !== undefined ? { sharepointModuleEnabled } : {}),
            ...(employeeCountLabel !== undefined ? { employeeCountLabel } : {}),
            ...(companyNeed !== undefined ? { companyNeed } : {}),
          },
        });
      }

      if (primaryAdmin && (adminEmail !== undefined || adminName !== undefined)) {
        await tx.user.update({
          where: { id: primaryAdmin.id },
          data: {
            ...(adminEmail !== undefined ? { email: adminEmail } : {}),
            ...(adminName !== undefined ? { name: adminName } : {}),
          },
        });
      }

      if (adminEmail !== undefined) {
        await tx.tenantCompanyProfile.updateMany({
          where: { tenantId: id },
          data: { email: adminEmail },
        });
      }
    });

    const updatedTenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        ...TENANT_SUBSCRIPTION_SELECT,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!updatedTenant) {
      res.status(404).json({ error: "Tenant não encontrado." });
      return;
    }

    const usage = await getTenantUsageSnapshot(updatedTenant.id);
    const subscription = subscriptionPayloadForTenant(updatedTenant, usage.billableUsersActive);
    const updatedAdmin = await prisma.user.findFirst({
      where: { tenantId: id, isPrimaryAdmin: true },
      select: { id: true, name: true, email: true, role: true, ativo: true },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      id: updatedTenant.id,
      name: updatedTenant.name,
      slug: updatedTenant.slug,
      createdAt: updatedTenant.createdAt.toISOString(),
      updatedAt: updatedTenant.updatedAt.toISOString(),
      signupSource: updatedTenant.signupSource ?? null,
      employeeCountLabel: updatedTenant.employeeCountLabel ?? null,
      companyNeed: updatedTenant.companyNeed ?? null,
      portalModuleEnabled: updatedTenant.portalModuleEnabled !== false,
      sharepointModuleEnabled: updatedTenant.sharepointModuleEnabled === true,
      hasSubscriptionPlan: !!updatedTenant.subscriptionPlanId || !!updatedTenant.platformPlan,
      planModules: {
        portal: !!updatedTenant.platformPlan?.modulePortal,
        sharepoint: !!updatedTenant.platformPlan?.moduleSharepoint,
      },
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription,
      primaryAdmin: updatedAdmin
        ? {
            id: updatedAdmin.id,
            name: updatedAdmin.name,
            email: updatedAdmin.email,
            role: updatedAdmin.role,
            ativo: updatedAdmin.ativo,
          }
        : null,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      res.status(400).json({ error: "E-mail já cadastrado." });
      return;
    }
    console.error("[platform] tenant patch", errorSummary(err));
    res.status(500).json({ error: "Erro ao atualizar empresa." });
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

/** Métricas de aquisição (landing: cadastros e demonstrações). */
platformRouter.get("/metrics", requirePlatformAdmin, async (_req, res) => {
  try {
    const [demoCount, contactCount, landingSignupCount, landingSignups, demos, trialsActive, trialsLocked] =
      await Promise.all([
        prisma.landingLeadRequest.count({ where: { kind: "demo" } }),
        prisma.landingLeadRequest.count({ where: { kind: "contact" } }),
        prisma.tenant.count({ where: { signupSource: "landing" } }),
        prisma.tenant.findMany({
          where: { signupSource: "landing" },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            subscriptionStatus: true,
            subscriptionAccessUntil: true,
            employeeCountLabel: true,
            companyNeed: true,
            users: {
              where: { isPrimaryAdmin: true },
              take: 1,
              select: { name: true, email: true },
            },
          },
        }),
        prisma.landingLeadRequest.findMany({
          where: { kind: "demo" },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            name: true,
            company: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        }),
        prisma.tenant.count({
          where: { signupSource: "landing", subscriptionStatus: "trial" },
        }),
        prisma.tenant.count({
          where: { signupSource: "landing", subscriptionStatus: "locked" },
        }),
      ]);

    res.json({
      totals: {
        landingSignups: landingSignupCount,
        demoRequests: demoCount,
        contactRequests: contactCount,
        trialsActive,
        trialsLocked,
      },
      landingSignups: landingSignups.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt.toISOString(),
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: t.subscriptionAccessUntil?.toISOString() ?? null,
        employeeCountLabel: t.employeeCountLabel,
        companyNeed: t.companyNeed,
        adminName: t.users[0]?.name ?? null,
        adminEmail: t.users[0]?.email ?? null,
      })),
      demoRequests: demos.map((d) => ({
        id: d.id,
        name: d.name,
        company: d.company,
        email: d.email,
        phone: d.phone,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[platform] metrics", errorSummary(err));
    res.status(500).json({ error: "Erro ao carregar métricas." });
  }
});
