import { prisma } from "./prisma.js";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Data-only em UTC, para comparar com colunas `@db.Date`. */
function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function parseEffectiveFromDate(raw: unknown): Date | undefined | "invalid" {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const text = String(raw).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (ymd) {
    const parsed = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "invalid" : toUtcDateOnly(parsed);
}

/**
 * Registra uma nova vigência da taxa hora. Mantém o valor anterior intacto para
 * que relatórios de períodos passados continuem usando a taxa da época.
 * Reescrever a mesma data de vigência substitui aquele registro (correção de digitação).
 */
export async function recordHourlyRateChange(
  client: Tx | typeof prisma,
  params: {
    tenantId: string;
    userId: string;
    hourlyRate: number | null;
    effectiveFrom?: Date;
    createdById?: string | null;
  },
): Promise<void> {
  const effectiveFrom = toUtcDateOnly(params.effectiveFrom ?? new Date());
  await client.userHourlyRateHistory.upsert({
    where: { userId_effectiveFrom: { userId: params.userId, effectiveFrom } },
    create: {
      tenantId: params.tenantId,
      userId: params.userId,
      hourlyRate: params.hourlyRate,
      effectiveFrom,
      createdById: params.createdById ?? null,
    },
    update: {
      hourlyRate: params.hourlyRate,
      createdById: params.createdById ?? null,
    },
  });
}

export type HourlyRateResolver = (userId: string, date: Date | null | undefined) => number | null;

/**
 * Resolve a taxa hora vigente na data informada. Usuários sem histórico caem na taxa
 * atual do cadastro, preservando o comportamento anterior à criação do histórico.
 */
export async function buildHourlyRateResolver(userIds: string[]): Promise<HourlyRateResolver> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return () => null;

  const [history, users] = await Promise.all([
    prisma.userHourlyRateHistory.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, hourlyRate: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    }),
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, hourlyRate: true },
    }),
  ]);

  const currentRate = new Map(users.map((u) => [u.id, u.hourlyRate]));
  const timeline = new Map<string, Array<{ from: number; rate: number | null }>>();
  for (const row of history) {
    const list = timeline.get(row.userId) ?? [];
    list.push({ from: toUtcDateOnly(row.effectiveFrom).getTime(), rate: row.hourlyRate });
    timeline.set(row.userId, list);
  }

  return (userId, date) => {
    const list = timeline.get(userId);
    if (!list || list.length === 0) return currentRate.get(userId) ?? null;
    if (!date) return currentRate.get(userId) ?? null;

    const target = toUtcDateOnly(date).getTime();
    let resolved: number | null = null;
    for (const item of list) {
      if (item.from > target) break;
      resolved = item.rate;
    }
    // Antes da primeira vigência o usuário não tinha taxa: não aplica a atual retroativamente.
    return resolved;
  };
}
