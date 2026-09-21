import { prisma } from "./prisma.js";
import { hashPassword } from "./auth.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { ensureTenantUserProfiles } from "./tenantUserProfiles.js";
import { errorSummary } from "./devLog.js";

const TRIAL_DAYS = 7;

export function slugifyTenantName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "empresa";
}

export async function uniqueTenantSlug(base: string): Promise<string> {
  let slug = base;
  let n = 0;
  while (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${base}-${n}`.slice(0, 56);
  }
  return slug;
}

export function trialAccessUntil(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
  return d;
}

export type PublicSignupInput = {
  name: string;
  email: string;
  phone: string;
  company: string;
  employees: string;
  need: string;
  passwordHash: string;
};

export async function createLandingTrialTenant(input: PublicSignupInput) {
  const emailNorm = input.email.trim().toLowerCase();
  const companyName = input.company.trim();
  const adminName = input.name.trim();
  const phone = input.phone.trim();
  const employees = input.employees.trim();
  const need = input.need.trim();

  const existingEmail = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true },
  });
  if (existingEmail) {
    const err = new Error("E-mail já cadastrado.");
    (err as Error & { code: string }).code = "EMAIL_IN_USE";
    throw err;
  }

  const slug = await uniqueTenantSlug(slugifyTenantName(companyName));
  const startedAt = new Date();
  const accessUntil = trialAccessUntil(startedAt);

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        slug,
        subscriptionStatus: "trial",
        subscriptionStartedAt: startedAt,
        subscriptionAccessUntil: accessUntil,
        subscriptionPlanId: null,
        subscriptionPlan: null,
        portalModuleEnabled: true,
        sharepointModuleEnabled: false,
        signupSource: "landing",
        employeeCountLabel: employees,
        companyNeed: need,
      },
    });

    await tx.tenantCompanyProfile.create({
      data: {
        tenantId: tenant.id,
        nomeFantasia: companyName,
        razaoSocial: companyName,
        telefone: phone.replace(/\D/g, ""),
        email: emailNorm,
      },
    });

    const user = await tx.user.create({
      data: {
        email: emailNorm,
        name: adminName,
        passwordHash: input.passwordHash,
        role: "SUPER_ADMIN",
        tenantId: tenant.id,
        cargo: "Administrador",
        mustChangePassword: false,
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
    console.error("[public-signup] finance defaults", errorSummary(seedErr));
  }
  try {
    await ensureTenantUserProfiles(created.tenant.id);
  } catch (seedErr) {
    console.error("[public-signup] user profiles", errorSummary(seedErr));
  }

  return {
    tenant: created.tenant,
    user: created.user,
    trialEndsAt: accessUntil,
    trialDays: TRIAL_DAYS,
  };
}

export { hashPassword, TRIAL_DAYS };
