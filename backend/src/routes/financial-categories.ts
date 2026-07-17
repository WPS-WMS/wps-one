import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults, normalizeConfigName } from "../lib/financeConfigHelpers.js";

export const financialCategoriesRouter = Router();
financialCategoriesRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.categoriasFinanceiras" as const;

const categorySelect = {
  id: true,
  name: true,
  isActive: true,
  enableHourRate: true,
  enableAmount: true,
  enableBenefit: true,
  enableReimbursement: true,
  enableDiscount: true,
  enableComplementaryHours: true,
  enableInterestFine: true,
  createdAt: true,
  updatedAt: true,
} as const;

type FieldFlags = {
  enableHourRate?: boolean;
  enableAmount?: boolean;
  enableBenefit?: boolean;
  enableReimbursement?: boolean;
  enableDiscount?: boolean;
  enableComplementaryHours?: boolean;
  enableInterestFine?: boolean;
};

function parseFieldFlags(body: Record<string, unknown>): FieldFlags {
  const data: FieldFlags = {};
  const keys = [
    "enableHourRate",
    "enableAmount",
    "enableBenefit",
    "enableReimbursement",
    "enableDiscount",
    "enableComplementaryHours",
    "enableInterestFine",
  ] as const;
  for (const key of keys) {
    if (typeof body[key] === "boolean") data[key] = body[key];
  }
  return data;
}

financialCategoriesRouter.get(
  "/",
  requireAnyFeature([FEATURE, "financeiro.contasPagar"]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    await ensureFinanceDefaults(user.tenantId);
    const rows = await prisma.financialCategory.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: categorySelect,
    });
    res.json(rows);
  },
);

financialCategoriesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return;
  }
  const exists = await prisma.financialCategory.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe uma categoria com esse nome." });
    return;
  }
  const flags = parseFieldFlags((req.body ?? {}) as Record<string, unknown>);
  const created = await prisma.financialCategory.create({
    data: { tenantId: user.tenantId, name, isActive: true, ...flags },
    select: categorySelect,
  });
  res.status(201).json(created);
});

financialCategoriesRouter.patch(
  "/:id",
  requireFeature(FEATURE),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const id = String(req.params.id);
    const existing = await prisma.financialCategory.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Categoria não encontrada." });
      return;
    }
    const data: { name?: string; isActive?: boolean } & FieldFlags = {
      ...parseFieldFlags((req.body ?? {}) as Record<string, unknown>),
    };
    if (req.body?.name != null) {
      const name = normalizeConfigName(req.body.name);
      if (!name) {
        res.status(400).json({ error: "Nome é obrigatório." });
        return;
      }
      const dup = await prisma.financialCategory.findFirst({
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
    const updated = await prisma.financialCategory.update({
      where: { id },
      data,
      select: categorySelect,
    });
    res.json(updated);
  },
);

financialCategoriesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.financialCategory.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  // Payables usam onDelete: SetNull — exclusão física libera o cadastro.
  await prisma.financialCategory.delete({ where: { id } });
  res.status(204).end();
});
