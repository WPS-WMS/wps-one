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

function formatPercent(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Soma contas a pagar do período por subcategoria DRE (IMPOSTO / CUSTO).
 * Usa competência; se ausente, parcela(s) com vencimento no período.
 */
async function sumPayablesByDreSubcategory(
  tenantId: string,
  period: ReportPeriod,
): Promise<{ impostosCents: number; custoOperacionalCents: number }> {
  const payables = await prisma.payable.findMany({
    where: {
      tenantId,
      status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] },
      OR: [
        { competenceDate: entryDateWhere(period) },
        {
          competenceDate: null,
          installments: {
            some: { dueDate: entryDateWhere(period), status: { not: "CANCELADO" } },
          },
        },
      ],
    },
    select: {
      totalAmountCents: true,
      competenceDate: true,
      financialCategory: { select: { dreSubcategory: true } },
      installments: {
        where: { status: { not: "CANCELADO" }, dueDate: entryDateWhere(period) },
        select: { amountCents: true },
      },
    },
  });

  let impostosCents = 0;
  let custoOperacionalCents = 0;

  for (const payable of payables) {
    const sub = String(payable.financialCategory?.dreSubcategory ?? "")
      .trim()
      .toUpperCase();
    if (sub !== "IMPOSTO" && sub !== "CUSTO") continue;

    const amount =
      payable.competenceDate != null
        ? payable.totalAmountCents
        : payable.installments.reduce((s, i) => s + i.amountCents, 0);

    if (sub === "IMPOSTO") impostosCents += amount;
    else custoOperacionalCents += amount;
  }

  return { impostosCents, custoOperacionalCents };
}

export async function computeExecutiveSummary(tenantId: string, period: ReportPeriod) {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + 90);

  const [receitaBrutaAgg, expenseBuckets, aging, recvOpen, payOpen] = await Promise.all([
    // Receita bruta = faturamento no período (parcelas a receber).
    prisma.receivableInstallment.aggregate({
      where: {
        dueDate: entryDateWhere(period),
        status: { not: "CANCELADO" },
        receivable: { tenantId, status: { not: "CANCELADO" } },
      },
      _sum: { amountCents: true },
    }),
    sumPayablesByDreSubcategory(tenantId, period),
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

  const receitaBrutaCents = receitaBrutaAgg._sum.amountCents ?? 0;
  const impostosCents = expenseBuckets.impostosCents;
  const custoOperacionalCents = expenseBuckets.custoOperacionalCents;
  const receitaLiquidaCents = receitaBrutaCents - impostosCents;
  const ebitdaCents = receitaLiquidaCents - custoOperacionalCents;
  const ebitdaPercent =
    receitaBrutaCents > 0 ? ebitdaCents / receitaBrutaCents : null;
  const fluxoPrevistoCents =
    (recvOpen._sum.amountCents ?? 0) - (payOpen._sum.amountCents ?? 0);

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    receitaBrutaCents,
    impostosCents,
    custoOperacionalCents,
    receitaLiquidaCents,
    ebitdaCents,
    ebitdaPercent,
    /** Compat: campos antigos ainda referenciados em clientes legados. */
    receitaMensalCents: receitaBrutaCents,
    despesaMensalCents: impostosCents + custoOperacionalCents,
    resultadoLiquidoCents: receitaLiquidaCents,
    ebitdaEstimadoCents: ebitdaCents,
    inadimplenciaCents: aging.overdueTotalCents,
    inadimplenciaCount: aging.overdueCount,
    fluxoPrevistoCents,
    notas: [
      "Receita bruta: faturamento (contas a receber) no período.",
      "Impostos: contas a pagar com subcategoria DRE Imposto.",
      "Custo operacional: contas a pagar com subcategoria DRE Custo (folha/custos).",
      "Receita líquida = Receita bruta − Impostos.",
      "EBITDA R$ = Receita líquida − Custo operacional.",
      "EBITDA % = EBITDA R$ ÷ Receita bruta.",
    ],
    formatted: {
      receitaBruta: formatCentsToBrl(receitaBrutaCents),
      impostos: formatCentsToBrl(impostosCents),
      custoOperacional: formatCentsToBrl(custoOperacionalCents),
      receitaLiquida: formatCentsToBrl(receitaLiquidaCents),
      ebitda: formatCentsToBrl(ebitdaCents),
      ebitdaPercent: formatPercent(ebitdaPercent),
      receitaMensal: formatCentsToBrl(receitaBrutaCents),
      despesaMensal: formatCentsToBrl(impostosCents + custoOperacionalCents),
      resultadoLiquido: formatCentsToBrl(receitaLiquidaCents),
      ebitdaEstimado: formatCentsToBrl(ebitdaCents),
      inadimplencia: formatCentsToBrl(aging.overdueTotalCents),
      fluxoPrevisto: formatCentsToBrl(fluxoPrevistoCents),
    },
  };
}

function monthKeyFromDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelFromKey(key: string): string {
  const [yRaw, mRaw] = key.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const short = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const label = short[m - 1] ?? mRaw;
  return `${label}-${String(y).slice(-2)}`;
}

function listMonthKeys(period: ReportPeriod): string[] {
  const keys: string[] = [];
  const cur = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), 1));
  while (cur <= last) {
    keys.push(monthKeyFromDate(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return keys.length > 0 ? keys : [monthKeyFromDate(period.start)];
}

function formatDreSigned(cents: number): string {
  if (cents < 0) return `-${formatCentsToBrl(Math.abs(cents))}`;
  return formatCentsToBrl(cents);
}

/**
 * DRE da empresa (tenant) — consolidado mensal, sem recorte por cliente.
 *
 * Linhas fixas: Faturamento, Outras receitas, Custo total, Lucro mensal.
 * Demais linhas: uma por categoria financeira cadastrada (inclui Imposto, Custo e Reembolsos).
 *
 * Custo total = soma das categorias com subcategoria DRE IMPOSTO, CUSTO ou REEMBOLSOS
 * Lucro mensal = Faturamento + Outras receitas − Custo total
 * Faturamento: contas a receber de faturamento (projeto / recorrente)
 * Outras receitas: demais CR (ex.: juros, reembolsos a receber) + lançamentos de receita sem parcela
 * Reembolsos (linhas de categoria): valores pagos no contas a pagar com subcategoria Reembolsos
 */
export async function computeGerencialDre(tenantId: string, period: ReportPeriod) {
  const monthKeys = listMonthKeys(period);
  const zeroMonths = (): number[] => monthKeys.map(() => 0);

  const faturamentoByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  const outrasReceitasByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  /** categoryId | "__uncategorized__" → monthKey → cents */
  const expenseByCategoryMonth = new Map<string, Map<string, number>>();

  const monthKeySet = new Set(monthKeys);
  const addCategoryExpense = (categoryId: string, monthKey: string, amount: number) => {
    if (!monthKeySet.has(monthKey) || amount === 0) return;
    let byMonth = expenseByCategoryMonth.get(categoryId);
    if (!byMonth) {
      byMonth = new Map();
      expenseByCategoryMonth.set(categoryId, byMonth);
    }
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + amount);
  };

  const isFaturamentoReceivable = (r: {
    projectRevenueId: string | null;
    kind: string;
  }) => {
    if (r.projectRevenueId) return true;
    const kind = String(r.kind ?? "").trim().toUpperCase();
    return kind === "PROJETO" || kind === "RECORRENTE";
  };

  const [categories, recvInstallments, otherRevenueEntries, payables, orphanExpenses] =
    await Promise.all([
      prisma.financialCategory.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true, dreSubcategory: true },
      }),
      prisma.receivableInstallment.findMany({
        where: {
          dueDate: entryDateWhere(period),
          status: { not: "CANCELADO" },
          receivable: { tenantId, status: { not: "CANCELADO" } },
        },
        select: {
          amountCents: true,
          dueDate: true,
          receivable: { select: { projectRevenueId: true, kind: true } },
        },
      }),
      prisma.financialEntry.findMany({
        where: {
          tenantId,
          type: "RECEITA",
          status: "LANCADO",
          entryDate: entryDateWhere(period),
          receivableInstallmentId: null,
        },
        select: { amountCents: true, entryDate: true },
      }),
      prisma.payable.findMany({
        where: {
          tenantId,
          status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] },
          OR: [
            { competenceDate: entryDateWhere(period) },
            {
              competenceDate: null,
              installments: {
                some: { dueDate: entryDateWhere(period), status: { not: "CANCELADO" } },
              },
            },
          ],
        },
        select: {
          totalAmountCents: true,
          competenceDate: true,
          financialCategoryId: true,
          installments: {
            where: { status: { not: "CANCELADO" } },
            orderBy: { installmentNumber: "asc" },
            select: { dueDate: true, amountCents: true },
          },
        },
      }),
      prisma.financialEntry.findMany({
        where: {
          tenantId,
          type: "DESPESA",
          status: "LANCADO",
          entryDate: entryDateWhere(period),
          payableInstallmentId: null,
        },
        select: { amountCents: true, entryDate: true },
      }),
    ]);

  for (const inst of recvInstallments) {
    const key = monthKeyFromDate(inst.dueDate);
    if (!monthKeySet.has(key)) continue;
    if (isFaturamentoReceivable(inst.receivable)) {
      faturamentoByMonth.set(key, (faturamentoByMonth.get(key) ?? 0) + inst.amountCents);
    } else {
      outrasReceitasByMonth.set(key, (outrasReceitasByMonth.get(key) ?? 0) + inst.amountCents);
    }
  }

  for (const entry of otherRevenueEntries) {
    const key = monthKeyFromDate(entry.entryDate);
    if (!outrasReceitasByMonth.has(key)) continue;
    outrasReceitasByMonth.set(key, (outrasReceitasByMonth.get(key) ?? 0) + entry.amountCents);
  }

  for (const payable of payables) {
    const categoryId = payable.financialCategoryId ?? "__uncategorized__";
    if (payable.competenceDate) {
      addCategoryExpense(
        categoryId,
        monthKeyFromDate(payable.competenceDate),
        payable.totalAmountCents,
      );
      continue;
    }
    for (const inst of payable.installments) {
      addCategoryExpense(categoryId, monthKeyFromDate(inst.dueDate), inst.amountCents);
    }
  }

  for (const entry of orphanExpenses) {
    addCategoryExpense("__uncategorized__", monthKeyFromDate(entry.entryDate), entry.amountCents);
  }

  const categoryValues = (categoryId: string): number[] =>
    monthKeys.map((k) => expenseByCategoryMonth.get(categoryId)?.get(k) ?? 0);

  const faturamento = monthKeys.map((k) => faturamentoByMonth.get(k) ?? 0);
  const outrasReceitas = monthKeys.map((k) => outrasReceitasByMonth.get(k) ?? 0);

  const countsTowardCustoTotal = (sub: string | null | undefined) => {
    const s = String(sub ?? "").trim().toUpperCase();
    return s === "IMPOSTO" || s === "CUSTO" || s === "REEMBOLSOS";
  };

  const categoryRowsMeta = categories
    .map((cat) => {
      const valuesCents = categoryValues(cat.id);
      const hasValues = valuesCents.some((v) => v !== 0);
      return { ...cat, valuesCents, hasValues };
    })
    .filter((cat) => cat.isActive || cat.hasValues);

  const uncategorizedValues = categoryValues("__uncategorized__");
  const hasUncategorized = uncategorizedValues.some((v) => v !== 0);

  const custoTotal = zeroMonths();
  for (const cat of categoryRowsMeta) {
    if (!countsTowardCustoTotal(cat.dreSubcategory)) continue;
    cat.valuesCents.forEach((v, i) => {
      custoTotal[i]! += v;
    });
  }

  const lucroMensal = monthKeys.map(
    (_, i) => faturamento[i]! + outrasReceitas[i]! - custoTotal[i]!,
  );

  type DreRowTone = "revenue" | "expense" | "total" | "result";
  type DreRowDef = {
    key: string;
    label: string;
    tone: DreRowTone;
    bold?: boolean;
    valuesCents: number[];
  };

  const rowDefs: DreRowDef[] = [
    { key: "faturamento", label: "Faturamento", tone: "revenue", valuesCents: faturamento },
    {
      key: "outrasReceitas",
      label: "Outras receitas",
      tone: "revenue",
      valuesCents: outrasReceitas,
    },
    ...categoryRowsMeta.map((cat) => ({
      key: `cat:${cat.id}`,
      label: cat.name,
      tone: "expense" as const,
      valuesCents: cat.valuesCents,
    })),
    ...(hasUncategorized
      ? [
          {
            key: "uncategorized",
            label: "Sem categoria",
            tone: "expense" as const,
            valuesCents: uncategorizedValues,
          },
        ]
      : []),
    { key: "custoTotal", label: "Custo total", tone: "total", bold: true, valuesCents: custoTotal },
    {
      key: "lucroMensal",
      label: "Lucro mensal",
      tone: "result",
      bold: true,
      valuesCents: lucroMensal,
    },
  ];

  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
    },
    months: monthKeys.map((key) => ({ key, label: monthLabelFromKey(key) })),
    rows: rowDefs.map((row) => ({
      key: row.key,
      label: row.label,
      tone: row.tone,
      bold: Boolean(row.bold),
      valuesCents: row.valuesCents,
      valuesFormatted: row.valuesCents.map((c) => formatDreSigned(c)),
    })),
    /** Compatibilidade com resposta antiga (somatório do período). */
    lines: rowDefs.map((row) => {
      const cents = row.valuesCents.reduce((s, v) => s + v, 0);
      return {
        key: row.key,
        label: row.label,
        cents,
        highlight: Boolean(row.bold),
        formatted: formatCentsToBrl(Math.abs(cents)),
        signedFormatted: formatDreSigned(cents),
      };
    }),
    notas: [
      "DRE da empresa (consolidado do tenant), não por cliente.",
      "Custo total = soma das categorias financeiras com subcategoria Imposto, Custo e Reembolso.",
      "Lucro mensal = Faturamento + Outras receitas − Custo total.",
      "Faturamento: contas a receber de faturamento (projeto/recorrente).",
      "Outras receitas: demais contas a receber (ex.: juros, reembolsos a receber) e lançamentos de receita sem parcela.",
      "Linhas de categoria com subcategoria Reembolsos: reembolsos pagos no contas a pagar (entram no Custo total).",
    ],
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
