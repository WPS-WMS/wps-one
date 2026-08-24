import type { PrismaClient } from "@prisma/client";
import { detectCsvSeparator, parseCsvRows, stripBom } from "./projectCsvImport.js";
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
  // Ignorar cotação e valor em dólar (senão "valor" + "r" de "valor_em_us" casa errado)
  if (h.includes("cotacao") || h.includes("cotation")) return null;
  if (h.includes("us") || h.includes("usd") || h.includes("dolar")) return null;

  if (
    h === "data_de_compra" ||
    h === "data_da_compra" ||
    h === "data_de_co" ||
    h === "data_compra" ||
    h === "data"
  ) {
    return "purchase_date";
  }
  if (
    h === "final_cartao" ||
    h === "final_do_cartao" ||
    h === "final_cartao_" ||
    h === "cartao" ||
    h === "final" ||
    (h.includes("final") && h.includes("cartao")) ||
    (h.includes("ultimos") && h.includes("digito"))
  ) {
    return "card_last_four";
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
    h === "centro_de_custo" ||
    h === "centro_custo" ||
    h === "centrocusto" ||
    h === "cc" ||
    h === "c_custo" ||
    (h.includes("centro") && h.includes("custo"))
  ) {
    return "cost_center";
  }

  // Preferência: Valor (em R$) / Valor em Reais
  if (
    h === "valor_em_r" ||
    h === "valor_em_rs" ||
    h === "valor_rs" ||
    h === "valor_reais" ||
    h === "valor_em_reais" ||
    (h.includes("valor") && (h.includes("real") || h.endsWith("_r") || h.includes("_r_") || h.includes("em_r")))
  ) {
    return "amount_brl";
  }
  if (h === "valor") return "amount_brl";
  return null;
}

/** Extrai os últimos 4 dígitos do cartão a partir do valor da célula. */
export function parseCardLastFour(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  if (digits.length > 0) return digits.padStart(4, "0").slice(-4);
  return null;
}

/** Prioridade maior = melhor coluna de valor em R$ (evita ficar com US$). */
function amountBrlHeaderPriority(normalized: string): number {
  const h = normalized;
  if (h.includes("us") || h.includes("usd") || h.includes("dolar") || h.includes("cotacao")) return -1;
  if (h === "valor_em_r" || h === "valor_em_rs" || h === "valor_em_reais" || h === "valor_reais" || h === "valor_rs") {
    return 100;
  }
  if (h.includes("valor") && (h.includes("real") || h.includes("em_r"))) return 90;
  if (h === "valor") return 10;
  return 0;
}

