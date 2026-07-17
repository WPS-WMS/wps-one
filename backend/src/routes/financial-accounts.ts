import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import {
  ensureFinanceDefaults,
  normalizeAccountType,
  normalizeConfigName,
  normalizeOptionalCode,
} from "../lib/financeConfigHelpers.js";

export const financialAccountsRouter = Router();
financialAccountsRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.planoContas" as const;

financialAccountsRouter.get("/", requireAnyFeature([FEATURE, "financeiro.lancamentos", "relatorios.financeiroCentroCusto"]), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);
  const typeFilter = normalizeAccountType(req.query.type);
  const rows = await prisma.financialAccount.findMany({
    where: {
      tenantId: user.tenantId,
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      costCenterId: true,
      isActive: true,
      parent: { select: { id: true, name: true } },
      costCenter: { select: { id: true, name: true } },
    },
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      parentId: r.parentId,
      parentName: r.parent?.name ?? null,
      costCenterId: r.costCenterId,
      costCenterName: r.costCenter?.name ?? null,
      isActive: r.isActive,
    })),
  );
});

financialAccountsRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const name = normalizeConfigName(req.body?.name);
  const type = normalizeAccountType(req.body?.type);
  if (!name) {
    res.status(400).json({ error: "Nome da conta é obrigatório." });
    return;
  }
  if (!type) {
    res.status(400).json({ error: "Tipo inválido. Use RECEITA ou DESPESA." });
    return;
  }
  const parentId = req.body?.parentId ? String(req.body.parentId) : null;
  const costCenterId = req.body?.costCenterId ? String(req.body.costCenterId) : null;

  if (parentId) {
    const parent = await prisma.financialAccount.findFirst({
      where: { id: parentId, tenantId: user.tenantId, type },
      select: { id: true },
    });
    if (!parent) {
      res.status(400).json({ error: "Conta pai não encontrada ou tipo incompatível." });
      return;
    }
  }
  if (costCenterId) {
    const cc = await prisma.costCenter.findFirst({
      where: { id: costCenterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!cc) {
      res.status(400).json({ error: "Centro de custo não encontrado." });
      return;
    }
  }

  const exists = await prisma.financialAccount.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" }, type },
    select: { id: true },
  });
  if (exists) {
    res.status(409).json({ error: "Já existe uma conta com esse nome para este tipo." });
    return;
  }

  const created = await prisma.financialAccount.create({
    data: {
      tenantId: user.tenantId,
      name,
      type,
      code: normalizeOptionalCode(req.body?.code),
      parentId,
      costCenterId,
      isActive: req.body?.isActive === false ? false : true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      costCenterId: true,
      isActive: true,
    },
  });
  res.status(201).json(created);
});

financialAccountsRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.financialAccount.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, type: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }

  const data: {
    name?: string;
    code?: string | null;
    parentId?: string | null;
    costCenterId?: string | null;
    isActive?: boolean;
  } = {};

  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome da conta é obrigatório." });
      return;
    }
    const dup = await prisma.financialAccount.findFirst({
      where: {
        tenantId: user.tenantId,
        type: existing.type,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe uma conta com esse nome para este tipo." });
      return;
    }
    data.name = name;
  }
  if (req.body?.code !== undefined) data.code = normalizeOptionalCode(req.body.code);
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;

  if (req.body?.parentId !== undefined) {
    const parentId = req.body.parentId ? String(req.body.parentId) : null;
    if (parentId === id) {
      res.status(400).json({ error: "Uma conta não pode ser pai de si mesma." });
      return;
    }
    if (parentId) {
      const parent = await prisma.financialAccount.findFirst({
        where: { id: parentId, tenantId: user.tenantId, type: existing.type },
        select: { id: true },
      });
      if (!parent) {
        res.status(400).json({ error: "Conta pai não encontrada ou tipo incompatível." });
        return;
      }
    }
    data.parentId = parentId;
  }

  if (req.body?.costCenterId !== undefined) {
    const costCenterId = req.body.costCenterId ? String(req.body.costCenterId) : null;
    if (costCenterId) {
      const cc = await prisma.costCenter.findFirst({
        where: { id: costCenterId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!cc) {
        res.status(400).json({ error: "Centro de custo não encontrado." });
        return;
      }
    }
    data.costCenterId = costCenterId;
  }

  const updated = await prisma.financialAccount.update({
    where: { id },
    data,
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      costCenterId: true,
      isActive: true,
    },
  });
  res.json(updated);
});

financialAccountsRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.financialAccount.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const updated = await prisma.financialAccount.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, type: true, code: true, isActive: true },
  });
  res.json(updated);
});
