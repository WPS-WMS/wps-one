import type { PlanAddonModuleId } from "./platformPlans.js";
import { PLAN_ADDON_MODULES, PLAN_MODULE_LABELS } from "./platformPlans.js";

export const NON_BILLABLE_ROLES = ["CLIENTE", "PLATFORM_ADMIN"] as const;

export function isBillableUserRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toUpperCase();
  return Boolean(r) && !(NON_BILLABLE_ROLES as readonly string[]).includes(r);
}

export type UserAddonFlags = {
  addonSharepoint?: boolean | null;
  addonComercial?: boolean | null;
  addonRh?: boolean | null;
};

export type PlanAddonAvailability = {
  moduleSharepoint?: boolean | null;
  moduleComercial?: boolean | null;
  moduleRh?: boolean | null;
};

export function normalizeUserAddonFlags(
  role: string,
  raw: UserAddonFlags | null | undefined,
  plan: PlanAddonAvailability | null | undefined,
): { addonSharepoint: boolean; addonComercial: boolean; addonRh: boolean } {
  if (!isBillableUserRole(role)) {
    return { addonSharepoint: false, addonComercial: false, addonRh: false };
  }
  return {
    addonSharepoint: !!plan?.moduleSharepoint && !!raw?.addonSharepoint,
    addonComercial: !!plan?.moduleComercial && !!raw?.addonComercial,
    addonRh: !!plan?.moduleRh && !!raw?.addonRh,
  };
}

export function userAssignedAddonIds(flags: UserAddonFlags): PlanAddonModuleId[] {
  const out: PlanAddonModuleId[] = [];
  if (flags.addonSharepoint) out.push("sharepoint");
  if (flags.addonComercial) out.push("comercial");
  if (flags.addonRh) out.push("rh");
  return out;
}

/** Rótulos estilo coluna "Licenças" do Microsoft 365 Admin. */
export function buildUserLicenseLabels(params: {
  role: string;
  ativo?: boolean | null;
  planName: string | null | undefined;
  flags: UserAddonFlags;
}): string[] {
  if (String(params.role).toUpperCase() === "CLIENTE") {
    return ["Não cobrado"];
  }
  if (String(params.role).toUpperCase() === "PLATFORM_ADMIN") {
    return ["Admin plataforma"];
  }
  if (params.ativo === false) {
    return ["Sem licença"];
  }
  if (!isBillableUserRole(params.role)) {
    return ["Não cobrado"];
  }
  if (!params.planName) {
    return ["Plano não configurado"];
  }
  const labels = [params.planName];
  for (const id of userAssignedAddonIds(params.flags)) {
    labels.push(PLAN_MODULE_LABELS[id]);
  }
  return labels;
}

export function parseAddonFlagsFromBody(body: Record<string, unknown> | null | undefined): UserAddonFlags {
  const src = body ?? {};
  const nested =
    src.addons && typeof src.addons === "object" && !Array.isArray(src.addons)
      ? (src.addons as Record<string, unknown>)
      : null;
  return {
    addonSharepoint: Boolean(
      nested?.sharepoint !== undefined ? nested.sharepoint : src.addonSharepoint,
    ),
    addonComercial: Boolean(
      nested?.comercial !== undefined ? nested.comercial : src.addonComercial,
    ),
    addonRh: Boolean(nested?.rh !== undefined ? nested.rh : src.addonRh),
  };
}

export { PLAN_ADDON_MODULES, PLAN_MODULE_LABELS };
