import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { financeConfigDeleteInUseError, isPrismaForeignKeyError, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const taxTypesRouter = Router();
taxTypesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.impostos" as const;

const selectFields = {
  id: true,
  name: true,
  ratePercent: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parseRatePercent(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const value = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

taxTypesRouter.get(
  "/",
  requireAnyFeature([FEATURE, "financeiro.projetos.receitas"]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const rows = await prisma.taxType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: selectFields,
    });
    res.json(rows);
  },
);

taxTypesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return;
  }
  const rate = parseRatePercent(req.body?.ratePercent);
  if (!rate.ok) {
    res.status(400).json({ error: "Alíquota inválida. Use um percentual entre 0 e 100." });
    return;
  }
  const exists = await prisma.taxType.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um imposto com esse nome." });
    return;
  }
  const created = await prisma.taxType.create({
    data: { tenantId: user.tenantId, name, ratePercent: rate.value, isActive: true },
    select: selectFields,
  });
  res.status(201).json(created);
});

taxTypesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.taxType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Imposto não encontrado." });
    return;
  }
  const data: { name?: string; ratePercent?: number | null; isActive?: boolean } = {};
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome é obrigatório." });
      return;
    }
    const dup = await prisma.taxType.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um imposto com esse nome." });
      return;
    }
    data.name = name;
  }
  if (req.body?.ratePercent !== undefined) {
    const rate = parseRatePercent(req.body.ratePercent);
    if (!rate.ok) {
      res.status(400).json({ error: "Alíquota inválida. Use um percentual entre 0 e 100." });
      return;
    }
    data.ratePercent = rate.value;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.taxType.update({
    where: { id },
    data,
    select: selectFields,
  });
  res.json(updated);
});

taxTypesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.taxType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Imposto não encontrado." });
    return;
  }
  try {
    await prisma.taxType.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      res.status(409).json({ error: financeConfigDeleteInUseError("imposto") });
      return;
    }
    throw err;
  }
});
