import { parseOptionalDate } from "./projectRevenueHelpers.js";
import { distributeEqualAmounts, type BillingLineInput } from "./projectRevenueCompositionHelpers.js";
import { getBrasilCalendarMonthBounds } from "./brasilCalendarMonthBounds.js";

export type VariableRevenueEntryInput = {
  competenceDate: Date;
  description: string | null;
  hours: number | null;
  hourlyRate: number | null;
  amount: number;
  installmentCount: number;
  firstDueDate: Date;
  sortOrder: number;
};

export function parseVariableRevenueEntries(raw: unknown):
  | { ok: true; data: VariableRevenueEntryInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Medições da receita variável são inválidas." };
  }
  const data: VariableRevenueEntryInput[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row = (raw[index] ?? {}) as Record<string, unknown>;
    const competenceDate = parseOptionalDate(row.competenceDate);
    const firstDueDate = parseOptionalDate(row.firstDueDate);
    if (!competenceDate) {
      return { ok: false, error: `Competência inválida na medição ${index + 1}.` };
    }
    if (
      getBrasilCalendarMonthBounds(competenceDate).start >=
      getBrasilCalendarMonthBounds().start
    ) {
      return {
        ok: false,
        error: `A medição ${index + 1} deve faturar um mês já encerrado.`,
      };
    }
    if (!firstDueDate) {
      return { ok: false, error: `Primeiro vencimento inválido na medição ${index + 1}.` };
    }
    const hours =
      row.hours == null || row.hours === "" ? null : Number(row.hours);
    const hourlyRate =
      row.hourlyRate == null || row.hourlyRate === "" ? null : Number(row.hourlyRate);
    if (hours != null && (!Number.isFinite(hours) || hours < 0)) {
      return { ok: false, error: `Horas inválidas na medição ${index + 1}.` };
    }
    if (hourlyRate != null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      return { ok: false, error: `Taxa hora inválida na medição ${index + 1}.` };
    }
    const calculatedAmount =
      hours != null && hourlyRate != null
        ? Math.round(hours * hourlyRate * 100) / 100
        : null;
    const amount =
      row.amount == null || row.amount === ""
        ? calculatedAmount
        : Number(row.amount);
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: `Valor inválido na medição ${index + 1}.` };
    }
    const installmentCount = Number.parseInt(String(row.installmentCount ?? 1), 10);
    if (!Number.isFinite(installmentCount) || installmentCount < 1 || installmentCount > 120) {
      return { ok: false, error: `Parcelamento inválido na medição ${index + 1} (1–120).` };
    }
    data.push({
      competenceDate,
      description: String(row.description ?? "").trim() || null,
      hours,
      hourlyRate,
      amount: Math.round(amount * 100) / 100,
      installmentCount,
      firstDueDate,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index,
    });
  }
  return { ok: true, data };
}

function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export type GeneratedVariableBillingLine = BillingLineInput & { variableEntryIndex: number };

export function buildVariableBillingLines(
  entries: VariableRevenueEntryInput[],
): GeneratedVariableBillingLine[] {
  const lines: GeneratedVariableBillingLine[] = [];
  let installmentNumber = 1;
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex]!;
    const amounts = distributeEqualAmounts(entry.amount, entry.installmentCount);
    for (let part = 0; part < entry.installmentCount; part += 1) {
      lines.push({
        variableEntryIndex: entryIndex,
        milestone:
          entry.description ??
          `Medição ${entry.competenceDate.toISOString().slice(0, 7)}`,
        installmentNumber,
        dueDate: addMonthsUtc(entry.firstDueDate, part),
        amount: amounts[part] ?? 0,
        sortOrder: lines.length,
      });
      installmentNumber += 1;
    }
  }
  return lines;
}
