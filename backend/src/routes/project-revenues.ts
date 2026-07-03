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

export const projectRevenuesRouter = Router();
projectRevenuesRouter.use(authMiddleware);

const FEATURE = "financeiro.projetos.receitas" as const;

type AuthUser = { id: string; tenantId: string; role: string };

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
  createdAt: Date;
  updatedAt: Date;
  billingType: { id: string; code: string; name: string } | null;
  _count: { history: number };
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
    historyCount: row._count.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
    include: {
      billingType: { select: { id: true, code: true, name: true } },
      _count: { select: { history: true } },
    },
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
  const btCheck = await validateBillingTypeId(user.tenantId, parsed.data.billingTypeId);
  if (btCheck.ok === false) {
    res.status(400).json({ error: btCheck.error });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);
  const created = await prisma.$transaction(async (tx) => {
    const revenue = await tx.projectRevenue.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        title: parsed.data.title ?? null,
        billingTypeId: parsed.data.billingTypeId ?? null,
        contractedValue: parsed.data.contractedValue ?? null,
        expectedRevenue: parsed.data.expectedRevenue ?? null,
        realizedRevenue: parsed.data.realizedRevenue ?? null,
        installmentCount: parsed.data.installmentCount ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        status: parsed.data.status ?? "NEGOCIACAO",
        isAdditive: parsed.data.isAdditive === true,
      },
      include: {
        billingType: { select: { id: true, code: true, name: true } },
        _count: { select: { history: true } },
      },
    });
    await tx.projectRevenueHistory.create({
      data: {
        revenueId: revenue.id,
        userId: user.id,
        action: "CREATE",
        details: revenue.title ?? "Receita criada",
      },
    });
    return revenue;
  });
  res.status(201).json(mapRevenueRow(created));
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
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }
  const btCheck = await validateBillingTypeId(user.tenantId, parsed.data.billingTypeId);
  if (btCheck.ok === false) {
    res.status(400).json({ error: btCheck.error });
    return;
  }
  const billingTypeNames = await getBillingTypeNames(user.tenantId);
  const historyEntries = buildRevenueHistoryEntries(existing, parsed.data, billingTypeNames);
  const updated = await prisma.$transaction(async (tx) => {
    const revenue = await tx.projectRevenue.update({
      where: { id },
      data: parsed.data,
      include: {
        billingType: { select: { id: true, code: true, name: true } },
        _count: { select: { history: true } },
      },
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
    return revenue;
  });
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
