import { prisma } from "./prisma.js";
import { costLineTotal, sumBillingLines, sumCostLines } from "./projectRevenueCompositionHelpers.js";
import { classifyReceivableRevenueText } from "./receivableRevenueClassification.js";

export type DashboardView = "completo" | "mensal";

export type DashboardDetailRow = {
  id: string;
  label: string;
  hours: number | null;
  amount: number;
};

export type DashboardExpandableRow = {
  id: string;
  label: string;
  amount: number;
  expandable: boolean;
  children: DashboardDetailRow[];
};

export type ProjectFinancialDashboard = {
  projectId: string;
  projectName: string;
  view: DashboardView;
  year: number;
  month: number;
  periodLabel: string;
  receita: {
    valorTotal: DashboardExpandableRow;
    parcelas: number;
    valorParcela: number | null;
    reembolsoProjeto: DashboardExpandableRow;
    total: number;
  };
  despesa: {
    operacao: DashboardExpandableRow;
    despesasOperacionais: DashboardExpandableRow;
    despesaProjeto: DashboardExpandableRow;
    total: number;
  };
  impostos: {
    impostoFederal: DashboardExpandableRow;
    taxRatePercent: number | null;
    total: number;
  };
  resultado: {
    bruto: number;
    liquido: number;
  };
  notas: string[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthBounds(year: number, month: number): { start: Date; endExclusive: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

function formatPeriodLabel(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = date.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function parseTaxRatePercent(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.replace("%", "").replace(",", ".").trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value > 1) return value / 100;
  return value;
}

function formatDashboardDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Rótulo: responsável/empresa — atividade — data */
function formatExpenseDetailLabel(parts: {
  party?: string | null;
  activity?: string | null;
  date?: Date | string | null;
}): string {
  const party = parts.party?.trim() || "—";
  const activity = parts.activity?.trim() || "—";
  const date = formatDashboardDate(parts.date);
  return date ? `${party} — ${activity} — ${date}` : `${party} — ${activity}`;
}

type RevenueTaxInput = {
  costLines: Array<{ hourlyRate: number; hours: number; isDiscount?: boolean }>;
  billingLines: Array<{ dueDate: Date; amount: number }>;
  taxType: { id: string; name: string; ratePercent: number | null } | null;
};

/** Base tributável: faturamento bruto (parcelas), sem custos nem reembolsos. */
function revenueTaxBase(
  revenue: RevenueTaxInput,
  isMonthly: boolean,
  monthStart: Date,
  monthEndExclusive: Date,
): number {
  const lines = isMonthly
    ? revenue.billingLines.filter(
        (line) => line.dueDate >= monthStart && line.dueDate < monthEndExclusive,
      )
    : revenue.billingLines;
  if (lines.length === 0) return 0;
  return roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
}

function computeTaxesFromRevenues(
  revenues: RevenueTaxInput[],
  isMonthly: boolean,
  monthStart: Date,
  monthEndExclusive: Date,
): { children: DashboardDetailRow[]; total: number; mainLabel: string } {
  const byTax = new Map<string, { id: string; label: string; amount: number }>();

  for (const revenue of revenues) {
    const tax = revenue.taxType;
    if (!tax || tax.ratePercent == null || tax.ratePercent <= 0) continue;
    const base = revenueTaxBase(revenue, isMonthly, monthStart, monthEndExclusive);
    if (base <= 0) continue;
    const amount = roundMoney(base * (tax.ratePercent / 100));
    const rateLabel = tax.ratePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const existing = byTax.get(tax.id) ?? {
      id: tax.id,
      label: `${tax.name} (${rateLabel}%)`,
      amount: 0,
    };
    existing.amount = roundMoney(existing.amount + amount);
    byTax.set(tax.id, existing);
  }

  const children = [...byTax.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    .map((row) => ({
      id: row.id,
      label: row.label,
      hours: null,
      amount: row.amount,
    }));

  const total = roundMoney(children.reduce((sum, row) => sum + row.amount, 0));
  const mainLabel =
    children.length === 1 ? children[0].label.split(" (")[0] ?? "Impostos" : "Impostos";

  return { children, total, mainLabel };
}

function reimbursementDateFilter(year: number, month: number) {
  const { start, endExclusive } = monthBounds(year, month);
  return {
    OR: [
      { expenseDate: { gte: start, lt: endExclusive } },
      {
        expenseDate: null,
        paidAt: { gte: start, lt: endExclusive },
      },
      {
        expenseDate: null,
        paidAt: null,
        createdAt: { gte: start, lt: endExclusive },
      },
    ],
  };
}

async function resolveProjectIds(tenantId: string, projectId: string): Promise<string[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId } },
    select: { id: true },
  });
  if (!project) return null;

  const childIds = await prisma.project.findMany({
    where: { parentProjectId: projectId, client: { tenantId } },
    select: { id: true },
  });
  return [projectId, ...childIds.map((child) => child.id)];
}

