import {
  BRASIL_IANA_TIMEZONE,
  parseSaoPauloWallClock,
  startOfSaoPauloCalendarDayUtc,
} from "./brasilCalendarMonthBounds.js";

const MS_DAY = 24 * 60 * 60 * 1000;

/** Limites UTC do mês civil (1 → último dia) em São Paulo. */
export function getBrasilMonthBoundsUtc(year: number, month1to12: number): { start: Date; endExclusive: Date } {
  const start = startOfSaoPauloCalendarDayUtc(year, month1to12, 1);
  const nextM = month1to12 === 12 ? 1 : month1to12 + 1;
  const nextY = month1to12 === 12 ? year + 1 : year;
  const endExclusive = startOfSaoPauloCalendarDayUtc(nextY, nextM, 1);
  return { start, endExclusive };
}

function weekdayShortToMon0(short: string): number {
  const m: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return m[short] ?? 0;
}

/** Segunda=0 … domingo=6 (relógio de São Paulo no instante `d`). */
export function saoPauloWeekdayMon0(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRASIL_IANA_TIMEZONE,
    weekday: "short",
  }).formatToParts(d);
  const s = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  return weekdayShortToMon0(s);
}

/** Segunda-feira 00:00:00 (muro SP) da semana ISO que contém `instant`. */
export function startOfIsoWeekMondaySp(instant: Date): Date {
  const { y, m, d } = parseSaoPauloWallClock(instant);
  const sod = startOfSaoPauloCalendarDayUtc(y, m, d);
  const wd = saoPauloWeekdayMon0(sod);
  return new Date(sod.getTime() - wd * MS_DAY);
}

export type BrasilMonthWeekSlice = {
  index: number;
  /** Segunda 00:00 SP da semana (pode iniciar antes do mês). */
  weekStart: Date;
  /** Seguinte segunda 00:00 SP (exclusivo). */
  weekEndExclusive: Date;
  /** Interseção com o mês — início inclusivo para filtros em `TimeEntry.date`. */
  clipStart: Date;
  /** Interseção com o mês — exclusivo (`date < clipEndExclusive`). */
  clipEndExclusive: Date;
  label: string;
};

function formatWeekLabel(clipStart: Date, clipEndExclusive: Date): string {
  const endWall = new Date(clipEndExclusive.getTime() - 1);
  const a = parseSaoPauloWallClock(clipStart);
  const b = parseSaoPauloWallClock(endWall);
  return `${String(a.d).padStart(2, "0")}/${String(a.m).padStart(2, "0")}–${String(b.d).padStart(2, "0")}/${String(b.m).padStart(2, "0")}`;
}

/**
 * Semanas (segunda→domingo) que intersectam o mês civil em SP.
 * Horas executadas na semana: apontamentos com `date` em [clipStart, clipEndExclusive).
 */
export function listWeeksOverlappingBrasilMonth(year: number, month1to12: number): BrasilMonthWeekSlice[] {
  const { start: m0, endExclusive: m1 } = getBrasilMonthBoundsUtc(year, month1to12);
  let wStart = startOfIsoWeekMondaySp(m0);
  const out: BrasilMonthWeekSlice[] = [];
  let idx = 0;
  while (wStart < m1) {
    const wEnd = new Date(wStart.getTime() + 7 * MS_DAY);
    const overlaps = wEnd > m0 && wStart < m1;
    if (overlaps) {
      const clipStart = wStart.getTime() > m0.getTime() ? wStart : m0;
      const clipEndExclusive = wEnd.getTime() < m1.getTime() ? wEnd : m1;
      if (clipStart.getTime() < clipEndExclusive.getTime()) {
        out.push({
          index: idx,
          weekStart: wStart,
          weekEndExclusive: wEnd,
          clipStart,
          clipEndExclusive,
          label: formatWeekLabel(clipStart, clipEndExclusive),
        });
        idx += 1;
      }
    }
    wStart = wEnd;
  }
  return out;
}
