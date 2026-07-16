import type { PrismaClient } from "@prisma/client";
import { detectCsvSeparator, parseCsvRows } from "./projectCsvImport.js";
import { buildInstallmentPlan } from "./payableHelpers.js";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(h: string): string {
  return stripAccents(String(h ?? "").trim().toLowerCase())
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Mapeia cabeçalhos do CSV C6 (e variações) para chaves canônicas. */
function resolveC6HeaderKey(normalized: string): string | null {
  const h = normalized;
  if (
    h === "data_de_compra" ||
    h === "data_da_compra" ||
    h === "data_de_co" ||
    h === "data_compra" ||
    h === "data"
  ) {
    return "purchase_date";
  }
  if (h === "categoria") return "category";
  if (
    h === "descricao" ||
    h === "descriao" ||
    h === "estabelecimento" ||
    h === "lancamento"
  ) {
    return "description";
  }
  if (
    h === "valor_em_r" ||
    h === "valor_em_rs" ||
    h === "valor_rs" ||
    h === "valor_reais" ||
    h === "valor_em_reais" ||
    h === "valor"
  ) {
    // Preferir valor em R$; se vier só "valor" usa
    return "amount_brl";
  }
  if (h.includes("valor") && (h.includes("r") || h.includes("real"))) {
    return "amount_brl";
  }
  // Evitar pegar "valor_em_us"
  if (h.includes("valor") && h.includes("us")) return null;
  return null;
}

function parseDateFlexible(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T12:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Excel serial (quando aberto/salvo pelo Excel)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const d = new Date(excelEpoch + Math.round(serial) * 86400000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Aceita 278.75 (C6) e 1.234,56 (BR). */
export function parseBrlAmountToCents(raw: string): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!s || s === "-") return null;

  const negative = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/^[-(]+/, "").replace(/[)]+$/, "");

  if (s.includes(",") && s.includes(".")) {
    // 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  // else: 278.75 — ponto decimal

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(Math.abs(n) * 100);
  return negative ? -cents : cents;
}

export type PayableCsvImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
};

