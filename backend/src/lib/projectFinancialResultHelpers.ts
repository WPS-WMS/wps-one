import type { Prisma } from "@prisma/client";
import { activeTimeEntryWhere } from "./activeTimeEntryWhere.js";
import { prisma } from "./prisma.js";
import { buildHourlyRateResolver } from "./userHourlyRateHistory.js";

export type ProjectFinancialOverviewRow = {
  projectId: string;
  projectName: string;
  arquivado: boolean;
  clientId: string;
  clientName: string;
  receitaContratada: number;
  receitaPrevista: number;
  receitaRealizada: number;
  custoTotal: number;
  lucroBruto: number;
  margemPercentual: number | null;
  parcelasReceita: number | null;
  quantidadeReceitas: number;
};

export type ProjectFinancialResult = {
  projectId: string;
  projectName: string;
  horasPrevistas: number | null;
  horasRealizadas: number;
  receitaContratada: number;
  receitaPrevista: number;
  receitaRealizada: number;
  receitaFaturada: number;
  receitaRecebida: number;
  receitaConsumida: number;
  custoHorasInternas: number | null;
  custoReembolsos: number;
  custoDespesasDiretas: number;
  custoParceiros: number;
  custoTotal: number;
  lucroBruto: number;
  margemPercentual: number | null;
  resultadoAcumulado: number;
  consumoHorasPercentual: number | null;
  consumoReceitaPercentual: number | null;
  notas: string[];
};

