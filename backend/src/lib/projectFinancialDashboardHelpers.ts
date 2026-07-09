import { prisma } from "./prisma.js";
import { costLineTotal, sumCostLines } from "./projectRevenueCompositionHelpers.js";

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
  const contractedFromRevenues = revenues.reduce((sum, revenue) => sum + (revenue.contractedValue ?? 0), 0);
  const valorTotalBase =
    costTotalFromLines > 0
      ? costTotalFromLines
      : contractedFromRevenues > 0
        ? contractedFromRevenues
        : (project.valorContrato ?? 0);

  const valorTotalAmount = isMonthly
    ? roundMoney(billingLinesInPeriod.reduce((sum, line) => sum + line.amount, 0))
    : roundMoney(valorTotalBase);

  const valorTotalChildren: DashboardDetailRow[] = allCostLines.map((line) => ({
    id: line.id,
    label: line.skill,
    hours: line.hours,
    amount: costLineTotal(line),
  }));

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

  const despesasOperacionaisChildren: DashboardDetailRow[] = operationalEntries.map((entry) => ({
    id: entry.id,
    label: entry.description?.trim() || "Despesa operacional",
    hours: null,
    amount: roundMoney(entry.amountCents / 100),
  }));

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

  const taxRate = parseTaxRatePercent(project.client.financial?.retencaoImpostos ?? null);
  const impostoFederalAmount =
    taxRate != null ? roundMoney(valorTotalAmount * taxRate) : 0;

  if (taxRate == null && valorTotalAmount > 0) {
    notas.push(
      "Imposto federal não calculado: cadastre retenção de impostos no cadastro financeiro do cliente.",
    );
  }

  const resultadoBruto = roundMoney(receitaTotal - despesaTotal);
  const resultadoLiquido = roundMoney(resultadoBruto - impostoFederalAmount);

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
        id: "imposto-federal",
        label: "Imposto federal",
        amount: impostoFederalAmount,
        expandable: false,
        children: [],
      },
      taxRatePercent: taxRate != null ? roundMoney(taxRate * 10000) / 100 : null,
      total: impostoFederalAmount,
    },
    resultado: {
      bruto: resultadoBruto,
      liquido: resultadoLiquido,
    },
    notas,
  };
}
