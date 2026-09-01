import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { activeTimeEntryWhere } from "../lib/activeTimeEntryWhere.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import {
  getBrasilCalendarMonthBoundsForStamp,
} from "../lib/brasilCalendarMonthBounds.js";
import {
  buildRevenueHistoryEntries,
  parseProjectRevenueWriteBody,
  REVENUE_FIELD_LABELS,
} from "../lib/projectRevenueHelpers.js";
import {
  applyAutoBillingAmounts,
  costLineTotal,
  defaultBillingLines,
  netCostTotal,
  parseBillingLinesInput,
  parseCostLinesInput,
  syncRevenueTotalsFromComposition,
  type BillingLineInput,
  type CostLineInput,
} from "../lib/projectRevenueCompositionHelpers.js";
import {
  buildVariableBillingLines,
  parseVariableRevenueEntries,
  type VariableRevenueEntryInput,
} from "../lib/projectRevenueVariableHelpers.js";
import {
  disposeReceivableForProjectRevenue,
  syncReceivableFromProjectRevenue,
} from "../lib/createReceivableFromProjectRevenue.js";

export const projectRevenuesRouter = Router();
projectRevenuesRouter.use(authMiddleware);

const FEATURE = "financeiro.projetos.receitas" as const;

type AuthUser = { id: string; tenantId: string; role: string };

const revenueInclude = {
  billingType: { select: { id: true, code: true, name: true } },
  taxType: { select: { id: true, name: true, ratePercent: true, isActive: true } },
  costLines: { orderBy: { sortOrder: "asc" as const } },
  billingLines: { orderBy: { sortOrder: "asc" as const } },
  variableEntries: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      billingLines: { orderBy: { sortOrder: "asc" as const } },
      costLines: { orderBy: { sortOrder: "asc" as const } },
    },
  },
  _count: { select: { history: true } },
};

function mapCostLineRow(line: {
  id: string;
  skill: string;
  hourlyRate: number;
  hours: number;
  isDiscount: boolean;
  sortOrder: number;
}) {
  return {
    id: line.id,
    skill: line.skill,
    hourlyRate: line.hourlyRate,
    hours: line.hours,
    isDiscount: line.isDiscount,
    totalValue: costLineTotal(line),
    sortOrder: line.sortOrder,
  };
}

function mapBillingLineRow(line: {
  id: string;
  milestone: string | null;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  sortOrder: number;
  variableEntryId?: string | null;
}) {
  return {
    id: line.id,
    milestone: line.milestone,
    installmentNumber: line.installmentNumber,
    dueDate: line.dueDate,
    amount: line.amount,
    sortOrder: line.sortOrder,
    variableEntryId: line.variableEntryId ?? null,
  };
}

