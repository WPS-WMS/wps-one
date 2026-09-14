/** Planos WPS One — cobrança por usuário ativo (exclui PLATFORM_ADMIN). */

export const PLATFORM_PLANS = {
  STANDARD: {
    id: "STANDARD" as const,
    label: "Standard",
    priceCentsPerUser: 4900,
  },
  PREMIUM: {
    id: "PREMIUM" as const,
    label: "Premium",
    priceCentsPerUser: 9900,
  },
} as const;

export type PlatformPlanId = keyof typeof PLATFORM_PLANS;

export const SUBSCRIPTION_PAYMENT_METHODS = {
  PIX: { id: "PIX" as const, label: "Pix" },
  BOLETO: { id: "BOLETO" as const, label: "Boleto" },
  CARTAO_CREDITO: { id: "CARTAO_CREDITO" as const, label: "Cartão de crédito" },
} as const;

export type SubscriptionPaymentMethodId = keyof typeof SUBSCRIPTION_PAYMENT_METHODS;

export function isPlatformPlanId(value: unknown): value is PlatformPlanId {
  return value === "STANDARD" || value === "PREMIUM";
}

export function isSubscriptionPaymentMethodId(
  value: unknown,
): value is SubscriptionPaymentMethodId {
  return value === "PIX" || value === "BOLETO" || value === "CARTAO_CREDITO";
}

export function subscriptionPaymentMethodLabel(
  method: string | null | undefined,
): string | null {
  if (method === "PIX") return SUBSCRIPTION_PAYMENT_METHODS.PIX.label;
  if (method === "BOLETO") return SUBSCRIPTION_PAYMENT_METHODS.BOLETO.label;
  if (method === "CARTAO_CREDITO") return SUBSCRIPTION_PAYMENT_METHODS.CARTAO_CREDITO.label;
  return null;
}

export function platformPlanLabel(plan: string | null | undefined): string {
  if (plan === "STANDARD") return PLATFORM_PLANS.STANDARD.label;
  if (plan === "PREMIUM") return PLATFORM_PLANS.PREMIUM.label;
  return "Não configurado";
}

export function priceCentsForPlan(plan: string | null | undefined): number | null {
  if (plan === "STANDARD") return PLATFORM_PLANS.STANDARD.priceCentsPerUser;
  if (plan === "PREMIUM") return PLATFORM_PLANS.PREMIUM.priceCentsPerUser;
  return null;
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

export function monthlyBillingCents(params: {
  plan: string | null | undefined;
  billableUsersActive: number;
}): number {
  const price = priceCentsForPlan(params.plan);
  if (price == null) return 0;
  const users = Math.max(0, Math.floor(params.billableUsersActive));
  return users * price;
}

export function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function buildSubscriptionPayload(params: {
  plan: string | null | undefined;
  startedAt: Date | null | undefined;
  nextPaymentAt: Date | null | undefined;
  paymentMethod?: string | null | undefined;
  billableUsersActive: number;
}) {
  const plan = isPlatformPlanId(params.plan) ? params.plan : null;
  const priceCents = priceCentsForPlan(plan);
  const monthlyCents = monthlyBillingCents({
    plan,
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

  return {
    plan,
    planLabel: platformPlanLabel(plan),
    status: plan ? ("active" as const) : ("none" as const),
    label: plan ? platformPlanLabel(plan) : "Não configurado",
    priceCentsPerUser: priceCents,
    pricePerUserFormatted: priceCents != null ? formatBrlFromCents(priceCents) : null,
    monthlyAmountCents: monthlyCents,
    monthlyAmountFormatted: formatBrlFromCents(monthlyCents),
    startedAt: startedAt ? startedAt.toISOString() : null,
    nextPaymentAt: nextPaymentAt ? nextPaymentAt.toISOString() : null,
    paymentMethod,
    paymentMethodLabel: subscriptionPaymentMethodLabel(paymentMethod),
    note: plan
      ? `Cobrança por usuário ativo · ${platformPlanLabel(plan)}`
      : "Defina o plano (Standard R$ 49 ou Premium R$ 99 por usuário ativo).",
  };
}
