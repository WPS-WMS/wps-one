import { prisma } from "./prisma.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";
import { computeAgingSummary } from "./receivableService.js";

export type ReportPeriod = { start: Date; end: Date };

export function parseReportPeriod(startRaw?: string, endRaw?: string): ReportPeriod {
  const now = new Date();
  const start = startRaw
    ? new Date(`${String(startRaw).trim()}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = endRaw
    ? new Date(`${String(endRaw).trim()}T23:59:59.999Z`)
    : new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      );
  return { start, end };
}

function entryDateWhere(period: ReportPeriod) {
  return { gte: period.start, lte: period.end };
}

export async function sumEntriesByType(
  tenantId: string,
  period: ReportPeriod,
): Promise<{ receitaCents: number; despesaCents: number }> {
  const grouped = await prisma.financialEntry.groupBy({
    by: ["type"],
    where: { tenantId, status: "LANCADO", entryDate: entryDateWhere(period) },
    _sum: { amountCents: true },
  });
  let receitaCents = 0;
  let despesaCents = 0;
  for (const row of grouped) {
    const cents = row._sum.amountCents ?? 0;
    if (row.type === "RECEITA") receitaCents += cents;
    else if (row.type === "DESPESA") despesaCents += cents;
  }
  return { receitaCents, despesaCents };
}

export async function computeExecutiveSummary(tenantId: string, period: ReportPeriod) {
  const prevMonthEnd = new Date(period.start);
  prevMonthEnd.setUTCDate(0);
  const prevMonthStart = new Date(Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1));

  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + 90);

  const [current, prev, recurringAgg, activeRules, aging, recvOpen, payOpen] = await Promise.all([
    sumEntriesByType(tenantId, period),
    sumEntriesByType(tenantId, { start: prevMonthStart, end: prevMonthEnd }),
    prisma.receivable.aggregate({
      where: {
        tenantId,
        kind: "RECORRENTE",
        status: { not: "CANCELADO" },
        competenceDate: entryDateWhere(period),
      },
      _sum: { totalAmountCents: true },
    }),
    prisma.receivableRecurrenceRule.aggregate({
      where: { tenantId, isActive: true },
      _sum: { amountCents: true },
    }),
    computeAgingSummary(tenantId),
    prisma.receivableInstallment.aggregate({
      where: {
        status: { in: ["PREVISTO", "FATURADO", "ATRASADO"] },
        dueDate: { gte: now, lte: horizon },
        receivable: { tenantId, status: { not: "CANCELADO" } },
      },
      _sum: { amountCents: true },
    }),
    prisma.payableInstallment.aggregate({
      where: {
        status: { in: ["ABERTO", "VENCIDO"] },
        dueDate: { gte: now, lte: horizon },
        payable: { tenantId, status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] } },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const { receitaCents, despesaCents } = current;
  const resultadoLiquidoCents = receitaCents - despesaCents;
  const receitaRecorrenteCents =
    (recurringAgg._sum.totalAmountCents ?? 0) > 0
      ? (recurringAgg._sum.totalAmountCents ?? 0)
      : (activeRules._sum.amountCents ?? 0);
  const fluxoPrevistoCents =
    (recvOpen._sum.amountCents ?? 0) - (payOpen._sum.amountCents ?? 0);

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    receitaMensalCents: receitaCents,
    despesaMensalCents: despesaCents,
    resultadoLiquidoCents,
    ebitdaEstimadoCents: resultadoLiquidoCents,
    receitaRecorrenteCents,
    inadimplenciaCents: aging.overdueTotalCents,
    inadimplenciaCount: aging.overdueCount,
    fluxoPrevistoCents,
    comparativoMesAnterior: {
      receitaCents: prev.receitaCents,
      despesaCents: prev.despesaCents,
      resultadoCents: prev.receitaCents - prev.despesaCents,
    },
    notas: [
      "EBITDA estimado igual ao resultado líquido (sem depreciação/amortização cadastrada).",
      "Receita recorrente: contas RECORRENTE no período ou soma das regras ativas.",
      "Fluxo previsto: parcelas a receber menos a pagar (próximos 90 dias).",
    ],
    formatted: {
      receitaMensal: formatCentsToBrl(receitaCents),
      despesaMensal: formatCentsToBrl(despesaCents),
      resultadoLiquido: formatCentsToBrl(resultadoLiquidoCents),
      ebitdaEstimado: formatCentsToBrl(resultadoLiquidoCents),
      receitaRecorrente: formatCentsToBrl(receitaRecorrenteCents),
      inadimplencia: formatCentsToBrl(aging.overdueTotalCents),
      fluxoPrevisto: formatCentsToBrl(fluxoPrevistoCents),
    },
  };
}

export async function computeGerencialDre(tenantId: string, period: ReportPeriod) {
  const { receitaCents, despesaCents } = await sumEntriesByType(tenantId, period);

  const taxAgg = await prisma.receivableInvoice.aggregate({
    where: {
      emissionDate: entryDateWhere(period),
      receivable: { tenantId },
    },
    _sum: { taxAmountCents: true, grossAmountCents: true, netAmountCents: true },
  });

  const impostosCents = taxAgg._sum.taxAmountCents ?? 0;
  const faturamentoBrutoCents = taxAgg._sum.grossAmountCents ?? 0;
  const receitaBrutaCents = Math.max(receitaCents, faturamentoBrutoCents);
  const receitaLiquidaCents = receitaBrutaCents - impostosCents;
  const custosOperacionaisCents = despesaCents;
  const margemOperacionalCents = receitaLiquidaCents - custosOperacionaisCents;

  const lines = [
    { key: "receitaBruta", label: "Receita bruta", cents: receitaBrutaCents },
    { key: "impostos", label: "Impostos", cents: -impostosCents },
    { key: "receitaLiquida", label: "Receita líquida", cents: receitaLiquidaCents, highlight: true },
    { key: "custosOperacionais", label: "Custos operacionais", cents: -custosOperacionaisCents },
    { key: "margemOperacional", label: "Margem operacional", cents: margemOperacionalCents, highlight: true },
    { key: "ebitda", label: "EBITDA", cents: margemOperacionalCents, highlight: true },
  ];

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    lines: lines.map((l) => ({
      ...l,
      formatted: formatCentsToBrl(Math.abs(l.cents)),
      signedFormatted: `${l.cents < 0 ? "−" : ""}${formatCentsToBrl(Math.abs(l.cents))}`,
    })),
    notas: ["EBITDA = margem operacional (sem depreciação/amortização)."],
  };
}

type CashFlowBucket = {
  key: string;
  label: string;
  realizadoReceitaCents: number;
  realizadoDespesaCents: number;
  previstoReceitaCents: number;
  previstoDespesaCents: number;
  saldoRealizadoCents: number;
  saldoPrevistoCents: number;
};

function bucketKey(date: Date, granularity: "DAY" | "WEEK" | "MONTH"): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (granularity === "DAY") return `${y}-${m}-${d}`;
  if (granularity === "MONTH") return `${y}-${m}`;
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return weekStart.toISOString().slice(0, 10);
}

function initBuckets(period: ReportPeriod, granularity: "DAY" | "WEEK" | "MONTH"): Map<string, CashFlowBucket> {
  const map = new Map<string, CashFlowBucket>();
  const cur = new Date(period.start);
  while (cur <= period.end) {
    const key = bucketKey(cur, granularity);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: key,
        realizadoReceitaCents: 0,
        realizadoDespesaCents: 0,
        previstoReceitaCents: 0,
        previstoDespesaCents: 0,
        saldoRealizadoCents: 0,
        saldoPrevistoCents: 0,
      });
    }
    if (granularity === "DAY") cur.setUTCDate(cur.getUTCDate() + 1);
    else if (granularity === "WEEK") cur.setUTCDate(cur.getUTCDate() + 7);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return map;
}

export async function computeCashFlow(
  tenantId: string,
  period: ReportPeriod,
  granularity: "DAY" | "WEEK" | "MONTH" = "MONTH",
) {
  const buckets = initBuckets(period, granularity);

  const entries = await prisma.financialEntry.findMany({
    where: { tenantId, status: "LANCADO", entryDate: entryDateWhere(period) },
    select: { type: true, amountCents: true, entryDate: true },
  });
  for (const e of entries) {
    const key = bucketKey(e.entryDate, granularity);
    const b = buckets.get(key);
    if (!b) continue;
    if (e.type === "RECEITA") b.realizadoReceitaCents += e.amountCents;
    else b.realizadoDespesaCents += e.amountCents;
  }

  const [recvInst, payInst] = await Promise.all([
    prisma.receivableInstallment.findMany({
      where: {
        dueDate: entryDateWhere(period),
        status: { in: ["PREVISTO", "FATURADO", "ATRASADO"] },
        receivable: { tenantId, status: { not: "CANCELADO" } },
      },
      select: { amountCents: true, dueDate: true },
    }),
    prisma.payableInstallment.findMany({
      where: {
        dueDate: entryDateWhere(period),
        status: { in: ["ABERTO", "VENCIDO"] },
        payable: { tenantId, status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] } },
      },
      select: { amountCents: true, dueDate: true },
    }),
  ]);

  for (const i of recvInst) {
    const key = bucketKey(i.dueDate, granularity);
    const b = buckets.get(key);
    if (b) b.previstoReceitaCents += i.amountCents;
  }
  for (const i of payInst) {
    const key = bucketKey(i.dueDate, granularity);
    const b = buckets.get(key);
    if (b) b.previstoDespesaCents += i.amountCents;
  }

  let accReal = 0;
  let accPrev = 0;
  const rows = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => {
      const saldoReal = b.realizadoReceitaCents - b.realizadoDespesaCents;
      const saldoPrev =
        b.realizadoReceitaCents +
        b.previstoReceitaCents -
        b.realizadoDespesaCents -
        b.previstoDespesaCents;
      accReal += saldoReal;
      accPrev += saldoPrev;
      return {
        ...b,
        saldoRealizadoCents: saldoReal,
        saldoPrevistoCents: saldoPrev,
        acumuladoRealizadoCents: accReal,
        acumuladoPrevistoCents: accPrev,
      };
    });

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    granularity,
    rows,
    totais: {
      realizadoReceitaCents: rows.reduce((s, r) => s + r.realizadoReceitaCents, 0),
      realizadoDespesaCents: rows.reduce((s, r) => s + r.realizadoDespesaCents, 0),
      previstoReceitaCents: rows.reduce((s, r) => s + r.previstoReceitaCents, 0),
      previstoDespesaCents: rows.reduce((s, r) => s + r.previstoDespesaCents, 0),
    },
  };
}

export async function computeInOutReport(tenantId: string, period: ReportPeriod) {
  const { receitaCents, despesaCents } = await sumEntriesByType(tenantId, period);
  return {
    receitaCents,
    despesaCents,
    saldoCents: receitaCents - despesaCents,
    receitaFormatted: formatCentsToBrl(receitaCents),
    despesaFormatted: formatCentsToBrl(despesaCents),
    saldoFormatted: formatCentsToBrl(receitaCents - despesaCents),
  };
}

async function groupEntriesByProject(tenantId: string, period: ReportPeriod) {
  const grouped = await prisma.financialEntry.groupBy({
    by: ["projectId", "type"],
    where: {
      tenantId,
      status: "LANCADO",
      entryDate: entryDateWhere(period),
      projectId: { not: null },
    },
    _sum: { amountCents: true },
  });

  const projectIds = [...new Set(grouped.map((g) => g.projectId!).filter(Boolean))];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, client: { tenantId } },
    select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));

  const byProject = new Map<string, { receitaCents: number; despesaCents: number }>();
  for (const g of grouped) {
    if (!g.projectId) continue;
    const cur = byProject.get(g.projectId) ?? { receitaCents: 0, despesaCents: 0 };
    const cents = g._sum.amountCents ?? 0;
    if (g.type === "RECEITA") cur.receitaCents += cents;
    else cur.despesaCents += cents;
    byProject.set(g.projectId, cur);
  }

  return { byProject, byId };
}

export async function computeResultByProject(tenantId: string, period: ReportPeriod) {
  const { byProject, byId } = await groupEntriesByProject(tenantId, period);
  return mapResultByProjectRows(byProject, byId);
}

function mapResultByProjectRows(
  byProject: Map<string, { receitaCents: number; despesaCents: number }>,
  byId: Map<string, { id: string; name: string; clientId: string; client: { id: string; name: string } }>,
) {
  return [...byProject.entries()]
    .map(([projectId, vals]) => {
      const p = byId.get(projectId);
      const saldo = vals.receitaCents - vals.despesaCents;
      return {
        projectId,
        projectName: p?.name ?? "—",
        clientName: p?.client.name ?? "—",
        receitaCents: vals.receitaCents,
        despesaCents: vals.despesaCents,
        resultadoCents: saldo,
        receitaFormatted: formatCentsToBrl(vals.receitaCents),
        despesaFormatted: formatCentsToBrl(vals.despesaCents),
        resultadoFormatted: formatCentsToBrl(saldo),
      };
    })
    .sort((a, b) => b.resultadoCents - a.resultadoCents);
}

export async function computeResultByClient(tenantId: string, period: ReportPeriod) {
  const { byProject, byId } = await groupEntriesByProject(tenantId, period);
  return mapResultByClientRows(byProject, byId);
}

function mapResultByClientRows(
  byProject: Map<string, { receitaCents: number; despesaCents: number }>,
  byId: Map<string, { id: string; name: string; clientId: string; client: { id: string; name: string } }>,
) {
  const byClient = new Map<
    string,
    { clientId: string; clientName: string; receitaCents: number; despesaCents: number }
  >();

  for (const [projectId, vals] of byProject) {
    const p = byId.get(projectId);
    if (!p) continue;
    const cur = byClient.get(p.clientId) ?? {
      clientId: p.clientId,
      clientName: p.client.name,
      receitaCents: 0,
      despesaCents: 0,
    };
    cur.receitaCents += vals.receitaCents;
    cur.despesaCents += vals.despesaCents;
    byClient.set(p.clientId, cur);
  }

  return [...byClient.values()]
    .map((c) => {
      const saldo = c.receitaCents - c.despesaCents;
      return {
        clientId: c.clientId,
        clientName: c.clientName,
        receitaCents: c.receitaCents,
        despesaCents: c.despesaCents,
        resultadoCents: saldo,
        receitaFormatted: formatCentsToBrl(c.receitaCents),
        despesaFormatted: formatCentsToBrl(c.despesaCents),
        resultadoFormatted: formatCentsToBrl(saldo),
      };
    })
    .sort((a, b) => b.resultadoCents - a.resultadoCents);
}

export async function computeExpensesByCategory(tenantId: string, period: ReportPeriod) {
  const payables = await prisma.payable.groupBy({
    by: ["corporateExpenseTypeId"],
    where: {
      tenantId,
      status: { not: "CANCELADO" },
      competenceDate: entryDateWhere(period),
    },
    _sum: { totalAmountCents: true },
  });

  const typeIds = payables.map((p) => p.corporateExpenseTypeId).filter(Boolean) as string[];
  const types = await prisma.corporateExpenseType.findMany({
    where: { tenantId, id: { in: typeIds } },
    select: { id: true, name: true },
  });
  const typeById = new Map(types.map((t) => [t.id, t.name]));

  const accountGrouped = await prisma.financialEntry.groupBy({
    by: ["financialAccountId"],
    where: {
      tenantId,
      type: "DESPESA",
      status: "LANCADO",
      entryDate: entryDateWhere(period),
    },
    _sum: { amountCents: true },
  });
  const accountIds = accountGrouped.map((g) => g.financialAccountId);
  const accounts = await prisma.financialAccount.findMany({
    where: { tenantId, id: { in: accountIds } },
    select: { id: true, name: true },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows: Array<{ category: string; amountCents: number; source: string }> = [];

  for (const p of payables) {
    if (!p.corporateExpenseTypeId) continue;
    rows.push({
      category: typeById.get(p.corporateExpenseTypeId) ?? "Outro",
      amountCents: p._sum.totalAmountCents ?? 0,
      source: "DESPESA_CORPORATIVA",
    });
  }

  for (const g of accountGrouped) {
    rows.push({
      category: accountById.get(g.financialAccountId) ?? "Conta",
      amountCents: g._sum.amountCents ?? 0,
      source: "LANCAMENTO",
    });
  }

  const merged = new Map<string, number>();
  for (const r of rows) {
    merged.set(r.category, (merged.get(r.category) ?? 0) + r.amountCents);
  }

  return [...merged.entries()]
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      formatted: formatCentsToBrl(amountCents),
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function computeRevenueByConsultant(tenantId: string, period: ReportPeriod) {
  const entries = await prisma.financialEntry.findMany({
    where: {
      tenantId,
      type: "RECEITA",
      status: "LANCADO",
      entryDate: entryDateWhere(period),
      projectId: { not: null },
    },
    select: { projectId: true, amountCents: true },
  });

  if (entries.length === 0) return [];

  const projectIds = [...new Set(entries.map((e) => e.projectId!))];
  const hours = await prisma.timeEntry.groupBy({
    by: ["projectId", "userId"],
    where: {
      projectId: { in: projectIds },
      date: entryDateWhere(period),
      project: { client: { tenantId } },
    },
    _sum: { totalHoras: true },
  });

  const topUserByProject = new Map<string, string>();
  const hoursByProjectUser = new Map<string, number>();
  for (const h of hours) {
    const key = `${h.projectId}:${h.userId}`;
    hoursByProjectUser.set(key, h._sum.totalHoras ?? 0);
    const currentTop = topUserByProject.get(h.projectId);
    if (!currentTop) {
      topUserByProject.set(h.projectId, h.userId);
      continue;
    }
    const curHours = hoursByProjectUser.get(`${h.projectId}:${currentTop}`) ?? 0;
    const newHours = h._sum.totalHoras ?? 0;
    if (newHours > curHours) topUserByProject.set(h.projectId, h.userId);
  }

  const byUser = new Map<string, number>();
  for (const e of entries) {
    if (!e.projectId) continue;
    const userId = topUserByProject.get(e.projectId);
    if (!userId) continue;
    byUser.set(userId, (byUser.get(userId) ?? 0) + e.amountCents);
  }

  const userIds = [...byUser.keys()];
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return [...byUser.entries()]
    .map(([userId, amountCents]) => ({
      userId,
      userName: userById.get(userId) ?? "—",
      amountCents,
      formatted: formatCentsToBrl(amountCents),
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function computeMarginByProject(tenantId: string, period: ReportPeriod) {
  const rows = await computeResultByProject(tenantId, period);
  return rows.map((r) => {
    const margemPercentual =
      r.receitaCents > 0 ? Math.round((r.resultadoCents / r.receitaCents) * 10000) / 100 : null;
    return {
      ...r,
      margemPercentual,
      margemLabel: margemPercentual != null ? `${margemPercentual.toFixed(1)}%` : "—",
    };
  });
}

export async function computeFullAnalysesReport(tenantId: string, period: ReportPeriod) {
  const [inOut, grouped, byCostCenter, expensesByCategory, revenueByConsultant] = await Promise.all([
    computeInOutReport(tenantId, period),
    groupEntriesByProject(tenantId, period),
    computeCostCenterFromEntries(tenantId, period),
    computeExpensesByCategory(tenantId, period),
    computeRevenueByConsultant(tenantId, period),
  ]);

  const byProject = mapResultByProjectRows(grouped.byProject, grouped.byId);
  const byClient = mapResultByClientRows(grouped.byProject, grouped.byId);
  const marginByProject = byProject.map((r) => {
    const margemPercentual =
      r.receitaCents > 0 ? Math.round((r.resultadoCents / r.receitaCents) * 10000) / 100 : null;
    return {
      ...r,
      margemPercentual,
      margemLabel: margemPercentual != null ? `${margemPercentual.toFixed(1)}%` : "—",
    };
  });

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    inOut,
    byProject,
    byClient,
    byCostCenter,
    expensesByCategory,
    revenueByConsultant,
    marginByProject,
  };
}

async function computeCostCenterFromEntries(tenantId: string, period: ReportPeriod) {
  const grouped = await prisma.financialEntry.groupBy({
    by: ["costCenterId", "type"],
    where: { tenantId, status: "LANCADO", entryDate: entryDateWhere(period) },
    _sum: { amountCents: true },
  });
  const ccIds = [...new Set(grouped.map((g) => g.costCenterId))];
  const costCenters = await prisma.costCenter.findMany({
    where: { tenantId, id: { in: ccIds } },
    select: { id: true, name: true },
  });
  const ccById = new Map(costCenters.map((c) => [c.id, c.name]));

  const byCc = new Map<string, { receitaCents: number; despesaCents: number }>();
  for (const g of grouped) {
    const cur = byCc.get(g.costCenterId) ?? { receitaCents: 0, despesaCents: 0 };
    const cents = g._sum.amountCents ?? 0;
    if (g.type === "RECEITA") cur.receitaCents += cents;
    else cur.despesaCents += cents;
    byCc.set(g.costCenterId, cur);
  }

  return [...byCc.entries()]
    .map(([costCenterId, vals]) => ({
      costCenterId,
      costCenterName: ccById.get(costCenterId) ?? "—",
      receitaCents: vals.receitaCents,
      despesaCents: vals.despesaCents,
      resultadoCents: vals.receitaCents - vals.despesaCents,
      resultadoFormatted: formatCentsToBrl(vals.receitaCents - vals.despesaCents),
    }))
    .sort((a, b) => b.resultadoCents - a.resultadoCents);
}