export async function computeProjectFinancialDashboard(
  tenantId: string,
  projectId: string,
  view: DashboardView,
  year: number,
  month: number,
): Promise<ProjectFinancialDashboard | null> {
  const projectIds = await resolveProjectIds(tenantId, projectId);
  if (!projectIds) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId } },
    select: {
      id: true,
      name: true,
      valorContrato: true,
      client: {
        select: {
          financial: { select: { retencaoImpostos: true } },
        },
      },
    },
  });
  if (!project) return null;

  const notas: string[] = [];
  const isMonthly = view === "mensal";
  const { start: monthStart, endExclusive: monthEndExclusive } = monthBounds(year, month);

  const projectReimbursementWhere = {
    tenantId,
    projectId: { in: projectIds },
    status: { not: "REJECTED" },
    ...(isMonthly ? reimbursementDateFilter(year, month) : {}),
  };
  const timeEntryWhere = {
    projectId: { in: projectIds },
    ...(isMonthly
      ? {
          date: {
            gte: monthStart,
            lt: monthEndExclusive,
          },
        }
      : {}),
  };

  const [revenues, projectReimbursements, timeEntries, financialEntries, payableAllocations, projectReceivables] =
    await Promise.all([
      prisma.projectRevenue.findMany({
        where: {
          tenantId,
          projectId: { in: projectIds },
          status: { not: "CANCELADO" },
        },
        include: {
          costLines: { orderBy: { sortOrder: "asc" } },
          billingLines: { orderBy: { sortOrder: "asc" } },
          taxType: { select: { id: true, name: true, ratePercent: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.reimbursement.findMany({
        where: projectReimbursementWhere,
        select: {
          id: true,
          description: true,
          amountCents: true,
          createdAt: true,
          expenseDate: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.timeEntry.findMany({
        where: timeEntryWhere,
        select: {
          userId: true,
          totalHoras: true,
          user: { select: { name: true, hourlyRate: true } },
        },
      }),
      prisma.financialEntry.findMany({
        where: {
          tenantId,
          projectId: { in: projectIds },
          type: "DESPESA",
          status: "LANCADO",
          ...(isMonthly
            ? {
                entryDate: {
                  gte: monthStart,
                  lt: monthEndExclusive,
                },
              }
            : {}),
        },
        select: {
          id: true,
          description: true,
          amountCents: true,
          entryDate: true,
          createdAt: true,
          supplier: { select: { nomeApelido: true } },
          createdBy: { select: { name: true } },
          payableInstallment: {
            select: {
              payable: {
                select: {
                  kind: true,
                  reimbursementId: true,
                  description: true,
                  createdAt: true,
                  payeeName: true,
                  supplier: { select: { nomeApelido: true } },
                  professional: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { entryDate: "asc" },
      }),
      prisma.payableAllocation.findMany({
        where: {
          projectId: { in: projectIds },
          payable: {
            tenantId,
            status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] },
            kind: { not: "REEMBOLSO" },
          },
        },
        include: {
          payable: {
            select: {
              id: true,
              description: true,
              totalAmountCents: true,
              createdAt: true,
              payeeName: true,
              supplier: { select: { nomeApelido: true } },
              professional: { select: { name: true } },
              installments: {
                where: { status: { in: ["ABERTO", "VENCIDO"] } },
                select: {
                  id: true,
                  installmentNumber: true,
                  dueDate: true,
                  amountCents: true,
                },
              },
            },
          },
        },
      }),
      prisma.receivable.findMany({
        where: {
          tenantId,
          projectId: { in: projectIds },
          status: { not: "CANCELADO" },
          projectRevenueId: null,
          NOT: { sourceType: "REIMBURSEMENT" },
          ...(isMonthly
            ? {
                OR: [
                  { competenceDate: { gte: monthStart, lt: monthEndExclusive } },
                  {
                    competenceDate: null,
                    installments: {
                      some: {
                        status: { not: "CANCELADO" },
                        dueDate: { gte: monthStart, lt: monthEndExclusive },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          description: true,
          totalAmountCents: true,
          competenceDate: true,
          createdAt: true,
          financialAccount: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const allCostLines = revenues.flatMap((revenue) =>
    revenue.costLines.map((line) => ({
      id: line.id,
      skill: line.skill,
      hourlyRate: line.hourlyRate,
      hours: line.hours,
      isDiscount: line.isDiscount,
    })),
  );

  const allBillingLines = revenues.flatMap((revenue) =>
    revenue.billingLines.map((line) => ({
      ...line,
      revenueTitle: revenue.title,
    })),
  );
  const billingLinesInPeriod = isMonthly
    ? allBillingLines.filter(
        (line) => line.dueDate >= monthStart && line.dueDate < monthEndExclusive,
      )
    : allBillingLines;

  const isFaturamentoBillingLine = (line: { milestone: string | null; revenueTitle?: string | null }) =>
    classifyReceivableRevenueText(line.milestone, line.revenueTitle) === "FATURAMENTO";
  const isReembolsoBillingLine = (line: { milestone: string | null; revenueTitle?: string | null }) =>
    classifyReceivableRevenueText(line.milestone, line.revenueTitle) === "REEMBOLSO";

  const faturamentoBillingAll = allBillingLines.filter(isFaturamentoBillingLine);
  const faturamentoBillingInPeriod = billingLinesInPeriod.filter(isFaturamentoBillingLine);
  const reembolsoBillingInPeriod = billingLinesInPeriod.filter(isReembolsoBillingLine);

  const costTotalFromLines = sumCostLines(allCostLines);
  const billingTotalFromLines = sumBillingLines(
    faturamentoBillingAll.map((line) => ({
      milestone: line.milestone,
      installmentNumber: line.installmentNumber,
      dueDate: line.dueDate,
      amount: line.amount,
    })),
  );
  const contractedFromRevenues = revenues
    .filter((revenue) => classifyReceivableRevenueText(revenue.title) === "FATURAMENTO")
    .reduce((sum, revenue) => sum + (revenue.contractedValue ?? 0), 0);
  const expectedFromRevenues = revenues
    .filter((revenue) => classifyReceivableRevenueText(revenue.title) === "FATURAMENTO")
    .reduce((sum, revenue) => sum + (revenue.expectedRevenue ?? 0), 0);
  /** No modo completo, prioriza faturamento (parcelas) — valor total configurado na receita. */
  const valorTotalBase = isMonthly
    ? faturamentoBillingInPeriod.reduce((sum, line) => sum + line.amount, 0)
    : billingTotalFromLines > 0
      ? billingTotalFromLines
      : expectedFromRevenues > 0
        ? expectedFromRevenues
        : costTotalFromLines > 0
          ? costTotalFromLines
          : contractedFromRevenues > 0
            ? contractedFromRevenues
            : (project.valorContrato ?? 0);

  const valorTotalAmount = roundMoney(valorTotalBase);
  /** Faturamento bruto para imposto — apenas parcelas, sem reembolsos nem fallback de custos. */
  const faturamentoBrutoImposto = roundMoney(
    isMonthly
      ? faturamentoBillingInPeriod.reduce((sum, line) => sum + line.amount, 0)
      : billingTotalFromLines,
  );

  const billingLinesForBreakdown = isMonthly ? faturamentoBillingInPeriod : faturamentoBillingAll;
  const valorTotalChildren: DashboardDetailRow[] =
    billingLinesForBreakdown.length > 0
      ? billingLinesForBreakdown.map((line) => ({
          id: line.id,
          label: line.milestone?.trim() || `Parcela ${line.installmentNumber}`,
          hours: null,
          amount: roundMoney(line.amount),
        }))
      : allCostLines.length > 0
        ? allCostLines
            .filter((line) => !line.isDiscount)
            .map((line) => ({
              id: line.id,
              label: line.skill,
              hours: line.hours,
              amount: costLineTotal(line),
            }))
        : [];

  const installmentCounts = revenues
    .filter((revenue) => classifyReceivableRevenueText(revenue.title) === "FATURAMENTO")
    .map((revenue) => revenue.installmentCount ?? revenue.billingLines.length)
    .filter((count) => count > 0);
  const parcelas =
    installmentCounts.length > 0
      ? Math.max(...installmentCounts)
      : faturamentoBillingAll.length > 0
        ? faturamentoBillingAll.length
        : 0;

  let valorParcela: number | null = null;
  if (faturamentoBillingAll.length > 0) {
    if (isMonthly && faturamentoBillingInPeriod.length > 0) {
      const sum = faturamentoBillingInPeriod.reduce((acc, line) => acc + line.amount, 0);
      valorParcela = roundMoney(sum / faturamentoBillingInPeriod.length);
    } else {
      const amounts = faturamentoBillingAll.map((line) => line.amount);
      const first = amounts[0] ?? 0;
      const allEqual = amounts.every((amount) => Math.abs(amount - first) < 0.01);
      valorParcela = allEqual ? roundMoney(first) : roundMoney(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    }
  } else if (parcelas > 0 && valorTotalBase > 0) {
    valorParcela = roundMoney(valorTotalBase / parcelas);
  }

  const reimbursementDashboardRows: DashboardDetailRow[] = projectReimbursements.map((row) => ({
    id: row.id,
    label: formatExpenseDetailLabel({
      party: row.user.name,
      activity: row.description,
      date: row.createdAt,
    }),
    hours: null,
    amount: roundMoney(row.amountCents / 100),
  }));

  // Parcelas legadas importadas como receita de projeto com título "Reembolso".
  const reembolsoFromBillingRows: DashboardDetailRow[] = reembolsoBillingInPeriod.map((line) => ({
    id: `billing-reembolso-${line.id}`,
    label: line.milestone?.trim() || "Reembolso",
    hours: null,
    amount: roundMoney(line.amount),
  }));

  // CR importadas/manuais de reembolso (sem ProjectRevenue).
  const reembolsoFromReceivables: DashboardDetailRow[] = projectReceivables
    .filter(
      (row) =>
        classifyReceivableRevenueText(row.description, row.financialAccount?.name) === "REEMBOLSO",
    )
    .map((row) => ({
      id: `recv-reembolso-${row.id}`,
      label: row.description?.trim() || "Reembolso",
      hours: null,
      amount: roundMoney(row.totalAmountCents / 100),
    }));

  const reembolsoChildren = [
    ...reimbursementDashboardRows,
    ...reembolsoFromBillingRows,
    ...reembolsoFromReceivables,
  ];
  const reembolsoProjetoAmount = roundMoney(
    reembolsoChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const receitaTotal = roundMoney(valorTotalAmount + reembolsoProjetoAmount);

  const hoursByUser = new Map<string, { name: string; hours: number; hourlyRate: number | null }>();
  for (const entry of timeEntries) {
    const current = hoursByUser.get(entry.userId) ?? {
      name: entry.user.name,
      hours: 0,
      hourlyRate: entry.user.hourlyRate,
    };
    current.hours += entry.totalHoras;
    hoursByUser.set(entry.userId, current);
  }

  const plannedHours = allCostLines.reduce((sum, line) => sum + line.hours, 0);
  const blendedHourlyRate =
    plannedHours > 0 && valorTotalBase > 0 ? valorTotalBase / plannedHours : null;

  let usersWithoutHourlyRate = 0;
  const operacaoChildren: DashboardDetailRow[] = [...hoursByUser.entries()]
    .map(([userId, row]) => {
      const hasUserRate = row.hourlyRate != null && row.hourlyRate > 0;
      if (!hasUserRate) usersWithoutHourlyRate += 1;
      const rate = hasUserRate ? row.hourlyRate! : blendedHourlyRate;
      const amount = rate != null ? roundMoney(row.hours * rate) : 0;
      return {
        id: userId,
        label: row.name,
        hours: roundMoney(row.hours * 100) / 100,
        amount,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  if (hoursByUser.size > 0) {
    if (usersWithoutHourlyRate === hoursByUser.size) {
      if (blendedHourlyRate == null) {
        notas.push(
          "Custo de operação não calculado: cadastre a taxa hora em Configurações > Usuários ou defina a composição de custos na receita do projeto.",
        );
      } else {
        notas.push(
          "Custo de operação estimado pela taxa média da composição de receita. Cadastre a taxa hora de cada usuário em Configurações > Usuários.",
        );
      }
    } else if (usersWithoutHourlyRate > 0) {
      notas.push(
        `${usersWithoutHourlyRate} usuário(s) sem taxa hora cadastrada; usada taxa média da composição de receita como fallback.`,
      );
    }
  }

  const operacaoAmount = roundMoney(operacaoChildren.reduce((sum, row) => sum + row.amount, 0));

  const operationalEntries = financialEntries.filter((entry) => {
    const payable = entry.payableInstallment?.payable;
    if (!payable) return true;
    return payable.kind !== "REEMBOLSO" && !payable.reimbursementId;
  });

  /** Mesmo formato nas duas linhas: responsável/empresa — atividade — data da solicitação. */
  const despesasFromEntries: DashboardDetailRow[] = operationalEntries.map((entry) => {
    const payable = entry.payableInstallment?.payable;
    const party =
      payable?.supplier?.nomeApelido ||
      payable?.professional?.name ||
      payable?.payeeName ||
      entry.supplier?.nomeApelido ||
      entry.createdBy?.name ||
      null;
    const activity = entry.description?.trim() || payable?.description?.trim() || "Atividade";
    // Data da solicitação/criação (igual ao reembolso), não a data de competência.
    const date = payable?.createdAt ?? entry.createdAt ?? entry.entryDate;
    return {
      id: entry.id,
      label: formatExpenseDetailLabel({ party, activity, date }),
      hours: null,
      amount: roundMoney(entry.amountCents / 100),
    };
  });

  const despesasFromOpenPayables: DashboardDetailRow[] = [];
  for (const allocation of payableAllocations) {
    const payable = allocation.payable;
    if (payable.totalAmountCents <= 0) continue;
    const share = allocation.amountCents / payable.totalAmountCents;
    const party =
      payable.supplier?.nomeApelido || payable.professional?.name || payable.payeeName || null;

    for (const installment of payable.installments) {
      if (
        isMonthly &&
        (installment.dueDate < monthStart || installment.dueDate >= monthEndExclusive)
      ) {
        continue;
      }
      const amount = roundMoney((installment.amountCents / 100) * share);
      if (amount <= 0) continue;
      despesasFromOpenPayables.push({
        id: `payable-${payable.id}-${installment.id}-${allocation.id}`,
        label: formatExpenseDetailLabel({
          party,
          activity: payable.description?.trim() || "Atividade",
          date: payable.createdAt,
        }),
        hours: null,
        amount,
      });
    }
  }

  /**
   * Despesas de projeto = reembolsáveis pelo cliente (mesmo conteúdo de Receita > Reembolso de projeto).
   * Despesas operacionais = custos da própria empresa no projeto, sem reembolso (lançamentos/CPs).
   */
  const despesasProjetoChildren = [...reimbursementDashboardRows].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
  const despesasProjetoAmount = roundMoney(
    despesasProjetoChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const despesasOperacionaisChildren = [...despesasFromEntries, ...despesasFromOpenPayables].sort(
    (a, b) => a.label.localeCompare(b.label, "pt-BR"),
  );
  const despesasOperacionaisAmount = roundMoney(
    despesasOperacionaisChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const despesaTotal = roundMoney(
    operacaoAmount + despesasOperacionaisAmount + despesasProjetoAmount,
  );

  const taxFromRevenues = computeTaxesFromRevenues(
    revenues
      .filter((revenue) => classifyReceivableRevenueText(revenue.title) === "FATURAMENTO")
      .map((revenue) => ({
        costLines: revenue.costLines,
        billingLines: revenue.billingLines.filter(
          (line) => classifyReceivableRevenueText(line.milestone, revenue.title) === "FATURAMENTO",
        ),
        taxType: revenue.taxType,
      })),
    isMonthly,
    monthStart,
    monthEndExclusive,
  );

  let impostoChildren = taxFromRevenues.children;
  let impostoTotal = taxFromRevenues.total;
  let impostoLabel = taxFromRevenues.mainLabel;
  let taxRatePercent: number | null =
    faturamentoBrutoImposto > 0 && impostoTotal > 0
      ? roundMoney((impostoTotal / faturamentoBrutoImposto) * 10000) / 100
      : null;

  if (impostoChildren.length === 0) {
    const taxRate = parseTaxRatePercent(project.client.financial?.retencaoImpostos ?? null);
    impostoTotal =
      taxRate != null && faturamentoBrutoImposto > 0
        ? roundMoney(faturamentoBrutoImposto * taxRate)
        : 0;
    taxRatePercent = taxRate != null ? roundMoney(taxRate * 10000) / 100 : null;
    impostoLabel = "Imposto federal";

    if (taxRate == null && faturamentoBrutoImposto > 0) {
      notas.push(
        "Imposto não calculado: selecione um imposto na receita do projeto ou cadastre retenção no cadastro financeiro do cliente.",
      );
    }
  }

  const resultadoBruto = roundMoney(receitaTotal - despesaTotal);
  const resultadoLiquido = roundMoney(resultadoBruto - impostoTotal);

  return {
    projectId: project.id,
    projectName: project.name,
    view,
    year,
    month,
    periodLabel: isMonthly ? formatPeriodLabel(year, month) : "Acumulado",
    receita: {
      valorTotal: {
        id: "valor-total",
        label: "Valor total",
        amount: valorTotalAmount,
        expandable: valorTotalChildren.length > 0,
        children: valorTotalChildren,
      },
      parcelas,
      valorParcela,
      reembolsoProjeto: {
        id: "reembolso-projeto",
        label: "Reembolso de projeto",
        amount: reembolsoProjetoAmount,
        expandable: reembolsoChildren.length > 0,
        children: reembolsoChildren,
      },
      total: receitaTotal,
    },
    despesa: {
      operacao: {
        id: "operacao",
        label: "Operação",
        amount: operacaoAmount,
        expandable: operacaoChildren.length > 0,
        children: operacaoChildren,
      },
      despesasOperacionais: {
        id: "despesas-operacionais",
        label: "Despesas operacionais",
        amount: despesasOperacionaisAmount,
        expandable: despesasOperacionaisChildren.length > 0,
        children: despesasOperacionaisChildren,
      },
      despesaProjeto: {
        id: "despesa-projeto",
        label: "Despesas de projeto",
        amount: despesasProjetoAmount,
        expandable: despesasProjetoChildren.length > 0,
        children: despesasProjetoChildren,
      },
      total: despesaTotal,
    },
    impostos: {
      impostoFederal: {
        id: "impostos",
        label: impostoLabel,
        amount: impostoTotal,
        expandable: impostoChildren.length > 0,
        children: impostoChildren,
      },
      taxRatePercent,
      total: impostoTotal,
    },
    resultado: {
      bruto: resultadoBruto,
      liquido: resultadoLiquido,
    },
    notas,
  };
}
