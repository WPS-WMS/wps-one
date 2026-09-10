import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ReadjustmentSkillRateInput = {
  skillProfileId: string;
  hourlyRate: number;
  sortOrder?: number;
};

export type UpsertReadjustmentInput = {
  revenueId: string;
  year: number;
  month: number;
  clientHourlyRate?: number | null;
  skillRates?: ReadjustmentSkillRateInput[];
  notes?: string | null;
  createdById?: string | null;
};

const MONTH_LABELS = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function readjustmentMonthLabel(month: number): string {
  return MONTH_LABELS[month] ?? String(month);
}

export function parseReadjustmentPeriod(raw: {
  year?: unknown;
  month?: unknown;
}): { ok: true; year: number; month: number } | { ok: false; error: string } {
  const year = Number(raw.year);
  const month = Number(raw.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Informe um ano válido." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Informe um mês de reajuste válido (1–12)." };
  }
  return { ok: true, year, month };
}

type Tx = Prisma.TransactionClient;

async function resolveSkillNames(
  tx: Tx,
  tenantId: string,
  rates: ReadjustmentSkillRateInput[],
): Promise<Array<ReadjustmentSkillRateInput & { skillName: string | null }>> {
  if (rates.length === 0) return [];
  const ids = [...new Set(rates.map((r) => r.skillProfileId).filter(Boolean))];
  const profiles = await tx.skillProfile.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));
  return rates
    .filter((r) => nameById.has(r.skillProfileId) && Number.isFinite(r.hourlyRate) && r.hourlyRate >= 0)
    .map((r, index) => ({
      skillProfileId: r.skillProfileId,
      hourlyRate: r.hourlyRate,
      sortOrder: r.sortOrder ?? index,
      skillName: nameById.get(r.skillProfileId) ?? null,
    }));
}

/** Cria ou atualiza o snapshot de reajuste para o par ano/mês. */
export async function upsertRevenueReadjustment(
  tx: Tx,
  tenantId: string,
  input: UpsertReadjustmentInput,
): Promise<string> {
  const skillRows = await resolveSkillNames(tx, tenantId, input.skillRates ?? []);
  const existing = await tx.projectRevenueReadjustment.findUnique({
    where: {
      revenueId_year_month: {
        revenueId: input.revenueId,
        year: input.year,
        month: input.month,
      },
    },
    select: { id: true },
  });

  const clientHourlyRate =
    input.clientHourlyRate != null && Number.isFinite(input.clientHourlyRate) && input.clientHourlyRate > 0
      ? input.clientHourlyRate
      : null;

  if (existing) {
    await tx.projectRevenueReadjustmentSkillRate.deleteMany({ where: { readjustmentId: existing.id } });
    await tx.projectRevenueReadjustment.update({
      where: { id: existing.id },
      data: {
        clientHourlyRate,
        notes: input.notes ?? undefined,
        ...(skillRows.length > 0
          ? {
              skillRates: {
                create: skillRows.map((r) => ({
                  skillProfileId: r.skillProfileId,
                  skillName: r.skillName,
                  hourlyRate: r.hourlyRate,
                  sortOrder: r.sortOrder ?? 0,
                })),
              },
            }
          : {}),
      },
    });
    return existing.id;
  }

  const created = await tx.projectRevenueReadjustment.create({
    data: {
      revenueId: input.revenueId,
      year: input.year,
      month: input.month,
      clientHourlyRate,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      skillRates: {
        create: skillRows.map((r) => ({
          skillProfileId: r.skillProfileId,
          skillName: r.skillName,
          hourlyRate: r.hourlyRate,
          sortOrder: r.sortOrder ?? 0,
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/** Após salvar receita variável: grava snapshot se houver mês de reajuste. */
export async function snapshotReadjustmentFromRevenueState(
  tx: Tx,
  params: {
    tenantId: string;
    revenueId: string;
    userId: string;
    readjustmentMonth: number | null | undefined;
    clientHourlyRate: number | null | undefined;
    skillRates?: ReadjustmentSkillRateInput[] | null;
    year?: number;
  },
): Promise<void> {
  const month = params.readjustmentMonth;
  if (month == null || !Number.isInteger(month) || month < 1 || month > 12) return;

  const year = params.year ?? new Date().getFullYear();
  let skillRates = params.skillRates ?? null;
  if (!skillRates) {
    const current = await tx.projectRevenueSkillRate.findMany({
      where: { revenueId: params.revenueId },
      orderBy: { sortOrder: "asc" },
      select: { skillProfileId: true, hourlyRate: true, sortOrder: true },
    });
    skillRates = current;
  }

  await upsertRevenueReadjustment(tx, params.tenantId, {
    revenueId: params.revenueId,
    year,
    month,
    clientHourlyRate: params.clientHourlyRate ?? null,
    skillRates,
    createdById: params.userId,
  });
}

export async function listRevenueReadjustments(revenueId: string) {
  const rows = await prisma.projectRevenueReadjustment.findMany({
    where: { revenueId },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      skillRates: {
        orderBy: { sortOrder: "asc" },
        include: { skillProfile: { select: { id: true, name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    year: row.year,
    month: row.month,
    monthLabel: readjustmentMonthLabel(row.month),
    periodLabel: `${readjustmentMonthLabel(row.month)} / ${row.year}`,
    clientHourlyRate: row.clientHourlyRate,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    skillRates: row.skillRates.map((s) => ({
      id: s.id,
      skillProfileId: s.skillProfileId,
      skillName: s.skillName ?? s.skillProfile.name,
      hourlyRate: s.hourlyRate,
      sortOrder: s.sortOrder,
    })),
    mode: row.clientHourlyRate != null && row.clientHourlyRate > 0 ? "PROJECT" : "SKILL",
  }));
}
