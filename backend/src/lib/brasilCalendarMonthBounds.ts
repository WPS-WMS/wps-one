/** Fuso IANA usado para “mês civil” nos cards AMS / Time & Material. */
export const BRASIL_IANA_TIMEZONE = "America/Sao_Paulo";

type SaoPauloWallParts = { y: number; m: number; d: number; h: number; min: number; s: number };

const saoPauloPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRASIL_IANA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function parseSaoPauloWallClock(instant: Date): SaoPauloWallParts {
  const parts = saoPauloPartsFormatter.formatToParts(instant);
  const o: SaoPauloWallParts = { y: 0, m: 0, d: 0, h: 0, min: 0, s: 0 };
  for (const p of parts) {
    if (p.type === "year") o.y = Number(p.value);
    else if (p.type === "month") o.m = Number(p.value);
    else if (p.type === "day") o.d = Number(p.value);
    else if (p.type === "hour") o.h = Number(p.value);
    else if (p.type === "minute") o.min = Number(p.value);
    else if (p.type === "second") o.s = Number(p.value);
  }
  return o;
}

/**
 * Instante UTC em que o relógio de São Paulo marca y-m-d 00:00:00
 * (início do dia civil no Brasil).
 */
export function startOfSaoPauloCalendarDayUtc(y: number, month1to12: number, day: number): Date {
  const lo = Date.UTC(y, month1to12 - 1, day - 2, 0, 0, 0, 0);
  const hi = Date.UTC(y, month1to12 - 1, day + 2, 23, 59, 59, 999);
  for (let ms = lo; ms <= hi; ms += 60_000) {
    const p = parseSaoPauloWallClock(new Date(ms));
    if (p.y === y && p.m === month1to12 && p.d === day && p.h === 0 && p.min === 0) {
      for (let s = ms; s < ms + 60_000; s += 1000) {
        const p2 = parseSaoPauloWallClock(new Date(s));
        if (p2.y === y && p2.m === month1to12 && p2.d === day && p2.h === 0 && p2.min === 0 && p2.s === 0) {
          return new Date(s);
        }
      }
      return new Date(ms);
    }
  }
  // Datas muito antigas / bordas raras: BRT ≈ UTC−3 (sem DST desde 2019).
  return new Date(Date.UTC(y, month1to12 - 1, day, 3, 0, 0, 0));
}

/** Primeiro instante do mês civil corrente em SP e primeiro instante do mês seguinte (exclusivo). */
export function getBrasilCalendarMonthBounds(reference: Date = new Date()): { start: Date; endExclusive: Date } {
  const now = parseSaoPauloWallClock(reference);
  const start = startOfSaoPauloCalendarDayUtc(now.y, now.m, 1);
  const nextM = now.m === 12 ? 1 : now.m + 1;
  const nextY = now.m === 12 ? now.y + 1 : now.y;
  const endExclusive = startOfSaoPauloCalendarDayUtc(nextY, nextM, 1);
  return { start, endExclusive };
}

/** `YYYY-MM` no calendário de São Paulo (ex.: chave de cache). */
export function saoPauloYearMonthStamp(reference: Date = new Date()): string {
  const { y, m } = parseSaoPauloWallClock(reference);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Mês anterior a um carimbo `YYYY-MM` (calendário SP). */
export function previousYearMonthStamp(stamp: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(stamp)) return null;
  const [y, m] = stamp.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return `${prev.y}-${String(prev.m).padStart(2, "0")}`;
}

/** Primeiro instante UTC do mês civil `YYYY-MM` em São Paulo. */
export function referenceMonthStartFromStamp(stamp: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(stamp)) return null;
  const [y, m] = stamp.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return startOfSaoPauloCalendarDayUtc(y, m, 1);
}

/** Limites do mês de referência (`YYYY-MM`) em São Paulo. */
export function getBrasilCalendarMonthBoundsForStamp(stamp: string): {
  hoursMonth: string;
  start: Date;
  endExclusive: Date;
} | null {
  if (!/^\d{4}-\d{2}$/.test(stamp)) return null;
  const start = referenceMonthStartFromStamp(stamp);
  if (!start) return null;
  const [y, m] = stamp.split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return {
    hoursMonth: stamp,
    start,
    endExclusive: startOfSaoPauloCalendarDayUtc(nextY, nextM, 1),
  };
}

/** @deprecated Use {@link getBrasilCalendarMonthBoundsForStamp}. Mantido por compatibilidade interna. */
export function getBrasilCalendarMonthBoundsForPreviousMonth(stamp: string): {
  hoursMonth: string;
  start: Date;
  endExclusive: Date;
} | null {
  const hoursMonth = previousYearMonthStamp(stamp);
  if (!hoursMonth) return null;
  return getBrasilCalendarMonthBoundsForStamp(hoursMonth);
}

/** `YYYY-MM-DD` no calendário civil de São Paulo para um instante UTC. */
export function ymdInBrasilFromInstant(instant: Date): string {
  const { y, m, d } = parseSaoPauloWallClock(instant);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hoje (`YYYY-MM-DD`) no calendário civil de São Paulo — regra de apontamento / mês atual. */
export function todayYmdInBrasil(reference: Date = new Date()): string {
  return ymdInBrasilFromInstant(reference);
}
