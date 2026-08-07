/** Formas de pagamento — Contas a receber / receita de projeto. */
export const RECEIVABLE_PAYMENT_METHODS = ["PIX", "TED", "BOLETO"] as const;
export type ReceivablePaymentMethod = (typeof RECEIVABLE_PAYMENT_METHODS)[number];

/** Formas de pagamento — Contas a pagar. */
export const PAYABLE_PAYMENT_METHODS = ["PIX", "TED", "BOLETO", "CARTAO_CREDITO"] as const;
export type PayablePaymentMethod = (typeof PAYABLE_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "PIX",
  TED: "TED",
  BOLETO: "Boleto",
  CARTAO_CREDITO: "Cartão de crédito",
};

export function normalizeReceivablePaymentMethod(raw: unknown): ReceivablePaymentMethod | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return RECEIVABLE_PAYMENT_METHODS.includes(s as ReceivablePaymentMethod)
    ? (s as ReceivablePaymentMethod)
    : null;
}

export function normalizePayablePaymentMethod(raw: unknown): PayablePaymentMethod | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return PAYABLE_PAYMENT_METHODS.includes(s as PayablePaymentMethod)
    ? (s as PayablePaymentMethod)
    : null;
}

export function paymentMethodLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PAYMENT_METHOD_LABELS[value] ?? value;
}