export async function computeProjectFinancialResult(
  tenantId: string,
  projectId: string,
): Promise<ProjectFinancialResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId } },
    select: {
      id: true,
      name: true,
      totalHorasPlanejadas: true,
      limiteHorasEscopo: true,
      valorContrato: true,
    },
  });
  if (!project) return null;

  const childIds = await prisma.project.findMany({
    where: { parentProjectId: projectId, client: { tenantId } },
    select: { id: true },
  });
  const projectIds = [projectId, ...childIds.map((c) => c.id)];

  const hoursAgg = await prisma.timeEntry.aggregate({
    where: activeTimeEntryWhere({ projectId: { in: projectIds } }),
    _sum: { totalHoras: true },
  });
  const horasRealizadas = hoursAgg._sum.totalHoras ?? 0;

  const costHoursAgg = await prisma.projectRevenueCostLine.aggregate({
    where: {
      isDiscount: false,
      revenue: {
        tenantId,
        projectId: { in: projectIds },
        status: { not: "CANCELADO" },
      },
    },
    _sum: { hours: true },
  });
  const horasFromFinanceiro = costHoursAgg._sum.hours ?? 0;
  const horasPrevistas =
    horasFromFinanceiro > 0
      ? Math.round(horasFromFinanceiro * 10) / 10
      : (project.totalHorasPlanejadas ?? project.limiteHorasEscopo ?? null);

  const timeEntriesByUser = await prisma.timeEntry.groupBy({
    by: ["userId", "date"],
    where: activeTimeEntryWhere({ projectId: { in: projectIds } }),
    _sum: { totalHoras: true },
  });
  const resolveHourlyRate = await buildHourlyRateResolver(
    timeEntriesByUser.map((row) => row.userId),
  );

  const revenues = await prisma.projectRevenue.findMany({
    where: {
      tenantId,
      projectId: { in: projectIds },
      status: { not: "CANCELADO" },
    },
    select: {
      contractedValue: true,
      expectedRevenue: true,
      realizedRevenue: true,
    },
  });

  const receitaContratada = revenues.reduce((s, r) => s + (r.contractedValue ?? 0), 0);
  const receitaPrevista = revenues.reduce((s, r) => s + (r.expectedRevenue ?? 0), 0);
  const receitaRealizada = revenues.reduce((s, r) => s + (r.realizedRevenue ?? 0), 0);

  const entries = await prisma.financialEntry.groupBy({
    by: ["type"],
    where: {
      tenantId,
      projectId: { in: projectIds },
      status: "LANCADO",
    },
    _sum: { amountCents: true },
  });

  let receitaFaturada = 0;
  let receitaRecebida = receitaRealizada;
  let custoDespesasDiretas = 0;
  let custoParceiros = 0;

  for (const row of entries) {
    const val = (row._sum.amountCents ?? 0) / 100;
    if (row.type === "RECEITA") {
      receitaFaturada += val;
      receitaRecebida = Math.max(receitaRecebida, val);
    } else if (row.type === "DESPESA") {
      custoDespesasDiretas += val;
    }
  }

  const reimbursementsAgg = await prisma.reimbursement.aggregate({
    where: {
      tenantId,
      projectId: { in: projectIds },
      status: "PAID",
    },
    _sum: { amountCents: true },
  });
  const custoReembolsos = (reimbursementsAgg._sum.amountCents ?? 0) / 100;

  const receitaConsumida =
    receitaPrevista > 0 && horasPrevistas && horasPrevistas > 0
      ? (horasRealizadas / horasPrevistas) * receitaPrevista
      : receitaRealizada;

  const notas: string[] = [];
  let custoHorasInternas = 0;
  // Sem taxa vigente na data do apontamento (usuário sem cadastro ou período anterior à 1ª vigência).
  const usersWithRate = new Set<string>();
  const usersWithoutRate = new Set<string>();
  for (const row of timeEntriesByUser) {
    const hours = row._sum.totalHoras ?? 0;
    const rate = resolveHourlyRate(row.userId, row.date);
    if (rate != null && rate > 0) {
      custoHorasInternas += hours * rate;
      usersWithRate.add(row.userId);
    } else {
      usersWithoutRate.add(row.userId);
    }
  }
  const usersWithoutHourlyRate = usersWithoutRate.size;
  custoHorasInternas = Math.round(custoHorasInternas * 100) / 100;
  const custoHorasInternasValue =
    timeEntriesByUser.length === 0 ? null : usersWithRate.size === 0 ? null : custoHorasInternas;
  if (timeEntriesByUser.length > 0 && usersWithoutHourlyRate > 0) {
    notas.push(
      usersWithRate.size === 0
        ? "Custo de horas internas não calculado: cadastre a taxa hora em Configurações > Usuários."
        : `${usersWithoutHourlyRate} usuário(s) sem taxa hora vigente no período; custo de horas internas parcial.`,
    );
  }

  const custoTotal =
    (custoHorasInternasValue ?? 0) + custoReembolsos + custoDespesasDiretas + custoParceiros;
  const lucroBruto = receitaRealizada - custoTotal;
  const margemPercentual =
    receitaRealizada > 0 ? Math.round((lucroBruto / receitaRealizada) * 10000) / 100 : null;
  const resultadoAcumulado = lucroBruto;

  const consumoHorasPercentual =
    horasPrevistas && horasPrevistas > 0
      ? Math.round((horasRealizadas / horasPrevistas) * 10000) / 100
      : null;
  const consumoReceitaPercentual =
    receitaPrevista > 0
      ? Math.round((receitaConsumida / receitaPrevista) * 10000) / 100
      : null;

  const contractedTotal =
    receitaContratada > 0 ? receitaContratada : (project.valorContrato ?? 0);

  return {
    projectId: project.id,
    projectName: project.name,
    horasPrevistas,
    horasRealizadas,
    receitaContratada: contractedTotal,
    receitaPrevista,
    receitaRealizada,
    receitaFaturada: receitaFaturada > 0 ? receitaFaturada : receitaRealizada,
    receitaRecebida,
    receitaConsumida,
    custoHorasInternas: custoHorasInternasValue,
    custoReembolsos,
    custoDespesasDiretas,
    custoParceiros,
    custoTotal,
    lucroBruto,
    margemPercentual,
    resultadoAcumulado,
    consumoHorasPercentual,
    consumoReceitaPercentual,
    notas,
  };
}

