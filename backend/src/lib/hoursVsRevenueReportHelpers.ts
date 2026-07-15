import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type HoursVsRevenueRow = {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  /** Horas cadastradas nas composições de receita (linhas de custo). */
  horasPrevistas: number | null;
  /** Horas apontadas no projeto (+ filhos). */
  horasRealizadas: number;
  /** Valor do projeto (receita prevista / contratada). */
  receitaPrevista: number;
  /**
   * % de consumo dos valores do projeto:
   * (custo operacional + despesa operacional) / receita prevista.
   */
  receitaConsumidaPercentual: number | null;
  /** Custo dos apontamentos (horas × taxa hora). */
  custoOperacional: number | null;
  /** Despesas ligadas à execução (lançamentos + reembolsos pagos). */
  despesaOperacional: number;
  impostos: number;
  /** Receita − custos − despesas − impostos. */
  margemReais: number;
  margemPercentual: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Relatório transversal: Medição de Horas vs Receita (Relatórios).
 */
export async function listHoursVsRevenueReport(
  tenantId: string,
  visibility: Prisma.ProjectWhereInput,
): Promise<HoursVsRevenueRow[]> {
  const rootProjects = await prisma.project.findMany({
    where: {
      ...visibility,
      parentProjectId: null,
      arquivado: false,
    },
    select: {
      id: true,
      name: true,
      valorContrato: true,
      totalHorasPlanejadas: true,
      limiteHorasEscopo: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  if (rootProjects.length === 0) return [];

  const rootIds = rootProjects.map((p) => p.id);
  const children = await prisma.project.findMany({
    where: { parentProjectId: { in: rootIds }, client: { tenantId } },
    select: { id: true, parentProjectId: true },
  });

  const projectToRoot = new Map<string, string>();
  for (const id of rootIds) projectToRoot.set(id, id);
  for (const child of children) {
    if (child.parentProjectId) projectToRoot.set(child.id, child.parentProjectId);
  }
  const allProjectIds = [...rootIds, ...children.map((c) => c.id)];

  const [costLines, timeByProject, timeByUserProject, revenues, expenseEntries, reimbursements] =
    await Promise.all([
      prisma.projectRevenueCostLine.findMany({
        where: {
          isDiscount: false,
          revenue: {
            tenantId,
            projectId: { in: allProjectIds },
            status: { not: "CANCELADO" },
          },
        },
        select: { hours: true, revenue: { select: { projectId: true } } },
      }),
      prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { projectId: { in: allProjectIds } },
        _sum: { totalHoras: true },
      }),
      prisma.timeEntry.groupBy({
        by: ["projectId", "userId"],
        where: { projectId: { in: allProjectIds } },
        _sum: { totalHoras: true },
      }),
      prisma.projectRevenue.findMany({
        where: {
          tenantId,
          projectId: { in: allProjectIds },
          status: { not: "CANCELADO" },
        },
        select: {
          projectId: true,
          contractedValue: true,
          expectedRevenue: true,
          taxType: { select: { ratePercent: true } },
          billingLines: { select: { amount: true } },
        },
      }),
      prisma.financialEntry.groupBy({
        by: ["projectId"],
        where: {
          tenantId,
          projectId: { in: allProjectIds },
          type: "DESPESA",
          status: "LANCADO",
        },
        _sum: { amountCents: true },
      }),
      prisma.reimbursement.groupBy({
        by: ["projectId"],
        where: {
          tenantId,
          projectId: { in: allProjectIds },
          status: "PAID",
        },
        _sum: { amountCents: true },
      }),
    ]);

  const userIds = [...new Set(timeByUserProject.map((r) => r.userId))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, hourlyRate: true },
        })
      : [];
  const rateByUser = new Map(users.map((u) => [u.id, u.hourlyRate]));

  const horasPrevistasByRoot = new Map<string, number>();
  for (const line of costLines) {
    const rootId = projectToRoot.get(line.revenue.projectId);
    if (!rootId) continue;
    horasPrevistasByRoot.set(rootId, (horasPrevistasByRoot.get(rootId) ?? 0) + (line.hours ?? 0));
  }

  const horasRealizadasByRoot = new Map<string, number>();
  for (const row of timeByProject) {
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    horasRealizadasByRoot.set(
      rootId,
      (horasRealizadasByRoot.get(rootId) ?? 0) + (row._sum.totalHoras ?? 0),
    );
  }

  const custoByRoot = new Map<string, { total: number; missingRate: boolean; hasHours: boolean }>();
  for (const row of timeByUserProject) {
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    const hours = row._sum.totalHoras ?? 0;
    if (hours <= 0) continue;
    const current = custoByRoot.get(rootId) ?? { total: 0, missingRate: false, hasHours: false };
    current.hasHours = true;
    const rate = rateByUser.get(row.userId);
    if (rate != null && rate > 0) {
      current.total += hours * rate;
    } else {
      current.missingRate = true;
    }
    custoByRoot.set(rootId, current);
  }

  const receitaByRoot = new Map<string, number>();
  const impostosByRoot = new Map<string, number>();
  for (const rev of revenues) {
    const rootId = projectToRoot.get(rev.projectId);
    if (!rootId) continue;
    const expected = rev.expectedRevenue ?? 0;
    const contracted = rev.contractedValue ?? 0;
    const billingSum = rev.billingLines.reduce((s, l) => s + (l.amount ?? 0), 0);
    const receita = expected > 0 ? expected : contracted > 0 ? contracted : billingSum;
    receitaByRoot.set(rootId, (receitaByRoot.get(rootId) ?? 0) + receita);

    const rate = rev.taxType?.ratePercent;
    if (rate != null && rate > 0 && receita > 0) {
      impostosByRoot.set(rootId, (impostosByRoot.get(rootId) ?? 0) + receita * (rate / 100));
    }
  }

  const despesaByRoot = new Map<string, number>();
  for (const row of expenseEntries) {
    if (!row.projectId) continue;
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    despesaByRoot.set(rootId, (despesaByRoot.get(rootId) ?? 0) + (row._sum.amountCents ?? 0) / 100);
  }
  for (const row of reimbursements) {
    if (!row.projectId) continue;
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    despesaByRoot.set(rootId, (despesaByRoot.get(rootId) ?? 0) + (row._sum.amountCents ?? 0) / 100);
  }

  return rootProjects.map((project) => {
    const fromCostLines = horasPrevistasByRoot.get(project.id);
    const horasPrevistas =
      fromCostLines != null && fromCostLines > 0
        ? round2(fromCostLines)
        : (project.totalHorasPlanejadas ?? project.limiteHorasEscopo ?? null);

    const horasRealizadas = round2(horasRealizadasByRoot.get(project.id) ?? 0);

    const receitaFromRevenues = receitaByRoot.get(project.id) ?? 0;
    const receitaPrevista = round2(
      receitaFromRevenues > 0 ? receitaFromRevenues : (project.valorContrato ?? 0),
    );

    const custoInfo = custoByRoot.get(project.id);
    const custoOperacional =
      !custoInfo || !custoInfo.hasHours
        ? null
        : custoInfo.missingRate && custoInfo.total <= 0
          ? null
          : round2(custoInfo.total);

    const despesaOperacional = round2(despesaByRoot.get(project.id) ?? 0);
    const impostos = round2(impostosByRoot.get(project.id) ?? 0);
    const custoVal = custoOperacional ?? 0;
    const consumido = custoVal + despesaOperacional;
    const receitaConsumidaPercentual =
      receitaPrevista > 0 ? round2((consumido / receitaPrevista) * 100) : null;
    const margemReais = round2(receitaPrevista - custoVal - despesaOperacional - impostos);
    const margemPercentual =
      receitaPrevista > 0 ? round2((margemReais / receitaPrevista) * 100) : null;

    return {
      projectId: project.id,
      projectName: project.name,
      clientId: project.client.id,
      clientName: project.client.name,
      horasPrevistas,
      horasRealizadas,
      receitaPrevista,
      receitaConsumidaPercentual,
      custoOperacional,
      despesaOperacional,
      impostos,
      margemReais,
      margemPercentual,
    };
  });
}
