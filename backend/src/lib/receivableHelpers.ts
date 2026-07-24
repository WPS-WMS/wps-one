import type { ReceivableInstallment } from "@prisma/client";
import { parseAmountToCents, parseEntryDate } from "./financialEntryHelpers.js";
import {
  buildInstallmentPlan,
  normalizeAllocations,
  nextRecurrenceDueDate,
  type AllocationInput,
} from "./payableHelpers.js";

export { parseEntryDate, buildInstallmentPlan, normalizeAllocations, nextRecurrenceDueDate };
export type { AllocationInput };

export type ReceivableStatus =
  | "PREVISTO"
  | "FATURADO"
  | "RECEBIDO"
  | "ATRASADO"
  | "CANCELADO";

export type ReceivableKind = "MANUAL" | "PROJETO" | "RECORRENTE";

export const RECEIVABLE_ATTACHMENT_CATEGORIES = ["NOTA_FISCAL", "BOLETO"] as const;

export type InstallmentStatus =
  | "PREVISTO"
  | "FATURADO"
  | "RECEBIDO"
  | "ATRASADO"
  | "CANCELADO";

export type ReceivableWriteBody = {
  clientId?: string;
  projectId?: string | null;
  financialAccountId?: string;
  description?: string;
  totalAmountCents?: number;
  netAmountCents?: number | null;
  taxAmountCents?: number | null;
  retentionAmountCents?: number | null;
  competenceDate?: string | null;
  kind?: ReceivableKind;
  dueDate?: string;
  installmentCount?: number;
  allocations?: AllocationInput[];
  notes?: string | null;
  recurrenceRuleId?: string | null;
};

export type InvoiceWriteBody = {
  nfNumber?: string;
  nfSeries?: string | null;
  emissionDate?: string;
  grossAmountCents?: number;
  netAmountCents?: number;
  taxAmountCents?: number;
  retentionAmountCents?: number;
};

export const RECEIVABLE_STATUSES: ReceivableStatus[] = [
  "PREVISTO",
  "FATURADO",
  "RECEBIDO",
  "ATRASADO",
  "CANCELADO",
];

export function normalizeReceivableStatus(raw: unknown): ReceivableStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return RECEIVABLE_STATUSES.includes(s as ReceivableStatus) ? (s as ReceivableStatus) : null;
}

export function normalizeReceivableKind(raw: unknown): ReceivableKind | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "MANUAL" || s === "PROJETO" || s === "RECORRENTE") return s;
  return null;
}

export function parseReceivableWriteBody(body: unknown): {
  ok: true;
  data: ReceivableWriteBody;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ReceivableWriteBody = {};

  if (b.clientId != null) data.clientId = String(b.clientId).trim();
  if (b.projectId !== undefined) {
    const id = String(b.projectId ?? "").trim();
    data.projectId = id.length > 0 ? id : null;
  }
  if (b.financialAccountId != null) {
    data.financialAccountId = String(b.financialAccountId).trim();
  }
  if (b.description != null) {
    const desc = String(b.description).trim();
    if (!desc) return { ok: false, error: "Descrição é obrigatória." };
    data.description = desc;
  }
  if (b.totalAmountCents != null) {
    const cents =
      typeof b.totalAmountCents === "number"
        ? Math.round(b.totalAmountCents)
        : parseAmountToCents(b.amount ?? b.totalAmount);
    if (cents == null || cents <= 0) return { ok: false, error: "Valor inválido." };
    data.totalAmountCents = cents;
  } else if (b.amount != null || b.totalAmount != null) {
    const cents = parseAmountToCents(b.amount ?? b.totalAmount);
    if (cents == null || cents <= 0) return { ok: false, error: "Valor inválido." };
    data.totalAmountCents = cents;
  }
  if (b.netAmountCents !== undefined) {
    data.netAmountCents =
      b.netAmountCents == null ? null : Math.round(Number(b.netAmountCents));
  }
  if (b.taxAmountCents !== undefined) {
    data.taxAmountCents =
      b.taxAmountCents == null ? null : Math.round(Number(b.taxAmountCents));
  }
  if (b.retentionAmountCents !== undefined) {
    data.retentionAmountCents =
      b.retentionAmountCents == null ? null : Math.round(Number(b.retentionAmountCents));
  }
  if (b.competenceDate !== undefined) {
    if (b.competenceDate == null || b.competenceDate === "") {
      data.competenceDate = null;
    } else {
      const d = parseEntryDate(b.competenceDate);
      if (!d) return { ok: false, error: "Competência inválida." };
      data.competenceDate = String(b.competenceDate).trim();
    }
  }
  if (b.kind != null) {
    const k = normalizeReceivableKind(b.kind);
    if (!k) return { ok: false, error: "Tipo inválido." };
    data.kind = k;
  }
  if (b.dueDate != null) {
    const d = parseEntryDate(b.dueDate);
    if (!d) return { ok: false, error: "Vencimento inválido." };
    data.dueDate = String(b.dueDate).trim();
  }
  if (b.installmentCount != null) {
    const n = Number.parseInt(String(b.installmentCount), 10);
    if (!Number.isFinite(n) || n < 1 || n > 120) {
      return { ok: false, error: "Número de parcelas inválido (1–120)." };
    }
    data.installmentCount = n;
  }
  if (Array.isArray(b.allocations)) {
    data.allocations = b.allocations.map((a) => {
      const row = a as Record<string, unknown>;
      return {
        costCenterId: String(row.costCenterId ?? "").trim(),
        projectId: row.projectId ? String(row.projectId).trim() : null,
        percentBps: row.percentBps != null ? Number(row.percentBps) : undefined,
        amountCents: row.amountCents != null ? Number(row.amountCents) : undefined,
      };
    });
  }
  if (b.notes !== undefined) {
    data.notes = b.notes == null ? null : String(b.notes).trim() || null;
  }
  if (b.recurrenceRuleId !== undefined) {
    data.recurrenceRuleId = b.recurrenceRuleId ? String(b.recurrenceRuleId).trim() : null;
  }

  return { ok: true, data };
}

