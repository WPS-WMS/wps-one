/** Módulos principais do plano WPS One. */
export const PLAN_CORE_MODULES = ["projetos", "financeiro", "portal"] as const;
/** Addons do plano (Cloud2Cloud + reservados Comercial/RH). */
export const PLAN_ADDON_MODULES = ["sharepoint", "comercial", "rh"] as const;
export const PLAN_MODULES = [...PLAN_CORE_MODULES, ...PLAN_ADDON_MODULES] as const;
export type PlanModuleId = (typeof PLAN_MODULES)[number];
export type PlanCoreModuleId = (typeof PLAN_CORE_MODULES)[number];
export type PlanAddonModuleId = (typeof PLAN_ADDON_MODULES)[number];

export const PLAN_MODULE_LABELS: Record<PlanModuleId, string> = {
  projetos: "Gestão de projetos",
  financeiro: "Financeiro",
  portal: "Portal Colaborativo",
  sharepoint: "Sincronizador Cloud2Cloud",
  comercial: "Comercial",
  rh: "RH",
};

export type PlatformPlanRecord = {
  id: string;
  name: string;
  code: string | null;
  priceCentsPerUser: number;
  moduleProjetos: boolean;
  moduleFinanceiro: boolean;
  modulePortal: boolean;
  moduleSharepoint: boolean;
  moduleComercial: boolean;
  moduleRh: boolean;
  active: boolean;
  sortOrder: number;
};

export type SubscriptionStatus = "active" | "canceling" | "locked" | "none" | "trial";

export const SUBSCRIPTION_PAYMENT_METHODS = {
  PIX: { id: "PIX" as const, label: "Pix" },
  CARTAO_CREDITO: { id: "CARTAO_CREDITO" as const, label: "Cartão de crédito" },
} as const;

export type SubscriptionPaymentMethodId = keyof typeof SUBSCRIPTION_PAYMENT_METHODS;

export function isSubscriptionPaymentMethodId(
  value: unknown,
): value is SubscriptionPaymentMethodId {
  return value === "PIX" || value === "CARTAO_CREDITO";
}

export function subscriptionPaymentMethodLabel(
  method: string | null | undefined,
): string | null {
  if (method === "PIX") return SUBSCRIPTION_PAYMENT_METHODS.PIX.label;
  if (method === "CARTAO_CREDITO") return SUBSCRIPTION_PAYMENT_METHODS.CARTAO_CREDITO.label;
  // Legado: assinaturas que ainda tenham boleto salvo.
  if (method === "BOLETO") return "Boleto";
  return null;
}

export function normalizeSubscriptionStatus(
  value: string | null | undefined,
): SubscriptionStatus {
  if (
    value === "active" ||
    value === "canceling" ||
    value === "locked" ||
    value === "none" ||
    value === "trial"
  ) {
    return value;
  }
  return "none";
}

/** Próxima parcela mensal a partir da data de início (aniversário do dia). */
export function computeNextSubscriptionPaymentAt(
  startedAt: Date,
  from: Date = new Date(),
): Date {
  const startDay = startedAt.getUTCDate();
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const build = (y: number, m: number) => {
    const day = Math.min(startDay, daysInMonth(y, m));
    return new Date(Date.UTC(y, m, day, 12, 0, 0));
  };

  let candidate = build(year, month);
  const fromDay = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12, 0, 0),
  );
  if (candidate.getTime() <= fromDay.getTime()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = build(year, month);
  }
  return candidate;
}

export function resolveNextPaymentAt(params: {
  startedAt: Date | null | undefined;
  nextPaymentAt: Date | null | undefined;
  from?: Date;
}): Date | null {
  if (params.nextPaymentAt) return params.nextPaymentAt;
  if (params.startedAt) {
    return computeNextSubscriptionPaymentAt(params.startedAt, params.from ?? new Date());
  }
  return null;
}

export function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export type PlanModulesState = {
  projetos: boolean;
  financeiro: boolean;
  portal: boolean;
  sharepoint: boolean;
  comercial: boolean;
  rh: boolean;
};

export function planModulesFromRecord(plan: PlatformPlanRecord | null | undefined): PlanModulesState {
  if (!plan) {
    // Sem plano configurado: não restringe módulos principais (legado / pré-assinatura).
    // Addons permanecem opt-in.
    return {
      projetos: true,
      financeiro: true,
      portal: true,
      sharepoint: false,
      comercial: false,
      rh: false,
    };
  }
  return {
    projetos: !!plan.moduleProjetos,
    financeiro: !!plan.moduleFinanceiro,
    portal: !!plan.modulePortal,
    sharepoint: !!plan.moduleSharepoint,
    comercial: !!plan.moduleComercial,
    rh: !!plan.moduleRh,
  };
}

