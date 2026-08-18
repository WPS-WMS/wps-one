/** Formas de pagamento — Contas a receber. */
export const RECEIVABLE_PAYMENT_METHOD_OPTIONS = [
  { value: "PIX", label: "PIX" },
  { value: "TED", label: "TED" },
  { value: "BOLETO", label: "Boleto" },
] as const;

/** Formas de pagamento — Contas a pagar. */
export const PAYABLE_PAYMENT_METHOD_OPTIONS = [
  { value: "PIX", label: "PIX" },
  { value: "TED", label: "TED" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão de crédito" },
] as const;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "PIX",
  TED: "TED",
  BOLETO: "Boleto",
  CARTAO_CREDITO: "Cartão de crédito",
};

export function paymentMethodLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PAYMENT_METHOD_LABELS[value] ?? value;
}
