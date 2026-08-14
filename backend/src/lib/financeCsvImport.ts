import type { PrismaClient } from "@prisma/client";
import { parseBrlAmountToCents, parseDateFlexible } from "./payableCsvImport.js";
import { buildInstallmentPlan, computePayableTotalCents } from "./payableHelpers.js";
import { detectCsvSeparator, parseCsvRows, stripBom } from "./projectCsvImport.js";
import { markPayableAsPaid } from "./payableService.js";
import { issueInvoice, markReceivableAsReceived, receiveInstallment } from "./receivableService.js";
import {
  resolveContractTypeIdFromEmploymentType,
  resolveProfessionalFromSupplierId,
} from "./userContractTypeHelpers.js";
import { classifyReceivableByAccountSubcategory } from "./receivableRevenueClassification.js";
import {
  normalizePayablePaymentMethod,
  PAYABLE_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "./financePaymentMethods.js";

export type FinanceImportKind = "RECEITA" | "DESPESA";

export type FinanceCsvImportResult = {
  createdPayables: number;
  createdReceivables: number;
  createdReceivableInstallments: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
};

function normalize(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parsePaidFlag(raw: string): boolean | null {
  const v = normalize(raw);
  if (!v) return false;
  if (["1", "sim", "s", "true", "pago", "recebido", "yes", "x"].includes(v)) return true;
  if (["0", "nao", "n", "false", "no", "aberto", "n_a", "na", "n/a", "-"].includes(v)) return false;
  return null;
}

function parseHours(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  // Valor monetário (ex.: "R$ 400,00") não é quantidade de horas.
  if (/r\s*\$/i.test(t)) return null;

  let s = t.replace(/\s/g, "");
  // 1.234,56 (BR) → remove milhar; 12,5 → vírgula decimal; 12.5 (Excel) → ponto decimal.
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // 1.234 ou 1.234.567 — milhar sem decimais
    s = s.replace(/\./g, "");
  }
  // else: "12.5" / "4608.66" mantém o ponto decimal (comum no Excel)

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Detecta R$ na coluna de horas complementares (Excel costuma mandar "4608.66" sem "R$").
 * Não confunde horas típicas (ex.: 12,5 / 150,5).
 */
function complementaryFieldLooksLikeMoney(raw: string): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  if (/r\s*\$/i.test(t)) return true;

  const cents = parseBrlAmountToCents(t);
  if (cents == null || cents < 10000) return false; // < R$ 100

  const compact = t.replace(/\s/g, "").replace(/r\$/gi, "");
  // BR com milhar: 4.608,66 | 1.234,5
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(compact)) return true;
  // BR sem milhar: 4608,66
  if (/^\d+,\d{2}$/.test(compact)) return true;
  // Excel (ponto decimal): 4608.66 — 2 casas e magnitude de dinheiro
  if (/^\d+\.\d{2}$/.test(compact) && cents >= 10000) return true;
  // Excel com 1 casa e valor alto (ex.: 2857.2 ≈ R$ 2.857,20)
  if (/^\d+\.\d$/.test(compact) && cents >= 100000) return true;
  // Magnitude absurda para horas (ex.: 12214 sem decimais claros)
  const asHours = parseHours(t);
  return asHours != null && asHours > 1000;
}

/**
 * Aceita horas (ex.: "12,5") ou valor em R$ na planilha operacional.
 * Em R$, converte para horas pela Tx Hora; sem taxa, soma o valor em centavos no total.
 */
function parseComplementaryHoursField(
  raw: string,
  hourRateCents: number | null,
):
  | { ok: true; hours: number | null; extraAmountCents: number }
  | { ok: false; message: string } {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, hours: null, extraAmountCents: 0 };

  if (complementaryFieldLooksLikeMoney(t)) {
    const cents = parseBrlAmountToCents(t);
    if (cents == null || cents < 0) {
      return { ok: false, message: `Horas complementares inválidas: "${t}".` };
    }
    if (cents === 0) return { ok: true, hours: 0, extraAmountCents: 0 };
    if (hourRateCents != null && hourRateCents > 0) {
      return {
        ok: true,
        hours: Math.round((cents / hourRateCents) * 100) / 100,
        extraAmountCents: 0,
      };
    }
    // Sem taxa hora: incorpora o R$ no valor da linha (não interpreta como milhares de horas).
    return { ok: true, hours: null, extraAmountCents: cents };
  }

  const hours = parseHours(t);
  if (hours == null) {
    return { ok: false, message: `Horas complementares inválidas: "${t}".` };
  }
  // Guarda: planilha com R$ sem símbolo e fora da heurística acima.
  if (hours > 1000) {
    const cents = parseBrlAmountToCents(t);
    if (cents != null && cents > 0 && hourRateCents != null && hourRateCents > 0) {
      return {
        ok: true,
        hours: Math.round((cents / hourRateCents) * 100) / 100,
        extraAmountCents: 0,
      };
    }
    if (cents != null && cents > 0) {
      return { ok: true, hours: null, extraAmountCents: cents };
    }
    return {
      ok: false,
      message: `Horas complementares improváveis (${hours}). Se for valor em R$, use o formato "R$ 1.234,56" ou confira a coluna.`,
    };
  }
  return { ok: true, hours, extraAmountCents: 0 };
}

function singleByName<T>(
  rows: T[],
  raw: string,
  getNames: (row: T) => Array<string | null | undefined>,
): T | null | "AMBIGUOUS" {
  const key = normalize(raw);
  if (!key) return null;
  const matches = rows.filter((row) => getNames(row).some((name) => normalize(name ?? "") === key));
  if (matches.length > 1) return "AMBIGUOUS";
  return matches[0] ?? null;
}

/** Aceita nome completo ou primeiro nome único (ex.: "Anderson" → "Anderson Silva"). */
function singlePersonByName<T>(
  rows: T[],
  raw: string,
  getNames: (row: T) => Array<string | null | undefined>,
): T | null | "AMBIGUOUS" {
  const exact = singleByName(rows, raw, getNames);
  if (exact) return exact;
  const key = normalize(raw);
  if (!key || key.length < 3) return null;
  const matches = rows.filter((row) =>
    getNames(row).some((name) => {
      const n = normalize(name ?? "");
      if (!n) return false;
      if (n === key || n.startsWith(`${key} `)) return true;
      return n.split(" ")[0] === key;
    }),
  );
  if (matches.length > 1) return "AMBIGUOUS";
  return matches[0] ?? null;
}

function isReembolsoCategoryKey(key: string): boolean {
  return key === "reembolso" || key === "reembolsos" || key.includes("reembolso");
}

function accountLookupKey(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function dreSubcategoryFromSheet(raw: string): string | null {
  const key = accountLookupKey(raw);
  if (key === "reembolso" || key === "reembolsos") return "REEMBOLSOS";
  if (key === "custo" || key === "custos") return "CUSTO";
  if (key === "imposto" || key === "impostos") return "IMPOSTO";
  return null;
}

type ExpenseAccountMatch = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  dreSubcategory?: string | null;
  isActive?: boolean;
};