export function serializePlan(plan: PlatformPlanRecord) {
  const modules = planModulesFromRecord(plan);
  const moduleLabels = PLAN_CORE_MODULES.filter((m) => modules[m]).map((m) => PLAN_MODULE_LABELS[m]);
  const addonLabels = PLAN_ADDON_MODULES.filter((m) => modules[m]).map((m) => PLAN_MODULE_LABELS[m]);
  return {
    id: plan.id,
    name: plan.name,
    code: plan.code,
    label: plan.name,
    priceCentsPerUser: plan.priceCentsPerUser,
    pricePerUserFormatted: formatBrlFromCents(plan.priceCentsPerUser),
    modules,
    moduleLabels,
    addonLabels,
    /** Módulos + addons ativos (landing / cards). */
    allFeatureLabels: [...moduleLabels, ...addonLabels],
    active: plan.active,
    sortOrder: plan.sortOrder,
  };
}

export function monthlyBillingCents(params: {
  priceCentsPerUser: number | null | undefined;
  billableUsersActive: number;
}): number {
  if (params.priceCentsPerUser == null) return 0;
  const users = Math.max(0, Math.floor(params.billableUsersActive));
  return users * params.priceCentsPerUser;
}

export function buildSubscriptionPayload(params: {
  plan: PlatformPlanRecord | null | undefined;
  planId?: string | null;
  legacyPlanCode?: string | null;
  startedAt: Date | null | undefined;
  nextPaymentAt: Date | null | undefined;
  paymentMethod?: string | null | undefined;
  status?: string | null | undefined;
  canceledAt?: Date | null | undefined;
  accessUntil?: Date | null | undefined;
  billableUsersActive: number;
}) {
  const plan = params.plan ?? null;
  const priceCents = plan?.priceCentsPerUser ?? null;
  const monthlyCents = monthlyBillingCents({
    priceCentsPerUser: priceCents,
    billableUsersActive: params.billableUsersActive,
  });
  const startedAt = params.startedAt ?? null;
  const nextPaymentAt = resolveNextPaymentAt({
    startedAt,
    nextPaymentAt: params.nextPaymentAt,
  });
  const paymentMethod = isSubscriptionPaymentMethodId(params.paymentMethod)
    ? params.paymentMethod
    : null;

  let status = normalizeSubscriptionStatus(params.status);
  if (status === "none" && plan) status = "active";
  if (!plan && status === "active") status = "none";
  // trial permanece trial mesmo sem plano (teste grátis da landing).

  const modules = planModulesFromRecord(plan);
  const accessUntil = params.accessUntil ?? null;
  const canceledAt = params.canceledAt ?? null;

  const statusLabel =
    status === "active"
      ? "Ativa"
      : status === "trial"
        ? "Teste grátis"
        : status === "canceling"
          ? "Cancelamento agendado"
          : status === "locked"
            ? "Encerrada"
            : "Não configurada";

  return {
    planId: plan?.id ?? params.planId ?? null,
    plan: plan?.id ?? params.legacyPlanCode ?? null,
    planLabel: plan?.name ?? (params.legacyPlanCode ? String(params.legacyPlanCode) : "Não configurado"),
    status,
    statusLabel,
    label: plan?.name ?? "Não configurado",
    priceCentsPerUser: priceCents,
    pricePerUserFormatted: priceCents != null ? formatBrlFromCents(priceCents) : null,
    monthlyAmountCents: monthlyCents,
    monthlyAmountFormatted: formatBrlFromCents(monthlyCents),
    startedAt: startedAt ? startedAt.toISOString() : null,
    nextPaymentAt: nextPaymentAt ? nextPaymentAt.toISOString() : null,
    paymentMethod,
    paymentMethodLabel: subscriptionPaymentMethodLabel(paymentMethod),
    canceledAt: canceledAt ? canceledAt.toISOString() : null,
    accessUntil: accessUntil ? accessUntil.toISOString() : null,
    modules,
    moduleLabels: PLAN_CORE_MODULES.filter((m) => modules[m]).map((m) => PLAN_MODULE_LABELS[m]),
    addonLabels: PLAN_ADDON_MODULES.filter((m) => modules[m]).map((m) => PLAN_MODULE_LABELS[m]),
    note: status === "trial"
      ? accessUntil
        ? `Teste grátis até ${accessUntil.toLocaleDateString("pt-BR")}. Escolha um plano em Minha Assinatura para continuar.`
        : "Teste grátis. Escolha um plano em Minha Assinatura para continuar após o período."
      : plan
        ? `Cobrança por usuário ativo · ${plan.name}`
        : "Escolha um plano cadastrado no painel da plataforma.",
  };
}
