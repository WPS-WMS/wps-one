/**
 * Classifica Contas a receber / DRE / resultado de projeto.
 * Fonte de verdade: subcategoria da conta financeira (Plano de contas > Receitas).
 * - FATURAMENTO → DRE Faturamento / Valor total do projeto
 * - OUTRAS_RECEITAS → DRE Outras receitas / linhas por conta no resultado do projeto
 */

export type ReceivableRevenueDreClass = "FATURAMENTO" | "OUTRAS_RECEITAS";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Converte dreSubcategory da conta RECEITA. */
export function classifyReceivableByAccountSubcategory(
  dreSubcategory: string | null | undefined,
): ReceivableRevenueDreClass | null {
  const raw = String(dreSubcategory ?? "").trim().toUpperCase();
  if (raw === "FATURAMENTO") return "FATURAMENTO";
  if (raw === "OUTRAS_RECEITAS") return "OUTRAS_RECEITAS";
  return null;
}

export function isFaturamentoAccountSubcategory(
  dreSubcategory: string | null | undefined,
): boolean {
  return classifyReceivableByAccountSubcategory(dreSubcategory) === "FATURAMENTO";
}

/** Conta de receita cujo nome indica reembolso (ex.: "Reembolso"). */
export function isReembolsoReceivableAccountName(name: string | null | undefined): boolean {
  return /\breembolso/.test(normalizeText(name));
}

/**
 * Heurística só para seed/migração de contas antigas sem subcategoria.
 * Não usar na importação nem no DRE em runtime.
 */
export function inferReceitaSubcategoryFromName(name: string | null | undefined): ReceivableRevenueDreClass {
  const n = normalizeText(name);
  if (!n) return "FATURAMENTO";
  if (isReembolsoReceivableAccountName(name)) return "OUTRAS_RECEITAS";
  if (
    /\bjuros\b/.test(n) ||
    /\bmulta\b/.test(n) ||
    /juros.?multa/.test(n)
  ) {
    return "OUTRAS_RECEITAS";
  }
  return "FATURAMENTO";
}
