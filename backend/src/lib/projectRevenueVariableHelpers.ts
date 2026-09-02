import { parseOptionalDate } from "./projectRevenueHelpers.js";
import {
  distributeEqualAmounts,
  parseBillingLinesInput,
  parseCostLinesInput,
  sumCostLines,
  type BillingLineInput,
  type CostLineInput,
} from "./projectRevenueCompositionHelpers.js";
import { referenceMonthStartFromStamp } from "./brasilCalendarMonthBounds.js";

export type VariableRevenueBillingLineInput = {
  milestone: string | null;
  dueDate: Date;
  expectedPaymentDate: Date;
  amount: number;
};

export type VariableRevenueEntryInput = {
  title: string | null;
  competenceDate: Date;
  description: string | null;
  hours: number | null;
  hourlyRate: number | null;
  amount: number;
  installmentCount: number;
  firstDueDate: Date;
  /** Parcelas explícitas (data + valor). Quando ausente, gera a partir de installmentCount/firstDueDate. */
  billingLines: VariableRevenueBillingLineInput[];
  /** Skills (taxa hora × horas por perfil). Quando informado, define o valor da medição. */
  costLines: CostLineInput[];
  sortOrder: number;
};

function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function generateEqualBillingLines(
  amount: number,
  installmentCount: number,
  firstDueDate: Date,
  milestone: string | null,
): VariableRevenueBillingLineInput[] {
  const amounts = distributeEqualAmounts(amount, installmentCount);
  return amounts.map((lineAmount, part) => {
    const dueDate = addMonthsUtc(firstDueDate, part);
    return {
      milestone,
      dueDate,
      expectedPaymentDate: dueDate,
      amount: lineAmount,
    };
  });
}

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
    if (!competenceDate) {
      return { ok: false, error: `Mês de referência inválido na medição ${index + 1}.` };
    }
    const referenceStart = referenceMonthStartFromStamp(
      competenceDate.toISOString().slice(0, 7),
    );
    if (!referenceStart) {
      return { ok: false, error: `Mês de referência inválido na medição ${index + 1}.` };
    }
    let hours =
      row.hours == null || row.hours === "" ? null : Number(row.hours);
    let hourlyRate =
      row.hourlyRate == null || row.hourlyRate === "" ? null : Number(row.hourlyRate);

    let costLines: CostLineInput[] = [];
    if (row.costLines !== undefined && Array.isArray(row.costLines)) {
      const parsedSkills = parseCostLinesInput(
        row.costLines.filter((line) => {
          const o = line as Record<string, unknown>;
          return o?.isDiscount !== true;
        }),
      );
      if (parsedSkills.ok === false) {
        return {
          ok: false,
          error: `Skills inválidas na medição ${index + 1}: ${parsedSkills.error}`,
        };
      }
      costLines = parsedSkills.data;
    }

    if (costLines.length > 0) {
      const skillHours =
        Math.round(costLines.reduce((sum, line) => sum + line.hours, 0) * 100) / 100;
      const skillAmount = sumCostLines(costLines);
      hours = skillHours > 0 ? skillHours : hours;
      hourlyRate =
        skillHours > 0 ? Math.round((skillAmount / skillHours) * 100) / 100 : hourlyRate;
    }

    if (hours != null && (!Number.isFinite(hours) || hours < 0)) {
      return { ok: false, error: `Horas inválidas na medição ${index + 1}.` };
    }
    if (hourlyRate != null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      return { ok: false, error: `Taxa hora inválida na medição ${index + 1}.` };
    }
    const calculatedAmount =
      costLines.length > 0
        ? sumCostLines(costLines)
        : hours != null && hourlyRate != null
          ? Math.round(hours * hourlyRate * 100) / 100
          : null;
    const rawAmount =
      row.amount == null || row.amount === "" ? calculatedAmount : Number(row.amount);
    const amount =
      rawAmount != null &&
      Number.isFinite(rawAmount) &&
      rawAmount > 0
        ? rawAmount
        : calculatedAmount != null && calculatedAmount > 0
          ? calculatedAmount
          : rawAmount;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: `Valor inválido na medição ${index + 1}.` };
    }
    const roundedAmount = Math.round(amount * 100) / 100;
    if (
      costLines.length === 0 &&
      (hours == null || !Number.isFinite(hours) || hours <= 0) &&
      hourlyRate != null &&
      hourlyRate > 0 &&
      roundedAmount > 0
    ) {
      hours = Math.round((roundedAmount / hourlyRate) * 100) / 100;
    }
    const description = String(row.description ?? "").trim() || null;
    const title =
      String(row.title ?? "").trim() ||
      `Medição ${index + 1}`;
    const milestoneDefault = title;

    let billingLines: VariableRevenueBillingLineInput[] = [];
    if (row.billingLines !== undefined) {
      const parsed = parseBillingLinesInput(row.billingLines);
      if (parsed.ok === false) {
        return {
          ok: false,
          error: `Parcelas inválidas na medição ${index + 1}: ${parsed.error}`,
        };
      }
      if (parsed.data.length === 0) {
        return { ok: false, error: `Informe ao menos uma parcela na medição ${index + 1}.` };
      }
      if (parsed.data.length > 120) {
        return { ok: false, error: `Parcelamento inválido na medição ${index + 1} (1–120).` };
      }
      billingLines = parsed.data.map((line) => ({
        milestone: line.milestone ?? milestoneDefault,
        dueDate: line.dueDate,
        expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
        amount: line.amount,
      }));
      const linesTotal =
        Math.round(billingLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
      if (Math.round(linesTotal * 100) !== Math.round(roundedAmount * 100)) {
        const diffCents = Math.round(roundedAmount * 100) - Math.round(linesTotal * 100);
        const last = billingLines[billingLines.length - 1]!;
        last.amount = (Math.round(last.amount * 100) + diffCents) / 100;
      }
    } else {
      const firstDueDate = parseOptionalDate(row.firstDueDate);
      if (!firstDueDate) {
        return { ok: false, error: `Primeiro vencimento inválido na medição ${index + 1}.` };
      }
      const installmentCount = Number.parseInt(String(row.installmentCount ?? 1), 10);
      if (!Number.isFinite(installmentCount) || installmentCount < 1 || installmentCount > 120) {
        return { ok: false, error: `Parcelamento inválido na medição ${index + 1} (1–120).` };
      }
      billingLines = generateEqualBillingLines(
        roundedAmount,
        installmentCount,
        firstDueDate,
        milestoneDefault,
      );
    }

    const sortedByDate = [...billingLines].sort(
      (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
    );
    data.push({
      title,
      competenceDate,
      description,
      hours,
      hourlyRate,
      amount: roundedAmount,
      installmentCount: billingLines.length,
      firstDueDate: sortedByDate[0]!.dueDate,
      billingLines,
      costLines,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index,
    });
  }
  return { ok: true, data };
}

export type GeneratedVariableBillingLine = BillingLineInput & { variableEntryIndex: number };

export function buildVariableBillingLines(
  entries: VariableRevenueEntryInput[],
): GeneratedVariableBillingLine[] {
  const lines: GeneratedVariableBillingLine[] = [];
  let installmentNumber = 1;
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex]!;
    const entryLines =
      entry.billingLines.length > 0
        ? entry.billingLines
        : generateEqualBillingLines(
            entry.amount,
            entry.installmentCount,
            entry.firstDueDate,
            entry.title ??
              `Medição ${entry.competenceDate.toISOString().slice(0, 7)}`,
          );
    for (const line of entryLines) {
      lines.push({
        variableEntryIndex: entryIndex,
        milestone:
          entry.title ??
          line.milestone ??
          `Medição ${entry.competenceDate.toISOString().slice(0, 7)}`,
        installmentNumber,
        dueDate: line.dueDate,
        expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
        amount: line.amount,
        sortOrder: lines.length,
      });
      installmentNumber += 1;
    }
  }
  return lines;
}
