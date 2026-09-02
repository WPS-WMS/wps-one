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
  isVariableEntryLocked,
  parseVariableRevenueEntries,
  utcTodayDate,
  type VariableRevenueEntryInput,
} from "../lib/projectRevenueVariableHelpers.js";
import {
  disposeReceivableForProjectRevenue,
  disposeReceivableForVariableEntry,
  loadMeasurementReceivablesByEntryIds,
  overlayExpectedPaymentFromReceivable,
  receivableOverlayForEntry,
  syncReceivableFromProjectRevenue,
  syncReceivableFromVariableEntry,
  type LinkedReceivableLookup,
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
  expectedPaymentDate?: Date | null;
  amount: number;
  sortOrder: number;
  variableEntryId?: string | null;
}) {
  return {
    id: line.id,
    milestone: line.milestone,
    installmentNumber: line.installmentNumber,
    dueDate: line.dueDate,
    expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
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
  clientHourlyRate?: number | null;
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
    expectedPaymentDate?: Date | null;
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
    receivableGeneratedAt?: Date | null;
    billingLines: Array<{
      id: string;
      milestone: string | null;
      installmentNumber: number;
      dueDate: Date;
      expectedPaymentDate?: Date | null;
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
}, measurementReceivables?: LinkedReceivableLookup) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    revenueType: row.revenueType,
    contractProposal: row.contractProposal,
    paymentMethod: row.paymentMethod,
    billingTypeId: row.billingTypeId,
    clientHourlyRate: row.clientHourlyRate ?? null,
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
      row.variableEntries?.map((entry) => {
        const billingLines = overlayExpectedPaymentFromReceivable(
          entry.billingLines,
          receivableOverlayForEntry(entry, row.id, measurementReceivables),
          entry.competenceDate,
        );
        return {
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
          billingLines: billingLines.map((line) => ({
            id: line.id,
            milestone: line.milestone,
            installmentNumber: line.installmentNumber,
            dueDate: line.dueDate,
            expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
            amount: line.amount,
          })),
          costLines: entry.costLines?.map(mapCostLineRow) ?? [],
          receivableGenerated: Boolean(entry.receivableGeneratedAt),
          isLocked: isVariableEntryLocked({
            receivableGeneratedAt: entry.receivableGeneratedAt,
            billingLines,
          }),
        };
      }) ?? [],
    historyCount: row._count.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function mapRevenueRowWithReceivables(
  row: Parameters<typeof mapRevenueRow>[0],
) {
  const entryIds = row.variableEntries?.map((entry) => entry.id) ?? [];
  const receivables = await loadMeasurementReceivablesByEntryIds(entryIds, [row.id]);
  return mapRevenueRow(row, receivables);
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
        expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
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
  const existing = await tx.projectRevenueVariableEntry.findMany({
    where: { revenueId },
    select: { id: true, receivableGeneratedAt: true },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();

  await tx.projectRevenueBillingLine.deleteMany({ where: { revenueId } });
  await tx.projectRevenueCostLine.deleteMany({ where: { revenueId } });

  const entryIds: string[] = [];
  for (const entry of entries) {
    const reuseId = entry.id && existingById.has(entry.id) ? entry.id : null;
    const receivableGeneratedAt = reuseId
      ? existingById.get(reuseId)!.receivableGeneratedAt
      : null;
    if (reuseId) {
      keptIds.add(reuseId);
      await tx.projectRevenueVariableEntry.update({
        where: { id: reuseId },
        data: {
          title: entry.title,
          competenceDate: entry.competenceDate,
          description: entry.description,
          hours: entry.hours,
          hourlyRate: entry.hourlyRate,
          amount: entry.amount,
          installmentCount: entry.installmentCount,
          firstDueDate: entry.firstDueDate,
          sortOrder: entry.sortOrder,
          receivableGeneratedAt,
        },
      });
      await tx.projectRevenueVariableCostLine.deleteMany({ where: { variableEntryId: reuseId } });
      entryIds.push(reuseId);
      if (entry.costLines.length > 0) {
        await tx.projectRevenueVariableCostLine.createMany({
          data: entry.costLines.map((line, lineIndex) => ({
            variableEntryId: reuseId,
            skill: line.skill,
            hourlyRate: line.hourlyRate,
            hours: line.hours,
            sortOrder: line.sortOrder ?? lineIndex,
          })),
        });
      }
      continue;
    }

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

  const removedEntryIds = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
  if (removedEntryIds.length > 0) {
    await tx.projectRevenueVariableEntry.deleteMany({ where: { id: { in: removedEntryIds } } });
  }

  if (generatedLines.length > 0) {
    await tx.projectRevenueBillingLine.createMany({
      data: generatedLines.map((line) => ({
        revenueId,
        variableEntryId: entryIds[line.variableEntryIndex]!,
        milestone: line.milestone ?? null,
        installmentNumber: line.installmentNumber,
        dueDate: line.dueDate,
        expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
        amount: line.amount,
        sortOrder: line.sortOrder ?? 0,
      })),
    });
  }

  const billingLines = generatedLines.map((line) => ({
    milestone: line.milestone,
    installmentNumber: line.installmentNumber,
    dueDate: line.dueDate,
    expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
    amount: line.amount,
    sortOrder: line.sortOrder,
  }));
  return {
    autoBillingCalculation: false,
    contractedValue: null,
    removedEntryIds,
    ...syncRevenueTotalsFromComposition([], billingLines),
  };
}

function lockedVariableEntryMutated(
  current: {
    amount: number;
    hours: number | null;
    hourlyRate: number | null;
    competenceDate: Date;
    description: string | null;
    billingLines: Array<{
      dueDate: Date;
      expectedPaymentDate?: Date | null;
      amount: number;
    }>;
  },
  incoming: VariableRevenueEntryInput,
): boolean {
  if (Math.round(current.amount * 100) !== Math.round(incoming.amount * 100)) return true;
  if (Math.round((current.hours ?? 0) * 100) !== Math.round((incoming.hours ?? 0) * 100)) return true;
  if (Math.round((current.hourlyRate ?? 0) * 100) !== Math.round((incoming.hourlyRate ?? 0) * 100)) return true;
  if ((current.description ?? null) !== (incoming.description ?? null)) return true;
  if (
    current.competenceDate.toISOString().slice(0, 10) !==
    incoming.competenceDate.toISOString().slice(0, 10)
  ) {
    return true;
  }
  if (current.billingLines.length !== incoming.billingLines.length) return true;
  const currentLines = [...current.billingLines].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
  );
  const incomingLines = [...incoming.billingLines].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
  );
  return currentLines.some((line, index) => {
    const other = incomingLines[index]!;
    return (
      line.dueDate.toISOString().slice(0, 10) !== other.dueDate.toISOString().slice(0, 10) ||
      (line.expectedPaymentDate ?? line.dueDate).toISOString().slice(0, 10) !==
        other.expectedPaymentDate.toISOString().slice(0, 10) ||
      Math.round(line.amount * 100) !== Math.round(other.amount * 100)
    );
  });
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
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.receivableGeneratedAt || isVariableEntryLocked(entry)) {
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
  const entryIds = rows.flatMap((row) => row.variableEntries.map((entry) => entry.id));
  const revenueIds = rows.map((row) => row.id);
  const receivables = await loadMeasurementReceivablesByEntryIds(entryIds, revenueIds);
  res.json(rows.map((row) => mapRevenueRow(row, receivables)));
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
        clientHourlyRate: revenueType === "VARIAVEL" ? (parsed.data.clientHourlyRate ?? null) : null,
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
  if (revenueType !== "VARIAVEL") {
    await syncReceivableFromProjectRevenue(user.tenantId, user.id, created.id).catch(() => null);
  }
  res.status(201).json(await mapRevenueRowWithReceivables(created));
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
  res.json(await mapRevenueRowWithReceivables(revenue));
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

projectRevenuesRouter.post(
  "/:id/variable-entries/:entryId/generate-receivable",
  requireFeature(FEATURE),
  async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const id = String(req.params.id);
    const entryId = String(req.params.entryId ?? "").trim();
    const revenue = await prisma.projectRevenue.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, projectId: true, revenueType: true, status: true },
    });
    if (!revenue || !(await assertProjectAccess(user, revenue.projectId))) {
      res.status(404).json({ error: "Receita não encontrada." });
      return;
    }
    if (revenue.revenueType !== "VARIAVEL") {
      res.status(400).json({ error: "Só medições de receita variável geram conta a receber individual." });
      return;
    }
    if (revenue.status === "CANCELADO") {
      res.status(400).json({ error: "Receita cancelada." });
      return;
    }
    const entry = await prisma.projectRevenueVariableEntry.findFirst({
      where: { id: entryId, revenueId: id },
      select: { id: true, title: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Medição não encontrada. Salve a receita antes de gerar a conta a receber." });
      return;
    }
    const result = await syncReceivableFromVariableEntry(user.tenantId, user.id, id, entry.id);
    if (result.ok === false) {
      const message = "error" in result ? result.error : "Não foi possível gerar a conta a receber.";
      res.status(400).json({ error: message });
      return;
    }
    await prisma.projectRevenueHistory.create({
      data: {
        revenueId: id,
        userId: user.id,
        action: "UPDATE",
        details: `Conta a receber gerada para a medição "${entry.title?.trim() || entry.id}".`,
      },
    });
    const refreshed = await prisma.projectRevenue.findFirstOrThrow({
      where: { id },
      include: revenueInclude,
    });
    res.json({ receivableId: result.receivableId, ...(await mapRevenueRowWithReceivables(refreshed)) });
  },
);

projectRevenuesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectRevenue.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      billingLines: { orderBy: { sortOrder: "asc" } },
      variableEntries: {
        include: { billingLines: { orderBy: { sortOrder: "asc" } } },
      },
    },
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
  const existingByEntryId = new Map(
    existing.variableEntries.map((entry) => [entry.id, entry]),
  );
  const variableEntriesUpdate =
    existing.revenueType === "VARIAVEL" &&
    compositionParsed.data.variableEntries !== undefined
      ? await fillVariableEntryWorkedHours(
          user.tenantId,
          existing.projectId,
          compositionParsed.data.variableEntries.map((entry) => {
            const current = entry.id ? existingByEntryId.get(entry.id) : undefined;
            return {
              ...entry,
              receivableGeneratedAt: current?.receivableGeneratedAt ?? null,
            };
          }),
        )
      : undefined;
  const incomingBillingLines =
    existing.revenueType === "FIXA" ? compositionParsed.data.billingLines : undefined;
  if (incomingBillingLines !== undefined) {
    const today = utcTodayDate();
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
  if (variableEntriesUpdate) {
    for (const current of existing.variableEntries) {
      if (!isVariableEntryLocked(current)) continue;
      const incoming = variableEntriesUpdate.find((entry) => entry.id === current.id);
      if (!incoming) {
        res.status(400).json({
          error: `A medição "${current.title?.trim() || current.id}" não pode ser excluída porque a conta a receber já foi gerada e a previsão de pagamento venceu.`,
        });
        return;
      }
      if (lockedVariableEntryMutated(current, incoming)) {
        res.status(400).json({
          error: `A medição "${current.title?.trim() || "bloqueada"}" só permite alterar o título: a conta a receber já foi gerada e a previsão de pagamento venceu.`,
        });
        return;
      }
    }
  }
  const billingTypeNames = await getBillingTypeNames(user.tenantId);
  const historyEntries = buildRevenueHistoryEntries(existing, parsed.data, billingTypeNames);
  let removedVariableEntryIds: string[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    let updateData = {
      ...parsed.data,
      clientHourlyRate:
        (parsed.data.revenueType ?? existing.revenueType) === "VARIAVEL"
          ? (parsed.data.clientHourlyRate !== undefined
              ? parsed.data.clientHourlyRate
              : existing.clientHourlyRate)
          : null,
    };

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
          expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
          amount: line.amount,
          sortOrder: line.sortOrder,
        }));
      let compositionUpdate: {
        autoBillingCalculation: boolean;
        contractedValue: number | null;
        expectedRevenue: number | null;
        installmentCount: number | null;
        startDate: Date | null;
        endDate: Date | null;
      };
      if (existing.revenueType === "VARIAVEL") {
        const variableUpdate = await replaceVariableRevenue(
          tx,
          id,
          variableEntriesUpdate ??
            current.variableEntries.map((entry) => ({
              id: entry.id,
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
                expectedPaymentDate: line.expectedPaymentDate ?? line.dueDate,
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
        );
        removedVariableEntryIds = variableUpdate.removedEntryIds;
        compositionUpdate = variableUpdate;
      } else {
        compositionUpdate = await replaceRevenueComposition(
          tx,
          id,
          autoBillingCalculation,
          costLines,
          billingLines,
        );
      }
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
  if (existing.revenueType === "VARIAVEL") {
    for (const entryId of removedVariableEntryIds) {
      await disposeReceivableForVariableEntry(
        user.tenantId,
        user.id,
        entryId,
        "Conta cancelada: medição da receita variável excluída.",
      ).catch(() => null);
    }
    for (const entry of updated.variableEntries) {
      if (!entry.receivableGeneratedAt) continue;
      await syncReceivableFromVariableEntry(user.tenantId, user.id, id, entry.id).catch(() => null);
    }
  } else {
    await syncReceivableFromProjectRevenue(user.tenantId, user.id, id).catch(() => null);
  }
  res.json(await mapRevenueRowWithReceivables(updated));
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
