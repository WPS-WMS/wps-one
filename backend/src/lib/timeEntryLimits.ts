import { activeTimeEntryWhere } from "./activeTimeEntryWhere.js";
import { prisma } from "./prisma.js";

const DOW_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

/** Dia da semana (0=Dom … 6=Sáb) em UTC — alinhado às datas civis do apontamento. */
export function utcWeekdayIndex(dateValue: string | Date): number | null {
  if (typeof dateValue === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue.trim());
    if (m) {
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    }
  }
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

/** Mesma regra do front: mapa por dia da semana (UTC) ou fallback; 0 é válido. */
export function getDailyLimitFromUser(
  user: { limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null },
  dateValue: string | Date
): number {
  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : 8;
  const idx = utcWeekdayIndex(dateValue);
  if (idx == null) return fallback;

  const raw = user.limiteHorasPorDia;
  if (!raw) {
    return idx === 0 || idx === 6 ? 0 : fallback;
  }
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const key = DOW_KEYS[idx] as string;
    const v = map[key];
    if (typeof v === "number" && v >= 0) return v;
    return idx === 0 || idx === 6 ? 0 : fallback;
  } catch {
    return idx === 0 || idx === 6 ? 0 : fallback;
  }
}

/**
 * Soma horas apontadas no mesmo dia civil que `day` (YMD via ISO UTC do valor gravado),
 * alinhado ao agrupamento por data na UI / banco de horas.
 */
export async function sumTimeEntryHoursForUserOnStoredUtcDay(
  userId: string,
  day: Date,
  opts?: { excludeEntryId?: string }
): Promise<number> {
  const minutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(userId, day, opts);
  return minutes / 60;
}

export async function sumTimeEntryMinutesForUserOnStoredUtcDay(
  userId: string,
  day: Date,
  opts?: { excludeEntryId?: string }
): Promise<number> {
  const isoYmd =
    day instanceof Date ? day.toISOString().slice(0, 10) : String(day).slice(0, 10);
  const start = new Date(`${isoYmd}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await prisma.timeEntry.findMany({
    where: activeTimeEntryWhere({
      userId,
      date: { gte: start, lt: end },
      ...(opts?.excludeEntryId ? { id: { not: opts.excludeEntryId } } : {}),
    }),
    select: { totalHoras: true },
  });
  return rows.reduce((sum, row) => sum + Math.round(Number(row.totalHoras) * 60), 0);
}
