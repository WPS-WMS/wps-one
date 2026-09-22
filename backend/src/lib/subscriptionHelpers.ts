import { prisma } from "./prisma.js";
import {
  buildSubscriptionPayload,
  type AddonSeatCounts,
  type PlatformPlanRecord,
} from "./platformPlans.js";

export const TENANT_SUBSCRIPTION_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscriptionPlanId: true,
  subscriptionPlan: true,
  subscriptionStartedAt: true,
  subscriptionNextPaymentAt: true,
  subscriptionPaymentMethod: true,
  subscriptionStatus: true,
  subscriptionCanceledAt: true,
  subscriptionAccessUntil: true,
  subscriptionAddonSharepointUsers: true,
  subscriptionAddonComercialUsers: true,
  subscriptionAddonRhUsers: true,
  platformPlan: true,
  portalModuleEnabled: true,
  sharepointModuleEnabled: true,
  signupSource: true,
  employeeCountLabel: true,
  companyNeed: true,
} as const;

export type TenantSubscriptionRow = {
  id: string;
  name: string;
  slug: string;
  subscriptionPlanId: string | null;
  subscriptionPlan: string | null;
  subscriptionStartedAt: Date | null;
  subscriptionNextPaymentAt: Date | null;
  subscriptionPaymentMethod: string | null;
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  subscriptionAccessUntil: Date | null;
  subscriptionAddonSharepointUsers: number;
  subscriptionAddonComercialUsers: number;
  subscriptionAddonRhUsers: number;
  platformPlan: PlatformPlanRecord | null;
  portalModuleEnabled: boolean;
  sharepointModuleEnabled: boolean;
  signupSource: string | null;
  employeeCountLabel: string | null;
  companyNeed: string | null;
};

export async function listPlatformPlans(params?: { activeOnly?: boolean }) {
  return prisma.platformPlan.findMany({
    where: params?.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function findPlatformPlanById(id: string) {
  return prisma.platformPlan.findUnique({ where: { id } });
}

/** Conta seats de addon a partir dos usuários ativos cobráveis (exclui Cliente). */
export async function countAddonSeatsFromUsers(tenantId: string): Promise<AddonSeatCounts> {
  const assignees = await listAddonAssigneesFromUsers(tenantId);
  return {
    sharepoint: assignees.sharepoint.length,
    comercial: assignees.comercial.length,
    rh: assignees.rh.length,
  };
}

export type AddonAssignee = { id: string; name: string; email: string };

export type AddonAssigneesByModule = {
  sharepoint: AddonAssignee[];
  comercial: AddonAssignee[];
  rh: AddonAssignee[];
};

/** Lista usuários ativos cobráveis com cada addon (para resumo na Minha Assinatura). */
export async function listAddonAssigneesFromUsers(
  tenantId: string,
): Promise<AddonAssigneesByModule> {
  const whereBase = {
    tenantId,
    ativo: true as const,
    role: { notIn: ["PLATFORM_ADMIN", "CLIENTE"] },
  };
  const [sharepoint, comercial, rh] = await Promise.all([
    prisma.user.findMany({
      where: { ...whereBase, addonSharepoint: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { ...whereBase, addonComercial: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { ...whereBase, addonRh: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { sharepoint, comercial, rh };
}

export async function syncTenantAddonSeatsFromUsers(tenantId: string): Promise<AddonSeatCounts> {
  const seats = await countAddonSeatsFromUsers(tenantId);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      subscriptionAddonSharepointUsers: seats.sharepoint,
      subscriptionAddonComercialUsers: seats.comercial,
      subscriptionAddonRhUsers: seats.rh,
    },
  });
  return seats;
}

export function subscriptionPayloadForTenant(
  tenant: TenantSubscriptionRow,
  billableUsersActive: number,
  addonSeatsOverride?: AddonSeatCounts | null,
  addonAssignees?: AddonAssigneesByModule | null,
) {
  return buildSubscriptionPayload({
    plan: tenant.platformPlan,
    planId: tenant.subscriptionPlanId,
    legacyPlanCode: tenant.subscriptionPlan,
    startedAt: tenant.subscriptionStartedAt,
    nextPaymentAt: tenant.subscriptionNextPaymentAt,
    paymentMethod: tenant.subscriptionPaymentMethod,
    status: tenant.subscriptionStatus,
    canceledAt: tenant.subscriptionCanceledAt,
    accessUntil: tenant.subscriptionAccessUntil,
    billableUsersActive,
    addonSeats: addonSeatsOverride ?? {
      sharepoint: tenant.subscriptionAddonSharepointUsers ?? 0,
      comercial: tenant.subscriptionAddonComercialUsers ?? 0,
      rh: tenant.subscriptionAddonRhUsers ?? 0,
    },
    addonAssignees: addonAssignees ?? null,
  });
}
