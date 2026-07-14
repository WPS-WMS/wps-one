import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
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
import { syncReceivableFromProjectRevenue } from "../lib/createReceivableFromProjectRevenue.js";

export const projectRevenuesRouter = Router();
projectRevenuesRouter.use(authMiddleware);

const FEATURE = "financeiro.projetos.receitas" as const;

type AuthUser = { id: string; tenantId: string; role: string };

const revenueInclude = {
  billingType: { select: { id: true, code: true, name: true } },
  taxType: { select: { id: true, name: true, ratePercent: true, isActive: true } },
  costLines: { orderBy: { sortOrder: "asc" as const } },
  billingLines: { orderBy: { sortOrder: "asc" as const } },
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
}) {
  return {
    id: line.id,
    milestone: line.milestone,
    installmentNumber: line.installmentNumber,
    dueDate: line.dueDate,
    amount: line.amount,
    sortOrder: line.sortOrder,
  };
}

function mapRevenueRow(row: {
  id: string;
  projectId: string;
  title: string | null;
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
  _count: { history: number };
  taxType?: { id: string; name: string; ratePercent: number | null; isActive: boolean } | null;
}) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
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
    where: { tenantId: user.tenantId, projectId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
  const autoBillingCalculation = compositionParsed.data.autoBillingCalculation ?? true;
  const costLines = compositionParsed.data.costLines ?? [];
  const billingLines = compositionParsed.data.billingLines ?? defaultBillingLines();
  const compositionTotals = syncRevenueTotalsFromComposition(
    costLines,
    autoBillingCalculation
      ? applyAutoBillingAmounts(netCostTotal(costLines), billingLines)
      : billingLines,
  );
  const created = await prisma.$transaction(async (tx) => {
    const revenue = await tx.projectRevenue.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        title: parsed.data.title ?? null,
        billingTypeId: parsed.data.billingTypeId ?? null,
        contractedValue: compositionTotals.contractedValue ?? parsed.data.contractedValue ?? null,
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
    if (costLines.length > 0 || billingLines.length > 0) {
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
    compositionParsed.data.taxTypeId !== undefined;
  if (Object.keys(parsed.data).length === 0 && !hasCompositionUpdate) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
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
        },
      });
      const autoBillingCalculation =
        compositionParsed.data.autoBillingCalculation ?? current.autoBillingCalculation;
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
      const compositionUpdate = await replaceRevenueComposition(
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
    select: { id: true, projectId: true, title: true },
  });
  if (!existing || !(await assertProjectAccess(user, existing.projectId))) {
    res.status(404).json({ error: "Receita não encontrada." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.projectRevenueHistory.create({
      data: {
        revenueId: id,
        userId: user.id,
        action: "DELETE",
        details: existing.title ?? "Receita excluída",
      },
    });
    await tx.projectRevenue.delete({ where: { id } });
  });
  res.status(204).end();
});