function matchExpenseAccount(accounts: ExpenseAccountMatch[], raw: string) {
  const key = accountLookupKey(raw);
  if (!key) return null;
  const keys = new Set<string>([key]);
  if (key === "reembolso") keys.add("reembolsos");
  if (key === "reembolsos") keys.add("reembolso");
  const dreHint = dreSubcategoryFromSheet(raw);

  const scored = accounts
    .map((item) => {
      const names = [item.name, item.code].map((n) => accountLookupKey(n ?? "")).filter(Boolean);
      const exact = names.some((n) => keys.has(n));
      const alias =
        isReembolsoCategoryKey(key) &&
        (names.some((n) => isReembolsoCategoryKey(n)) ||
          String(item.dreSubcategory ?? "").toUpperCase() === "REEMBOLSOS");
      const dre =
        dreHint === "REEMBOLSOS" &&
        String(item.dreSubcategory ?? "").toUpperCase() === "REEMBOLSOS";
      const starts = names.some((n) => n.startsWith(`${key} `) || key.startsWith(`${n} `));
      if (!exact && !alias && !dre && !starts) return null;
      let rank = 5;
      if (exact) rank = 0;
      else if (alias) rank = 1;
      else if (starts) rank = 2;
      else rank = 3;
      if (item.isActive === false) rank += 10;
      return { item, rank };
    })
    .filter((row): row is { item: ExpenseAccountMatch; rank: number } => row != null);

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.rank - b.rank);
  const best = scored[0]!.rank;
  const top = scored.filter((row) => row.rank === best).map((row) => row.item);
  const unique = new Map(top.map((item) => [item.id, item]));
  if (unique.size > 1) return "AMBIGUOUS" as const;
  return unique.values().next().value ?? null;
}

function resolveReceitaHeader(value: string): string | null {
  const h = normalizeHeader(value);
  if (["cliente"].includes(h)) return "client";
  if (["projeto"].includes(h)) return "project";
  if (
    ["atividade_descricao", "atividade", "descricao", "atividade_descriao"].includes(h) ||
    (h.includes("atividade") && h.includes("descricao"))
  ) {
    return "description";
  }
  if (["contrato", "contra", "n_contrato", "numero_contrato"].includes(h) || h.startsWith("contra")) {
    return "contract";
  }
  if (["data", "competencia", "data_competencia"].includes(h)) return "date";
  if (["valor", "valor_rs", "valor_em_rs"].includes(h)) return "amount";
  if (
    ["conta_financeira", "conta_financeira_receita", "conta"].includes(h) ||
    (h.includes("conta") && h.includes("finance"))
  ) {
    return "financial_account";
  }
  if (
    ["dt_emissao_nf", "data_emissao_nf", "emissao_nf", "dt_emissao"].includes(h) ||
    (h.includes("emissao") && h.includes("nf"))
  ) {
    return "nf_emission";
  }
  if (["nro_nf", "numero_nf", "nf", "n_nf", "num_nf"].includes(h) || h.includes("nro_nf")) {
    return "nf_number";
  }
  if (
    ["prev_pagamento", "previsao_pagamento", "prev_pagamen", "vencimento", "data_vencimento"].includes(h) ||
    (h.includes("prev") && h.includes("pagam"))
  ) {
    return "due_date";
  }
  if (
    ["centro_de_custo", "centro_custo", "cc"].includes(h) ||
    (h.includes("centro") && h.includes("custo"))
  ) {
    return "cost_center";
  }
  if (["pago", "pago_", "recebido", "status_pago"].includes(h) || h.startsWith("pago")) return "paid";
  return null;
}

function resolveDespesaHeader(value: string): string | null {
  const h = normalizeHeader(value);
  if (["mes", "mes_ref", "mes_referencia"].includes(h)) return "month";
  if (["data", "competencia", "data_competencia"].includes(h)) return "date";
  // Só "Tipo de contrato" — a coluna "Tipo" das planilhas operacionais
  // (Escritório, Serviço…) não é tipo de contrato (PJ, CLT).
  if (
    ["tipo_contrato", "tipo_de_contrato"].includes(h) ||
    (h.includes("tipo") && h.includes("contrato"))
  ) {
    return "contract_type";
  }
  // Categoria financeira = nome da conta em Plano de contas > Despesas.
  if (
    ["categoria_financeira", "ctg_fin"].includes(h) ||
    (h.includes("categoria") && h.includes("financ")) ||
    (h.includes("conta") && h.includes("tipo"))
  ) {
    return "category";
  }
  if (h === "categoria") return "category_generic";
  if (h === "categoria_final") return "category_final";
  if (["vencimento", "data_vencimento", "data_de_vencimento"].includes(h)) return "due_date";
  if (
    ["forma_de_pagamento", "forma_pagamento", "pagamento"].includes(h) ||
    (h.includes("forma") && h.includes("pagamento"))
  ) {
    return "payment_method";
  }
  if (["fornecedor", "fornecedores"].includes(h)) return "supplier";
  if (
    ["profissional_empresa", "profissional", "empresa", "beneficiario"].includes(h) ||
    (h.includes("profissional") && h.includes("empresa"))
  ) {
    return "payee";
  }
  if (
    ["atividade_descricao", "atividade", "descricao"].includes(h) ||
    (h.includes("atividade") && h.includes("descricao"))
  ) {
    return "description";
  }
  if (
    ["centro_de_custo", "centro_custo", "cc"].includes(h) ||
    (h.includes("centro") && h.includes("custo"))
  ) {
    return "cost_center";
  }
  if (["cliente"].includes(h)) return "client";
  if (["projeto", "projetos"].includes(h)) return "project";
  if (["tx_hora", "taxa_hora"].includes(h) || (h.includes("tx") && h.includes("hora"))) {
    return "hour_rate";
  }
  if (["valor", "valor_rs", "valor_em_rs"].includes(h)) return "amount";
  if (["descontos", "desconto"].includes(h)) return "discount";
  // Benefício / Reembolso: colunas legadas (não existem no modelo) — ignorar.
  if (["beneficio", "beneficios", "reembolso", "reembolsos"].includes(h)) return null;
  if (
    ["horas_complementares", "h_compl", "hora_complementar"].includes(h) ||
    (h.includes("hora") && h.includes("complement"))
  ) {
    return "complementary_hours";
  }
  if (["juros_multa", "juros", "multa"].includes(h) || (h.includes("juros") && h.includes("multa"))) {
    return "interest_fine";
  }
  // Coluna Total da planilha é calculada — ignorar.
  if (["total", "total_rs"].includes(h)) return null;
  if (["pago", "status_pago"].includes(h) || h.startsWith("pago")) return "paid";
  return null;
}

