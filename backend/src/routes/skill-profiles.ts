import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import {
  financeConfigDeleteInUseError,
  isPrismaForeignKeyError,
  normalizeConfigName,
} from "../lib/financeConfigHelpers.js";

export const skillProfilesRouter = Router();
skillProfilesRouter.use(authMiddleware);

const FEATURE = "configuracoes.skills" as const;

skillProfilesRouter.get(
  "/",
  requireAnyFeature([
    FEATURE,
    "configuracoes.usuarios",
    "financeiro.projetos",
    "financeiro.projetos.receitas",
  ]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const activeOnly =
      String(req.query.activeOnly ?? "").trim() === "1" ||
      String(req.query.activeOnly ?? "").toLowerCase() === "true";
    const rows = await prisma.skillProfile.findMany({
      where: {
        tenantId: user.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json(rows);
  },
);

skillProfilesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome do skill é obrigatório." });
    return;
  }
  const exists = await prisma.skillProfile.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um skill com esse nome." });
    return;
  }
  const created = await prisma.skillProfile.create({
    data: {
      tenantId: user.tenantId,
      name,
      isActive: req.body?.isActive === false ? false : true,
    },
    select: { id: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

skillProfilesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.skillProfile.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Skill não encontrado." });
    return;
  }
  const data: { name?: string; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome do skill é obrigatório." });
      return;
    }
    const dup = await prisma.skillProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um skill com esse nome." });
      return;
    }
    data.name = name;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.skillProfile.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true },
  });
  res.json(updated);
});

skillProfilesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.skillProfile.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Skill não encontrado." });
    return;
  }
  try {
    await prisma.skillProfile.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      res.status(409).json({ error: financeConfigDeleteInUseError("Skill") });
      return;
    }
    throw err;
  }
});
