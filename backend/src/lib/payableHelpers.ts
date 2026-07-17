import type { Payable, PayableInstallment } from "@prisma/client";
import { parseAmountToCents, parseEntryDate } from "./financialEntryHelpers.js";

export { parseEntryDate };

export type PayableStatus =
  | "ABERTO"
  | "PAGO"
  | "VENCIDO"
  | "CANCELADO"
  | "PENDENTE_APROVACAO";

export type PayableKind = "MANUAL" | "CORPORATIVA" | "REEMBOLSO";

export type InstallmentStatus = "ABERTO" | "PAGO" | "VENCIDO" | "CANCELADO";

export type AllocationInput = {
  costCenterId: string;
  projectId?: string | null;
  percentBps?: number;
  amountCents?: number;
};

export type PayableWriteBody = {
  supplierId?: string | null;
  professionalUserId?: string | null;
  payeeName?: string | null;
  financialAccountId?: string;
  financialCategoryId?: string | null;
  corporateExpenseTypeId?: string | null;
  contractTypeId?: string | null;
  description?: string;
  totalAmountCents?: number;
  hourRateCents?: number | null;
  benefitCents?: number | null;
  reimbursementCents?: number | null;
  discountCents?: number | null;
  complementaryHours?: number | null;
  interestFineCents?: number | null;
  competenceDate?: string | null;
  kind?: PayableKind;
  dueDate?: string;
  installmentCount?: number;
  allocations?: AllocationInput[];
  notes?: string | null;
  isCorporate?: boolean;
  recurrenceRuleId?: string | null;
};

export const PAYABLE_STATUSES: PayableStatus[] = [
  "ABERTO",
  "PAGO",
  "VENCIDO",
  "CANCELADO",
  "PENDENTE_APROVACAO",
];

export const ATTACHMENT_CATEGORIES = ["NOTA_FISCAL", "BOLETO", "COMPROVANTE", "OUTRO"] as const;

export function normalizePayableStatus(raw: unknown): PayableStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return PAYABLE_STATUSES.includes(s as PayableStatus) ? (s as PayableStatus) : null;
}

export function normalizePayableKind(raw: unknown): PayableKind | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "MANUAL" || s === "CORPORATIVA" || s === "REEMBOLSO") return s;
  return null;
}