/** Aceita "abr/26", "abril/2026", além dos formatos já cobertos por parseDateFlexible. */
function parseCompetenceOrDate(raw: string): Date | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const flex = parseDateFlexible(t);
  if (flex) return flex;

  const mmmYy = t.match(/^([a-zA-ZçÇãÃáÁéÉíÍóÓúÚ.]{3,9})\s*[\/\-]\s*(\d{2}|\d{4})$/);
  if (mmmYy) {
    const monthPart = normalize(mmmYy[1]!).replace(/\./g, "");
    const yearRaw = mmmYy[2]!;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const months: Record<string, number> = {
      janeiro: 0,
      jan: 0,
      fevereiro: 1,
      fev: 1,
      marco: 2,
      mar: 2,
      abril: 3,
      abr: 3,
      maio: 4,
      mai: 4,
      junho: 5,
      jun: 5,
      julho: 6,
      jul: 6,
      agosto: 7,
      ago: 7,
      setembro: 8,
      set: 8,
      outubro: 9,
      out: 9,
      novembro: 10,
      nov: 10,
      dezembro: 11,
      dez: 11,
    };
    for (const [name, idx] of Object.entries(months)) {
      if (monthPart === name || monthPart.startsWith(name.slice(0, 3))) {
        return new Date(Date.UTC(year, idx, 1, 12, 0, 0));
      }
    }
  }
  return monthHintToDate(t, null);
}

/** "N/A" na coluna Nro NF marca nota de débito (documento não fiscal). */
const DEBIT_NOTE_LABEL = "Nota de débito";

type ParsedReceitaRow = {
  line: number;
  description: string;
  amountCents: number;
  paidFlag: boolean;
  competenceDate: Date;
  dueDate: Date;
  nfEmission: Date | null;
  nfNumber: string;
  isDebitNote: boolean;
  costCenter: { id: string };
  client: { id: string };
  account: { id: string; name: string };
  project: { id: string; name: string };
  isBillingFaturamento: boolean;
  contractTitle: string | null;
};

function receitaDocument(
  row: ParsedReceitaRow,
): { number: string; emissionDate: Date } | null {
  if (row.isDebitNote) {
    return { number: DEBIT_NOTE_LABEL, emissionDate: row.nfEmission ?? row.dueDate };
  }
  if (row.nfNumber) {
    return { number: row.nfNumber.slice(0, 60), emissionDate: row.nfEmission ?? row.dueDate };
  }
  return null;
}

/** Faturamento com contrato: uma receita por (projeto + contrato), independente do ano. */
function faturamentoGroupKey(row: ParsedReceitaRow): string | null {
  if (!row.isBillingFaturamento) return null;
  const contract = row.contractTitle?.trim();
  if (!contract) return null;
  return `${row.project.id}::${normalize(contract)}`;
}

function sortReceitaRows(rows: ParsedReceitaRow[]): ParsedReceitaRow[] {
  return [...rows].sort((a, b) => {
    const byCompetence = a.competenceDate.getTime() - b.competenceDate.getTime();
    if (byCompetence !== 0) return byCompetence;
    const byDue = a.dueDate.getTime() - b.dueDate.getTime();
    if (byDue !== 0) return byDue;
    return a.line - b.line;
  });
}

function validateFaturamentoGroups(
  rows: ParsedReceitaRow[],
  result: FinanceCsvImportResult,
): void {
  const groups = new Map<string, ParsedReceitaRow[]>();
  for (const row of rows) {
    const key = faturamentoGroupKey(row);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const accountNames = [...new Set(group.map((r) => r.account.name))];
    if (accountNames.length > 1) {
      result.errors.push({
        line: first.line,
        message: `Contrato "${first.contractTitle}" no projeto "${first.project.name}" usa contas financeiras diferentes (${accountNames.join(", ")}). Use a mesma conta nas linhas do contrato.`,
      });
    }
    const costCenterIds = new Set(group.map((r) => r.costCenter.id));
    if (costCenterIds.size > 1) {
      result.errors.push({
        line: first.line,
        message: `Contrato "${first.contractTitle}" no projeto "${first.project.name}" usa centros de custo diferentes. Use o mesmo centro nas linhas do contrato.`,
      });
    }
  }
}

function isNotApplicableValue(raw: string): boolean {
  const v = normalize(raw);
  return v === "n/a" || v === "na" || v === "n_a" || v === "n.a";
}

function isBlankSpreadsheetValue(raw: string): boolean {
  const v = normalize(raw);
  // Artefato de célula Excel (objeto/fórmula) serializada como "[object Object]".
  if (v === "[object object]") return true;
  return !v || v === "-" || v === "r_-" || isNotApplicableValue(raw);
}

/** Aceita PIX / TED / Boleto / Cartão de crédito (código ou rótulo). */
function parsePayablePaymentMethodFromSheet(raw: string): string | null | "INVALID" {
  const t = String(raw ?? "").trim();
  if (!t || isBlankSpreadsheetValue(t)) return null;
  const byCode = normalizePayablePaymentMethod(t);
  if (byCode) return byCode;
  const n = normalize(t);
  if (n === "pix") return "PIX";
  if (n === "ted") return "TED";
  if (n === "boleto") return "BOLETO";
  if (
    n === "cartao" ||
    n === "cartao de credito" ||
    n === "cartao_credito" ||
    n === "credito" ||
    n.includes("cartao")
  ) {
    return "CARTAO_CREDITO";
  }
  for (const code of PAYABLE_PAYMENT_METHODS) {
    if (normalize(PAYMENT_METHOD_LABELS[code] ?? "") === n) return code;
  }
  return "INVALID";
}

function monthHintToDate(monthRaw: string, yearFromDate: number | null): Date | null {
  const v = normalize(monthRaw);
  if (!v) return null;
  const months: Record<string, number> = {
    janeiro: 0,
    fevereiro: 1,
    marco: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11,
  };
  let monthIndex: number | null = null;
  if (/^\d{1,2}$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= 12) monthIndex = n - 1;
  } else if (/^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  } else {
    for (const [name, idx] of Object.entries(months)) {
      if (v.startsWith(name.slice(0, 3)) || v.includes(name)) {
        monthIndex = idx;
        break;
      }
    }
  }
  if (monthIndex == null) return null;
  const year = yearFromDate ?? new Date().getUTCFullYear();
  return new Date(Date.UTC(year, monthIndex, 1));
}

