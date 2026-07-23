import type { PrismaClient } from "@prisma/client";
import { parseBrlAmountToCents, parseDateFlexible } from "./payableCsvImport.js";
import { buildInstallmentPlan } from "./payableHelpers.js";
import { detectCsvSeparator, parseCsvRows } from "./projectCsvImport.js";
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
  if (["1", "sim", "s", "true", "pago", "recebido", "yes"].includes(v)) return true;
  if (["0", "nao", "n", "false", "no", "aberto"].includes(v)) return false;
  return null;
}

function parseHours(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
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
  if (["contrato"].includes(h)) return "contract";
  if (["data", "competencia", "data_competencia"].includes(h)) return "date";
  if (["valor", "valor_rs", "valor_em_rs"].includes(h)) return "amount";
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
    ["prev_pagamento", "previsao_pagamento", "vencimento", "data_vencimento"].includes(h) ||
    (h.includes("prev") && h.includes("pagamento"))
  ) {
    return "due_date";
  }
  if (
    ["centro_de_custo", "centro_custo", "cc"].includes(h) ||
    (h.includes("centro") && h.includes("custo"))
  ) {
    return "cost_center";
  }
  if (["pago", "recebido", "status_pago"].includes(h)) return "paid";
  return null;
}

function resolveDespesaHeader(value: string): string | null {
  const h = normalizeHeader(value);
  if (["mes", "mes_ref", "mes_referencia"].includes(h)) return "month";
  if (["data", "competencia", "data_competencia"].includes(h)) return "date";
  if (
    ["categoria_financeira", "categoria", "tipo", "categoria_financeira_tipo"].includes(h) ||
    (h.includes("categoria") && h.includes("finance"))
  ) {
    return "category";
  }
  if (["vencimento", "data_vencimento"].includes(h)) return "due_date";
  if (["tipo_contrato", "contrato", "tipo_de_contrato"].includes(h)) return "contract_type";
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
  if (["tx_hora", "taxa_hora", "hora"].includes(h) || (h.includes("tx") && h.includes("hora"))) {
    return "hour_rate";
  }
  if (["valor", "valor_rs", "valor_em_rs"].includes(h)) return "amount";
  if (["descontos", "desconto"].includes(h)) return "discount";
  if (
    ["horas_complementares", "h_compl", "hora_complementar"].includes(h) ||
    (h.includes("hora") && h.includes("complement"))
  ) {
    return "complementary_hours";
  }
  if (["juros_multa", "juros", "multa"].includes(h) || (h.includes("juros") && h.includes("multa"))) {
    return "interest_fine";
  }
  if (["pago", "status_pago"].includes(h)) return "paid";
  return null;
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
  const text = String(params.csvText ?? "").replace(/^\uFEFF/, "").trim();
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
      ? (["client", "description", "amount", "cost_center"] as const)
      : (["description", "amount", "cost_center"] as const);
  for (const key of required) {
    if (!columns.has(key)) {
      result.errors.push({
        line: 1,
        message: `Coluna obrigatória ausente para ${importKind === "RECEITA" ? "receitas" : "despesas"}: ${key}. Baixe o modelo correspondente.`,
      });
    }
  }
  if (result.errors.length > 0) return result;

  const dataRows = matrix.slice(1);
  const maxRows = params.maxRows ?? 800;
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
        });
      }
    } catch (error) {
      result.errors.push({
        line,
        message: error instanceof Error ? error.message : "Erro ao importar linha.",
      });
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
}) {
  const { prisma, tenantId, userId, row, line, get, result } = ctx;
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
    result.errors.push({ line, message: 'Coluna Pago inválida. Use 1 (sim) ou 0 (não).' });
    return;
  }

  const competenceDate =
    parseDateFlexible(get(row, "date")) ??
    parseDateFlexible(get(row, "nf_emission")) ??
    parseDateFlexible(get(row, "due_date"));
  const dueDate =
    parseDateFlexible(get(row, "due_date")) ??
    parseDateFlexible(get(row, "date")) ??
    competenceDate;
  if (!dueDate) {
    result.errors.push({ line, message: "Informe Data ou Prev. Pagamento válido." });
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

  const client = singleByName(ctx.clients, get(row, "client"), (item) => [item.name]);
  if (!client || client === "AMBIGUOUS") {
    result.errors.push({ line, message: "Cliente não encontrado ou ambíguo." });
    return;
  }

  const account =
    ctx.accounts.find((a) => a.type === "RECEITA") ??
    ctx.accounts.filter((a) => a.type === "RECEITA")[0] ??
    null;
  if (!account) {
    result.errors.push({ line, message: "Nenhuma conta financeira de RECEITA ativa no tenant." });
    return;
  }

  let project: (typeof ctx.projects)[number] | null = null;
  const projectRaw = get(row, "project");
  if (projectRaw) {
    const found = singleByName(
      ctx.projects.filter((p) => p.clientId === client.id),
      projectRaw,
      (item) => [item.name],
    );
    if (!found || found === "AMBIGUOUS") {
      result.errors.push({ line, message: "Projeto não encontrado para o cliente ou ambíguo." });
      return;
    }
    if (!(await ctx.hasProjectAccess(found.id))) {
      result.errors.push({ line, message: "Sem acesso ao projeto informado." });
      return;
    }
    project = found;
  }

  const contractRaw = get(row, "contract");
  const notesParts = ["Importação por planilha (receitas) em Lançamentos."];
  if (contractRaw) notesParts.push(`Contrato: ${contractRaw}`);

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

  const nfNumber = get(row, "nf_number");
  const nfEmission = parseDateFlexible(get(row, "nf_emission"));
  if (nfNumber && nfEmission) {
    const invoiceResult = await issueInvoice(tenantId, userId, created.id, {
      nfNumber: nfNumber.slice(0, 60),
      emissionDate: nfEmission,
      grossAmountCents: amountCents,
      netAmountCents: amountCents,
      taxAmountCents: 0,
      retentionAmountCents: 0,
    });
    if (invoiceResult.ok === false) {
      result.errors.push({ line, message: `Conta criada, mas NF falhou: ${invoiceResult.error}` });
    }
  } else if (nfNumber || get(row, "nf_emission")) {
    result.errors.push({
      line,
      message: "Para registrar NF informe Dt Emissão NF e Nro NF juntos. Conta criada sem NF.",
    });
  }

  if (paidFlag) {
    const paidAt = (nfEmission ?? dueDate).toISOString().slice(0, 10);
    const receiveResult = await markReceivableAsReceived(tenantId, userId, created.id, paidAt);
    if (receiveResult.ok === false) {
      result.errors.push({
        line,
        message: `Conta criada, mas recebimento falhou: ${receiveResult.error}`,
      });
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
}) {
  const { prisma, tenantId, userId, row, line, get, result } = ctx;
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
    result.errors.push({ line, message: 'Coluna Pago inválida. Use 1 (sim) ou 0 (não).' });
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
    result.errors.push({ line, message: "Categoria financeira não encontrada ou ambígua." });
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
  if (get(row, "hour_rate") && hourRateCents == null) {
    result.errors.push({ line, message: `Tx hora inválida: "${get(row, "hour_rate")}".` });
    return;
  }
  const discountCents = get(row, "discount") ? parseBrlAmountToCents(get(row, "discount")) : null;
  if (get(row, "discount") && discountCents == null) {
    result.errors.push({ line, message: `Descontos inválidos: "${get(row, "discount")}".` });
    return;
  }
  const interestFineCents = get(row, "interest_fine")
    ? parseBrlAmountToCents(get(row, "interest_fine"))
    : null;
  if (get(row, "interest_fine") && interestFineCents == null) {
    result.errors.push({ line, message: `Juros/Multa inválidos: "${get(row, "interest_fine")}".` });
    return;
  }
  const complementaryHours = get(row, "complementary_hours")
    ? parseHours(get(row, "complementary_hours"))
    : null;
  if (get(row, "complementary_hours") && complementaryHours == null) {
    result.errors.push({
      line,
      message: `Horas complementares inválidas: "${get(row, "complementary_hours")}".`,
    });
    return;
  }

  const installmentTotal =
    amountCents - (discountCents ?? 0) + (interestFineCents ?? 0);
  if (installmentTotal <= 0) {
    result.errors.push({ line, message: "Valor líquido (Valor − Descontos + Juros/Multa) deve ser positivo." });
    return;
  }

  const installments = buildInstallmentPlan(installmentTotal, 1, dueDate);
  const created = await prisma.payable.create({
    data: {
      tenantId,
      supplierId,
      professionalUserId,
      payeeName,
      financialAccountId: account.id,
      financialCategoryId: category?.id ?? null,
      contractTypeId,
      description: description.slice(0, 500),
      totalAmountCents: amountCents,
      hourRateCents,
      discountCents,
      complementaryHours,
      interestFineCents,
      competenceDate: competenceDate ?? dueDate,
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
          costCenterId: costCenter.id,
          percentBps: 10000,
          amountCents: installmentTotal,
        },
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: `Importação despesas: ${description.slice(0, 120)}`,
        },
      },
    },
    select: { id: true },
  });

  if (paidFlag) {
    const paidAt = dueDate.toISOString().slice(0, 10);
    const payResult = await markPayableAsPaid(tenantId, userId, created.id, paidAt);
    if (payResult.ok === false) {
      result.errors.push({
        line,
        message: `Conta criada, mas pagamento falhou: ${payResult.error}`,
      });
    }
  }

  result.createdPayables += 1;
}
