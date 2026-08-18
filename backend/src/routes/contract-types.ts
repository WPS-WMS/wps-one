import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, financeConfigDeleteInUseError, isPrismaForeignKeyError, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const contractTypesRouter = Router();
contractTypesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.tiposContrato" as const;

contractTypesRouter.get(
  "/",
  requireAnyFeature([
    FEATURE,
    "financeiro.projetos.receitas",
    "financeiro.contasPagar",
    "configuracoes.usuarios",
  ]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    await ensureFinanceDefaults(user.tenantId);
    const rows = await prisma.contractType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json(rows);
  },
);

contractTypesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome do tipo de contrato é obrigatório." });
    return;
  }
  const exists = await prisma.contractType.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um tipo de contrato com esse nome." });
    return;
  }
  const created = await prisma.contractType.create({
    data: {
      tenantId: user.tenantId,
      name,
      isActive: req.body?.isActive === false ? false : true,
    },
    select: { id: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

contractTypesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.contractType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo de contrato não encontrado." });
    return;
  }
  const data: { name?: string; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome do tipo de contrato é obrigatório." });
      return;
    }
    const dup = await prisma.contractType.findFirst({
      where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" }, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um tipo de contrato com esse nome." });
      return;
    }
    data.name = name;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.contractType.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true },
  });
  res.json(updated);
});

contractTypesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.contractType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo de contrato não encontrado." });
    return;
  }
  try {
    await prisma.contractType.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      res.status(409).json({ error: financeConfigDeleteInUseError("tipo de contrato") });
      return;
    }
    throw err;
  }
});
