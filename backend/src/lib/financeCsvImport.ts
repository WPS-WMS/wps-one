import type { PrismaClient } from "@prisma/client";
import { parseBrlAmountToCents, parseDateFlexible } from "./payableCsvImport.js";
import { buildInstallmentPlan } from "./payableHelpers.js";
import { detectCsvSeparator, parseCsvRows } from "./projectCsvImport.js";

type ImportType = "RECEITA" | "DESPESA";

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

function resolveHeader(value: string): string | null {
  const header = normalizeHeader(value);
  if (["tipo", "natureza"].includes(header)) return "type";
  if (["data", "competencia", "data_competencia"].includes(header)) return "date";
  if (["vencimento", "data_vencimento"].includes(header)) return "due_date";
  if (["descricao", "atividade", "historico"].includes(header)) return "description";
  if (["valor", "valor_rs", "valor_em_rs"].includes(header)) return "amount";
  if (["cliente"].includes(header)) return "client";
  if (["conta", "conta_financeira", "plano_de_contas"].includes(header)) return "account";
  if (["categoria", "categoria_financeira"].includes(header)) return "category";
  if (["centro_de_custo", "centro_custo", "cc"].includes(header)) return "cost_center";
  if (["projeto"].includes(header)) return "project";
  if (["fornecedor", "beneficiario", "fornecedor_beneficiario"].includes(header)) return "supplier";
  if (["parcelas", "quantidade_de_parcelas", "qtd_parcelas"].includes(header)) return "installments";
  return null;
}

