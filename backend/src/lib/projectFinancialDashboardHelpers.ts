import { prisma } from "./prisma.js";
import { activeTimeEntryWhere } from "./activeTimeEntryWhere.js";
import { costLineTotal, sumBillingLines, sumCostLines } from "./projectRevenueCompositionHelpers.js";
import {
  classifyReceivableRevenueAccount,
  isReembolsoReceivableAccountName,
} from "./receivableRevenueClassification.js";
import { buildHourlyRateResolver } from "./userHourlyRateHistory.js";

export type DashboardView = "completo" | "mensal";

export type DashboardDetailRow = {
  id: string;
  label: string;
  hours: number | null;
  amount: number;
};

/** Linha de despesa embutida na composição da receita. */
export type DashboardExpenseDetailRow = {
  id: string;
  description: string;
  typeName: string;
  quantity: number;
  unitValue: number;
  amount: number;
};

export type DashboardExpenseRow = {
  id: string;
  label: string;
  amount: number;
  expandable: boolean;
  children: DashboardExpenseDetailRow[];
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
    /** Despesas cadastradas na composição das receitas do projeto. */
    despesas: DashboardExpenseRow;
    reembolsoProjeto: DashboardExpandableRow;
    /** Outras receitas agrupadas pela conta financeira do plano de contas. */
    outrasReceitasPorConta: DashboardExpandableRow[];
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

function sameLabelText(a: string, b: string): boolean {
  return (
    a
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase() ===
    b
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
  );
}

type RevenueTaxInput = {
  costLines: Array<{ hourlyRate: number; hours: number; isDiscount?: boolean }>;
  billingLines: Array<{
    dueDate: Date;
    amount: number;
    /** Prev. pagamento (caixa); no Mensal tem prioridade sobre dueDate. */
    expectedPaymentDate?: Date | null;
  }>;
  taxType: { id: string; name: string; ratePercent: number | null } | null;
};

/**
 * Data do Mensal alinhada ao Contas a Receber:
 * Prev. pagamento, senão Data (competência/vencimento da parcela).
 * Não usa data de criação nem o mês do título da medição.
 */
function billingLineLedgerDate(line: {
  dueDate: Date;
  expectedPaymentDate?: Date | null;
}): Date {
  return line.expectedPaymentDate ?? line.dueDate;
}

function dateInPeriod(date: Date, monthStart: Date, monthEndExclusive: Date): boolean {
  return date >= monthStart && date < monthEndExclusive;
}

function billingLineInMonth(
  line: { dueDate: Date; expectedPaymentDate?: Date | null },
  monthStart: Date,
  monthEndExclusive: Date,
): boolean {
  return dateInPeriod(billingLineLedgerDate(line), monthStart, monthEndExclusive);
}

/** Contas a Pagar: Prev. pagamento (vencimento da parcela), senão competência. Nunca createdAt. */
function payableLedgerDate(parts: {
  dueDate?: Date | null;
  competenceDate?: Date | null;
}): Date | null {
  return parts.dueDate ?? parts.competenceDate ?? null;
}

/** Base tributável: faturamento bruto (parcelas), sem custos nem reembolsos. */
function revenueTaxBase(
  revenue: RevenueTaxInput,
  isMonthly: boolean,
  monthStart: Date,
  monthEndExclusive: Date,
): number {
  const lines = isMonthly
    ? revenue.billingLines.filter((line) => billingLineInMonth(line, monthStart, monthEndExclusive))
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

/**
 * Imposto acumulado do projeto (mesma regra do dashboard completo):
 * % do imposto da receita sobre as parcelas; se nenhuma receita tiver imposto,
 * usa retenção do cadastro financeiro do cliente sobre o faturamento bruto.
 */
export function computeAccumulatedProjectTaxAmount(
  revenues: RevenueTaxInput[],
  clientRetentionRaw?: string | null,
): number {
  const epoch = new Date(0);
  const taxFromRevenues = computeTaxesFromRevenues(revenues, false, epoch, epoch);
  if (taxFromRevenues.children.length > 0) return taxFromRevenues.total;

  const faturamentoBruto = roundMoney(
    revenues.reduce(
      (sum, revenue) =>
        sum + revenue.billingLines.reduce((lineSum, line) => lineSum + line.amount, 0),
      0,
    ),
  );
  const taxRate = parseTaxRatePercent(clientRetentionRaw);
  if (taxRate != null && faturamentoBruto > 0) {
    return roundMoney(faturamentoBruto * taxRate);
  }
  return 0;
}

function reimbursementDateFilter(year: number, month: number) {
  const { start, endExclusive } = monthBounds(year, month);
  // Competência da despesa (expenseDate) ou pagamento — sem data de criação.
  return {
    OR: [
      { expenseDate: { gte: start, lt: endExclusive } },
      {
        expenseDate: null,
        paidAt: { gte: start, lt: endExclusive },
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
  /**
   * Mensal: o mês do filtro = competência / Prev. pagamento (CR e CP),
   * no mesmo espírito do Contas a Receber/Pagar — nunca data de criação.
   */
  const filterPeriod = monthBounds(year, month);
  if (isMonthly) {
    notas.push(
      `Mensal (${formatPeriodLabel(year, month)}): receita e despesas pelo mês da Data/competência ou Prev. pagamento — não pela data de criação.`,
    );
  }

  const projectReimbursementWhere = {
    tenantId,
    projectId: { in: projectIds },
    status: { not: "REJECTED" },
    ...(isMonthly ? reimbursementDateFilter(year, month) : {}),
  };
  const timeEntryWhere = activeTimeEntryWhere({
    projectId: { in: projectIds },
    ...(isMonthly
      ? {
          date: {
            gte: filterPeriod.start,
            lt: filterPeriod.endExclusive,
          },
        }
      : {}),
  });

  const [revenues, projectReimbursements, timeEntries, financialEntries, payableAllocations, projectReceivables] =
    await Promise.all([
      prisma.projectRevenue.findMany({
        where: {
          tenantId,
          projectId: { in: projectIds },
          status: { not: "CANCELADO" },
        },
        include: {
          costLines: {
            orderBy: { sortOrder: "asc" },
            include: {
              reimbursementType: { select: { id: true, name: true } },
            },
          },
          billingLines: {
            orderBy: { sortOrder: "asc" },
          },
          taxType: { select: { id: true, name: true, ratePercent: true } },
          receivable: {
            select: {
              financialAccount: { select: { id: true, name: true, dreSubcategory: true } },
            },
          },
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
          date: true,
          totalHoras: true,
          user: { select: { name: true } },
        },
      }),
      prisma.financialEntry.findMany({
        where: {
          tenantId,
          projectId: { in: projectIds },
          type: "DESPESA",
          status: "LANCADO",
          // Mensal: Prev. pagamento (vencimento da parcela) ou competência — não criação.
          ...(isMonthly
            ? {
                OR: [
                  {
                    payableInstallment: {
                      dueDate: {
                        gte: filterPeriod.start,
                        lt: filterPeriod.endExclusive,
                      },
                    },
                  },
                  {
                    payableInstallment: {
                      payable: {
                        competenceDate: {
                          gte: filterPeriod.start,
                          lt: filterPeriod.endExclusive,
                        },
                      },
                    },
                  },
                  {
                    AND: [
                      { payableInstallmentId: null },
                      {
                        entryDate: {
                          gte: filterPeriod.start,
                          lt: filterPeriod.endExclusive,
                        },
                      },
                    ],
                  },
                ],
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
              dueDate: true,
              payable: {
                select: {
                  kind: true,
                  reimbursementId: true,
                  description: true,
                  createdAt: true,
                  competenceDate: true,
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
              competenceDate: true,
              payeeName: true,
              supplier: { select: { nomeApelido: true } },
              professional: { select: { name: true } },
              installments: {
                where: {
                  status: { in: ["ABERTO", "VENCIDO"] },
                  ...(isMonthly
                    ? {
                        OR: [
                          {
                            dueDate: {
                              gte: filterPeriod.start,
                              lt: filterPeriod.endExclusive,
                            },
                          },
                          {
                            payable: {
                              competenceDate: {
                                gte: filterPeriod.start,
                                lt: filterPeriod.endExclusive,
                              },
                            },
                          },
                        ],
                      }
                    : {}),
                },
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
          status: { not: "CANCELADO" },
          projectRevenueId: null,
          // Prisma/SQL: `not: "REIMBURSEMENT"` exclui sourceType NULL (CR manual).
          OR: [{ sourceType: null }, { sourceType: { not: "REIMBURSEMENT" } }],
          AND: [
            {
              OR: [
                { projectId: { in: projectIds } },
                { allocations: { some: { projectId: { in: projectIds } } } },
              ],
            },
            ...(isMonthly
              ? [
                  {
                    OR: [
                      {
                        competenceDate: {
                          gte: filterPeriod.start,
                          lt: filterPeriod.endExclusive,
                        },
                      },
                      {
                        installments: {
                          some: {
                            status: { not: "CANCELADO" },
                            OR: [
                              {
                                dueDate: {
                                  gte: filterPeriod.start,
                                  lt: filterPeriod.endExclusive,
                                },
                              },
                              {
                                competenceDate: {
                                  gte: filterPeriod.start,
                                  lt: filterPeriod.endExclusive,
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          description: true,
          notes: true,
          contractTitle: true,
          totalAmountCents: true,
          projectId: true,
          competenceDate: true,
          createdAt: true,
          client: { select: { name: true } },
          financialAccount: { select: { id: true, name: true, dreSubcategory: true } },
          allocations: {
            where: { projectId: { in: projectIds } },
            select: { amountCents: true, projectId: true },
          },
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
      isExpense: line.isExpense === true,
      reimbursementTypeName: line.reimbursementType?.name ?? null,
    })),
  );

  const expenseChildren: DashboardExpenseDetailRow[] = allCostLines
    .filter((line) => line.isExpense)
    .map((line) => ({
      id: `expense-${line.id}`,
      description: line.skill?.trim() || "—",
      typeName: line.reimbursementTypeName?.trim() || "—",
      quantity: roundMoney(line.hours),
      unitValue: roundMoney(line.hourlyRate),
      amount: roundMoney(costLineTotal(line)),
    }))
    .sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));
  const despesasAmount = roundMoney(
    expenseChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const isFaturamentoRevenue = (revenue: (typeof revenues)[number]) => {
    const sub = classifyReceivableRevenueAccount(revenue.receivable?.financialAccount);
    // Sem CR vinculada (receita cadastrada na UI): conta como faturamento.
    if (sub == null) return true;
    return sub === "FATURAMENTO";
  };

  const faturamentoRevenues = revenues.filter(isFaturamentoRevenue);

  const allBillingLines = faturamentoRevenues.flatMap((revenue) =>
    revenue.billingLines.map((line) => ({
      ...line,
      revenueTitle: revenue.title,
    })),
  );
  // Mensal: Prev. pagamento ou Data da parcela no mês do filtro (como no Contas a Receber).
  // Completo: todas as parcelas (inalterado).
  const billingLinesInPeriod = isMonthly
    ? allBillingLines.filter((line) =>
        billingLineInMonth(line, filterPeriod.start, filterPeriod.endExclusive),
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
  const contractedFromRevenues = faturamentoRevenues.reduce(
    (sum, revenue) => sum + (revenue.contractedValue ?? 0),
    0,
  );
  const expectedFromRevenues = faturamentoRevenues.reduce(
    (sum, revenue) => sum + (revenue.expectedRevenue ?? 0),
    0,
  );
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
  /** Faturamento bruto para imposto — apenas parcelas, sem reembolsos nem fallback de custos. */
  const faturamentoBrutoImposto = roundMoney(
    isMonthly
      ? billingLinesInPeriod.reduce((sum, line) => sum + line.amount, 0)
      : billingTotalFromLines,
  );

  const billingLinesForBreakdown = billingLinesInPeriod;
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

  const installmentCounts = faturamentoRevenues
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
      valorParcela = allEqual
        ? roundMoney(first)
        : roundMoney(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    }
  } else if (parcelas > 0 && valorTotalBase > 0) {
    valorParcela = roundMoney(valorTotalBase / parcelas);
  }

  // Reembolso de projeto = solicitações do módulo + CRs de conta "Reembolso".
  // Despesas de projeto espelha só o módulo (não as CRs), para não misturar receita com despesa.
  const reimbursementDashboardRows: DashboardDetailRow[] = projectReimbursements.map((row) => ({
    id: row.id,
    label: `Solicitação — ${formatExpenseDetailLabel({
      party: row.user.name,
      activity: row.description,
      date: row.createdAt,
    })}`,
    hours: null,
    amount: roundMoney(row.amountCents / 100),
  }));

  const reembolsoReceivableRows: DashboardDetailRow[] = [];
  // Outras receitas: CR OUTRAS_RECEITAS que não são conta de reembolso.
  const outrasByAccount = new Map<
    string,
    { accountId: string; accountName: string; children: DashboardDetailRow[]; amount: number }
  >();
  for (const row of projectReceivables) {
    if (classifyReceivableRevenueAccount(row.financialAccount) !== "OUTRAS_RECEITAS") {
      continue;
    }
    const accountId = row.financialAccount?.id ?? "__sem_conta__";
    const accountName = row.financialAccount?.name?.trim() || "Outras receitas";
    // Header do projeto: valor cheio. Só rateio: soma das alocações deste projeto.
    const amountCents =
      row.projectId && projectIds.includes(row.projectId)
        ? row.totalAmountCents
        : row.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    if (amountCents <= 0) continue;
    const amount = roundMoney(amountCents / 100);
    const desc = row.description?.trim() || "";
    const notes = row.notes?.trim() || "";
    const contract = row.contractTitle?.trim() || "";
    const activityParts = [
      desc && !sameLabelText(desc, accountName) ? desc : null,
      contract || null,
      notes || null,
    ].filter(Boolean) as string[];
    const activity =
      activityParts.length > 0 ? activityParts.join(" · ") : desc || accountName;
    const detailLabel = formatExpenseDetailLabel({
      party: row.client?.name,
      activity,
      date: row.competenceDate ?? row.createdAt,
    });

    if (isReembolsoReceivableAccountName(accountName)) {
      reembolsoReceivableRows.push({
        id: `recv-reembolso-${row.id}`,
        label: `CR — ${detailLabel}`,
        hours: null,
        amount,
      });
      continue;
    }

    const current = outrasByAccount.get(accountId) ?? {
      accountId,
      accountName,
      children: [],
      amount: 0,
    };
    current.children.push({
      id: `recv-outras-${row.id}`,
      label: detailLabel,
      hours: null,
      amount,
    });
    current.amount = roundMoney(current.amount + amount);
    outrasByAccount.set(accountId, current);
  }

  const reembolsoChildren = [...reimbursementDashboardRows, ...reembolsoReceivableRows].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
  const reembolsoProjetoAmount = roundMoney(
    reembolsoChildren.reduce((sum, row) => sum + row.amount, 0),
  );

  const outrasReceitasPorConta: DashboardExpandableRow[] = [...outrasByAccount.values()]
    .sort((a, b) => a.accountName.localeCompare(b.accountName, "pt-BR"))
    .map((group) => ({
      id: `outras-conta-${group.accountId}`,
      label: group.accountName,
      amount: group.amount,
      expandable: group.children.length > 0,
      children: group.children,
    }));

  const outrasReceitasAmount = roundMoney(
    outrasReceitasPorConta.reduce((sum, row) => sum + row.amount, 0),
  );

  const receitaTotal = roundMoney(
    valorTotalAmount + reembolsoProjetoAmount + outrasReceitasAmount,
  );

  // Custo por apontamento usa a taxa vigente na data, para não reescrever períodos já fechados.
  const resolveHourlyRate = await buildHourlyRateResolver(timeEntries.map((e) => e.userId));
  const hoursByUser = new Map<
    string,
    { name: string; hours: number; ratedCost: number; hoursWithoutRate: number }
  >();
  for (const entry of timeEntries) {
    const current = hoursByUser.get(entry.userId) ?? {
      name: entry.user.name,
      hours: 0,
      ratedCost: 0,
      hoursWithoutRate: 0,
    };
    current.hours += entry.totalHoras;
    const rate = resolveHourlyRate(entry.userId, entry.date);
    if (rate != null && rate > 0) {
      current.ratedCost += entry.totalHoras * rate;
    } else {
      current.hoursWithoutRate += entry.totalHoras;
    }
    hoursByUser.set(entry.userId, current);
  }

  const plannedHours = allCostLines
    .filter((line) => !line.isDiscount && !line.isExpense)
    .reduce((sum, line) => sum + line.hours, 0);
  const blendedHourlyRate =
    plannedHours > 0 && valorTotalBase > 0 ? valorTotalBase / plannedHours : null;

  let usersWithoutHourlyRate = 0;
  const operacaoChildren: DashboardDetailRow[] = [...hoursByUser.entries()]
    .map(([userId, row]) => {
      if (row.hoursWithoutRate > 0) usersWithoutHourlyRate += 1;
      const fallbackCost =
        blendedHourlyRate != null ? row.hoursWithoutRate * blendedHourlyRate : 0;
      return {
        id: userId,
        label: row.name,
        hours: roundMoney(row.hours * 100) / 100,
        amount: roundMoney(row.ratedCost + fallbackCost),
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

  /** Mesmo formato nas duas linhas: responsável/empresa — atividade — data. */
  const despesasFromEntries: DashboardDetailRow[] = operationalEntries.map((entry) => {
    const installment = entry.payableInstallment;
    const payable = installment?.payable;
    const party =
      payable?.supplier?.nomeApelido ||
      payable?.professional?.name ||
      payable?.payeeName ||
      entry.supplier?.nomeApelido ||
      entry.createdBy?.name ||
      null;
    const activity = entry.description?.trim() || payable?.description?.trim() || "Atividade";
    const date =
      payableLedgerDate({
        dueDate: installment?.dueDate,
        competenceDate: payable?.competenceDate,
      }) ?? entry.entryDate;
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
      const ledger = payableLedgerDate({
        dueDate: installment.dueDate,
        competenceDate: payable.competenceDate,
      });
      if (
        isMonthly &&
        (!ledger || !dateInPeriod(ledger, filterPeriod.start, filterPeriod.endExclusive))
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
          date: ledger ?? installment.dueDate,
        }),
        hours: null,
        amount,
      });
    }
  }

  /**
   * Despesas de projeto = solicitações do módulo de reembolsos (reembolsáveis pelo cliente).
   * Não inclui CRs de conta Reembolso — essas entram só em Receita > Reembolso de projeto.
   * Despesas operacionais = custos da própria empresa no projeto (lançamentos/CPs).
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
    faturamentoRevenues.map((revenue) => ({
      costLines: revenue.costLines,
      billingLines: revenue.billingLines.map((line) => ({
        dueDate: line.dueDate,
        amount: line.amount,
        expectedPaymentDate: line.expectedPaymentDate ?? null,
      })),
      taxType: revenue.taxType,
    })),
    isMonthly,
    filterPeriod.start,
    filterPeriod.endExclusive,
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
    periodLabel: isMonthly
      ? `Competência / Prev. pagamento · ${formatPeriodLabel(year, month)}`
      : "Acumulado",
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
      despesas: {
        id: "despesas-receita",
        label: "Despesas",
        amount: despesasAmount,
        expandable: expenseChildren.length > 0,
        children: expenseChildren,
      },
      reembolsoProjeto: {
        id: "reembolso-projeto",
        label: "Reembolso de projeto",
        amount: reembolsoProjetoAmount,
        expandable: reembolsoChildren.length > 0,
        children: reembolsoChildren,
      },
      outrasReceitasPorConta,
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
