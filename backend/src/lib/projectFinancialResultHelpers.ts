import { prisma } from "./prisma.js";

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
    where: { projectId: { in: projectIds } },
    _sum: { totalHoras: true },
  });
  const horasRealizadas = hoursAgg._sum.totalHoras ?? 0;
  const horasPrevistas =
    project.totalHorasPlanejadas ?? project.limiteHorasEscopo ?? null;

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
  const custoHorasInternas: number | null = null;
  if (custoHorasInternas == null) {
    notas.push(
      "Custo de horas internas não calculado: cadastre valor/hora do profissional em versão futura.",
    );
  }

  const custoTotal =
    (custoHorasInternas ?? 0) + custoReembolsos + custoDespesasDiretas + custoParceiros;
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
    custoHorasInternas,
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