function parseType(raw: string): ImportType | null {
  const value = normalize(raw).toUpperCase();
  if (["RECEITA", "RECEBIMENTO", "ENTRADA"].includes(value)) return "RECEITA";
  if (["DESPESA", "PAGAMENTO", "SAIDA"].includes(value)) return "DESPESA";
  return null;
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

export async function importFinanceCsv(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  csvText: string;
  canAccessProject: (projectId: string) => Promise<boolean>;
  maxRows?: number;
}): Promise<FinanceCsvImportResult> {
  const { prisma, tenantId, userId } = params;
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

  const columns = new Map<string, number>();
  matrix[0]!.forEach((cell, index) => {
    const key = resolveHeader(cell);
    if (key && !columns.has(key)) columns.set(key, index);
  });
  for (const required of ["type", "date", "description", "amount", "cost_center"] as const) {
    if (!columns.has(required)) {
      result.errors.push({
        line: 1,
        message: `Coluna obrigatória ausente: ${required}. Use o modelo disponível em Lançamentos.`,
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

  const [accounts, costCenters, categories, clients, suppliers, projects] = await Promise.all([
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
    const typeRaw = get(row, "type");
    const dateRaw = get(row, "date");
    const description = get(row, "description");
    const amountRaw = get(row, "amount");
    if (!typeRaw && !dateRaw && !description && !amountRaw) {
      result.skipped += 1;
      continue;
    }

    const type = parseType(typeRaw);
    if (!type) {
      result.errors.push({ line, message: `Tipo inválido: "${typeRaw}". Use RECEITA ou DESPESA.` });
      continue;
    }
    const competenceDate = parseDateFlexible(dateRaw);
    const dueDate = parseDateFlexible(get(row, "due_date")) ?? competenceDate;
    if (!competenceDate || !dueDate) {
      result.errors.push({ line, message: "Data ou vencimento inválido." });
      continue;
    }
    if (!description) {
      result.errors.push({ line, message: "Descrição obrigatória." });
      continue;
    }
    const amountCents = parseBrlAmountToCents(amountRaw);
    if (amountCents == null || amountCents <= 0) {
      result.errors.push({ line, message: `Valor inválido: "${amountRaw}". Informe um valor positivo.` });
      continue;
    }
    const installmentRaw = get(row, "installments");
    const installmentCount = installmentRaw ? Number.parseInt(installmentRaw, 10) : 1;
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) {
      result.errors.push({ line, message: "Parcelas deve ser um número entre 1 e 120." });
      continue;
    }

    const costCenter = singleByName(costCenters, get(row, "cost_center"), (item) => [
      item.name,
      item.code,
    ]);
    if (!costCenter || costCenter === "AMBIGUOUS") {
      result.errors.push({ line, message: "Centro de custo não encontrado ou ambíguo." });
      continue;
    }

    const accountRaw = get(row, "account");
    const accountCandidates = accounts.filter((item) => item.type === type);
    const account = accountRaw
      ? singleByName(accountCandidates, accountRaw, (item) => [item.name, item.code])
      : accountCandidates[0] ?? null;
    if (!account || account === "AMBIGUOUS") {
      result.errors.push({
        line,
        message: `Conta financeira de ${type.toLowerCase()} não encontrada ou ambígua.`,
      });
      continue;
    }

    const projectRaw = get(row, "project");
    let project: (typeof projects)[number] | null = null;
    if (projectRaw) {
      const found = singleByName(projects, projectRaw, (item) => [item.name]);
      if (!found || found === "AMBIGUOUS") {
        result.errors.push({ line, message: "Projeto não encontrado ou ambíguo." });
        continue;
      }
      if (!(await hasProjectAccess(found.id))) {
        result.errors.push({ line, message: "Sem acesso ao projeto informado." });
        continue;
      }
      project = found;
    }

    const installments = buildInstallmentPlan(amountCents, installmentCount, dueDate);

    try {
      if (type === "RECEITA") {
        const clientRaw = get(row, "client");
        const client = singleByName(clients, clientRaw, (item) => [item.name]);
        if (!client || client === "AMBIGUOUS") {
          result.errors.push({ line, message: "Cliente não encontrado ou ambíguo." });
          continue;
        }
        if (project && project.clientId !== client.id) {
          result.errors.push({ line, message: "O projeto informado não pertence ao cliente." });
          continue;
        }
        await prisma.receivable.create({
          data: {
            tenantId,
            clientId: client.id,
            projectId: project?.id ?? null,
            financialAccountId: account.id,
            description: description.slice(0, 500),
            totalAmountCents: amountCents,
            competenceDate,
            kind: "MANUAL",
            status: "PREVISTO",
            createdById: userId,
            notes: "Importação por planilha em Lançamentos.",
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
                details: `Importação por planilha: ${description.slice(0, 120)}`,
              },
            },
          },
        });
        result.createdReceivables += 1;
        continue;
      }

      const categoryRaw = get(row, "category");
      const category = categoryRaw
        ? singleByName(categories, categoryRaw, (item) => [item.name])
        : null;
      if (category === "AMBIGUOUS" || (categoryRaw && !category)) {
        result.errors.push({ line, message: "Categoria financeira não encontrada ou ambígua." });
        continue;
      }
      const supplierRaw = get(row, "supplier");
      const supplier = supplierRaw
        ? singleByName(suppliers, supplierRaw, (item) => [item.nomeApelido, item.razaoSocial])
        : null;
      if (supplier === "AMBIGUOUS") {
        result.errors.push({ line, message: "Fornecedor/beneficiário ambíguo." });
        continue;
      }
      await prisma.payable.create({
        data: {
          tenantId,
          supplierId: supplier?.id ?? null,
          payeeName: supplierRaw || null,
          financialAccountId: account.id,
          financialCategoryId: category?.id ?? null,
          description: description.slice(0, 500),
          totalAmountCents: amountCents,
          competenceDate,
          kind: "MANUAL",
          status: "ABERTO",
          requiresApproval: false,
          createdById: userId,
          notes: "Importação por planilha em Lançamentos.",
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
              projectId: project?.id ?? null,
              percentBps: 10000,
              amountCents,
            },
          },
          history: {
            create: {
              userId,
              action: "CREATE",
              details: `Importação por planilha: ${description.slice(0, 120)}`,
            },
          },
        },
      });
      result.createdPayables += 1;
    } catch (error) {
      result.errors.push({
        line,
        message: error instanceof Error ? error.message : "Erro ao importar lançamento.",
      });
    }
  }

  return result;
}
