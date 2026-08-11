/**
 * Classifica linhas de Contas a receber / títulos de receita para DRE e resultado de projeto.
 * - FATURAMENTO: serviço/projeto (Faturamento / Valor total)
 * - REEMBOLSO: cobrança de reembolso ao cliente (Outras receitas / Reembolso de projeto)
 * - OUTRAS: juros, multa, etc. (Outras receitas; fora do Valor total)
 */

export type ReceivableRevenueClass = "FATURAMENTO" | "REEMBOLSO" | "OUTRAS";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Une textos (descrição, conta, título da receita, marco da parcela). */
export function classifyReceivableRevenueText(
  ...texts: Array<string | null | undefined>
): ReceivableRevenueClass {
  const joined = texts.map(normalizeText).filter(Boolean).join(" | ");
  if (!joined) return "FATURAMENTO";

  if (/\breembolso/.test(joined)) return "REEMBOLSO";

  if (
    /\bjuros\b/.test(joined) ||
    /\bmulta\b/.test(joined) ||
    /juros\s*\/\s*multa/.test(joined) ||
    /juros\s+e\s+multa/.test(joined) ||
    /juros.?multa/.test(joined)
  ) {
    return "OUTRAS";
  }

  return "FATURAMENTO";
}

export function isFaturamentoRevenueClass(cls: ReceivableRevenueClass): boolean {
  return cls === "FATURAMENTO";
}
