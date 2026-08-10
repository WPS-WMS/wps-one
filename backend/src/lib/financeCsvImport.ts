import type { PrismaClient } from "@prisma/client";
import { parseBrlAmountToCents, parseDateFlexible } from "./payableCsvImport.js";
import { buildInstallmentPlan, computePayableTotalCents } from "./payableHelpers.js";
import { detectCsvSeparator, parseCsvRows, stripBom } from "./projectCsvImport.js";
import { markPayableAsPaid } from "./payableService.js";
import { issueInvoice, markReceivableAsReceived } from "./receivableService.js";
import {
  resolveContractTypeFromUserId,
  resolveProfessionalFromSupplierId,
} from "./userContractTypeHelpers.js";

export type FinanceImportKind = "RECEITA" | "DESPESA";

export type FinanceCsvImportResult = {
  createdPayables: number;
  createdReceivables: number;
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
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Aceita horas (ex.: "12,5") ou valor em R$ na planilha operacional.
 * Em R$, converte para horas pela Tx Hora quando houver.
 */
function parseComplementaryHoursField(
  raw: string,
  hourRateCents: number | null,
): { ok: true; hours: number | null } | { ok: false; message: string } {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, hours: null };

  if (/r\s*\$/i.test(t)) {
    const cents = parseBrlAmountToCents(t);
    if (cents == null || cents < 0) {
      return { ok: false, message: `Horas complementares inválidas: "${t}".` };
    }
    if (cents === 0) return { ok: true, hours: 0 };
    if (hourRateCents != null && hourRateCents > 0) {
      return { ok: true, hours: Math.round((cents / hourRateCents) * 100) / 100 };
    }
    // Sem taxa hora: não bloqueia a linha (campo fica vazio).
    return { ok: true, hours: null };
  }

  const hours = parseHours(t);
  if (hours == null) {
    return { ok: false, message: `Horas complementares inválidas: "${t}".` };
  }
  return { ok: true, hours };
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
  // "Tipo de contrato" antes de "Tipo" (Ctg Fin).
  if (
    ["tipo_contrato", "tipo_de_contrato", "contrato"].includes(h) ||
    (h.includes("tipo") && h.includes("contrato"))
  ) {
    return "contract_type";
  }
  // Planilha empresa: coluna "Tipo" = Ctg Fin no sistema.
  if (
    ["categoria_financeira", "categoria", "tipo", "ctg_fin", "categoria_financeira_tipo"].includes(h) ||
    (h.includes("categoria") && h.includes("finance"))
  ) {
    return "category";
  }
  if (["vencimento", "data_vencimento", "data_de_vencimento"].includes(h)) return "due_date";
  if (
    ["profissional_empresa", "profissional", "empresa", "fornecedor", "beneficiario"].includes(h) ||
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
  if (["tx_hora", "taxa_hora"].includes(h) || (h.includes("tx") && h.includes("hora"))) {
    return "hour_rate";
  }
  if (["valor", "valor_rs", "valor_em_rs"].includes(h)) return "amount";
  if (["descontos", "desconto"].includes(h)) return "discount";
  if (["beneficio", "beneficios"].includes(h)) return "benefit";
  if (["reembolso", "reembolsos"].includes(h)) return "reimbursement";
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

function isNotApplicableValue(raw: string): boolean {
  const v = normalize(raw);
  return v === "n/a" || v === "na" || v === "n_a" || v === "n.a";
}

function isBlankSpreadsheetValue(raw: string): boolean {
  const v = normalize(raw);
  return !v || v === "-" || v === "r_-" || isNotApplicableValue(raw);
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
  canAccessProject: (projectId: string) => Promise<boolean>;
  maxRows?: number;
}): Promise<FinanceCsvImportResult> {
  const { prisma, tenantId, userId, importKind } = params;
  const result: FinanceCsvImportResult = {
    createdPayables: 0,
    createdReceivables: 0,
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

  const [accounts, costCenters, categories, clients, suppliers, projects, users, contractTypes] =
    await Promise.all([
      prisma.financialAccount.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, type: true },
      }),
      prisma.costCenter.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, code: true },
      }),
      prisma.financialCategory.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
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
  const projectAccessCache = new Map<string, boolean>();
  const hasProjectAccess = async (projectId: string) => {
    if (!projectAccessCache.has(projectId)) {
      projectAccessCache.set(projectId, await params.canAccessProject(projectId));
    }
    return projectAccessCache.get(projectId) === true;
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

  const abortImport = async (createdReceivableIds: string[], createdPayableIds: string[]) => {
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
    result.createdReceivables = 0;
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
  for (const { row, line } of pending) {
    try {
      if (importKind === "RECEITA") {
        await importReceitaRow({
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
          hasProjectAccess,
          dryRun: true,
        });
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
          categories,
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

  if (result.errors.length > 0) {
    await abortImport([], []);
    return result;
  }

  // 2) Só grava se nenhuma linha tiver erro. Qualquer falha no meio desfaz o lote.
  const createdReceivableIds: string[] = [];
  const createdPayableIds: string[] = [];
  for (const { row, line } of pending) {
    try {
      if (importKind === "RECEITA") {
        await importReceitaRow({
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
          hasProjectAccess,
          dryRun: false,
          onCreated: (id) => createdReceivableIds.push(id),
        });
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
          categories,
          suppliers,
          users,
          contractTypes,
          dryRun: false,
          onCreated: (id) => createdPayableIds.push(id),
        });
      }
    } catch (error) {
      result.errors.push({
        line,
        message: error instanceof Error ? error.message : "Erro ao importar linha.",
      });
    }
    if (result.errors.length > 0) {
      await abortImport(createdReceivableIds, createdPayableIds);
      return result;
    }
  }

  return result;
}

async function importReceitaRow(ctx: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  row: string[];
  line: number;
  get: (row: string[], key: string) => string;
  result: FinanceCsvImportResult;
  accounts: Array<{ id: string; name: string; code: string | null; type: string }>;
  costCenters: Array<{ id: string; name: string; code: string | null }>;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
  hasProjectAccess: (projectId: string) => Promise<boolean>;
  dryRun: boolean;
  onCreated?: (id: string) => void;
}) {
  const { prisma, tenantId, userId, row, line, get, result, dryRun } = ctx;
  const projectRaw = get(row, "project");
  const description = (get(row, "description") || projectRaw || "").trim();
  if (!description) {
    result.errors.push({ line, message: "Projeto ou Atividade/Descrição obrigatória." });
    return;
  }
  const amountCents = parseBrlAmountToCents(get(row, "amount"));
  if (amountCents == null || amountCents <= 0) {
    result.errors.push({ line, message: `Valor inválido: "${get(row, "amount")}".` });
    return;
  }
  const paidFlag = parsePaidFlag(get(row, "paid"));
  if (paidFlag == null) {
    result.errors.push({ line, message: 'Coluna Pago inválida. Use 1/X/pago (sim) ou 0 (não).' });
    return;
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
    return;
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
      return;
    }
    if (!nfEmission) {
      result.errors.push({
        line,
        message:
          "Com Pago = 1, Dt Emissão NF é obrigatória e deve ser uma data válida (ex.: 01/07/2026).",
      });
      return;
    }
    if (!isDebitNote && !nfNumber) {
      result.errors.push({
        line,
        message:
          'Com Pago = 1, Nro NF é obrigatório (número da NF/invoice, ou N/A para nota de débito).',
      });
      return;
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
    return;
  }
  if (!costCenter) {
    costCenter =
      ctx.costCenters.find((c) => normalize(c.name) === "administrativo") ??
      ctx.costCenters[0] ??
      null;
  }
  if (!costCenter) {
    result.errors.push({ line, message: "Nenhum centro de custo ativo no tenant." });
    return;
  }

  const client = singleByName(ctx.clients, get(row, "client"), (item) => [item.name]);
  if (!client || client === "AMBIGUOUS") {
    result.errors.push({ line, message: "Cliente não encontrado ou ambíguo." });
    return;
  }

  const accountRaw = get(row, "financial_account");
  if (!accountRaw || isBlankSpreadsheetValue(accountRaw)) {
    result.errors.push({
      line,
      message: "Conta financeira é obrigatória. Informe o nome de uma conta de RECEITA ativa.",
    });
    return;
  }
  const receitaAccounts = ctx.accounts.filter((a) => a.type === "RECEITA");
  const account = singleByName(receitaAccounts, accountRaw, (item) => [item.name, item.code]);
  if (!account || account === "AMBIGUOUS") {
    result.errors.push({
      line,
      message: `Conta financeira não encontrada ou ambígua: "${accountRaw}". Use o nome de uma conta de RECEITA ativa.`,
    });
    return;
  }

  let project: (typeof ctx.projects)[number] | null = null;
  if (projectRaw && !isBlankSpreadsheetValue(projectRaw)) {
    // Ordem: Cliente já resolvido acima → Projeto só entre os cadastrados desse cliente.
    const found = singleByName(
      ctx.projects.filter((p) => p.clientId === client.id),
      projectRaw,
      (item) => [item.name],
    );
    if (found && found !== "AMBIGUOUS" && (await ctx.hasProjectAccess(found.id))) {
      project = found;
    }
    // Nome preenchido mas sem projeto cadastrado (ou ambíguo): importa sem vínculo de projeto.
  }

  const contractRaw = get(row, "contract");
  const contractTitle =
    contractRaw && !isBlankSpreadsheetValue(contractRaw) ? contractRaw.trim().slice(0, 200) : null;
  const notesParts = ["Importação por planilha (receitas) em Lançamentos."];
  if (contractTitle) {
    notesParts.push(`Contrato: ${contractTitle}`);
  }

  if (dryRun) return;

  const installments = buildInstallmentPlan(amountCents, 1, dueDate);
  const created = await prisma.receivable.create({
    data: {
      tenantId,
      clientId: client.id,
      projectId: project?.id ?? null,
      financialAccountId: account.id,
      description: description.slice(0, 500),
      totalAmountCents: amountCents,
      competenceDate: competenceDate ?? dueDate,
      contractTitle,
      kind: "MANUAL",
      status: "PREVISTO",
      createdById: userId,
      notes: notesParts.join(" "),
      installments: {
        create: installments.map((item) => ({
          installmentNumber: item.installmentNumber,
          dueDate: item.dueDate,
          amountCents: item.amountCents,
          status: "PREVISTO",
        })),
      },
      allocations: {
        create: {
          costCenterId: costCenter.id,
          projectId: project?.id ?? null,
          percentBps: 10000,
          amountCents,
        },
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: `Importação receitas: ${description.slice(0, 120)}`,
        },
      },
    },
    select: { id: true },
  });
  ctx.onCreated?.(created.id);

  // Documento de cobrança: NF fiscal, invoice ou nota de débito (N/A).
  // Com Pago = 1 os três campos já foram validados acima.
  let document: { number: string; emissionDate: Date } | null = null;
  if (isDebitNote) {
    document = { number: DEBIT_NOTE_LABEL, emissionDate: nfEmission ?? dueDate };
  } else if (nfNumber) {
    document = { number: nfNumber.slice(0, 60), emissionDate: nfEmission ?? dueDate };
  }

  if (document) {
    const invoiceResult = await issueInvoice(tenantId, userId, created.id, {
      nfNumber: document.number,
      emissionDate: document.emissionDate,
      grossAmountCents: amountCents,
      netAmountCents: amountCents,
      taxAmountCents: 0,
      retentionAmountCents: 0,
    });
    if (invoiceResult.ok === false) {
      throw new Error(`Falha ao registrar NF: ${invoiceResult.error}`);
    }
  }

  if (paidFlag) {
    const paidAt = dueDate.toISOString().slice(0, 10);
    const receiveResult = await markReceivableAsReceived(tenantId, userId, created.id, paidAt);
    if (receiveResult.ok === false) {
      throw new Error(`Falha ao registrar recebimento: ${receiveResult.error}`);
    }
  }

  result.createdReceivables += 1;
}