export async function importPayablesFromC6Csv(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  csvText: string;
  /** Vencimento da fatura (aplicado a todas as contas). Se omitido, usa data da compra. */
  dueDate?: string | null;
  supplierId?: string | null;
  payeeName?: string | null;
  maxRows?: number;
}): Promise<PayableCsvImportResult> {
  const { prisma, tenantId, userId, csvText } = params;
  const maxRows = params.maxRows ?? 800;
  const errors: Array<{ line: number; message: string }> = [];
  let created = 0;
  let skipped = 0;

  const text = String(csvText ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { created: 0, skipped: 0, errors: [{ line: 1, message: "Arquivo CSV vazio." }] };
  }

  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = detectCsvSeparator(firstLine);
  const matrix = parseCsvRows(text, sep);
  if (matrix.length < 2) {
    return {
      created: 0,
      skipped: 0,
      errors: [{ line: 1, message: "CSV deve ter cabeçalho e ao menos uma linha de dados." }],
    };
  }

  const headerCells = matrix[0]!.map((c) => normalizeHeader(c));
  const colIndex = new Map<string, number>();
  for (let i = 0; i < headerCells.length; i++) {
    const key = resolveC6HeaderKey(headerCells[i]!);
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  }

  for (const required of ["purchase_date", "category", "description", "amount_brl"] as const) {
    if (!colIndex.has(required)) {
      errors.push({
        line: 1,
        message: `Cabeçalho obrigatório ausente (${required}). Esperado: Data de Compra, Categoria, Descrição, Valor (em R$).`,
      });
    }
  }
  if (errors.length) return { created: 0, skipped: 0, errors };

  const get = (row: string[], key: string) => {
    const idx = colIndex.get(key);
    return idx == null ? "" : String(row[idx] ?? "").trim();
  };

  const defaultAccount = await prisma.financialAccount.findFirst({
    where: { tenantId, type: "DESPESA", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (!defaultAccount) {
    return {
      created: 0,
      skipped: 0,
      errors: [{ line: 1, message: "Nenhuma conta de despesa configurada no plano de contas." }],
    };
  }

  if (params.supplierId) {
    const s = await prisma.supplier.findFirst({
      where: { id: params.supplierId, tenantId },
      select: { id: true },
    });
    if (!s) {
      return { created: 0, skipped: 0, errors: [{ line: 1, message: "Fornecedor inválido." }] };
    }
  }

  const dueOverride = params.dueDate
    ? parseDateFlexible(params.dueDate) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(params.dueDate)
        ? new Date(params.dueDate + "T12:00:00.000Z")
        : null)
    : null;

  const categoryCache = new Map<string, string>();

  async function resolveCategoryId(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    const cached = categoryCache.get(key);
    if (cached) return cached;
    const existing = await prisma.financialCategory.findFirst({
      where: { tenantId, name: { equals: name.trim(), mode: "insensitive" } },
      select: { id: true, isActive: true },
    });
    if (existing) {
      if (!existing.isActive) {
        await prisma.financialCategory.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      categoryCache.set(key, existing.id);
      return existing.id;
    }
    const createdCat = await prisma.financialCategory.create({
      data: {
        tenantId,
        name: name.trim().slice(0, 120),
        isActive: true,
        enableAmount: true,
      },
      select: { id: true },
    });
    categoryCache.set(key, createdCat.id);
    return createdCat.id;
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > maxRows) {
    return {
      created: 0,
      skipped: 0,
      errors: [{ line: 1, message: `Limite de ${maxRows} linhas excedido (${dataRows.length}).` }],
    };
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const line = i + 2;
    const dateRaw = get(row, "purchase_date");
    const categoryRaw = get(row, "category");
    const descriptionRaw = get(row, "description");
    const amountRaw = get(row, "amount_brl");

    if (!dateRaw && !categoryRaw && !descriptionRaw && !amountRaw) {
      skipped += 1;
      continue;
    }

    const purchaseDate = parseDateFlexible(dateRaw);
    if (!purchaseDate) {
      errors.push({ line, message: `Data de compra inválida: "${dateRaw}".` });
      continue;
    }

    const amountCents = parseBrlAmountToCents(amountRaw);
    if (amountCents == null) {
      errors.push({ line, message: `Valor inválido: "${amountRaw}".` });
      continue;
    }
    // Pagamentos/créditos na fatura (ex.: Inclusão de Pagamento) — não viram conta a pagar
    if (amountCents <= 0) {
      skipped += 1;
      continue;
    }

    if (!descriptionRaw) {
      errors.push({ line, message: "Descrição (atividade) vazia." });
      continue;
    }
    if (!categoryRaw) {
      errors.push({ line, message: "Categoria vazia." });
      continue;
    }

    const dueDate = dueOverride ?? purchaseDate;
    const financialCategoryId = await resolveCategoryId(categoryRaw);

    try {
      const installments = buildInstallmentPlan(amountCents, 1, dueDate);
      await prisma.payable.create({
        data: {
          tenantId,
          supplierId: params.supplierId ?? null,
          payeeName: params.payeeName?.trim() || "Cartão C6 Bank",
          financialAccountId: defaultAccount.id,
          financialCategoryId,
          description: descriptionRaw.slice(0, 500),
          totalAmountCents: amountCents,
          competenceDate: purchaseDate,
          kind: "MANUAL",
          status: "ABERTO",
          requiresApproval: false,
          createdById: userId,
          notes: "Importação CSV fatura C6 Bank",
          installments: {
            create: installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              amountCents: inst.amountCents,
              status: "ABERTO",
            })),
          },
          history: {
            create: {
              userId,
              action: "CREATE",
              details: `Importação CSV C6: ${descriptionRaw.slice(0, 120)}`,
            },
          },
        },
      });
      created += 1;
    } catch (e) {
      errors.push({
        line,
        message: e instanceof Error ? e.message : "Erro ao criar conta a pagar.",
      });
    }
  }

  return { created, skipped, errors };
}
