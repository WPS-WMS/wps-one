import { prisma } from "./prisma.js";
import { getDailyLimitFromUser, sumTimeEntryMinutesForUserOnStoredUtcDay } from "./timeEntryLimits.js";

function storedDayBounds(day: Date): { start: Date; end: Date } {
  const isoYmd = day.toISOString().slice(0, 10);
  const start = new Date(`${isoYmd}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export type PermissionRequestHorasSummary = {
  dayTotalHoras: number;
  extraHoras: number;
  dailyLimitHoras: number;
};

export async function computePermissionRequestHorasSummary(input: {
  userId: string;
  date: Date;
  replacesTimeEntryId?: string | null;
  user: { limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null };
}): Promise<PermissionRequestHorasSummary> {
  const approvedMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(input.userId, input.date, {
    excludeEntryId: input.replacesTimeEntryId ?? undefined,
  });
  const { start, end } = storedDayBounds(input.date);
  const pendingRows = await prisma.timeEntryPermissionRequest.findMany({
    where: {
      userId: input.userId,
      status: "PENDING",
      date: { gte: start, lt: end },
    },
    select: { totalHoras: true },
  });
  const pendingMinutes = pendingRows.reduce((s, r) => s + Math.round(Number(r.totalHoras) * 60), 0);
  const dayTotalMinutes = approvedMinutes + pendingMinutes;
  const dailyLimitHoras = getDailyLimitFromUser(input.user, input.date);
  const limitMinutes = Math.round(dailyLimitHoras * 60);
  const extraMinutes = Math.max(0, dayTotalMinutes - limitMinutes);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    dayTotalHoras: round1(dayTotalMinutes / 60),
    extraHoras: round1(extraMinutes / 60),
    dailyLimitHoras,
  };
}

type PermissionRequestRow = {
  userId: string;
  date: Date;
  replacesTimeEntryId?: string | null;
  user: { limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null };
};

export async function enrichPermissionRequestsWithHorasSummary<T extends PermissionRequestRow>(
  rows: T[],
): Promise<(T & PermissionRequestHorasSummary)[]> {
  const cache = new Map<string, PermissionRequestHorasSummary>();
  const out: (T & PermissionRequestHorasSummary)[] = [];
  for (const row of rows) {
    const ymd = row.date.toISOString().slice(0, 10);
    const cacheKey = `${row.userId}|${ymd}|${row.replacesTimeEntryId ?? ""}`;
    if (!cache.has(cacheKey)) {
      cache.set(
        cacheKey,
        await computePermissionRequestHorasSummary({
          userId: row.userId,
          date: row.date,
          replacesTimeEntryId: row.replacesTimeEntryId,
          user: row.user,
        }),
      );
    }
    out.push({ ...row, ...cache.get(cacheKey)! });
  }
  return out;
}