export function parsePayableWriteBody(body: unknown): {
  ok: true;
  data: PayableWriteBody;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: PayableWriteBody = {};

  if (b.supplierId !== undefined) {
    const id = String(b.supplierId ?? "").trim();
    data.supplierId = id.length > 0 ? id : null;
  }
  if (b.professionalUserId !== undefined) {
    const id = String(b.professionalUserId ?? "").trim();
    data.professionalUserId = id.length > 0 ? id : null;
  }
  if (b.payeeName !== undefined) {
    const name = String(b.payeeName ?? "").trim();
    data.payeeName = name.length > 0 ? name : null;
  }
  if (b.financialAccountId != null) {
    data.financialAccountId = String(b.financialAccountId).trim();
  }
  if (b.financialCategoryId !== undefined) {
    const id = String(b.financialCategoryId ?? "").trim();
    data.financialCategoryId = id.length > 0 ? id : null;
  }
  if (b.contractTypeId !== undefined) {
    const id = String(b.contractTypeId ?? "").trim();
    data.contractTypeId = id.length > 0 ? id : null;
  }
  if (b.corporateExpenseTypeId !== undefined) {
    const id = String(b.corporateExpenseTypeId ?? "").trim();
    data.corporateExpenseTypeId = id.length > 0 ? id : null;
  }
  if (b.description != null) {
    const desc = String(b.description).trim();
    if (!desc) return { ok: false, error: "Atividade é obrigatória." };
    data.description = desc;
  }
  if (b.totalAmountCents != null) {
    const cents =
      typeof b.totalAmountCents === "number"
        ? Math.round(b.totalAmountCents)
        : parseAmountToCents(b.amount ?? b.totalAmount);
    if (cents == null || cents < 0) return { ok: false, error: "Valor inválido." };
    data.totalAmountCents = cents;
  } else if (b.amount != null || b.totalAmount != null) {
    const cents = parseAmountToCents(b.amount ?? b.totalAmount);
    if (cents == null || cents < 0) return { ok: false, error: "Valor inválido." };
    data.totalAmountCents = cents;
  }

  const optionalCentsFields = [
    ["hourRateCents", "Tx hora inválida."],
    ["benefitCents", "Benefício inválido."],
    ["reimbursementCents", "Reembolso inválido."],
    ["discountCents", "Desconto inválido."],
    ["interestFineCents", "Juros/multa inválidos."],
  ] as const;
  for (const [key, errMsg] of optionalCentsFields) {
    if (b[key] !== undefined) {
      if (b[key] == null || b[key] === "") {
        (data as Record<string, unknown>)[key] = null;
      } else {
        const cents =
          typeof b[key] === "number"
            ? Math.round(b[key] as number)
            : parseAmountToCents(b[key]);
        if (cents == null || cents < 0) return { ok: false, error: errMsg };
        (data as Record<string, unknown>)[key] = cents;
      }
    }
  }
  if (b.complementaryHours !== undefined) {
    if (b.complementaryHours == null || b.complementaryHours === "") {
      data.complementaryHours = null;
    } else {
      const n = Number(b.complementaryHours);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Horas complementares inválidas." };
      data.complementaryHours = Math.round(n * 100) / 100;
    }
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
    const k = normalizePayableKind(b.kind);
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
  if (b.isCorporate === true) data.isCorporate = true;
  if (b.recurrenceRuleId !== undefined) {
    data.recurrenceRuleId = b.recurrenceRuleId ? String(b.recurrenceRuleId).trim() : null;
  }

  return { ok: true, data };
}

export function validatePayableCreate(data: PayableWriteBody): string | null {
  if (!data.financialCategoryId) return "Categoria financeira é obrigatória.";
  if (!data.description) return "Atividade é obrigatória.";
  if (data.totalAmountCents == null || data.totalAmountCents < 0) return "Valor inválido.";
  if (!data.dueDate) return "Vencimento é obrigatório.";
  return null;
}

export function buildInstallmentPlan(
  totalCents: number,
  count: number,
  firstDueDate: Date,
): Array<{ installmentNumber: number; dueDate: Date; amountCents: number }> {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const rows: Array<{ installmentNumber: number; dueDate: Date; amountCents: number }> = [];
  for (let i = 0; i < count; i++) {
    const due = new Date(firstDueDate);
    due.setUTCMonth(due.getUTCMonth() + i);
    rows.push({
      installmentNumber: i + 1,
      dueDate: due,
      amountCents: base + (i === count - 1 ? remainder : 0),
    });
  }
  return rows;
}

export function normalizeAllocations(
  totalCents: number,
  allocations: AllocationInput[] | undefined,
  defaultCostCenterId?: string | null,
): AllocationInput[] {
  if (allocations && allocations.length > 0) {
    const withPercent = allocations.filter((a) => a.percentBps != null && a.percentBps > 0);
    if (withPercent.length > 0) {
      return allocations.map((a, idx, arr) => {
        const bps = a.percentBps ?? 0;
        let amountCents = Math.round((totalCents * bps) / 10000);
        if (idx === arr.length - 1) {
          const prev = arr.slice(0, -1).reduce(
            (s, x) => s + Math.round((totalCents * (x.percentBps ?? 0)) / 10000),
            0,
          );
          amountCents = totalCents - prev;
        }
        return {
          costCenterId: a.costCenterId,
          projectId: a.projectId ?? null,
          percentBps: bps,
          amountCents,
        };
      });
    }
    return allocations.map((a) => ({
      costCenterId: a.costCenterId,
      projectId: a.projectId ?? null,
      percentBps: a.amountCents ? Math.round((a.amountCents / totalCents) * 10000) : 10000,
      amountCents: a.amountCents ?? totalCents,
    }));
  }
  if (defaultCostCenterId) {
    return [
      {
        costCenterId: defaultCostCenterId,
        projectId: null,
        percentBps: 10000,
        amountCents: totalCents,
      },
    ];
  }
  return [];
}

export function computeEffectiveInstallmentStatus(
  inst: Pick<PayableInstallment, "status" | "dueDate">,
  today = new Date(),
): InstallmentStatus {
  if (inst.status === "PAGO" || inst.status === "CANCELADO") {
    return inst.status as InstallmentStatus;
  }
  const due = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (due < todayStart) return "VENCIDO";
  return "ABERTO";
}

export function derivePayableStatus(
  installments: Pick<PayableInstallment, "status" | "dueDate">[],
  headerStatus: string,
): PayableStatus {
  if (headerStatus === "CANCELADO" || headerStatus === "PENDENTE_APROVACAO") {
    return headerStatus as PayableStatus;
  }
  const effective = installments.map((i) => computeEffectiveInstallmentStatus(i));
  if (effective.every((s) => s === "CANCELADO")) return "CANCELADO";
  if (effective.every((s) => s === "PAGO")) return "PAGO";
  if (effective.some((s) => s === "VENCIDO")) return "VENCIDO";
  return "ABERTO";
}

export function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function clampDayOfMonth(dayOfMonth: number): number {
  return Math.min(Math.max(Math.round(dayOfMonth) || 1, 1), 28);
}

/** Data civil em UTC ao meio-dia (evita virar o dia anterior em fusos negativos). */
function utcCalendarDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

/** Se cair em sábado ou domingo, avança para a próxima segunda-feira. */
export function toNextBusinessDayUtc(date: Date): Date {
  const d = utcCalendarDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Primeiro vencimento a partir do início da recorrência, no dia do mês informado. */
export function firstRecurrenceDueDate(startDate: Date, dayOfMonth: number): Date {
  const day = clampDayOfMonth(dayOfMonth);
  const start = utcCalendarDate(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  let due = utcCalendarDate(start.getUTCFullYear(), start.getUTCMonth(), day);
  if (due < start) {
    const nextMonth = addMonthsUtc(due, 1);
    due = utcCalendarDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), day);
  }
  return toNextBusinessDayUtc(due);
}

export function nextRecurrenceDueDate(
  current: Date,
  frequency: string,
  dayOfMonth: number,
): Date {
  let months = 1;
  if (frequency === "BIMESTRAL") months = 2;
  else if (frequency === "TRIMESTRAL") months = 3;
  else if (frequency === "SEMESTRAL") months = 6;
  else if (frequency === "ANUAL") months = 12;
  const day = clampDayOfMonth(dayOfMonth);
  // Âncora no dia configurado do mês (ignora deslocamento de fim de semana já aplicado).
  const anchor = utcCalendarDate(current.getUTCFullYear(), current.getUTCMonth(), day);
  const next = addMonthsUtc(anchor, months);
  const due = utcCalendarDate(next.getUTCFullYear(), next.getUTCMonth(), day);
  return toNextBusinessDayUtc(due);
}

/** Datas de vencimento inclusivas entre início e término da recorrência. */
export function listRecurrenceDueDates(
  startDate: Date,
  endDate: Date,
  frequency: string,
  dayOfMonth: number,
): Date[] {
  const end = utcCalendarDate(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const dates: Date[] = [];
  let due = firstRecurrenceDueDate(startDate, dayOfMonth);
  let guard = 0;
  while (due <= end && guard < 120) {
    dates.push(due);
    due = nextRecurrenceDueDate(due, frequency, dayOfMonth);
    guard += 1;
  }
  return dates;
}
