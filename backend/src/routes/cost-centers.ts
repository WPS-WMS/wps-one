import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, normalizeConfigName, normalizeOptionalCode } from "../lib/financeConfigHelpers.js";
import { costCenterBudgetsRouter } from "./cost-center-budgets.js";

export const costCentersRouter = Router();
costCentersRouter.use(authMiddleware);
costCentersRouter.use(costCenterBudgetsRouter);

const FEATURE = "configuracoes.financeiro.centrosCusto" as const;

costCentersRouter.get("/", requireAnyFeature([FEATURE, "financeiro.lancamentos", "relatorios.financeiroCentroCusto"]), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);
  const rows = await prisma.costCenter.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
  res.json(rows);
});

costCentersRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome do centro de custo é obrigatório." });
    return;
  }
  const exists = await prisma.costCenter.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um centro de custo com esse nome." });
    return;
  }
  const created = await prisma.costCenter.create({
    data: {
      tenantId: user.tenantId,
      name,
      code: normalizeOptionalCode(req.body?.code),
      isActive: req.body?.isActive === false ? false : true,
    },
    select: { id: true, code: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

costCentersRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.costCenter.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Centro de custo não encontrado." });
    return;
  }
  const data: { name?: string; code?: string | null; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome do centro de custo é obrigatório." });
      return;
    }
    const dup = await prisma.costCenter.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um centro de custo com esse nome." });
      return;
    }
    data.name = name;
  }
  if (req.body?.code !== undefined) data.code = normalizeOptionalCode(req.body.code);
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.costCenter.update({
    where: { id },
    data,
    select: { id: true, code: true, name: true, isActive: true },
  });
  res.json(updated);
});

costCentersRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.costCenter.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Centro de custo não encontrado." });
    return;
  }
  const updated = await prisma.costCenter.update({
    where: { id },
    data: { isActive: false },
  });
  res.json(updated);
});