export async function importFinanceCsv(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  csvText: string;
  importKind: FinanceImportKind;
  maxRows?: number;
}): Promise<FinanceCsvImportResult> {
  const { prisma, tenantId, userId, importKind } = params;
  const result: FinanceCsvImportResult = {
    createdPayables: 0,
    createdReceivables: 0,
    createdReceivableInstallments: 0,
    skipped: 0,
    errors: [],
  };
  const text = stripBom(params.csvText ?? "").trim();
  if (!text) {
    result.errors.push({ line: 1, message: "Arquivo CSV vazio." });
    return result;
  }

  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const matrix = parseCsvRows(text, detectCsvSeparator(firstLine));
  if (matrix.length < 2) {
    result.errors.push({ line: 1, message: "O CSV deve ter cabeçalho e ao menos uma linha de dados." });
    return result;
  }

  const resolveHeader = importKind === "RECEITA" ? resolveReceitaHeader : resolveDespesaHeader;
  const columns = new Map<string, number>();
  matrix[0]!.forEach((cell, index) => {
    const key = resolveHeader(cell);
    if (key && !columns.has(key)) columns.set(key, index);
  });

  const required =
    importKind === "RECEITA"
      ? (["client", "amount"] as const)
      : (["description", "amount", "cost_center"] as const);
  for (const key of required) {
    if (!columns.has(key)) {
      result.errors.push({
        line: 1,
        message: `Coluna obrigatória ausente para ${importKind === "RECEITA" ? "receitas" : "despesas"}: ${key}.`,
      });
    }
  }
  if (importKind === "RECEITA" && !columns.has("description") && !columns.has("project")) {
    result.errors.push({
      line: 1,
      message: "Informe a coluna Projeto ou Atividade/Descrição nas receitas.",
    });
  }
  if (result.errors.length > 0) return result;

  const dataRows = matrix.slice(1);
  const maxRows = params.maxRows ?? 2000;
  if (dataRows.length > maxRows) {
    result.errors.push({ line: 1, message: `Limite de ${maxRows} linhas excedido (${dataRows.length}).` });
    return result;
  }

  const [accounts, costCenters, clients, suppliers, projects, users, contractTypes] =
    await Promise.all([
      prisma.financialAccount.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, type: true, dreSubcategory: true, isActive: true },
      }),
      prisma.costCenter.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, code: true },
      }),
      prisma.client.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      prisma.supplier.findMany({
        where: { tenantId, status: "ATIVO" },
        select: { id: true, nomeApelido: true, razaoSocial: true },
      }),
      prisma.project.findMany({
        where: { client: { tenantId } },
        select: { id: true, name: true, clientId: true },
      }),
      prisma.user.findMany({
        where: { tenantId, role: { not: "CLIENTE" } },
        select: { id: true, name: true, employmentType: true },
      }),
      prisma.contractType.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

  const get = (row: string[], key: string) => {
    const index = columns.get(key);
    return index == null ? "" : String(row[index] ?? "").trim();
  };

  type PendingRow = { row: string[]; line: number };
  const pending: PendingRow[] = [];
  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index]!;
    const line = index + 2;
    const description = get(row, "description");
    const amountRaw = get(row, "amount");
    const dateRaw = get(row, "date");
    if (!description && !amountRaw && !dateRaw) {
      result.skipped += 1;
      continue;
    }
    pending.push({ row, line });
  }

  const abortImport = async (
    createdReceivableIds: string[],
    createdPayableIds: string[],
    createdProjectRevenueIds: string[] = [],
  ) => {
    if (createdReceivableIds.length > 0) {
      await prisma.receivable.deleteMany({
        where: { tenantId, id: { in: createdReceivableIds } },
      });
    }
    if (createdPayableIds.length > 0) {
      await prisma.payable.deleteMany({
        where: { tenantId, id: { in: createdPayableIds } },
      });
    }
    if (createdProjectRevenueIds.length > 0) {
      await prisma.projectRevenue.deleteMany({
        where: { tenantId, id: { in: createdProjectRevenueIds } },
      });
    }
    result.createdReceivables = 0;
    result.createdReceivableInstallments = 0;
    result.createdPayables = 0;
    if (!result.errors.some((e) => e.line === 0)) {
      result.errors.unshift({
        line: 0,
        message:
          "Importação cancelada: nenhuma linha foi gravada. Corrija os erros abaixo e importe novamente.",
      });
    }
  };

  // 1) Valida todas as linhas sem gravar.
  const parsedReceitas: ParsedReceitaRow[] = [];
  for (const { row, line } of pending) {
    try {
      if (importKind === "RECEITA") {
        const parsed = parseReceitaRow({
          row,
          line,
          get,
          result,
          accounts,
          costCenters,
          clients,
          projects,
        });
        if (parsed) parsedReceitas.push(parsed);
      } else {
        await importDespesaRow({
          prisma,
          tenantId,
          userId,
          row,
          line,
          get,
          result,
          accounts,
          costCenters,
          clients,
          projects,
          suppliers,
          users,
          contractTypes,
          dryRun: true,
        });
      }
    } catch (error) {
      result.errors.push({
        line,
        message: error instanceof Error ? error.message : "Erro ao validar linha.",
      });
    }
  }

  if (importKind === "RECEITA") {
    validateFaturamentoGroups(parsedReceitas, result);
  }

  if (result.errors.length > 0) {
    await abortImport([], []);
    return result;
  }

  // 2) Só grava se nenhuma linha tiver erro. Qualquer falha no meio desfaz o lote.
  const createdReceivableIds: string[] = [];
  const createdPayableIds: string[] = [];
  const createdProjectRevenueIds: string[] = [];

  if (importKind === "RECEITA") {
    const grouped = new Map<string, ParsedReceitaRow[]>();
    const singles: ParsedReceitaRow[] = [];
    for (const parsed of parsedReceitas) {
      const key = faturamentoGroupKey(parsed);
      if (!key) {
        singles.push(parsed);
        continue;
      }
      const list = grouped.get(key) ?? [];
      list.push(parsed);
      grouped.set(key, list);
    }
    try {
      for (const group of grouped.values()) {
        await persistGroupedFaturamentoReceita({
          prisma,
          tenantId,
          userId,
          rows: group,
          result,
          onCreated: (id) => createdReceivableIds.push(id),
          onProjectRevenueCreated: (id) => createdProjectRevenueIds.push(id),
        });
      }
      for (const parsed of singles) {
        await persistSingleReceitaRow({
          prisma,
          tenantId,
          userId,
          parsed,
          result,
          onCreated: (id) => createdReceivableIds.push(id),
          onProjectRevenueCreated: (id) => createdProjectRevenueIds.push(id),
        });
      }
    } catch (error) {
      result.errors.push({
        line: 0,
        message: error instanceof Error ? error.message : "Erro ao importar receitas.",
      });
      await abortImport(createdReceivableIds, createdPayableIds, createdProjectRevenueIds);
      return result;
    }
    return result;
  }

  for (const { row, line } of pending) {
    try {
      await importDespesaRow({
        prisma,
        tenantId,
        userId,
        row,
        line,
        get,
        result,
        accounts,
        costCenters,
        clients,
        projects,
        suppliers,
        users,
        contractTypes,
        dryRun: false,
        onCreated: (id) => createdPayableIds.push(id),
      });
    } catch (error) {
      result.errors.push({
        line,
        message: error instanceof Error ? error.message : "Erro ao importar linha.",
      });
    }
    if (result.errors.length > 0) {
      await abortImport(createdReceivableIds, createdPayableIds, createdProjectRevenueIds);
      return result;
    }
  }

  return result;
}

