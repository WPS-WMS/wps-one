import { parseOptionalDate } from "./projectRevenueHelpers.js";

export type CostLineInput = {
  skill: string;
  hourlyRate: number;
  hours: number;
  isDiscount?: boolean;
  sortOrder?: number;
};

export type BillingLineInput = {
  milestone?: string | null;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  sortOrder?: number;
};

export function costLineTotal(line: Pick<CostLineInput, "hourlyRate" | "hours">): number {
  return Math.round(line.hourlyRate * line.hours * 100) / 100;
}

export function sumCostLines(lines: CostLineInput[]): number {
  return (
    Math.round(
      lines
        .filter((line) => !line.isDiscount)
        .reduce((sum, line) => sum + costLineTotal(line), 0) * 100,
    ) / 100
  );
}

export function sumDiscountLines(lines: CostLineInput[]): number {
  return (
    Math.round(
      lines
        .filter((line) => line.isDiscount)
        .reduce((sum, line) => sum + costLineTotal(line), 0) * 100,
    ) / 100
  );
}

/** Total de custos menos os descontos aplicados. */
export function netCostTotal(lines: CostLineInput[]): number {
  return Math.round((sumCostLines(lines) - sumDiscountLines(lines)) * 100) / 100;
}

export function sumBillingLines(lines: BillingLineInput[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
}

/** Divide o total em parcelas iguais (centavos no último ajuste). */
export function distributeEqualAmounts(total: number, count: number): number[] {
  if (count <= 0) return [];
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) =>
    (base + (index === count - 1 ? remainder : 0)) / 100,
  );
}

export function applyAutoBillingAmounts(
  costTotal: number,
  billingLines: BillingLineInput[],
): BillingLineInput[] {
  if (billingLines.length === 0) return billingLines;
  const amounts = distributeEqualAmounts(costTotal, billingLines.length);
  return billingLines.map((line, index) => ({
    ...line,
    amount: amounts[index] ?? 0,
  }));
}

export function parseCostLinesInput(raw: unknown): { ok: true; data: CostLineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Linhas de custo inválidas." };
  }
  const data: CostLineInput[] = [];
  for (let index = 0; index < raw.length; index++) {
    const row = raw[index] as Record<string, unknown>;
    const isDiscount = row?.isDiscount === true;
    const skill = String(row?.skill ?? "").trim() || (isDiscount ? "Desconto" : "");
    if (!skill) {
      return { ok: false, error: `Skill obrigatória na linha ${index + 1} de custos.` };
    }
    const hourlyRate = Number(row?.hourlyRate);
    const hours = isDiscount ? 1 : Number(row?.hours);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return { ok: false, error: `Taxa hora inválida na linha ${index + 1} de custos.` };
    }
    if (!Number.isFinite(hours) || hours < 0) {
      return { ok: false, error: `Quantidade de horas inválida na linha ${index + 1} de custos.` };
    }
    data.push({
      skill,
      hourlyRate,
      hours,
      isDiscount,
      sortOrder: Number.isFinite(Number(row?.sortOrder)) ? Number(row.sortOrder) : index,
    });
  }
  return { ok: true, data };
}

export function parseBillingLinesInput(
  raw: unknown,
): { ok: true; data: BillingLineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Linhas de faturamento inválidas." };
  }
  const data: BillingLineInput[] = [];
  for (let index = 0; index < raw.length; index++) {
    const row = raw[index] as Record<string, unknown>;
    const milestoneRaw = String(row?.milestone ?? "").trim();
    const installmentNumber = Number.parseInt(String(row?.installmentNumber ?? index + 1), 10);
    if (!Number.isFinite(installmentNumber) || installmentNumber < 1) {
      return { ok: false, error: `Número da parcela inválido na linha ${index + 1} de faturamento.` };
    }
    const dueDate = parseOptionalDate(row?.dueDate);
    if (!dueDate) {
      return { ok: false, error: `Data de pagamento inválida na linha ${index + 1} de faturamento.` };
    }
    const amount = Number(row?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `Valor inválido na linha ${index + 1} de faturamento.` };
    }
    data.push({
      milestone: milestoneRaw.length > 0 ? milestoneRaw : null,
      installmentNumber,
      dueDate,
      amount,
      sortOrder: Number.isFinite(Number(row?.sortOrder)) ? Number(row.sortOrder) : index,
    });
  }
  return { ok: true, data };
}

export function defaultBillingLines(count = 4, firstDueDate = new Date()): BillingLineInput[] {
  const due = new Date(firstDueDate);
  return Array.from({ length: count }, (_, index) => {
    const lineDue = new Date(due);
    lineDue.setUTCMonth(lineDue.getUTCMonth() + index);
    return {
      milestone: null,
      installmentNumber: index + 1,
      dueDate: lineDue,
      amount: 0,
      sortOrder: index,
    };
  });
}

export function syncRevenueTotalsFromComposition(
  costLines: CostLineInput[],
  billingLines: BillingLineInput[],
): {
  contractedValue: number | null;
  expectedRevenue: number | null;
  installmentCount: number | null;
  startDate: Date | null;
  endDate: Date | null;
} {
  const costTotal = netCostTotal(costLines);
  const billingTotal = sumBillingLines(billingLines);
  const contractedValue = costLines.length > 0 ? costTotal : null;
  const expectedRevenue = billingLines.length > 0 ? billingTotal : contractedValue;
  const sortedDueDates = billingLines
    .map((line) => line.dueDate)
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    contractedValue,
    expectedRevenue,
    installmentCount: billingLines.length > 0 ? billingLines.length : null,
    startDate: sortedDueDates[0] ?? null,
    endDate: sortedDueDates.length > 0 ? sortedDueDates[sortedDueDates.length - 1] : null,
  };
}
