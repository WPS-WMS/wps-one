import { prisma } from "./prisma.js";
import { costLineTotal, sumBillingLines, sumCostLines } from "./projectRevenueCompositionHelpers.js";

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

type RevenueTaxInput = {
  costLines: Array<{ hourlyRate: number; hours: number }>;
  billingLines: Array<{ dueDate: Date; amount: number }>;
  taxType: { id: string; name: string; ratePercent: number | null } | null;
};

function revenueTaxBase(
  revenue: RevenueTaxInput,
  isMonthly: boolean,
  monthStart: Date,
  monthEndExclusive: Date,
): number {
  if (isMonthly) {
    const billingInPeriod = revenue.billingLines.filter(
      (line) => line.dueDate >= monthStart && line.dueDate < monthEndExclusive,
    );
    if (billingInPeriod.length > 0) {
      return roundMoney(billingInPeriod.reduce((sum, line) => sum + line.amount, 0));
    }
    return 0;
  }
  const costTotal = roundMoney(
    revenue.costLines.reduce((sum, line) => sum + costLineTotal(line), 0),
  );
  const billingTotal = sumBillingLines(
    revenue.billingLines.map((line) => ({
      milestone: null,
      installmentNumber: 1,
      dueDate: line.dueDate,
      amount: line.amount,
    })),
  );
  if (billingTotal > 0) return billingTotal;
  if (costTotal > 0) return costTotal;
  return 0;
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

  const revenues = await prisma.projectRevenue.findMany({
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
  });

  const allCostLines = revenues.flatMap((revenue) =>
    revenue.costLines.map((line) => ({
      id: line.id,
      skill: line.skill,
      hourlyRate: line.hourlyRate,
      hours: line.hours,
    })),
  );

  const allBillingLines = revenues.flatMap((revenue) => revenue.billingLines);
  const billingLinesInPeriod = isMonthly
    ? allBillingLines.filter(
        (line) => line.dueDate >= monthStart && line.dueDate < monthEndExclusive,
      )
    : allBillingLines;

  const costTotalFromLines = sumCostLines(allCostLines);
  const billingTotalFromLines = sumBillingLines(
    allBillingLines.map((line) => ({
      milestone: line.milestone,
      installmentNumber: line.installmentNumber,
      dueDate: line.dueDate,
      amount: line.amount,
    })),
  );
  const contractedFromRevenues = revenues.reduce((sum, revenue) => sum + (revenue.contractedValue ?? 0), 0);
  const expectedFromRevenues = revenues.reduce((sum, revenue) => sum + (revenue.expectedRevenue ?? 0), 0);
  /** No modo completo, prioriza faturamento (parcelas) — valor total configurado na receita. */
  const valorTotalBase = isMonthly
    ? billingLinesInPeriod.reduce((sum, line) => sum + line.amount, 0)
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

  const billingLinesForBreakdown = isMonthly ? billingLinesInPeriod : allBillingLines;
  const valorTotalChildren: DashboardDetailRow[] =
    billingLinesForBreakdown.length > 0
      ? billingLinesForBreakdown.map((line) => ({
          id: line.id,
          label: line.milestone?.trim() || `Parcela ${line.installmentNumber}`,
          hours: null,
          amount: roundMoney(line.amount),
        }))
      : allCostLines.length > 0
        ? allCostLines.map((line) => ({
            id: line.id,
            label: line.skill,
            hours: line.hours,
            amount: costLineTotal(line),
          }))
        : [];

  const installmentCounts = revenues
    .map((revenue) => revenue.installmentCount ?? revenue.billingLines.length)
    .filter((count) => count > 0);
  const parcelas =
    installmentCounts.length > 0
      ? Math.max(...installmentCounts)
      : allBillingLines.length > 0
        ? allBillingLines.length
        : 0;

  let valorParcela: number | null = null;
  if (allBillingLines.length > 0) {
    if (isMonthly && billingLinesInPeriod.length > 0) {
      const sum = billingLinesInPeriod.reduce((acc, line) => acc + line.amount, 0);
      valorParcela = roundMoney(sum / billingLinesInPeriod.length);
    } else {
      const amounts = allBillingLines.map((line) => line.amount);
      const first = amounts[0] ?? 0;
      const allEqual = amounts.every((amount) => Math.abs(amount - first) < 0.01);
      valorParcela = allEqual ? roundMoney(first) : roundMoney(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    }
  } else if (parcelas > 0 && valorTotalBase > 0) {
    valorParcela = roundMoney(valorTotalBase / parcelas);
  }

  const clientReimbursementWhere = {
    tenantId,
    projectId: { in: projectIds },
    status: { not: "REJECTED" },
    paymentTo: "CONSULTOR",
    ...(isMonthly ? reimbursementDateFilter(year, month) : {}),
  };

  const clientReimbursements = await prisma.reimbursement.findMany({
    where: clientReimbursementWhere,
    select: {
      id: true,
      description: true,
      amountCents: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const reembolsoProjetoAmount = roundMoney(
    clientReimbursements.reduce((sum, row) => sum + row.amountCents, 0) / 100,
  );

  const reembolsoChildren: DashboardDetailRow[] = clientReimbursements.map((row) => ({
    id: row.id,
    label: row.user.name ? `${row.user.name} — ${row.description}` : row.description,
    hours: null,
    amount: roundMoney(row.amountCents / 100),
  }));

  const receitaTotal = roundMoney(valorTotalAmount + reembolsoProjetoAmount);

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

  const timeEntries = await prisma.timeEntry.findMany({
    where: timeEntryWhere,
    select: {
      userId: true,
      totalHoras: true,
      user: { select: { name: true } },
    },
  });

  const hoursByUser = new Map<string, { name: string; hours: number }>();
  for (const entry of timeEntries) {
    const current = hoursByUser.get(entry.userId) ?? { name: entry.user.name, hours: 0 };
    current.hours += entry.totalHoras;
    hoursByUser.set(entry.userId, current);
  }

  const plannedHours = allCostLines.reduce((sum, line) => sum + line.hours, 0);
  const blendedHourlyRate =
    plannedHours > 0 && valorTotalBase > 0 ? valorTotalBase / plannedHours : null;

  if (blendedHourlyRate == null && hoursByUser.size > 0) {
    notas.push(
      "Custo de operação estimado pela taxa média da composição de receita. Cadastre custos na receita do projeto para calcular valores.",
    );
  }

  const operacaoChildren: DashboardDetailRow[] = [...hoursByUser.entries()]
    .map(([userId, row]) => {
      const amount =
        blendedHourlyRate != null ? roundMoney(row.hours * blendedHourlyRate) : 0;
      return {
        id: userId,
        label: row.name,
        hours: roundMoney(row.hours * 100) / 100,
        amount,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const operacaoAmount = roundMoney(operacaoChildren.reduce((sum, row) => sum + row.amount, 0));

  const financialEntries = await prisma.financialEntry.findMany({
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
      payableInstallment: {
        select: {
          payable: { select: { kind: true, reimbursementId: true } },
        },
      },
    },
    orderBy: { entryDate: "asc" },
  });

  const operationalEntries = financialEntries.filter((entry) => {
    const payable = entry.payableInstallment?.payable;
    if (!payable) return true;
    return payable.kind !== "REEMBOLSO" && !payable.reimbursementId;
  });

  const despesasFromEntries: DashboardDetailRow[] = operationalEntries.map((entry) => ({
    id: entry.id,
    label: entry.description?.trim() || "Despesa operacional",
    hours: null,
    amount: roundMoney(entry.amountCents / 100),
  }));

  const payableAllocations = await prisma.payableAllocation.findMany({
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
  });

  const despesasFromOpenPayables: DashboardDetailRow[] = [];
  for (const allocation of payableAllocations) {
    const payable = allocation.payable;
    if (payable.totalAmountCents <= 0) continue;
    const share = allocation.amountCents / payable.totalAmountCents;

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
        label: `${payable.description} — parcela ${installment.installmentNumber} (em aberto)`,
        hours: null,
        amount,
      });
    }
  }

  const despesasOperacionaisChildren = [...despesasFromEntries, ...despesasFromOpenPayables].sort(
    (a, b) => a.label.localeCompare(b.label, "pt-BR"),
  );

  const despesasOperacionaisAmount = roundMoney(
    despesasOperacionaisChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const companyReimbursementWhere = {
    tenantId,
    projectId: { in: projectIds },
    status: { not: "REJECTED" },
    paymentTo: "EMPRESA",
    ...(isMonthly ? reimbursementDateFilter(year, month) : {}),
  };

  const companyReimbursements = await prisma.reimbursement.findMany({
    where: companyReimbursementWhere,
    select: {
      id: true,
      description: true,
      amountCents: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const despesaProjetoChildren: DashboardDetailRow[] = companyReimbursements.map((row) => ({
    id: row.id,
    label: row.user.name ? `${row.user.name} — ${row.description}` : row.description,
    hours: null,
    amount: roundMoney(row.amountCents / 100),
  }));

  const despesaProjetoAmount = roundMoney(
    despesaProjetoChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const despesaTotal = roundMoney(
    operacaoAmount + despesasOperacionaisAmount + despesaProjetoAmount,
  );

  const taxFromRevenues = computeTaxesFromRevenues(
    revenues.map((revenue) => ({
      costLines: revenue.costLines,
      billingLines: revenue.billingLines,
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
    valorTotalAmount > 0 && impostoTotal > 0
      ? roundMoney((impostoTotal / valorTotalAmount) * 10000) / 100
      : null;

  if (impostoChildren.length === 0) {
    const taxRate = parseTaxRatePercent(project.client.financial?.retencaoImpostos ?? null);
    impostoTotal = taxRate != null ? roundMoney(valorTotalAmount * taxRate) : 0;
    taxRatePercent = taxRate != null ? roundMoney(taxRate * 10000) / 100 : null;
    impostoLabel = "Imposto federal";

    if (taxRate == null && valorTotalAmount > 0) {
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
        label: "Despesa de projeto",
        amount: despesaProjetoAmount,
        expandable: despesaProjetoChildren.length > 0,
        children: despesaProjetoChildren,
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