function parseReceitaRow(ctx: {
  row: string[];
  line: number;
  get: (row: string[], key: string) => string;
  result: FinanceCsvImportResult;
  accounts: Array<{
    id: string;
    name: string;
    code: string | null;
    type: string;
    dreSubcategory: string | null;
  }>;
  costCenters: Array<{ id: string; name: string; code: string | null }>;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
}): ParsedReceitaRow | null {
  const { row, line, get, result } = ctx;
  const projectRaw = get(row, "project");
  const description = (get(row, "description") || projectRaw || "").trim();
  if (!description) {
    result.errors.push({ line, message: "Projeto ou Atividade/Descrição obrigatória." });
    return null;
  }
  const amountCents = parseBrlAmountToCents(get(row, "amount"));
  if (amountCents == null || amountCents <= 0) {
    result.errors.push({ line, message: `Valor inválido: "${get(row, "amount")}".` });
    return null;
  }
  const paidFlag = parsePaidFlag(get(row, "paid"));
  if (paidFlag == null) {
    result.errors.push({ line, message: 'Coluna Pago inválida. Use 1/X/pago (sim) ou 0 (não).' });
    return null;
  }

  // Data (competência) é obrigatória: alimenta competência e, na prática, os filtros de mês
  // em Contas a receber quando Prev. Pagamento não veio preenchido.
  const competenceDate = parseCompetenceOrDate(get(row, "date"));
  if (!competenceDate) {
    result.errors.push({
      line,
      message:
        'Coluna Data obrigatória. Informe uma data válida (ex.: 01/07/2026 ou jan/26) — usada nos filtros de mês em Contas a receber.',
    });
    return null;
  }

  const nfEmissionRaw = get(row, "nf_emission");
  const nfNumberRaw = get(row, "nf_number");
  const dueRaw = get(row, "due_date");
  const nfEmission = parseDateFlexible(nfEmissionRaw);
  const dueParsed = parseDateFlexible(dueRaw);
  const isDebitNote = isNotApplicableValue(nfNumberRaw);
  const nfNumber =
    isBlankSpreadsheetValue(nfNumberRaw) && !isDebitNote ? "" : nfNumberRaw.trim();

  // Com Pago = 1: Dt Emissão NF, Nro NF e Prev. Pagamento são obrigatórios.
  if (paidFlag) {
    if (!dueParsed) {
      result.errors.push({
        line,
        message:
          "Com Pago = 1, Prev. Pagamento é obrigatório e deve ser uma data válida (ex.: 10/07/2026).",
      });
      return null;
    }
    if (!nfEmission) {
      result.errors.push({
        line,
        message:
          "Com Pago = 1, Dt Emissão NF é obrigatória e deve ser uma data válida (ex.: 01/07/2026).",
      });
      return null;
    }
    if (!isDebitNote && !nfNumber) {
      result.errors.push({
        line,
        message:
          'Com Pago = 1, Nro NF é obrigatório (número da NF/invoice, ou N/A para nota de débito).',
      });
      return null;
    }
  }

  const dueDate = dueParsed ?? competenceDate;

  const costCenterRaw = get(row, "cost_center");
  let costCenter =
    costCenterRaw
      ? singleByName(ctx.costCenters, costCenterRaw, (item) => [item.name, item.code])
      : null;
  if (costCenter === "AMBIGUOUS") {
    result.errors.push({ line, message: "Centro de custo ambíguo." });
    return null;
  }
  if (!costCenter) {
    costCenter =
      ctx.costCenters.find((c) => normalize(c.name) === "administrativo") ??
      ctx.costCenters[0] ??
      null;
  }
  if (!costCenter) {
    result.errors.push({ line, message: "Nenhum centro de custo ativo no tenant." });
    return null;
  }

  const client = singleByName(ctx.clients, get(row, "client"), (item) => [item.name]);
  if (!client || client === "AMBIGUOUS") {
    result.errors.push({ line, message: "Cliente não encontrado ou ambíguo." });
    return null;
  }

  const accountRaw = get(row, "financial_account");
  if (!accountRaw || isBlankSpreadsheetValue(accountRaw)) {
    result.errors.push({
      line,
      message: "Conta financeira é obrigatória. Informe o nome de uma conta de RECEITA ativa.",
    });
    return null;
  }
  const receitaAccounts = ctx.accounts.filter((a) => a.type === "RECEITA");
  const account = singleByName(receitaAccounts, accountRaw, (item) => [item.name, item.code]);
  if (!account || account === "AMBIGUOUS") {
    result.errors.push({
      line,
      message: `Conta financeira não encontrada ou ambígua: "${accountRaw}". Use o nome de uma conta de RECEITA ativa.`,
    });
    return null;
  }

  let project: (typeof ctx.projects)[number] | null = null;
  const clientProjects = ctx.projects.filter((p) => p.clientId === client.id);
  const resolveProjectByName = (raw: string) => {
    if (!raw || isBlankSpreadsheetValue(raw)) return null;
    const found = singleByName(clientProjects, raw, (item) => [item.name]);
    if (found === "AMBIGUOUS") return "AMBIGUOUS" as const;
    // Já restrito ao cliente da linha — não exige checagem extra de acesso ao projeto.
    return found;
  };

  // Ordem: Cliente → Projeto (coluna Projeto; se vazia, tenta o texto de Atividade/Descrição).
  let projectLookup: ReturnType<typeof resolveProjectByName> = null;
  if (projectRaw) {
    projectLookup = resolveProjectByName(projectRaw);
  }
  if (!projectLookup) {
    const descriptionRaw = get(row, "description");
    if (descriptionRaw && descriptionRaw !== projectRaw) {
      projectLookup = resolveProjectByName(descriptionRaw);
    } else if (!projectRaw && description) {
      projectLookup = resolveProjectByName(description);
    }
  }
  if (projectLookup === "AMBIGUOUS") {
    result.errors.push({
      line,
      message: "Projeto ambíguo para este cliente. Informe o nome exato do projeto cadastrado.",
    });
    return null;
  }
  project = projectLookup;
  if (!project) {
    result.errors.push({
      line,
      message:
        "Projeto obrigatório e não encontrado para este cliente. Informe na coluna Projeto (ou Atividade/Descrição) um projeto cadastrado do cliente — a importação cria a receita do projeto e vincula ao resultado.",
    });
    return null;
  }

  // Classificação pela subcategoria da conta financeira (Plano de contas > Receitas).
  const revenueClass = classifyReceivableByAccountSubcategory(account.dreSubcategory);
  if (!revenueClass) {
    result.errors.push({
      line,
      message: `Conta financeira "${account.name}" sem subcategoria. Em Plano de contas > Receitas, defina Faturamento ou Outras receitas.`,
    });
    return null;
  }
  const isBillingFaturamento = revenueClass === "FATURAMENTO";

  const contractRaw = get(row, "contract");
  const contractTitle =
    contractRaw && !isBlankSpreadsheetValue(contractRaw) ? contractRaw.trim().slice(0, 200) : null;

  return {
    line,
    description,
    amountCents,
    paidFlag,
    competenceDate,
    dueDate,
    nfEmission,
    nfNumber,
    isDebitNote,
    costCenter: { id: costCenter.id },
    client: { id: client.id },
    account: { id: account.id, name: account.name },
    project: { id: project.id, name: project.name },
    isBillingFaturamento,
    contractTitle,
  };
}

async function applyReceitaDocumentsAndPayments(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId?: string;
  row: ParsedReceitaRow;
}): Promise<void> {
  const document = receitaDocument(params.row);
  if (document) {
    const invoiceResult = await issueInvoice(
      params.tenantId,
      params.userId,
      params.receivableId,
      {
        nfNumber: document.number,
        emissionDate: document.emissionDate,
        grossAmountCents: params.row.amountCents,
        netAmountCents: params.row.amountCents,
        taxAmountCents: 0,
        retentionAmountCents: 0,
      },
      params.installmentId ? { installmentId: params.installmentId } : undefined,
    );
    if (invoiceResult.ok === false) {
      throw new Error(`Falha ao registrar NF: ${invoiceResult.error}`);
    }
  }
  if (params.row.paidFlag) {
    const paidAt = params.row.dueDate.toISOString().slice(0, 10);
    const receiveResult = params.installmentId
      ? await receiveInstallment(
          params.tenantId,
          params.userId,
          params.receivableId,
          params.installmentId,
          paidAt,
        )
      : await markReceivableAsReceived(
          params.tenantId,
          params.userId,
          params.receivableId,
          paidAt,
        );
    if (receiveResult.ok === false) {
      throw new Error(`Falha ao registrar recebimento: ${receiveResult.error}`);
    }
  }
}