function mapRevenueRow(row: {
  id: string;
  projectId: string;
  title: string | null;
  revenueType: string;
  contractProposal: string | null;
  paymentMethod: string | null;
  billingTypeId: string | null;
  contractedValue: number | null;
  expectedRevenue: number | null;
  realizedRevenue: number | null;
  installmentCount: number | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  isAdditive: boolean;
  autoBillingCalculation: boolean;
  taxTypeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  billingType: { id: string; code: string; name: string } | null;
  costLines?: Array<{
    id: string;
    skill: string;
    hourlyRate: number;
    hours: number;
    isDiscount: boolean;
    sortOrder: number;
  }>;
  billingLines?: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: Date;
    amount: number;
    sortOrder: number;
  }>;
  variableEntries?: Array<{
    id: string;
    title: string | null;
    competenceDate: Date;
    description: string | null;
    hours: number | null;
    hourlyRate: number | null;
    amount: number;
    installmentCount: number;
    firstDueDate: Date;
    sortOrder: number;
    billingLines: Array<{
      id: string;
      milestone: string | null;
      installmentNumber: number;
      dueDate: Date;
      amount: number;
    }>;
    costLines?: Array<{
      id: string;
      skill: string;
      hourlyRate: number;
      hours: number;
      sortOrder: number;
    }>;
  }>;
  _count: { history: number };
  taxType?: { id: string; name: string; ratePercent: number | null; isActive: boolean } | null;
}) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    revenueType: row.revenueType,
    contractProposal: row.contractProposal,
    paymentMethod: row.paymentMethod,
    billingTypeId: row.billingTypeId,
    billingTypeCode: row.billingType?.code ?? null,
    billingTypeName: row.billingType?.name ?? null,
    contractedValue: row.contractedValue,
    expectedRevenue: row.expectedRevenue,
    realizedRevenue: row.realizedRevenue,
    installmentCount: row.installmentCount,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    isAdditive: row.isAdditive,
    autoBillingCalculation: row.autoBillingCalculation,
    taxTypeId: row.taxTypeId ?? null,
    taxTypeName: row.taxType?.name ?? null,
    taxRatePercent: row.taxType?.ratePercent ?? null,
    costLines: row.costLines?.map(mapCostLineRow) ?? [],
    billingLines: row.billingLines?.map(mapBillingLineRow) ?? [],
    variableEntries:
      row.variableEntries?.map((entry) => ({
        id: entry.id,
        title: entry.title,
        competenceDate: entry.competenceDate,
        description: entry.description,
        hours: entry.hours,
        hourlyRate: entry.hourlyRate,
        amount: entry.amount,
        installmentCount: entry.installmentCount,
        firstDueDate: entry.firstDueDate,
        sortOrder: entry.sortOrder,
        billingLines: entry.billingLines.map((line) => ({
          id: line.id,
          milestone: line.milestone,
          installmentNumber: line.installmentNumber,
          dueDate: line.dueDate,
          amount: line.amount,
        })),
        costLines: entry.costLines?.map(mapCostLineRow) ?? [],
        isLocked: entry.billingLines.some((line) => {
          const now = new Date();
          const today = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          );
          return line.dueDate < today;
        }),
      })) ?? [],
    historyCount: row._count.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type CompositionPayload = {
  autoBillingCalculation?: boolean;
  costLines?: CostLineInput[];
  billingLines?: BillingLineInput[];
  taxTypeId?: string | null;
  variableEntries?: VariableRevenueEntryInput[];
};

function parseCompositionPayload(body: unknown): { ok: true; data: CompositionPayload } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: CompositionPayload = {};

  if (b.autoBillingCalculation !== undefined) {
    data.autoBillingCalculation = b.autoBillingCalculation === true;
  }
  if (b.costLines !== undefined) {
    const parsed = parseCostLinesInput(b.costLines);
    if (parsed.ok === false) return parsed;
    data.costLines = parsed.data;
  }
  if (b.billingLines !== undefined) {
    const parsed = parseBillingLinesInput(b.billingLines);
    if (parsed.ok === false) return parsed;
    data.billingLines = parsed.data;
  }
  if (b.taxTypeId !== undefined) {
    const raw = b.taxTypeId;
    data.taxTypeId = raw == null || raw === "" ? null : String(raw).trim();
  }
  if (b.variableEntries !== undefined) {
    const parsed = parseVariableRevenueEntries(b.variableEntries);
    if (parsed.ok === false) return parsed;
    data.variableEntries = parsed.data;
  }

  return { ok: true, data };
}

async function replaceRevenueComposition(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  revenueId: string,
  autoBillingCalculation: boolean,
  costLines: CostLineInput[],
  billingLines: BillingLineInput[],
) {
  const costTotal = netCostTotal(costLines);
  const normalizedBilling = autoBillingCalculation
    ? applyAutoBillingAmounts(costTotal, billingLines)
    : billingLines;
  const totals = syncRevenueTotalsFromComposition(costLines, normalizedBilling);

  await tx.projectRevenueCostLine.deleteMany({ where: { revenueId } });
  await tx.projectRevenueBillingLine.deleteMany({ where: { revenueId } });

  if (costLines.length > 0) {
    await tx.projectRevenueCostLine.createMany({
      data: costLines.map((line, index) => ({
        revenueId,
        skill: line.skill,
        hourlyRate: line.hourlyRate,
        hours: line.hours,
        isDiscount: line.isDiscount === true,
        sortOrder: line.sortOrder ?? index,
      })),
    });
  }
  if (normalizedBilling.length > 0) {
    await tx.projectRevenueBillingLine.createMany({
      data: normalizedBilling.map((line, index) => ({
        revenueId,
        milestone: line.milestone ?? null,
        installmentNumber: line.installmentNumber,
        dueDate: line.dueDate,
        amount: line.amount,
        sortOrder: line.sortOrder ?? index,
      })),
    });
  }

  return {
    autoBillingCalculation,
    ...totals,
  };
}

