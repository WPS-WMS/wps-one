import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const revenueTypesRouter = Router();
revenueTypesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.tiposReceita" as const;

revenueTypesRouter.get(
  "/",
  requireAnyFeature([FEATURE, "financeiro.contasReceber", "financeiro.projetos.receitas"]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    await ensureFinanceDefaults(user.tenantId);
    const rows = await prisma.revenueType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json(rows);
  },
);

revenueTypesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return;
  }
  const exists = await prisma.revenueType.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um tipo com esse nome." });
    return;
  }
  const created = await prisma.revenueType.create({
    data: { tenantId: user.tenantId, name, isActive: true },
    select: { id: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

revenueTypesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.revenueType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo não encontrado." });
    return;
  }
  const data: { name?: string; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome é obrigatório." });
      return;
    }
    const dup = await prisma.revenueType.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um tipo com esse nome." });
      return;
    }
    data.name = name;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.revenueType.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true },
  });
  res.json(updated);
});

revenueTypesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.revenueType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo não encontrado." });
    return;
  }
  const updated = await prisma.revenueType.update({
    where: { id },
    data: { isActive: false },
  });
  res.json(updated);
});