async function persistGroupedFaturamentoReceita(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  rows: ParsedReceitaRow[];
  result: FinanceCsvImportResult;
  onCreated?: (id: string) => void;
  onProjectRevenueCreated?: (id: string) => void;
}): Promise<void> {
  const { prisma, tenantId, userId, result } = params;
  const sorted = sortReceitaRows(params.rows);
  const first = sorted[0]!;
  const totalCents = sorted.reduce((sum, row) => sum + row.amountCents, 0);
  const paidCents = sorted
    .filter((row) => row.paidFlag)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const allPaid = sorted.every((row) => row.paidFlag);
  const startDate = sorted.reduce(
    (min, row) => (row.competenceDate < min ? row.competenceDate : min),
    first.competenceDate,
  );
  const endDate = sorted.reduce(
    (max, row) => (row.dueDate > max ? row.dueDate : max),
    first.dueDate,
  );
  const title = (first.contractTitle ?? first.description).slice(0, 200);
  const amountReais = totalCents / 100;

  const revenue = await prisma.projectRevenue.create({
    data: {
      tenantId,
      projectId: first.project.id,
      title,
      revenueType: "FIXA",
      contractProposal: first.contractTitle,
      contractedValue: amountReais,
      expectedRevenue: amountReais,
      realizedRevenue: paidCents > 0 ? paidCents / 100 : null,
      installmentCount: sorted.length,
      startDate,
      endDate,
      status: allPaid ? "FINALIZADO" : "ATIVO",
      isAdditive: false,
      autoBillingCalculation: false,
      billingLines: {
        create: sorted.map((row, index) => ({
          milestone: row.description.slice(0, 200),
          installmentNumber: index + 1,
          dueDate: row.dueDate,
          amount: row.amountCents / 100,
          sortOrder: index,
        })),
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: `Receita criada pela importação de Contas a receber (contrato ${first.contractTitle}, ${sorted.length} parcela(s)).`,
        },
      },
    },
    select: { id: true },
  });
  params.onProjectRevenueCreated?.(revenue.id);

  const created = await prisma.receivable.create({
    data: {
      tenantId,
      clientId: first.client.id,
      projectId: first.project.id,
      projectRevenueId: revenue.id,
      financialAccountId: first.account.id,
      description: title.slice(0, 500),
      totalAmountCents: totalCents,
      competenceDate: startDate,
      contractTitle: first.contractTitle,
      kind: "PROJETO",
      status: "PREVISTO",
      sourceType: "PROJECT_REVENUE",
      sourceId: revenue.id,
      createdById: userId,
      notes: [
        "Importação por planilha (receitas) em Lançamentos.",
        `Contrato: ${first.contractTitle}`,
        "Classificação: Faturamento (conta financeira).",
        `${sorted.length} parcela(s) agrupadas por contrato + projeto.`,
      ].join(" "),
      installments: {
        create: sorted.map((row, index) => ({
          installmentNumber: index + 1,
          dueDate: row.dueDate,
          competenceDate: row.competenceDate,
          amountCents: row.amountCents,
          status: "PREVISTO",
        })),
      },
      allocations: {
        create: {
          costCenterId: first.costCenter.id,
          projectId: first.project.id,
          percentBps: 10000,
          amountCents: totalCents,
        },
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: `Importação receitas agrupada por contrato ${first.contractTitle} (${sorted.length} parcela(s)).`,
        },
      },
    },
    select: { id: true },
  });
  params.onCreated?.(created.id);

  const installments = await prisma.receivableInstallment.findMany({
    where: { receivableId: created.id },
    orderBy: { installmentNumber: "asc" },
    select: { id: true, installmentNumber: true },
  });

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]!;
    const installment = installments.find((item) => item.installmentNumber === index + 1);
    if (!installment) {
      throw new Error("Parcela não encontrada após agrupamento da importação.");
    }
    await applyReceitaDocumentsAndPayments({
      tenantId,
      userId,
      receivableId: created.id,
      installmentId: installment.id,
      row,
    });
  }

  result.createdReceivables += 1;
  result.createdReceivableInstallments += sorted.length;
}

async function persistSingleReceitaRow(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  parsed: ParsedReceitaRow;
  result: FinanceCsvImportResult;
  onCreated?: (id: string) => void;
  onProjectRevenueCreated?: (id: string) => void;
}): Promise<void> {
  const { prisma, tenantId, userId, parsed, result } = params;
  const amountReais = parsed.amountCents / 100;
  const revenueTitle = parsed.description.slice(0, 200);
  let projectRevenueId: string | null = null;
  const notesParts = ["Importação por planilha (receitas) em Lançamentos."];
  if (parsed.contractTitle) notesParts.push(`Contrato: ${parsed.contractTitle}`);
  notesParts.push(
    parsed.isBillingFaturamento
      ? "Classificação: Faturamento (conta financeira)."
      : `Classificação: Outras receitas — conta ${parsed.account.name}.`,
  );

  if (parsed.isBillingFaturamento) {
    const revenue = await prisma.projectRevenue.create({
      data: {
        tenantId,
        projectId: parsed.project.id,
        title: revenueTitle,
        revenueType: "FIXA",
        contractProposal: parsed.contractTitle,
        contractedValue: amountReais,
        expectedRevenue: amountReais,
        realizedRevenue: parsed.paidFlag ? amountReais : null,
        installmentCount: 1,
        startDate: parsed.competenceDate,
        endDate: parsed.dueDate,
        status: parsed.paidFlag ? "FINALIZADO" : "ATIVO",
        isAdditive: false,
        autoBillingCalculation: false,
        billingLines: {
          create: [
            {
              milestone: revenueTitle,
              installmentNumber: 1,
              dueDate: parsed.dueDate,
              amount: amountReais,
              sortOrder: 0,
            },
          ],
        },
        history: {
          create: {
            userId,
            action: "CREATE",
            details: `Receita criada pela importação de Contas a receber: ${revenueTitle.slice(0, 120)}`,
          },
        },
      },
      select: { id: true },
    });
    projectRevenueId = revenue.id;
    params.onProjectRevenueCreated?.(revenue.id);
  }

  const installments = buildInstallmentPlan(parsed.amountCents, 1, parsed.dueDate);
  const created = await prisma.receivable.create({
    data: {
      tenantId,
      clientId: parsed.client.id,
      projectId: parsed.project.id,
      projectRevenueId,
      financialAccountId: parsed.account.id,
      description: parsed.description.slice(0, 500),
      totalAmountCents: parsed.amountCents,
      competenceDate: parsed.competenceDate,
      contractTitle: parsed.contractTitle,
      kind: parsed.isBillingFaturamento ? "PROJETO" : "MANUAL",
      status: "PREVISTO",
      sourceType: parsed.isBillingFaturamento ? "PROJECT_REVENUE" : "IMPORT",
      sourceId: projectRevenueId,
      createdById: userId,
      notes: notesParts.join(" "),
      installments: {
        create: installments.map((item) => ({
          installmentNumber: item.installmentNumber,
          dueDate: item.dueDate,
          competenceDate: parsed.competenceDate,
          amountCents: item.amountCents,
          status: "PREVISTO",
        })),
      },
      allocations: {
        create: {
          costCenterId: parsed.costCenter.id,
          projectId: parsed.project.id,
          percentBps: 10000,
          amountCents: parsed.amountCents,
        },
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: parsed.isBillingFaturamento
            ? `Importação receitas (vinculada à receita do projeto): ${parsed.description.slice(0, 100)}`
            : `Importação receitas (outras receitas — ${parsed.account.name}): ${parsed.description.slice(0, 80)}`,
        },
      },
    },
    select: { id: true },
  });
  params.onCreated?.(created.id);

  await applyReceitaDocumentsAndPayments({
    tenantId,
    userId,
    receivableId: created.id,
    row: parsed,
  });

  result.createdReceivables += 1;
  result.createdReceivableInstallments += 1;
}

