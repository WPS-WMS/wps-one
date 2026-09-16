import { prisma } from "./prisma.js";
import {
  buildSubscriptionPayload,
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
  platformPlan: true,
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
  platformPlan: PlatformPlanRecord | null;
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

export function subscriptionPayloadForTenant(
  tenant: TenantSubscriptionRow,
  billableUsersActive: number,
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
  });
}