export function parseDateFlexible(raw: string): Date | null {
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
      // Meio-dia UTC evita shift de fuso ao gravar @db.Date / exibir.
      const d = new Date(excelEpoch + Math.round(serial) * 86400000 + 12 * 3600000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  // Evita `new Date("03/01/2026")` (interpretação ambígua MM/DD vs DD/MM).
  return null;
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

/** Categoria financeira aplicada por padrão às contas importadas da fatura. */
const CARD_CATEGORY_NAME = "Cartão de Crédito";

export type PayableCsvImportResult = {
  created: number;
  skipped: number;
  /** Linhas com valor ≤ 0 (pagamento/crédito na fatura). */
  skippedCredits: number;
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
  let skippedCredits = 0;

  const text = stripBom(csvText ?? "").trim();
  if (!text) {
    return { created: 0, skipped: 0, skippedCredits: 0, errors: [{ line: 1, message: "Arquivo CSV vazio." }] };
  }

  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = detectCsvSeparator(firstLine);
  const matrix = parseCsvRows(text, sep);
  if (matrix.length < 2) {
    return {
      created: 0,
      skipped: 0,
      skippedCredits: 0,
      errors: [{ line: 1, message: "CSV deve ter cabeçalho e ao menos uma linha de dados." }],
    };
  }

  const headerCells = matrix[0]!.map((c) => normalizeHeader(c));
  const colIndex = new Map<string, number>();
  let bestAmountPriority = -1;
  for (let i = 0; i < headerCells.length; i++) {
    const normalized = headerCells[i]!;
    const key = resolveC6HeaderKey(normalized);
    if (!key) continue;
    if (key === "amount_brl") {
      const priority = amountBrlHeaderPriority(normalized);
      if (priority > bestAmountPriority) {
        bestAmountPriority = priority;
        colIndex.set("amount_brl", i);
      }
      continue;
    }
    if (!colIndex.has(key)) colIndex.set(key, i);
  }

  // Fallback posicional só se o cabeçalho não mapeou:
  // - modelo / fatura com 6–7 colunas: Centro de custo = F (índice 5)
  // - layout C6 longo: Final cartão = B (1), Centro de custo = I (8) ou J (9)
  if (!colIndex.has("card_last_four")) {
    if (headerCells.length > 1) colIndex.set("card_last_four", 1);
    else if (headerCells.length > 2) colIndex.set("card_last_four", 2);
  }
  if (!colIndex.has("cost_center")) {
    if (headerCells.length >= 6 && headerCells.length <= 7) {
      colIndex.set("cost_center", 5);
    } else if (headerCells.length > 8) {
      colIndex.set("cost_center", 8);
    } else if (headerCells.length > 9) {
      colIndex.set("cost_center", 9);
    } else if (headerCells.length > 5) {
      colIndex.set("cost_center", 5);
    }
  }

  for (const required of ["purchase_date", "category", "description", "amount_brl"] as const) {
    if (!colIndex.has(required)) {
      errors.push({
        line: 1,
        message: `Cabeçalho obrigatório ausente (${required}). Esperado: Data de Compra, Categoria, Descrição, Valor (em R$). Opcional: Final cartão e Centro de custo (pelo nome da coluna ou colunas B/I).`,
      });
    }
  }
  if (errors.length) return { created: 0, skipped: 0, skippedCredits: 0, errors };

  const get = (row: string[], key: string) => {
    const idx = colIndex.get(key);
    return idx == null ? "" : String(row[idx] ?? "").trim();
  };

  // Garante ao menos uma conta DESPESA no tenant (seed).
  const hasExpenseAccount = await prisma.financialAccount.findFirst({
    where: { tenantId, type: "DESPESA", isActive: true },
    select: { id: true },
  });
  if (!hasExpenseAccount) {
    return {
      created: 0,
      skipped: 0,
      skippedCredits: 0,
      errors: [{ line: 1, message: "Nenhuma conta de despesa configurada no plano de contas." }],
    };
  }

  if (params.supplierId) {
    const s = await prisma.supplier.findFirst({
      where: { id: params.supplierId, tenantId },
      select: { id: true },
    });
    if (!s) {
      return {
        created: 0,
        skipped: 0,
        skippedCredits: 0,
        errors: [{ line: 1, message: "Fornecedor inválido." }],
      };
    }
  }

  const dueOverride = params.dueDate
    ? parseDateFlexible(params.dueDate) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(params.dueDate)
        ? new Date(params.dueDate + "T12:00:00.000Z")
        : null)
    : null;

  const costCenterCache = new Map<string, string>();
  const costCenters = await prisma.costCenter.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, code: true },
  });

  function normalizeCcKey(value: string): string {
    return stripAccents(String(value ?? ""))
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  for (const cc of costCenters) {
    const nameKey = normalizeCcKey(cc.name);
    if (nameKey) costCenterCache.set(nameKey, cc.id);
    if (cc.code?.trim()) {
      const codeKey = normalizeCcKey(cc.code);
      if (codeKey) costCenterCache.set(codeKey, cc.id);
    }
  }

  function resolveCostCenterId(name: string): string | null {
    const key = normalizeCcKey(name);
    if (!key) return null;
    const exact = costCenterCache.get(key);
    if (exact) return exact;

    const compact = key.replace(/\s+/g, "");
    for (const [cachedKey, id] of costCenterCache) {
      if (cachedKey.replace(/\s+/g, "") === compact) return id;
    }

    // Match único por inclusão (ex.: "Operacao SAP" ↔ "Operação SAP")
    const fuzzy = [...costCenterCache.entries()].filter(
      ([cachedKey]) => cachedKey.includes(key) || key.includes(cachedKey),
    );
    if (fuzzy.length === 1) return fuzzy[0]![1];
    return null;
  }

  // Sempre usa a conta DESPESA "Cartão de crédito" (cria/reativa se necessário).
  let cardAccount = await prisma.financialAccount.findFirst({
    where: {
      tenantId,
      type: "DESPESA",
      name: { equals: CARD_CATEGORY_NAME, mode: "insensitive" },
    },
    select: { id: true, isActive: true, name: true },
  });
  if (!cardAccount) {
    cardAccount = await prisma.financialAccount.create({
      data: {
        tenantId,
        name: CARD_CATEGORY_NAME,
        type: "DESPESA",
        isActive: true,
        dreSubcategory: "CUSTO",
        enableAmount: true,
        enableInterestFine: true,
      },
      select: { id: true, isActive: true, name: true },
    });
  } else if (!cardAccount.isActive) {
    cardAccount = await prisma.financialAccount.update({
      where: { id: cardAccount.id },
      data: { isActive: true },
      select: { id: true, isActive: true, name: true },
    });
  }
  const defaultCardAccountId = cardAccount.id;

  const dataRows = matrix.slice(1);
  if (dataRows.length > maxRows) {
    return {
      created: 0,
      skipped: 0,
      skippedCredits: 0,
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
    const cardRaw = get(row, "card_last_four");
    const costCenterRaw = get(row, "cost_center");

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
      skippedCredits += 1;
      skipped += 1;
      continue;
    }

    if (!descriptionRaw) {
      errors.push({ line, message: "Descrição (atividade) vazia." });
      continue;
    }

    const dueDate = dueOverride ?? purchaseDate;
    // Sempre "Cartão de Crédito" — a coluna Categoria do CSV é só da fatura (fica nas notas).
    const financialAccountId = defaultCardAccountId;
    const cardLastFour = parseCardLastFour(cardRaw);
    const costCenterId = resolveCostCenterId(costCenterRaw);
    if (costCenterRaw.trim() && !costCenterId) {
      errors.push({
        line,
        message: `Centro de custo "${costCenterRaw.trim()}" não encontrado no cadastro. Conta criada sem C. Custo.`,
      });
    }
    const basePayee = params.payeeName?.trim() || "Cartão C6 Bank";
    const payeeName = cardLastFour ? `${basePayee} ****${cardLastFour}` : basePayee;
    const notesParts = ["Importação CSV fatura C6 Bank"];
    if (cardLastFour) notesParts.push(`Final cartão: ${cardLastFour}`);
    if (categoryRaw) notesParts.push(`Categoria fatura: ${categoryRaw}`);
    if (costCenterRaw.trim() && !costCenterId) {
      notesParts.push(`Centro de custo (não encontrado): ${costCenterRaw.trim()}`);
    }

    try {
      const installments = buildInstallmentPlan(amountCents, 1, dueDate);
      await prisma.payable.create({
        data: {
          tenantId,
          supplierId: params.supplierId ?? null,
          payeeName,
          cardLastFour,
          financialAccountId,
          financialCategoryId: null,
          description: descriptionRaw.slice(0, 500),
          totalAmountCents: amountCents,
          competenceDate: purchaseDate,
          kind: "MANUAL",
          status: "ABERTO",
          requiresApproval: false,
          createdById: userId,
          notes: notesParts.join(" · "),
          installments: {
            create: installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              amountCents: inst.amountCents,
              status: "ABERTO",
            })),
          },
          ...(costCenterId
            ? {
                allocations: {
                  create: [
                    {
                      costCenterId,
                      projectId: null,
                      percentBps: 10000,
                      amountCents,
                    },
                  ],
                },
              }
            : {}),
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

  return { created, skipped, skippedCredits, errors };
}
