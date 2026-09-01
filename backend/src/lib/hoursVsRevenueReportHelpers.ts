import type { Prisma } from "@prisma/client";
import { activeTimeEntryWhere } from "./activeTimeEntryWhere.js";
import { prisma } from "./prisma.js";
import type { ReportPeriod } from "./financialReportHelpers.js";
import { buildHourlyRateResolver } from "./userHourlyRateHistory.js";

export type HoursVsRevenueRow = {
  projectId: string;
  projectName: string;
  arquivado: boolean;
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
   * (custo operacional + despesa operacional + despesas de projeto) / receita prevista.
   */
  receitaConsumidaPercentual: number | null;
  /** Custo dos apontamentos (horas × taxa hora). */
  custoOperacional: number | null;
  /** Despesas da empresa no projeto, sem reembolso. */
  despesaOperacional: number;
  /** Despesas reembolsáveis pelo cliente (reembolsos pagos). */
  despesasProjeto: number;
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
  period?: ReportPeriod,
): Promise<HoursVsRevenueRow[]> {
  const dateFilter = period ? { gte: period.start, lte: period.end } : undefined;
  const rootProjects = await prisma.project.findMany({
    where: {
      ...visibility,
      parentProjectId: null,
    },
    select: {
      id: true,
      name: true,
      arquivado: true,
      valorContrato: true,
      totalHorasPlanejadas: true,
      limiteHorasEscopo: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: [{ arquivado: "asc" }, { name: "asc" }],
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
        where: activeTimeEntryWhere({
          projectId: { in: allProjectIds },
          ...(dateFilter ? { date: dateFilter } : {}),
        }),
        _sum: { totalHoras: true },
      }),
      prisma.timeEntry.groupBy({
        by: ["projectId", "userId", "date"],
        where: activeTimeEntryWhere({
          projectId: { in: allProjectIds },
          ...(dateFilter ? { date: dateFilter } : {}),
        }),
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
      prisma.financialEntry.findMany({
        where: {
          tenantId,
          projectId: { in: allProjectIds },
          type: "DESPESA",
          status: "LANCADO",
          ...(dateFilter ? { entryDate: dateFilter } : {}),
        },
        select: {
          projectId: true,
          amountCents: true,
          payableInstallment: {
            select: {
              payable: { select: { kind: true, reimbursementId: true } },
            },
          },
        },
      }),
      prisma.reimbursement.groupBy({
        by: ["projectId"],
        where: {
          tenantId,
          projectId: { in: allProjectIds },
          status: "PAID",
          ...(dateFilter
            ? {
                OR: [
                  { paidAt: dateFilter },
                  { paidAt: null, expenseDate: dateFilter },
                ],
              }
            : {}),
        },
        _sum: { amountCents: true },
      }),
    ]);

  const resolveHourlyRate = await buildHourlyRateResolver(timeByUserProject.map((r) => r.userId));

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
    const rate = resolveHourlyRate(row.userId, row.date);
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

  /** Despesas reembolsáveis pelo cliente (reembolsos pagos). */
  const despesasProjetoByRoot = new Map<string, number>();
  for (const row of reimbursements) {
    if (!row.projectId) continue;
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    despesasProjetoByRoot.set(
      rootId,
      (despesasProjetoByRoot.get(rootId) ?? 0) + (row._sum.amountCents ?? 0) / 100,
    );
  }

  /** Despesa operacional (custos da empresa, sem reembolso): lançamentos DESPESA sem vínculo de reembolso. */
  const despesaOperacionalByRoot = new Map<string, number>();
  for (const entry of expenseEntries) {
    if (!entry.projectId) continue;
    const payable = entry.payableInstallment?.payable;
    const isReimbursementLinked =
      payable != null && (payable.kind === "REEMBOLSO" || Boolean(payable.reimbursementId));
    if (isReimbursementLinked) continue;
    const rootId = projectToRoot.get(entry.projectId);
    if (!rootId) continue;
    despesaOperacionalByRoot.set(
      rootId,
      (despesaOperacionalByRoot.get(rootId) ?? 0) + entry.amountCents / 100,
    );
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

    const despesaOperacional = round2(despesaOperacionalByRoot.get(project.id) ?? 0);
    const despesasProjeto = round2(despesasProjetoByRoot.get(project.id) ?? 0);
    const impostos = round2(impostosByRoot.get(project.id) ?? 0);
    const custoVal = custoOperacional ?? 0;
    const consumido = custoVal + despesaOperacional + despesasProjeto;
    const receitaConsumidaPercentual =
      receitaPrevista > 0 ? round2((consumido / receitaPrevista) * 100) : null;
    const margemReais = round2(receitaPrevista - custoVal - despesaOperacional - despesasProjeto - impostos);
    const margemPercentual =
      receitaPrevista > 0 ? round2((margemReais / receitaPrevista) * 100) : null;

    return {
      projectId: project.id,
      projectName: project.name,
      arquivado: project.arquivado,
      clientId: project.client.id,
      clientName: project.client.name,
      horasPrevistas,
      horasRealizadas,
      receitaPrevista,
      receitaConsumidaPercentual,
      custoOperacional,
      despesaOperacional,
      despesasProjeto,
      impostos,
      margemReais,
      margemPercentual,
    };
  });
}