async function importDespesaRow(ctx: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  row: string[];
  line: number;
  get: (row: string[], key: string) => string;
  result: FinanceCsvImportResult;
  accounts: Array<{
    id: string;
    name: string;
    code: string | null;
    type: string;
    dreSubcategory?: string | null;
    isActive?: boolean;
  }>;
  costCenters: Array<{ id: string; name: string; code: string | null }>;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
  suppliers: Array<{ id: string; nomeApelido: string; razaoSocial: string | null }>;
  users: Array<{ id: string; name: string; employmentType: string | null }>;
  contractTypes: Array<{ id: string; name: string }>;
  dryRun: boolean;
  onCreated?: (id: string) => void;
}) {
  const { prisma, tenantId, userId, row, line, get, result, dryRun } = ctx;
  const description = get(row, "description");
  if (!description) {
    result.errors.push({ line, message: "Atividade/Descrição obrigatória." });
    return;
  }
  const amountCents = parseBrlAmountToCents(get(row, "amount"));
  if (amountCents == null || amountCents <= 0) {
    result.errors.push({ line, message: `Valor inválido: "${get(row, "amount")}".` });
    return;
  }
  const paidFlag = parsePaidFlag(get(row, "paid"));
  if (paidFlag == null) {
    result.errors.push({ line, message: 'Coluna Pago inválida. Use 1/pago (sim) ou 0 (não).' });
    return;
  }

  const dateParsed = parseDateFlexible(get(row, "date"));
  const dueParsed = parseDateFlexible(get(row, "due_date"));
  const monthHint = monthHintToDate(
    get(row, "month"),
    dateParsed?.getUTCFullYear() ?? dueParsed?.getUTCFullYear() ?? null,
  );
  const competenceDate = dateParsed ?? monthHint ?? dueParsed;
  const dueDate = dueParsed ?? dateParsed ?? monthHint;
  if (!dueDate) {
    result.errors.push({ line, message: "Informe Vencimento ou Data válido." });
    return;
  }

  const costCenter = singleByName(ctx.costCenters, get(row, "cost_center"), (item) => [
    item.name,
    item.code,
  ]);
  if (!costCenter || costCenter === "AMBIGUOUS") {
    result.errors.push({ line, message: "Centro de custo não encontrado ou ambíguo." });
    return;
  }
  const resolvedCostCenter = costCenter;

  const clientRaw = get(row, "client");
  let clientId: string | null = null;
  if (clientRaw && !isBlankSpreadsheetValue(clientRaw)) {
    const client = singleByName(ctx.clients, clientRaw, (item) => [item.name]);
    if (!client || client === "AMBIGUOUS") {
      result.errors.push({
        line,
        message:
          client === "AMBIGUOUS"
            ? `Cliente ambíguo: "${clientRaw}". Informe o nome exato.`
            : `Cliente não encontrado: "${clientRaw}".`,
      });
      return;
    }
    clientId = client.id;
  }

  const projectRaw = get(row, "project");
  let projectId: string | null = null;
  if (projectRaw && !isBlankSpreadsheetValue(projectRaw)) {
    const projectPool = clientId
      ? ctx.projects.filter((p) => p.clientId === clientId)
      : ctx.projects;
    const project = singleByName(projectPool, projectRaw, (item) => [item.name]);
    if (project === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: clientId
          ? `Projeto ambíguo para este cliente: "${projectRaw}". Informe o nome exato.`
          : `Projeto ambíguo: "${projectRaw}". Preencha também a coluna Cliente.`,
      });
      return;
    }
    if (!project) {
      result.errors.push({
        line,
        message: clientId
          ? `Projeto não encontrado para este cliente: "${projectRaw}".`
          : `Projeto não encontrado: "${projectRaw}".`,
      });
      return;
    }
    projectId = project.id;
  }

  const expenseAccounts = ctx.accounts.filter((a) => a.type === "DESPESA");
  const categoryRaw =
    get(row, "category") || get(row, "category_generic") || get(row, "category_final");
  let account = categoryRaw ? matchExpenseAccount(expenseAccounts, categoryRaw) : null;
  if (categoryRaw && (account === "AMBIGUOUS" || !account)) {
    result.errors.push({
      line,
      message:
        account === "AMBIGUOUS"
          ? `Categoria financeira ambígua: "${categoryRaw}". Use o nome exato da conta em Configuração > Financeiro > Plano de contas > Despesas.`
          : `Categoria financeira não encontrada em Configuração > Financeiro > Plano de contas > Despesas: "${categoryRaw}".`,
    });
    return;
  }
  if (!account) {
    account =
      expenseAccounts.find((item) => item.isActive !== false) ?? expenseAccounts[0] ?? null;
  }
  if (!account || account === "AMBIGUOUS") {
    result.errors.push({
      line,
      message: "Nenhuma conta de despesa cadastrada em Plano de contas > Despesas.",
    });
    return;
  }
  const resolvedAccount = account;

  const contractTypeRaw = get(row, "contract_type");
  let contractTypeId: string | null = null;
  if (contractTypeRaw && !isBlankSpreadsheetValue(contractTypeRaw)) {
    const found = singleByName(ctx.contractTypes, contractTypeRaw, (item) => [item.name]);
    if (found === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: `Tipo de contrato ambíguo: "${contractTypeRaw}". Informe o nome exato.`,
      });
      return;
    }
    if (found) contractTypeId = found.id;
  }

  const payeeRaw = get(row, "payee");
  const supplierRaw = get(row, "supplier");
  let supplierId: string | null = null;
  let professionalUserId: string | null = null;
  let payeeName: string | null = payeeRaw || supplierRaw || null;
  let professionalEmploymentType: string | null = null;

  if (supplierRaw && !isBlankSpreadsheetValue(supplierRaw)) {
    const supplier = singleByName(ctx.suppliers, supplierRaw, (item) => [
      item.nomeApelido,
      item.razaoSocial,
    ]);
    if (!supplier || supplier === "AMBIGUOUS") {
      result.errors.push({
        line,
        message:
          supplier === "AMBIGUOUS"
            ? "Fornecedor ambíguo."
            : `Fornecedor não encontrado: "${supplierRaw}".`,
      });
      return;
    }
    supplierId = supplier.id;
    payeeName = supplier.nomeApelido;
  }

  if (payeeRaw && !isBlankSpreadsheetValue(payeeRaw)) {
    const user = singlePersonByName(ctx.users, payeeRaw, (item) => [item.name]);
    if (user === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: `Profissional/Empresa ambíguo: "${payeeRaw}". Informe o nome completo.`,
      });
      return;
    }
    if (user) {
      professionalUserId = user.id;
      payeeName = user.name;
      professionalEmploymentType = user.employmentType;
    } else if (!supplierId) {
      const supplier = singleByName(ctx.suppliers, payeeRaw, (item) => [
        item.nomeApelido,
        item.razaoSocial,
      ]);
      if (supplier === "AMBIGUOUS") {
        result.errors.push({ line, message: "Profissional/Empresa ambíguo." });
        return;
      }
      if (supplier) {
        supplierId = supplier.id;
        payeeName = supplier.nomeApelido;
      }
    }
  }

  // Tipo de contrato vem do cadastro do profissional (Usuários > Financeiro), não da coluna Tipo da planilha.
  if (professionalUserId) {
    const fromUser = await resolveContractTypeIdFromEmploymentType(
      tenantId,
      professionalEmploymentType,
      prisma,
    );
    if (fromUser) contractTypeId = fromUser;
  } else if (supplierId) {
    const resolved = await resolveProfessionalFromSupplierId(tenantId, supplierId, prisma);
    if (resolved) {
      professionalUserId = resolved.professionalUserId;
      if (resolved.contractTypeId) contractTypeId = resolved.contractTypeId;
    }
  }

  const paymentMethodParsed = parsePayablePaymentMethodFromSheet(get(row, "payment_method"));
  if (paymentMethodParsed === "INVALID") {
    result.errors.push({
      line,
      message:
        'Forma de pagamento inválida. Use PIX, TED, Boleto ou Cartão de crédito.',
    });
    return;
  }
  const paymentMethod = paymentMethodParsed;

  const hourRateCents = get(row, "hour_rate")
    ? parseBrlAmountToCents(get(row, "hour_rate"))
    : null;
  if (get(row, "hour_rate") && !isBlankSpreadsheetValue(get(row, "hour_rate")) && hourRateCents == null) {
    result.errors.push({ line, message: `Tx hora inválida: "${get(row, "hour_rate")}".` });
    return;
  }
  const discountCents =
    get(row, "discount") && !isBlankSpreadsheetValue(get(row, "discount"))
      ? parseBrlAmountToCents(get(row, "discount"))
      : null;
  if (get(row, "discount") && !isBlankSpreadsheetValue(get(row, "discount")) && discountCents == null) {
    result.errors.push({ line, message: `Descontos inválidos: "${get(row, "discount")}".` });
    return;
  }
  const interestFineCents =
    get(row, "interest_fine") && !isBlankSpreadsheetValue(get(row, "interest_fine"))
      ? parseBrlAmountToCents(get(row, "interest_fine"))
      : null;
  if (
    get(row, "interest_fine") &&
    !isBlankSpreadsheetValue(get(row, "interest_fine")) &&
    interestFineCents == null
  ) {
    result.errors.push({ line, message: `Juros/Multa inválidos: "${get(row, "interest_fine")}".` });
    return;
  }

  const complementaryParsed =
    get(row, "complementary_hours") && !isBlankSpreadsheetValue(get(row, "complementary_hours"))
      ? parseComplementaryHoursField(get(row, "complementary_hours"), hourRateCents)
      : ({ ok: true, hours: null, extraAmountCents: 0 } as const);
  if (complementaryParsed.ok === false) {
    result.errors.push({
      line,
      message: complementaryParsed.message,
    });
    return;
  }
  const complementaryHours = complementaryParsed.hours;
  const complementaryExtraCents = complementaryParsed.extraAmountCents ?? 0;
  // Quando a planilha manda R$ em H. compl. sem Tx hora, incorpora no valor da linha.
  const baseAmountCents = amountCents + complementaryExtraCents;

  const installmentTotal = computePayableTotalCents({
    totalAmountCents: baseAmountCents,
    hourRateCents,
    complementaryHours,
    benefitCents: 0,
    reimbursementCents: 0,
    discountCents,
    interestFineCents,
  });
  if (installmentTotal <= 0) {
    result.errors.push({
      line,
      message: "Valor líquido (Valor + Tx hora × H. compl. − Descontos + Juros/Multa) deve ser positivo.",
    });
    return;
  }

  if (dryRun) return;

  async function createPayableLine(opts: {
    description: string;
    totalAmountCents: number;
    installmentAmountCents: number;
    financialAccountId: string;
    contractTypeId: string | null;
    paymentMethod: string | null;
    hourRateCents: number | null;
    discountCents: number | null;
    complementaryHours: number | null;
    interestFineCents: number | null;
    historyDetail: string;
  }): Promise<string> {
    const installments = buildInstallmentPlan(opts.installmentAmountCents, 1, dueDate!);
    const created = await prisma.payable.create({
      data: {
        tenantId,
        supplierId,
        professionalUserId,
        payeeName,
        financialAccountId: opts.financialAccountId,
        financialCategoryId: null,
        contractTypeId: opts.contractTypeId,
        description: opts.description.slice(0, 500),
        totalAmountCents: opts.totalAmountCents,
        hourRateCents: opts.hourRateCents,
        discountCents: opts.discountCents,
        reimbursementCents: null,
        complementaryHours: opts.complementaryHours,
        interestFineCents: opts.interestFineCents,
        competenceDate: competenceDate ?? dueDate!,
        paymentMethod: opts.paymentMethod,
        kind: "MANUAL",
        status: "ABERTO",
        requiresApproval: false,
        createdById: userId,
        notes: "Importação por planilha (despesas) em Lançamentos.",
        installments: {
          create: installments.map((item) => ({
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            amountCents: item.amountCents,
            status: "ABERTO",
          })),
        },
        allocations: {
          create: {
            costCenterId: resolvedCostCenter.id,
            projectId,
            percentBps: 10000,
            amountCents: opts.installmentAmountCents,
          },
        },
        history: {
          create: {
            userId,
            action: "CREATE",
            details: opts.historyDetail.slice(0, 500),
          },
        },
      },
      select: { id: true },
    });
    ctx.onCreated?.(created.id);

    if (paidFlag) {
      const paidAt = dueDate!.toISOString().slice(0, 10);
      const payResult = await markPayableAsPaid(tenantId, userId, created.id, paidAt);
      if (payResult.ok === false) {
        throw new Error(`Falha ao registrar pagamento: ${payResult.error}`);
      }
    }
    return created.id;
  }

  await createPayableLine({
    description,
    totalAmountCents: baseAmountCents,
    installmentAmountCents: installmentTotal,
    financialAccountId: resolvedAccount.id,
    contractTypeId,
    paymentMethod,
    hourRateCents,
    discountCents,
    complementaryHours,
    interestFineCents,
    historyDetail: `Importação despesas: ${description.slice(0, 120)}`,
  });
  result.createdPayables += 1;
}
