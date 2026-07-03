import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const supplierCategoriesRouter = Router();
supplierCategoriesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.categorias" as const;

supplierCategoriesRouter.get("/", requireAnyFeature([FEATURE, "financeiro.fornecedores"]), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);
  const rows = await prisma.supplierCategory.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
  res.json(rows);
});

supplierCategoriesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome da categoria é obrigatório." });
    return;
  }
  const exists = await prisma.supplierCategory.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe uma categoria com esse nome." });
    return;
  }
  const created = await prisma.supplierCategory.create({
    data: {
      tenantId: user.tenantId,
      name,
      isActive: req.body?.isActive === false ? false : true,
    },
    select: { id: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

supplierCategoriesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.supplierCategory.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  const data: { name?: string; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome da categoria é obrigatório." });
      return;
    }
    const dup = await prisma.supplierCategory.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe uma categoria com esse nome." });
      return;
    }
    data.name = name;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.supplierCategory.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true },
  });
  res.json(updated);
});

supplierCategoriesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.supplierCategory.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  const used = await prisma.supplier.count({ where: { categoryId: id } });
  if (used > 0) {
    res.status(409).json({
      error: "Esta categoria está vinculada a fornecedores. Inative-a em vez de excluir.",
    });
    return;
  }
  await prisma.supplierCategory.delete({ where: { id } });
  res.status(204).end();
});
