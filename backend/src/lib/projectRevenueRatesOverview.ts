import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ProjectRateSkillCell = {
  skillProfileId: string;
  skillName: string;
  hourlyRate: number;
};

export type ProjectRateOverviewRow = {
  revenueId: string;
  revenueTitle: string | null;
  projectId: string;
  projectName: string;
  arquivado: boolean;
  clientId: string;
  clientName: string;
  tipoProjeto: string | null;
  contractProposal: string | null;
  paymentTermDays: number | null;
  readjustmentMonth: number | null;
  clientHourlyRate: number | null;
  status: string;
  skillRates: ProjectRateSkillCell[];
  readjustmentHistory: Array<{
    id: string;
    year: number;
    month: number;
    periodLabel: string;
    clientHourlyRate: number | null;
    skillRates: Array<{ skillName: string; hourlyRate: number }>;
  }>;
};

export type ProjectRateSkillColumn = {
  id: string;
  name: string;
};

/**
 * Painel Taxas por projeto: receitas variáveis de projetos AMS / T&M.
 */
export async function listProjectRatesOverview(
  tenantId: string,
  visibility: Prisma.ProjectWhereInput,
): Promise<{ rows: ProjectRateOverviewRow[]; skillColumns: ProjectRateSkillColumn[] }> {
  const revenues = await prisma.projectRevenue.findMany({
    where: {
      tenantId,
      revenueType: "VARIAVEL",
      status: { not: "CANCELADO" },
      project: {
        ...visibility,
        parentProjectId: null,
        tipoProjeto: { in: ["AMS", "TIME_MATERIAL"] },
      },
    },
    select: {
      id: true,
      title: true,
      contractProposal: true,
      paymentTermDays: true,
      readjustmentMonth: true,
      clientHourlyRate: true,
      status: true,
      project: {
        select: {
          id: true,
          name: true,
          arquivado: true,
          tipoProjeto: true,
          client: { select: { id: true, name: true } },
        },
      },
      skillRates: {
        orderBy: { sortOrder: "asc" },
        select: {
          hourlyRate: true,
          skillProfile: { select: { id: true, name: true } },
        },
      },
      readjustments: {
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 8,
        select: {
          id: true,
          year: true,
          month: true,
          clientHourlyRate: true,
          skillRates: {
            orderBy: { sortOrder: "asc" },
            select: {
              hourlyRate: true,
              skillName: true,
              skillProfile: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { project: { client: { name: "asc" } } },
      { project: { name: "asc" } },
      { createdAt: "asc" },
    ],
  });

  const skillMap = new Map<string, string>();
  const monthLabels = [
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
  const rows: ProjectRateOverviewRow[] = revenues.map((row) => {
    const skillRates: ProjectRateSkillCell[] = row.skillRates.map((rate) => {
      skillMap.set(rate.skillProfile.id, rate.skillProfile.name);
      return {
        skillProfileId: rate.skillProfile.id,
        skillName: rate.skillProfile.name,
        hourlyRate: rate.hourlyRate,
      };
    });
    return {
      revenueId: row.id,
      revenueTitle: row.title,
      projectId: row.project.id,
      projectName: row.project.name,
      arquivado: row.project.arquivado,
      clientId: row.project.client.id,
      clientName: row.project.client.name,
      tipoProjeto: row.project.tipoProjeto,
      contractProposal: row.contractProposal,
      paymentTermDays: row.paymentTermDays,
      readjustmentMonth: row.readjustmentMonth,
      clientHourlyRate: row.clientHourlyRate,
      status: row.status,
      skillRates,
      readjustmentHistory: row.readjustments.map((adj) => ({
        id: adj.id,
        year: adj.year,
        month: adj.month,
        periodLabel: `${monthLabels[adj.month] ?? adj.month} / ${adj.year}`,
        clientHourlyRate: adj.clientHourlyRate,
        skillRates: adj.skillRates.map((s) => ({
          skillName: s.skillName ?? s.skillProfile.name,
          hourlyRate: s.hourlyRate,
        })),
      })),
    };
  });

  const skillColumns = [...skillMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { rows, skillColumns };
}