export async function listProjectsFinancialOverview(
  tenantId: string,
  visibility: Prisma.ProjectWhereInput,
): Promise<ProjectFinancialOverviewRow[]> {
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

  const [revenues, entries, reimbursements, timeByUserProject] = await Promise.all([
    prisma.projectRevenue.findMany({
      where: {
        tenantId,
        projectId: { in: allProjectIds },
        status: { not: "CANCELADO" },
      },
      select: {
        projectId: true,
        installmentCount: true,
        expectedRevenue: true,
        contractedValue: true,
        realizedRevenue: true,
      },
    }),
    prisma.financialEntry.groupBy({
      by: ["projectId", "type"],
      where: {
        tenantId,
        projectId: { in: allProjectIds },
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
    prisma.timeEntry.groupBy({
      by: ["projectId", "userId", "date"],
      where: activeTimeEntryWhere({ projectId: { in: allProjectIds } }),
      _sum: { totalHoras: true },
    }),
  ]);

  const resolveHourlyRate = await buildHourlyRateResolver(
    timeByUserProject.map((r) => r.userId),
  );

  const installmentByRoot = new Map<string, number[]>();
  const revenueCountByRoot = new Map<string, number>();
  const receitaContratadaByRoot = new Map<string, number>();
  const receitaPrevistaByRoot = new Map<string, number>();
  const receitaRealizadaByRoot = new Map<string, number>();

  for (const rev of revenues) {
    const rootId = projectToRoot.get(rev.projectId);
    if (!rootId) continue;
    revenueCountByRoot.set(rootId, (revenueCountByRoot.get(rootId) ?? 0) + 1);
    if (rev.installmentCount != null && rev.installmentCount > 0) {
      const list = installmentByRoot.get(rootId) ?? [];
      list.push(rev.installmentCount);
      installmentByRoot.set(rootId, list);
    }
    receitaContratadaByRoot.set(
      rootId,
      (receitaContratadaByRoot.get(rootId) ?? 0) + (rev.contractedValue ?? 0),
    );
    receitaPrevistaByRoot.set(
      rootId,
      (receitaPrevistaByRoot.get(rootId) ?? 0) + (rev.expectedRevenue ?? 0),
    );
    receitaRealizadaByRoot.set(
      rootId,
      (receitaRealizadaByRoot.get(rootId) ?? 0) + (rev.realizedRevenue ?? 0),
    );
  }

  const despesaByRoot = new Map<string, number>();
  for (const row of entries) {
    if (!row.projectId || row.type !== "DESPESA") continue;
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    despesaByRoot.set(rootId, (despesaByRoot.get(rootId) ?? 0) + (row._sum.amountCents ?? 0) / 100);
  }

  const reembolsoByRoot = new Map<string, number>();
  for (const row of reimbursements) {
    if (!row.projectId) continue;
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    reembolsoByRoot.set(
      rootId,
      (reembolsoByRoot.get(rootId) ?? 0) + (row._sum.amountCents ?? 0) / 100,
    );
  }

  const custoHorasByRoot = new Map<string, number>();
  for (const row of timeByUserProject) {
    const rootId = projectToRoot.get(row.projectId);
    if (!rootId) continue;
    const hours = row._sum.totalHoras ?? 0;
    const rate = resolveHourlyRate(row.userId, row.date);
    if (rate != null && rate > 0 && hours > 0) {
      custoHorasByRoot.set(rootId, (custoHorasByRoot.get(rootId) ?? 0) + hours * rate);
    }
  }

  return rootProjects.map((project) => {
    const receitaFromRevenues = receitaContratadaByRoot.get(project.id) ?? 0;
    const receitaContratada =
      receitaFromRevenues > 0 ? receitaFromRevenues : (project.valorContrato ?? 0);
    const receitaPrevista = receitaPrevistaByRoot.get(project.id) ?? 0;
    const receitaRealizada = receitaRealizadaByRoot.get(project.id) ?? 0;
    const custoHoras = Math.round((custoHorasByRoot.get(project.id) ?? 0) * 100) / 100;
    const custoTotal =
      custoHoras + (reembolsoByRoot.get(project.id) ?? 0) + (despesaByRoot.get(project.id) ?? 0);
    const lucroBruto = receitaRealizada - custoTotal;
    const margemPercentual =
      receitaRealizada > 0 ? Math.round((lucroBruto / receitaRealizada) * 10000) / 100 : null;
    const installments = installmentByRoot.get(project.id) ?? [];
    const parcelasReceita = installments.length === 0 ? null : Math.max(...installments);

    return {
      projectId: project.id,
      projectName: project.name,
      arquivado: project.arquivado,
      clientId: project.client.id,
      clientName: project.client.name,
      receitaContratada,
      receitaPrevista,
      receitaRealizada,
      custoTotal,
      lucroBruto,
      margemPercentual,
      parcelasReceita,
      quantidadeReceitas: revenueCountByRoot.get(project.id) ?? 0,
    };
  });
}