async function replaceVariableRevenue(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  revenueId: string,
  entries: VariableRevenueEntryInput[],
) {
  const generatedLines = buildVariableBillingLines(entries);
  await tx.projectRevenueBillingLine.deleteMany({ where: { revenueId } });
  await tx.projectRevenueCostLine.deleteMany({ where: { revenueId } });
  await tx.projectRevenueVariableEntry.deleteMany({ where: { revenueId } });

  const entryIds: string[] = [];
  for (const entry of entries) {
    const created = await tx.projectRevenueVariableEntry.create({
      data: {
        revenueId,
        title: entry.title,
        competenceDate: entry.competenceDate,
        description: entry.description,
        hours: entry.hours,
        hourlyRate: entry.hourlyRate,
        amount: entry.amount,
        installmentCount: entry.installmentCount,
        firstDueDate: entry.firstDueDate,
        sortOrder: entry.sortOrder,
      },
      select: { id: true },
    });
    entryIds.push(created.id);
    if (entry.costLines.length > 0) {
      await tx.projectRevenueVariableCostLine.createMany({
        data: entry.costLines.map((line, lineIndex) => ({
          variableEntryId: created.id,
          skill: line.skill,
          hourlyRate: line.hourlyRate,
          hours: line.hours,
          sortOrder: line.sortOrder ?? lineIndex,
        })),
      });
    }
  }
  if (generatedLines.length > 0) {
    await tx.projectRevenueBillingLine.createMany({
      data: generatedLines.map((line) => ({
        revenueId,
        variableEntryId: entryIds[line.variableEntryIndex]!,
        milestone: line.milestone ?? null,
        installmentNumber: line.installmentNumber,
        dueDate: line.dueDate,
        amount: line.amount,
        sortOrder: line.sortOrder ?? 0,
      })),
    });
  }

  const billingLines = generatedLines.map((line) => ({
    milestone: line.milestone,
    installmentNumber: line.installmentNumber,
    dueDate: line.dueDate,
    amount: line.amount,
    sortOrder: line.sortOrder,
  }));
  return {
    autoBillingCalculation: false,
    contractedValue: null,
    ...syncRevenueTotalsFromComposition([], billingLines),
  };
}

async function assertProjectAccess(user: AuthUser, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    select: { id: true },
  });
  if (!project) return false;
  return userCanAccessProject(prisma, user, projectId);
}

