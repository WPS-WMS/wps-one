import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, financeConfigDeleteInUseError, isPrismaForeignKeyError, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const projectBillingTypesRouter = Router();
projectBillingTypesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.tiposCobranca" as const;

function normalizeBillingCode(raw: unknown): string | null {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  return code.length > 0 ? code : null;
}

projectBillingTypesRouter.get(
  "/",
  requireAnyFeature([FEATURE, "financeiro.projetos.receitas", "financeiro.projetos.contratos"]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    await ensureFinanceDefaults(user.tenantId);
    const rows = await prisma.projectBillingType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json(rows);
  },
);

projectBillingTypesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const code = normalizeBillingCode(req.body?.code);
  const name = normalizeConfigName(req.body?.name);
  if (!code) {
    res.status(400).json({ error: "Código do tipo de cobrança é obrigatório." });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "Nome do tipo de cobrança é obrigatório." });
    return;
  }
  const exists = await prisma.projectBillingType.findFirst({
    where: { tenantId: user.tenantId, code },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe um tipo de cobrança com esse código." });
    return;
  }
  const created = await prisma.projectBillingType.create({
    data: {
      tenantId: user.tenantId,
      code,
      name,
      isActive: req.body?.isActive === false ? false : true,
    },
    select: { id: true, code: true, name: true, isActive: true },
  });
  res.status(201).json(created);
});

projectBillingTypesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectBillingType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, code: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo de cobrança não encontrado." });
    return;
  }
  const data: { code?: string; name?: string; isActive?: boolean } = {};
  if (req.body?.code != null) {
    const code = normalizeBillingCode(req.body.code);
    if (!code) {
      res.status(400).json({ error: "Código do tipo de cobrança é obrigatório." });
      return;
    }
    if (code !== existing.code) {
      const dup = await prisma.projectBillingType.findFirst({
        where: { tenantId: user.tenantId, code, NOT: { id } },
        select: { id: true },
      });
      if (dup) {
        res.status(409).json({ error: "Já existe um tipo de cobrança com esse código." });
        return;
      }
    }
    data.code = code;
  }
  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome do tipo de cobrança é obrigatório." });
      return;
    }
    data.name = name;
  }
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;
  const updated = await prisma.projectBillingType.update({
    where: { id },
    data,
    select: { id: true, code: true, name: true, isActive: true },
  });
  res.json(updated);
});

projectBillingTypesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectBillingType.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Tipo de cobrança não encontrado." });
    return;
  }
  try {
    await prisma.projectBillingType.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      res.status(409).json({ error: financeConfigDeleteInUseError("tipo de cobrança") });
      return;
    }
    throw err;
  }
});