async function importDespesaRow(ctx: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  row: string[];
  line: number;
  get: (row: string[], key: string) => string;
  result: FinanceCsvImportResult;
  accounts: Array<{ id: string; name: string; code: string | null; type: string }>;
  costCenters: Array<{ id: string; name: string; code: string | null }>;
  categories: Array<{ id: string; name: string }>;
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

  const account = ctx.accounts.find((a) => a.type === "DESPESA") ?? null;
  if (!account) {
    result.errors.push({ line, message: "Nenhuma conta financeira de DESPESA ativa no tenant." });
    return;
  }

  const categoryRaw = get(row, "category");
  const category = categoryRaw
    ? singleByName(ctx.categories, categoryRaw, (item) => [item.name])
    : null;
  if (category === "AMBIGUOUS" || (categoryRaw && !category)) {
    result.errors.push({ line, message: "Categoria financeira (Tipo/Ctg Fin) não encontrada ou ambígua." });
    return;
  }

  const contractTypeRaw = get(row, "contract_type");
  let contractTypeId: string | null = null;
  if (contractTypeRaw) {
    const found = singleByName(ctx.contractTypes, contractTypeRaw, (item) => [item.name]);
    if (!found || found === "AMBIGUOUS") {
      result.errors.push({ line, message: "Tipo de contrato não encontrado ou ambíguo." });
      return;
    }
    contractTypeId = found.id;
  }

  const payeeRaw = get(row, "payee");
  let supplierId: string | null = null;
  let professionalUserId: string | null = null;
  let payeeName: string | null = payeeRaw || null;
  if (payeeRaw) {
    const user = singleByName(ctx.users, payeeRaw, (item) => [item.name]);
    if (user && user !== "AMBIGUOUS") {
      professionalUserId = user.id;
      payeeName = user.name;
      if (!contractTypeId) {
        const resolved = await resolveContractTypeFromUserId(tenantId, user.id, prisma);
        contractTypeId = resolved?.contractTypeId ?? null;
      }
    } else {
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
        if (!contractTypeId) {
          const resolved = await resolveProfessionalFromSupplierId(tenantId, supplier.id, prisma);
          if (resolved) {
            professionalUserId = resolved.professionalUserId;
            contractTypeId = resolved.contractTypeId;
          }
        }
      }
    }
  }

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
  const reimbursementCents =
    get(row, "reimbursement") && !isBlankSpreadsheetValue(get(row, "reimbursement"))
      ? parseBrlAmountToCents(get(row, "reimbursement"))
      : null;
  if (
    get(row, "reimbursement") &&
    !isBlankSpreadsheetValue(get(row, "reimbursement")) &&
    reimbursementCents == null
  ) {
    result.errors.push({ line, message: `Reembolso inválido: "${get(row, "reimbursement")}".` });
    return;
  }

  const benefitRaw = get(row, "benefit");
  const benefitCents =
    benefitRaw && !isBlankSpreadsheetValue(benefitRaw) ? parseBrlAmountToCents(benefitRaw) : null;
  if (benefitRaw && !isBlankSpreadsheetValue(benefitRaw) && benefitCents == null) {
    result.errors.push({ line, message: `Benefício inválido: "${benefitRaw}".` });
    return;
  }

  const complementaryParsed =
    get(row, "complementary_hours") && !isBlankSpreadsheetValue(get(row, "complementary_hours"))
      ? parseComplementaryHoursField(get(row, "complementary_hours"), hourRateCents)
      : ({ ok: true, hours: null } as const);
  if (complementaryParsed.ok === false) {
    result.errors.push({
      line,
      message: complementaryParsed.message,
    });
    return;
  }
  const complementaryHours = complementaryParsed.hours;

  // Valor principal da linha (Benefício vira linha separada — não soma no total desta).
  const installmentTotal = computePayableTotalCents({
    totalAmountCents: amountCents,
    hourRateCents,
    complementaryHours,
    benefitCents: 0,
    reimbursementCents,
    discountCents,
    interestFineCents,
  });
  if (installmentTotal <= 0) {
    result.errors.push({
      line,
      message: "Valor líquido (Valor + Tx hora × H. compl. + Reembolso − Descontos + Juros/Multa) deve ser positivo.",
    });
    return;
  }

  let folhaCategory: { id: string; name: string } | null = null;
  let servicoType: { id: string; name: string } | null = null;
  if (benefitCents != null && benefitCents > 0) {
    const folha =
      singleByName(ctx.categories, "Folha", (item) => [item.name]) ??
      singleByName(ctx.categories, "folha", (item) => [item.name]);
    if (!folha || folha === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: 'Benefício informado, mas categoria "Folha" não encontrada no sistema.',
      });
      return;
    }
    const servico =
      singleByName(ctx.contractTypes, "Serviço", (item) => [item.name]) ??
      singleByName(ctx.contractTypes, "Servico", (item) => [item.name]);
    if (!servico || servico === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: 'Benefício informado, mas tipo de contrato "Serviço" não encontrado no sistema.',
      });
      return;
    }
    folhaCategory = folha;
    servicoType = servico;
  }

  if (dryRun) return;

  async function createPayableLine(opts: {
    description: string;
    totalAmountCents: number;
    installmentAmountCents: number;
    financialCategoryId: string | null;
    contractTypeId: string | null;
    hourRateCents: number | null;
    discountCents: number | null;
    reimbursementCents: number | null;
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
        financialAccountId: account!.id,
        financialCategoryId: opts.financialCategoryId,
        contractTypeId: opts.contractTypeId,
        description: opts.description.slice(0, 500),
        totalAmountCents: opts.totalAmountCents,
        hourRateCents: opts.hourRateCents,
        discountCents: opts.discountCents,
        reimbursementCents: opts.reimbursementCents,
        complementaryHours: opts.complementaryHours,
        interestFineCents: opts.interestFineCents,
        competenceDate: competenceDate ?? dueDate!,
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
    totalAmountCents: amountCents,
    installmentAmountCents: installmentTotal,
    financialCategoryId: category?.id ?? null,
    contractTypeId,
    hourRateCents,
    discountCents,
    reimbursementCents,
    complementaryHours,
    interestFineCents,
    historyDetail: `Importação despesas: ${description.slice(0, 120)}`,
  });
  result.createdPayables += 1;

  // Benefício preenchido → nova linha do mesmo usuário, Ctg Fin=Folha e Tipo=Serviço.
  if (benefitCents != null && benefitCents > 0 && folhaCategory && servicoType) {
    await createPayableLine({
      description,
      totalAmountCents: benefitCents,
      installmentAmountCents: benefitCents,
      financialCategoryId: folhaCategory.id,
      contractTypeId: servicoType.id,
      hourRateCents: null,
      discountCents: null,
      reimbursementCents: null,
      complementaryHours: null,
      interestFineCents: null,
      historyDetail: `Importação despesas (benefício): ${description.slice(0, 100)}`,
    });
    result.createdPayables += 1;
  }
}