async function getBillingTypeNames(tenantId: string): Promise<Map<string, string>> {
  const rows = await prisma.projectBillingType.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function validateBillingTypeId(tenantId: string, billingTypeId: string | null | undefined) {
  if (!billingTypeId) return { ok: true as const };
  const bt = await prisma.projectBillingType.findFirst({
    where: { id: billingTypeId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!bt) return { ok: false as const, error: "Tipo de cobrança inválido ou inativo." };
  return { ok: true as const };
}

async function validateTaxTypeId(tenantId: string, taxTypeId: string | null | undefined) {
  if (!taxTypeId) return { ok: true as const };
  const tax = await prisma.taxType.findFirst({
    where: { id: taxTypeId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!tax) return { ok: false as const, error: "Imposto inválido ou inativo." };
  return { ok: true as const };
}

async function fillVariableEntryWorkedHours(
  tenantId: string,
  projectId: string,
  entries: VariableRevenueEntryInput[],
): Promise<VariableRevenueEntryInput[]> {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Promise.all(
    entries.map(async (entry) => {
      const hasPastBilling = entry.billingLines.some((line) => line.dueDate < todayUtc);
      if (hasPastBilling && entry.amount > 0) {
        return entry;
      }
      const stamp = entry.competenceDate.toISOString().slice(0, 7);
      const bounds = getBrasilCalendarMonthBoundsForStamp(stamp);
      if (!bounds) return entry;
      const aggregate = await prisma.timeEntry.aggregate({
        where: activeTimeEntryWhere({
          projectId,
          project: { client: { tenantId } },
          date: { gte: bounds.start, lt: bounds.endExclusive },
        }),
        _sum: { totalHoras: true },
      });
      const totalHours = Math.round((aggregate._sum.totalHoras ?? 0) * 100) / 100;
      return {
        ...entry,
        hours: totalHours > 0 ? totalHours : entry.hours,
      };
    }),
  );
}

projectRevenuesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.query.projectId ?? "").trim();
  if (!projectId) {
    res.status(400).json({ error: "projectId é obrigatório." });
    return;
  }
  if (!(await assertProjectAccess(user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);
  const rows = await prisma.projectRevenue.findMany({
    where: { tenantId: user.tenantId, projectId, status: { not: "CANCELADO" } },
    orderBy: [{ createdAt: "asc" }],
    include: revenueInclude,
  });
  res.json(rows.map(mapRevenueRow));
});

projectRevenuesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.body?.projectId ?? "").trim();
  if (!projectId) {
    res.status(400).json({ error: "projectId é obrigatório." });
    return;
  }
  if (!(await assertProjectAccess(user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  const parsed = parseProjectRevenueWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const compositionParsed = parseCompositionPayload(req.body);
  if (compositionParsed.ok === false) {
    res.status(400).json({ error: compositionParsed.error });
    return;
  }
  const btCheck = await validateBillingTypeId(user.tenantId, parsed.data.billingTypeId);
  if (btCheck.ok === false) {
    res.status(400).json({ error: btCheck.error });
    return;
  }
  const taxCheck = await validateTaxTypeId(user.tenantId, compositionParsed.data.taxTypeId);
  if (taxCheck.ok === false) {
    res.status(400).json({ error: taxCheck.error });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);
  const revenueType = parsed.data.revenueType ?? "FIXA";
  const variableEntries =
    parsed.data.revenueType === "VARIAVEL"
      ? await fillVariableEntryWorkedHours(
          user.tenantId,
          projectId,
          compositionParsed.data.variableEntries ?? [],
        )
      : [];
  if (revenueType === "VARIAVEL" && variableEntries.length === 0) {
    res.status(400).json({ error: "Adicione ao menos uma medição à receita variável." });
    return;
  }
  const existingCount = await prisma.projectRevenue.count({
    where: { tenantId: user.tenantId, projectId },
  });
  const title =
    parsed.data.title?.trim() ||
    `Receita ${existingCount + 1}`;
  const autoBillingCalculation =
    revenueType === "FIXA"
      ? (compositionParsed.data.autoBillingCalculation ?? true)
      : false;
  const costLines = compositionParsed.data.costLines ?? [];
  const billingLines = compositionParsed.data.billingLines ?? defaultBillingLines();
  const variableBillingLines = buildVariableBillingLines(variableEntries);
  const compositionTotals =
    revenueType === "FIXA"
      ? syncRevenueTotalsFromComposition(
          costLines,
          autoBillingCalculation
            ? applyAutoBillingAmounts(netCostTotal(costLines), billingLines)
            : billingLines,
        )
      : syncRevenueTotalsFromComposition([], variableBillingLines);
  const created = await prisma.$transaction(async (tx) => {
    const revenue = await tx.projectRevenue.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        title,
        revenueType,
        contractProposal: parsed.data.contractProposal ?? null,
        paymentMethod: parsed.data.paymentMethod ?? null,
        billingTypeId: parsed.data.billingTypeId ?? null,
        contractedValue:
          revenueType === "FIXA"
            ? (compositionTotals.contractedValue ?? parsed.data.contractedValue ?? null)
            : null,
        expectedRevenue: compositionTotals.expectedRevenue ?? parsed.data.expectedRevenue ?? null,
        realizedRevenue: parsed.data.realizedRevenue ?? null,
        installmentCount: compositionTotals.installmentCount ?? parsed.data.installmentCount ?? null,
        startDate: compositionTotals.startDate ?? parsed.data.startDate ?? null,
        endDate: compositionTotals.endDate ?? parsed.data.endDate ?? null,
        status: parsed.data.status ?? "NEGOCIACAO",
        isAdditive: parsed.data.isAdditive === true,
        autoBillingCalculation,
        taxTypeId: compositionParsed.data.taxTypeId ?? null,
      },
    });
    if (revenueType === "VARIAVEL") {
      await replaceVariableRevenue(tx, revenue.id, variableEntries);
    } else if (costLines.length > 0 || billingLines.length > 0) {
      await replaceRevenueComposition(tx, revenue.id, autoBillingCalculation, costLines, billingLines);
    }
    await tx.projectRevenueHistory.create({
      data: {
        revenueId: revenue.id,
        userId: user.id,
        action: "CREATE",
        details: revenue.title ?? "Receita criada",
      },
    });
    return tx.projectRevenue.findFirstOrThrow({
      where: { id: revenue.id },
      include: revenueInclude,
    });
  });
  await syncReceivableFromProjectRevenue(user.tenantId, user.id, created.id).catch(() => null);
  res.status(201).json(mapRevenueRow(created));
});

projectRevenuesRouter.get("/worked-hours", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.query.projectId ?? "").trim();
  const competence = String(req.query.competence ?? "").trim();
  if (!projectId || !/^\d{4}-\d{2}$/.test(competence)) {
    res.status(400).json({ error: "Projeto e mês de referência (AAAA-MM) são obrigatórios." });
    return;
  }
  if (!(await assertProjectAccess(user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  const bounds = getBrasilCalendarMonthBoundsForStamp(competence);
  if (!bounds) {
    res.status(400).json({ error: "Mês de referência inválido." });
    return;
  }
  const aggregate = await prisma.timeEntry.aggregate({
    where: activeTimeEntryWhere({
      projectId,
      project: { client: { tenantId: user.tenantId } },
      date: { gte: bounds.start, lt: bounds.endExclusive },
    }),
    _sum: { totalHoras: true },
  });
  res.json({
    projectId,
    competence,
    hoursMonth: bounds.hoursMonth,
    totalHours: Math.round((aggregate._sum.totalHoras ?? 0) * 100) / 100,
  });
});

projectRevenuesRouter.get("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const revenue = await prisma.projectRevenue.findFirst({
    where: { id, tenantId: user.tenantId },
    include: revenueInclude,
  });
  if (!revenue || !(await assertProjectAccess(user, revenue.projectId))) {
    res.status(404).json({ error: "Receita não encontrada." });
    return;
  }
  res.json(mapRevenueRow(revenue));
});

projectRevenuesRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const revenue = await prisma.projectRevenue.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, projectId: true },
  });
  if (!revenue || !(await assertProjectAccess(user, revenue.projectId))) {
    res.status(404).json({ error: "Receita não encontrada." });
    return;
  }
  const rows = await prisma.projectRevenueHistory.findMany({
    where: { revenueId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      field: row.field,
      fieldLabel: row.field ? (REVENUE_FIELD_LABELS[row.field] ?? row.field) : null,
      oldValue: row.oldValue,
      newValue: row.newValue,
      details: row.details,
      createdAt: row.createdAt,
      user: row.user,
    })),
  );
});

projectRevenuesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectRevenue.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { billingLines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing || !(await assertProjectAccess(user, existing.projectId))) {
    res.status(404).json({ error: "Receita não encontrada." });
    return;
  }
  const parsed = parseProjectRevenueWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const compositionParsed = parseCompositionPayload(req.body);
  if (compositionParsed.ok === false) {
    res.status(400).json({ error: compositionParsed.error });
    return;
  }
  const hasCompositionUpdate =
    compositionParsed.data.costLines !== undefined ||
    compositionParsed.data.billingLines !== undefined ||
    compositionParsed.data.autoBillingCalculation !== undefined ||
    compositionParsed.data.taxTypeId !== undefined ||
    compositionParsed.data.variableEntries !== undefined;
  if (Object.keys(parsed.data).length === 0 && !hasCompositionUpdate) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }
  if (parsed.data.revenueType && parsed.data.revenueType !== existing.revenueType) {
    res.status(400).json({
      error: "O tipo da receita não pode ser alterado depois da criação.",
    });
    return;
  }
  if (existing.revenueType === "FIXA" && compositionParsed.data.variableEntries !== undefined) {
    res.status(400).json({ error: "Medições só podem ser usadas em receita variável." });
    return;
  }
  if (
    existing.revenueType === "VARIAVEL" &&
    (compositionParsed.data.costLines !== undefined ||
      compositionParsed.data.billingLines !== undefined)
  ) {
    res.status(400).json({
      error: "A composição fixa não pode ser usada em receita variável.",
    });
    return;
  }
  const btCheck = await validateBillingTypeId(user.tenantId, parsed.data.billingTypeId);
  if (btCheck.ok === false) {
    res.status(400).json({ error: btCheck.error });
    return;
  }
  const taxCheck = await validateTaxTypeId(
    user.tenantId,
    compositionParsed.data.taxTypeId !== undefined
      ? compositionParsed.data.taxTypeId
      : existing.taxTypeId,
  );
  if (taxCheck.ok === false) {
    res.status(400).json({ error: taxCheck.error });
    return;
  }
  const variableEntriesUpdate =
    existing.revenueType === "VARIAVEL" &&
    compositionParsed.data.variableEntries !== undefined
      ? await fillVariableEntryWorkedHours(
          user.tenantId,
          existing.projectId,
          compositionParsed.data.variableEntries,
        )
      : undefined;
  const incomingBillingLines =
    existing.revenueType === "VARIAVEL" &&
    variableEntriesUpdate !== undefined
      ? buildVariableBillingLines(variableEntriesUpdate)
      : compositionParsed.data.billingLines;
  if (incomingBillingLines !== undefined) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const incomingByInstallment = new Map(
      incomingBillingLines.map((line) => [line.installmentNumber, line]),
    );
    for (const currentLine of existing.billingLines) {
      if (currentLine.dueDate >= today) continue;
      const incoming = incomingByInstallment.get(currentLine.installmentNumber);
      const unchanged =
        incoming &&
        incoming.dueDate.toISOString().slice(0, 10) ===
          currentLine.dueDate.toISOString().slice(0, 10) &&
        Math.round(incoming.amount * 100) === Math.round(currentLine.amount * 100) &&
        (incoming.milestone ?? null) === (currentLine.milestone ?? null);
      if (!unchanged) {
        res.status(400).json({
          error: `A parcela ${currentLine.installmentNumber} não pode ser alterada porque sua data já passou.`,
        });
        return;
      }
    }
    for (const incoming of incomingBillingLines) {
      if (incoming.dueDate >= today) continue;
      const current = existing.billingLines.find(
        (line) => line.installmentNumber === incoming.installmentNumber,
      );
      if (!current || current.dueDate >= today) {
        res.status(400).json({
          error: "Não é possível definir uma parcela nova com data anterior à data atual.",
        });
        return;
      }
    }
  }
  const billingTypeNames = await getBillingTypeNames(user.tenantId);
  const historyEntries = buildRevenueHistoryEntries(existing, parsed.data, billingTypeNames);
  const updated = await prisma.$transaction(async (tx) => {
    let updateData = { ...parsed.data };

    if (hasCompositionUpdate) {
      const current = await tx.projectRevenue.findFirstOrThrow({
        where: { id },
        include: {
          costLines: { orderBy: { sortOrder: "asc" } },
          billingLines: { orderBy: { sortOrder: "asc" } },
          variableEntries: {
            orderBy: { sortOrder: "asc" },
            include: {
              billingLines: { orderBy: { sortOrder: "asc" } },
              costLines: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      });
      const autoBillingCalculation =
        existing.revenueType === "FIXA"
          ? (compositionParsed.data.autoBillingCalculation ?? current.autoBillingCalculation)
          : false;
      const costLines =
        compositionParsed.data.costLines ??
        current.costLines.map((line) => ({
          skill: line.skill,
          hourlyRate: line.hourlyRate,
          hours: line.hours,
          isDiscount: line.isDiscount,
          sortOrder: line.sortOrder,
        }));
      const billingLines =
        compositionParsed.data.billingLines ??
        current.billingLines.map((line) => ({
          milestone: line.milestone,
          installmentNumber: line.installmentNumber,
          dueDate: line.dueDate,
          amount: line.amount,
          sortOrder: line.sortOrder,
        }));
      const compositionUpdate =
        existing.revenueType === "VARIAVEL"
          ? await replaceVariableRevenue(
              tx,
              id,
              variableEntriesUpdate ??
                current.variableEntries.map((entry) => ({
                  title: entry.title,
                  competenceDate: entry.competenceDate,
                  description: entry.description,
                  hours: entry.hours,
                  hourlyRate: entry.hourlyRate,
                  amount: entry.amount,
                  installmentCount: entry.installmentCount,
                  firstDueDate: entry.firstDueDate,
                  billingLines: entry.billingLines.map((line) => ({
                    milestone: line.milestone,
                    dueDate: line.dueDate,
                    amount: line.amount,
                  })),
                  costLines: entry.costLines.map((line) => ({
                    skill: line.skill,
                    hourlyRate: line.hourlyRate,
                    hours: line.hours,
                    sortOrder: line.sortOrder,
                  })),
                  sortOrder: entry.sortOrder,
                })),
            )
          : await replaceRevenueComposition(
              tx,
              id,
              autoBillingCalculation,
              costLines,
              billingLines,
            );
      updateData = {
        ...updateData,
        autoBillingCalculation: compositionUpdate.autoBillingCalculation,
        contractedValue: compositionUpdate.contractedValue,
        expectedRevenue: compositionUpdate.expectedRevenue,
        installmentCount: compositionUpdate.installmentCount,
        startDate: compositionUpdate.startDate,
        endDate: compositionUpdate.endDate,
      };
    }

    if (compositionParsed.data.taxTypeId !== undefined) {
      updateData = { ...updateData, taxTypeId: compositionParsed.data.taxTypeId } as typeof updateData & {
        taxTypeId: string | null;
      };
    }

    const revenue = await tx.projectRevenue.update({
      where: { id },
      data: updateData,
    });
    for (const entry of historyEntries) {
      await tx.projectRevenueHistory.create({
        data: {
          revenueId: id,
          userId: user.id,
          action: "UPDATE",
          field: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
        },
      });
    }
    return tx.projectRevenue.findFirstOrThrow({
      where: { id: revenue.id },
      include: revenueInclude,
    });
  });
  await syncReceivableFromProjectRevenue(user.tenantId, user.id, id).catch(() => null);
  res.json(mapRevenueRow(updated));
});

projectRevenuesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectRevenue.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, projectId: true, title: true, status: true },
  });
  if (!existing || !(await assertProjectAccess(user, existing.projectId))) {
    res.status(404).json({ error: "Receita não encontrada." });
    return;
  }
  if (existing.status === "CANCELADO") {
    res.status(204).end();
    return;
  }
  // Soft cancel: não exclui fisicamente; cancela CR vinculada
  const disposed = await disposeReceivableForProjectRevenue(
    user.tenantId,
    user.id,
    id,
    "Conta cancelada: receita de projeto cancelada.",
  );
  if (disposed.ok === false) {
    res.status(400).json({ error: disposed.error });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.projectRevenue.update({
      where: { id },
      data: { status: "CANCELADO" },
    });
    await tx.projectRevenueHistory.create({
      data: {
        revenueId: id,
        userId: user.id,
        action: "CANCEL",
        field: "status",
        oldValue: existing.status,
        newValue: "CANCELADO",
        details: existing.title ?? "Receita cancelada",
      },
    });
  });
  res.status(204).end();
});
