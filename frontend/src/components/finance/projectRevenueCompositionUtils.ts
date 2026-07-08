export type CostLineDraft = {
  clientId: string;
  skill: string;
  hourlyRate: string;
  hours: string;
};

export type BillingLineDraft = {
  clientId: string;
  milestone: string;
  installmentNumber: string;
  dueDate: string;
  amount: string;
};

export function newClientId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function costLineValue(line: Pick<CostLineDraft, "hourlyRate" | "hours">): number {
  const rate = Number(line.hourlyRate);
  const hours = Number(line.hours);
  if (!Number.isFinite(rate) || !Number.isFinite(hours)) return 0;
  return Math.round(rate * hours * 100) / 100;
}

export function sumCostLines(lines: CostLineDraft[]): number {
  return Math.round(lines.reduce((sum, line) => sum + costLineValue(line), 0) * 100) / 100;
}

export function sumBillingLines(lines: BillingLineDraft[]): number {
  return Math.round(
    lines.reduce((sum, line) => {
      const amount = Number(line.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0) * 100,
  ) / 100;
}

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
  lines: BillingLineDraft[],
): BillingLineDraft[] {
  const amounts = distributeEqualAmounts(costTotal, lines.length);
  return lines.map((line, index) => ({
    ...line,
    amount: amounts[index] != null ? String(amounts[index]) : "0",
  }));
}

export function defaultBillingLines(count = 4): BillingLineDraft[] {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(today);
    due.setMonth(due.getMonth() + index);
    return {
      clientId: newClientId(),
      milestone: "",
      installmentNumber: String(index + 1),
      dueDate: due.toISOString().slice(0, 10),
      amount: "0",
    };
  });
}

export function defaultCostLine(): CostLineDraft {
  return {
    clientId: newClientId(),
    skill: "",
    hourlyRate: "",
    hours: "",
  };
}

export function renumberBillingInstallments(lines: BillingLineDraft[]): BillingLineDraft[] {
  return lines.map((line, index) => ({
    ...line,
    installmentNumber: String(index + 1),
  }));
}
