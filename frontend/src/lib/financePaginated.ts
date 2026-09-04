/** Normaliza respostas de listagem paginada `{ items, total }` ou array legado. */

export type PaginatedList<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  sumCents?: number;
};

export function unwrapPaginatedList<T>(body: unknown): PaginatedList<T> {
  if (Array.isArray(body)) {
    return { items: body as T[], total: body.length, limit: body.length, offset: 0 };
  }
  if (body && typeof body === "object") {
    const raw = body as Record<string, unknown>;
    const items = Array.isArray(raw.items) ? (raw.items as T[]) : [];
    const total = typeof raw.total === "number" ? raw.total : items.length;
    const limit = typeof raw.limit === "number" ? raw.limit : items.length;
    const offset = typeof raw.offset === "number" ? raw.offset : 0;
    const sumCents = typeof raw.sumCents === "number" ? raw.sumCents : undefined;
    return { items, total, limit, offset, sumCents };
  }
  return { items: [], total: 0, limit: 0, offset: 0 };
}

/** Converte mês/ano (1–12) em intervalo YYYY-MM-DD (UTC). */
export function monthYearToDueRange(
  year: number | null,
  month: number | null,
): { dueFrom?: string; dueTo?: string } {
  if (!year || year < 1990 || year > 2100) return {};
  if (month && month >= 1 && month <= 12) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      dueFrom: `${year}-${String(month).padStart(2, "0")}-01`,
      dueTo: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    };
  }
  return {
    dueFrom: `${year}-01-01`,
    dueTo: `${year}-12-31`,
  };
}

/**
 * Expande seleções múltiplas de ano/mês em intervalos de data.
 * Se há meses e anos, usa o produto cartesiano (ex.: Jan+Mar × 2025+2026).
 * Só anos → cada ano inteiro. Só meses → exige ano (retorna vazio).
 */
export function monthYearSelectionsToDueRanges(
  years: string[],
  months: string[],
): Array<{ dueFrom: string; dueTo: string }> {
  const ys = [...new Set(years.map((y) => Number(y)).filter((y) => y >= 1990 && y <= 2100))];
  const ms = [...new Set(months.map((m) => Number(m)).filter((m) => m >= 1 && m <= 12))];
  if (ys.length === 0) return [];
  const out: Array<{ dueFrom: string; dueTo: string }> = [];
  if (ms.length === 0) {
    for (const y of ys) {
      const r = monthYearToDueRange(y, null);
      if (r.dueFrom && r.dueTo) out.push({ dueFrom: r.dueFrom, dueTo: r.dueTo });
    }
    return out;
  }
  for (const y of ys) {
    for (const m of ms) {
      const r = monthYearToDueRange(y, m);
      if (r.dueFrom && r.dueTo) out.push({ dueFrom: r.dueFrom, dueTo: r.dueTo });
    }
  }
  return out;
}

/** Serializa intervalos para a query `dueRanges` (YYYY-MM-DD|YYYY-MM-DD,...). */
export function encodeDueRanges(ranges: Array<{ dueFrom: string; dueTo: string }>): string {
  return ranges.map((r) => `${r.dueFrom}|${r.dueTo}`).join(",");
}

/** Mês/ano atuais no fuso local, no formato dos filtros de Contas a pagar/receber. */
export function currentFinanceMonthYear(): { month: string; year: string } {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  };
}

export function currentMonthBoundsLocal(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}
