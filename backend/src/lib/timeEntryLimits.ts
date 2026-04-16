import { prisma } from "./prisma.js";

/** Mesma regra de `time-entries`: limite do dia (mapa por dia da semana ou fallback). */
export function getDailyLimitFromUser(
  user: { limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null },
  dateValue: string | Date
): number {
  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : 8;
  const raw = user.limiteHorasPorDia;
  if (!raw) return fallback;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return fallback;
    const idx = d.getDay();
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    const key = keys[idx] as string;
    const v = map[key];
    return typeof v === "number" && v > 0 ? v : fallback;
  } catch {
    return fallback;
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
  const isoYmd =
    day instanceof Date ? day.toISOString().slice(0, 10) : String(day).slice(0, 10);
  const start = new Date(`${isoYmd}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const agg = await prisma.timeEntry.aggregate({
    where: {
      userId,
      date: { gte: start, lt: end },
      ...(opts?.excludeEntryId ? { id: { not: opts.excludeEntryId } } : {}),
    },
    _sum: { totalHoras: true },
  });
  return Math.round((agg._sum.totalHoras ?? 0) * 100) / 100;
}
