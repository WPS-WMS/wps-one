export type FinancialEntryType = "RECEITA" | "DESPESA";
export type FinancialEntryStatus = "LANCADO" | "CANCELADO";

export const ENTRY_TYPES: FinancialEntryType[] = ["RECEITA", "DESPESA"];
export const ENTRY_STATUSES: FinancialEntryStatus[] = ["LANCADO", "CANCELADO"];

export type FinancialEntryWriteBody = {
  costCenterId?: string;
  financialAccountId?: string;
  type?: FinancialEntryType;
  amountCents?: number;
  entryDate?: string;
  description?: string | null;
  status?: FinancialEntryStatus;
  supplierId?: string | null;
  projectId?: string | null;
};

export function parseAmountToCents(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw * 100);
  }
  const s = String(raw).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function formatCentsToBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function normalizeEntryType(raw: unknown): FinancialEntryType | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "RECEITA" || s === "DESPESA") return s;
  return null;
}

export function normalizeEntryStatus(raw: unknown): FinancialEntryStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "LANCADO" || s === "CANCELADO") return s;
  return null;
}

export function parseEntryDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFinancialEntryWriteBody(body: unknown): {
  ok: boolean;
  error?: string;
  data: FinancialEntryWriteBody;
} {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data: FinancialEntryWriteBody = {};

  if (b.costCenterId != null) data.costCenterId = String(b.costCenterId).trim();
  if (b.financialAccountId != null) data.financialAccountId = String(b.financialAccountId).trim();
  if (b.type != null) {
    const t = normalizeEntryType(b.type);
    if (!t) return { ok: false, error: "Tipo inválido. Use RECEITA ou DESPESA.", data };
    data.type = t;
  }
  if (b.amountCents != null) {
    const cents = typeof b.amountCents === "number" ? Math.round(b.amountCents) : parseAmountToCents(b.amount);
    if (cents == null || cents <= 0) return { ok: false, error: "Valor deve ser maior que zero.", data };
    data.amountCents = cents;
  } else if (b.amount != null) {
    const cents = parseAmountToCents(b.amount);
    if (cents == null) return { ok: false, error: "Valor inválido.", data };
    data.amountCents = cents;
  }
  if (b.entryDate != null) {
    const d = parseEntryDate(b.entryDate);
    if (!d) return { ok: false, error: "Data do lançamento inválida.", data };
    data.entryDate = String(b.entryDate).trim();
  }
  if (b.description !== undefined) {
    const desc = b.description == null ? null : String(b.description).trim();
    data.description = desc || null;
  }
  if (b.status != null) {
    const st = normalizeEntryStatus(b.status);
    if (!st) return { ok: false, error: "Status inválido.", data };
    data.status = st;
  }
  if (b.supplierId !== undefined) {
    data.supplierId = b.supplierId ? String(b.supplierId).trim() : null;
  }
  if (b.projectId !== undefined) {
    data.projectId = b.projectId ? String(b.projectId).trim() : null;
  }

  return { ok: true, data };
}

export function validateFinancialEntryCreate(data: FinancialEntryWriteBody): string | null {
  if (!data.costCenterId) return "Centro de custo é obrigatório.";
  if (!data.financialAccountId) return "Conta do plano de contas é obrigatória.";
  if (!data.type) return "Tipo é obrigatório (RECEITA ou DESPESA).";
  if (!data.amountCents || data.amountCents <= 0) return "Valor deve ser maior que zero.";
  if (!data.entryDate) return "Data do lançamento é obrigatória.";
  return null;
}