export function validateReceivableCreate(data: ReceivableWriteBody): string | null {
  if (!data.clientId) return "Cliente é obrigatório.";
  if (!data.financialAccountId) return "Conta financeira é obrigatória.";
  if (!data.description) return "Descrição é obrigatória.";
  if (!data.totalAmountCents || data.totalAmountCents <= 0) return "Valor é obrigatório.";
  if (!data.dueDate) return "Vencimento é obrigatório.";
  return null;
}

export function parseInvoiceWriteBody(body: unknown): {
  ok: true;
  data: InvoiceWriteBody;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const nfNumber = String(b.nfNumber ?? "").trim();
  if (!nfNumber) return { ok: false, error: "Número da NF é obrigatório." };
  const emissionDate = parseEntryDate(b.emissionDate);
  if (!emissionDate) return { ok: false, error: "Data de emissão inválida." };

  const gross =
    b.grossAmountCents != null
      ? Math.round(Number(b.grossAmountCents))
      : parseAmountToCents(b.grossAmount);
  const net =
    b.netAmountCents != null
      ? Math.round(Number(b.netAmountCents))
      : parseAmountToCents(b.netAmount);
  if (gross == null || gross <= 0) return { ok: false, error: "Valor bruto inválido." };
  if (net == null || net <= 0) return { ok: false, error: "Valor líquido inválido." };

  return {
    ok: true,
    data: {
      nfNumber,
      nfSeries: b.nfSeries ? String(b.nfSeries).trim() : null,
      emissionDate: String(b.emissionDate).trim(),
      grossAmountCents: gross,
      netAmountCents: net,
      taxAmountCents: Math.round(Number(b.taxAmountCents ?? 0)),
      retentionAmountCents: Math.round(Number(b.retentionAmountCents ?? 0)),
    },
  };
}

export function computeEffectiveInstallmentStatus(
  inst: Pick<ReceivableInstallment, "status" | "dueDate">,
  today = new Date(),
): InstallmentStatus {
  if (inst.status === "RECEBIDO" || inst.status === "CANCELADO") {
    return inst.status as InstallmentStatus;
  }
  const due = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (due < todayStart && inst.status !== "RECEBIDO") return "ATRASADO";
  return inst.status as InstallmentStatus;
}

export function deriveReceivableStatus(
  installments: Pick<ReceivableInstallment, "status" | "dueDate">[],
  headerStatus: string,
  hasInvoice: boolean,
): ReceivableStatus {
  if (headerStatus === "CANCELADO") return "CANCELADO";
  const effective = installments.map((i) => computeEffectiveInstallmentStatus(i));
  if (effective.every((s) => s === "CANCELADO")) return "CANCELADO";
  if (effective.every((s) => s === "RECEBIDO")) return "RECEBIDO";
  if (effective.some((s) => s === "ATRASADO")) return "ATRASADO";
  if (hasInvoice || effective.some((s) => s === "FATURADO")) return "FATURADO";
  return "PREVISTO";
}

export type AgingBucket =
  | "VENCIDOS"
  | "A_VENCER"
  | "1_30"
  | "31_60"
  | "61_90"
  | "90_PLUS";

/**
 * Classifica parcela pelo vencimento a partir de hoje:
 * - VENCIDOS: data já passou
 * - A_VENCER: vence nos próximos 7 dias (inclui hoje)
 * - 1_30: vence entre 8 e 30 dias
 * - 31_60 / 61_90 / 90_PLUS: faixas futuras seguintes
 */
export function agingBucketForDueDate(dueDate: Date, today = new Date()): AgingBucket {
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dueStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return "VENCIDOS";
  if (diffDays <= 7) return "A_VENCER";
  if (diffDays <= 30) return "1_30";
  if (diffDays <= 60) return "31_60";
  if (diffDays <= 90) return "61_90";
  return "90_PLUS";
}
