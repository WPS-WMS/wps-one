export type CostLineDraft = {
  clientId: string;
  skill: string;
  hourlyRate: string;
  hours: string;
  isDiscount?: boolean;
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
  return (
    Math.round(
      lines
        .filter((line) => !line.isDiscount)
        .reduce((sum, line) => sum + costLineValue(line), 0) * 100,
    ) / 100
  );
}

export function sumDiscountLines(lines: CostLineDraft[]): number {
  return (
    Math.round(
      lines
        .filter((line) => line.isDiscount)
        .reduce((sum, line) => sum + costLineValue(line), 0) * 100,
    ) / 100
  );
}

/** Total de custos menos os descontos aplicados. */
export function netCostTotal(lines: CostLineDraft[]): number {
  return Math.round((sumCostLines(lines) - sumDiscountLines(lines)) * 100) / 100;
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

/** Data local YYYY-MM-DD (evita deslocamento de fuso do toISOString). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function todayLocalIso(): string {
  return formatLocalDate(new Date());
}

/** Soma meses a uma data ISO local, preservando o dia quando possível. */
export function addMonthsToIso(iso: string, months: number): string {
  const base = parseLocalDate(iso) ?? new Date();
  const day = base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return formatLocalDate(next);
}

/** Soma dias a uma data ISO local. */
export function addDaysToIso(iso: string, days: number): string {
  const base = parseLocalDate(iso) ?? new Date();
  base.setDate(base.getDate() + days);
  return formatLocalDate(base);
}

/**
 * Próxima data de parcela: 30 dias após a última parcela existente.
 * Se não houver data válida, usa hoje + 30 dias.
 */
export function nextBillingDueFromLines(lines: BillingLineDraft[]): string {
  const lastWithDate = [...lines].reverse().find((line) => parseLocalDate(line.dueDate));
  if (lastWithDate) return addDaysToIso(lastWithDate.dueDate, 30);
  return addDaysToIso(todayLocalIso(), 30);
}

/**
 * Mantém datas progressivas (+1 mês) a partir da parcela em `fromIndex`.
 * Ex.: alterar parcela 1 para out/2026 → parcela 2 nov, parcela 3 dez, …
 */
export function cascadeBillingDatesFrom(
  lines: BillingLineDraft[],
  fromIndex: number,
): BillingLineDraft[] {
  if (fromIndex < 0 || fromIndex >= lines.length) return lines;
  const startIso = parseLocalDate(lines[fromIndex]!.dueDate)
    ? lines[fromIndex]!.dueDate
    : todayLocalIso();
  return lines.map((line, index) => {
    if (index <= fromIndex) {
      return index === fromIndex ? { ...line, dueDate: startIso } : line;
    }
    return {
      ...line,
      dueDate: addMonthsToIso(startIso, index - fromIndex),
    };
  });
}

/** Parcelas iniciais: 1ª = hoje; demais = +1 mês progressivo. */
export function defaultBillingLines(count = 4): BillingLineDraft[] {
  const start = todayLocalIso();
  return Array.from({ length: count }, (_, index) => ({
    clientId: newClientId(),
    milestone: "",
    installmentNumber: String(index + 1),
    dueDate: index === 0 ? start : addMonthsToIso(start, index),
    amount: "0",
  }));
}

export function defaultCostLine(): CostLineDraft {
  return {
    clientId: newClientId(),
    skill: "",
    hourlyRate: "",
    hours: "",
  };
}

export function defaultDiscountLine(): CostLineDraft {
  return {
    clientId: newClientId(),
    skill: "Desconto",
    hourlyRate: "",
    hours: "1",
    isDiscount: true,
  };
}

export function renumberBillingInstallments(lines: BillingLineDraft[]): BillingLineDraft[] {
  return lines.map((line, index) => ({
    ...line,
    installmentNumber: String(index + 1),
  }));
}
