import type { ProjectRevenue } from "@prisma/client";

export type ProjectRevenueStatus = "NEGOCIACAO" | "ATIVO" | "FINALIZADO" | "CANCELADO";

export const REVENUE_STATUSES: ProjectRevenueStatus[] = [
  "NEGOCIACAO",
  "ATIVO",
  "FINALIZADO",
  "CANCELADO",
];

export const REVENUE_STATUS_LABELS: Record<ProjectRevenueStatus, string> = {
  NEGOCIACAO: "Em negociação",
  ATIVO: "Ativo",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
};

export function normalizeRevenueStatus(raw: unknown): ProjectRevenueStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (REVENUE_STATUSES.includes(s as ProjectRevenueStatus)) return s as ProjectRevenueStatus;
  return null;
}

export function normalizeOptionalMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function normalizeOptionalInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseOptionalDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function normalizeOptionalTitle(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  return v.length > 0 ? v : null;
}

export type ProjectRevenueWriteBody = {
  title?: string | null;
  billingTypeId?: string | null;
  contractedValue?: number | null;
  expectedRevenue?: number | null;
  realizedRevenue?: number | null;
  installmentCount?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: ProjectRevenueStatus;
  isAdditive?: boolean;
  autoBillingCalculation?: boolean;
};

export function parseProjectRevenueWriteBody(body: unknown): {
  ok: true;
  data: ProjectRevenueWriteBody;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ProjectRevenueWriteBody = {};

  if (b.title !== undefined) {
    data.title = normalizeOptionalTitle(b.title);
  }
  if (b.billingTypeId !== undefined) {
    const id = String(b.billingTypeId ?? "").trim();
    data.billingTypeId = id.length > 0 ? id : null;
  }
  if (b.contractedValue !== undefined) {
    const v = normalizeOptionalMoney(b.contractedValue);
    if (b.contractedValue != null && b.contractedValue !== "" && v == null) {
      return { ok: false, error: "Valor contratado inválido." };
    }
    data.contractedValue = v;
  }
  if (b.expectedRevenue !== undefined) {
    const v = normalizeOptionalMoney(b.expectedRevenue);
    if (b.expectedRevenue != null && b.expectedRevenue !== "" && v == null) {
      return { ok: false, error: "Receita prevista inválida." };
    }
    data.expectedRevenue = v;
  }
  if (b.realizedRevenue !== undefined) {
    const v = normalizeOptionalMoney(b.realizedRevenue);
    if (b.realizedRevenue != null && b.realizedRevenue !== "" && v == null) {
      return { ok: false, error: "Receita realizada inválida." };
    }
    data.realizedRevenue = v;
  }
  if (b.installmentCount !== undefined) {
    const v = normalizeOptionalInt(b.installmentCount);
    if (b.installmentCount != null && b.installmentCount !== "" && v == null) {
      return { ok: false, error: "Quantidade de parcelas inválida." };
    }
    data.installmentCount = v;
  }
  if (b.startDate !== undefined) {
    const d = parseOptionalDate(b.startDate);
    if (b.startDate != null && b.startDate !== "" && !d) {
      return { ok: false, error: "Data de início inválida." };
    }
    data.startDate = d;
  }
  if (b.endDate !== undefined) {
    const d = parseOptionalDate(b.endDate);
    if (b.endDate != null && b.endDate !== "" && !d) {
      return { ok: false, error: "Data de término inválida." };
    }
    data.endDate = d;
  }
  if (b.status !== undefined) {
    const status = normalizeRevenueStatus(b.status);
    if (!status) {
      return { ok: false, error: "Status da receita inválido." };
    }
    data.status = status;
  }
  if (b.isAdditive !== undefined) {
    data.isAdditive = b.isAdditive === true;
  }
  if (b.autoBillingCalculation !== undefined) {
    data.autoBillingCalculation = b.autoBillingCalculation === true;
  }

  return { ok: true, data };
}

export const REVENUE_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  billingTypeId: "Tipo de cobrança",
  contractedValue: "Valor contratado",
  expectedRevenue: "Receita prevista",
  realizedRevenue: "Receita realizada",
  installmentCount: "Parcelas",
  startDate: "Data de início",
  endDate: "Data de término",
  status: "Status",
  isAdditive: "Aditivo",
  autoBillingCalculation: "Cálculo automático de faturamento",
};

const TRACKED_FIELDS = [
  "title",
  "billingTypeId",
  "contractedValue",
  "expectedRevenue",
  "realizedRevenue",
  "installmentCount",
  "startDate",
  "endDate",
  "status",
  "isAdditive",
  "autoBillingCalculation",
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

function formatMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}

function displayValue(
  field: TrackedField,
  value: unknown,
  billingTypeNames?: Map<string, string>,
): string | null {
  if (value == null || value === "") return null;
  if (field === "isAdditive") return value ? "Sim" : "Não";
  if (field === "autoBillingCalculation") return value ? "Automático" : "Manual";
  if (field === "status") {
    const key = String(value).toUpperCase() as ProjectRevenueStatus;
    return REVENUE_STATUS_LABELS[key] ?? String(value);
  }
  if (field === "billingTypeId" && billingTypeNames) {
    const id = String(value);
    return billingTypeNames.get(id) ?? id;
  }
  if (field === "contractedValue" || field === "expectedRevenue" || field === "realizedRevenue") {
    return formatMoney(value);
  }
  if (field === "startDate" || field === "endDate") {
    return formatDate(value);
  }
  return String(value);
}

export function buildRevenueHistoryEntries(
  before: ProjectRevenue,
  after: Partial<ProjectRevenue>,
  billingTypeNames?: Map<string, string>,
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const entries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const oldRaw = before[field as keyof ProjectRevenue];
    const newRaw = after[field as keyof ProjectRevenue];
    const oldStr = displayValue(field, oldRaw, billingTypeNames);
    const newStr = displayValue(field, newRaw, billingTypeNames);
    if (oldStr === newStr) continue;
    entries.push({
      field,
      oldValue: oldStr,
      newValue: newStr,
    });
  }
  return entries;
}
