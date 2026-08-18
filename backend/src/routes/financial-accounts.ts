import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature } from "../lib/authorizeFeature.js";
import {
  ensureFinanceDefaults,
  financeConfigDeleteInUseError,
  isPrismaForeignKeyError,
  normalizeAccountType,
  normalizeConfigName,
  normalizeOptionalCode,
} from "../lib/financeConfigHelpers.js";

export const financialAccountsRouter = Router();
financialAccountsRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.planoContas" as const;

const DRE_SUBS_DESPESA = new Set(["IMPOSTO", "CUSTO", "REEMBOLSOS"]);
const DRE_SUBS_RECEITA = new Set(["FATURAMENTO", "OUTRAS_RECEITAS"]);

function normalizeDreSubcategory(raw: unknown, type?: string): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toUpperCase();
  if (type === "RECEITA") {
    if (!DRE_SUBS_RECEITA.has(s)) return null;
    return s;
  }
  if (type === "DESPESA") {
    if (!DRE_SUBS_DESPESA.has(s)) return null;
    return s;
  }
  if (DRE_SUBS_RECEITA.has(s) || DRE_SUBS_DESPESA.has(s)) return s;
  return null;
}

function boolOr(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  return fallback;
}

const accountSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  parentId: true,
  costCenterId: true,
  isActive: true,
  dreSubcategory: true,
  enableHourRate: true,
  enableAmount: true,
  enableBenefit: true,
  enableReimbursement: true,
  enableDiscount: true,
  enableComplementaryHours: true,
  enableInterestFine: true,
} as const;

function mapAccount(
  r: {
    id: string;
    code: string | null;
    name: string;
    type: string;
    parentId: string | null;
    costCenterId: string | null;
    isActive: boolean;
    dreSubcategory: string | null;
    enableHourRate: boolean;
    enableAmount: boolean;
    enableBenefit: boolean;
    enableReimbursement: boolean;
    enableDiscount: boolean;
    enableComplementaryHours: boolean;
    enableInterestFine: boolean;
    parent?: { id: string; name: string } | null;
    costCenter?: { id: string; name: string } | null;
  },
) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    parentId: r.parentId,
    parentName: r.parent?.name ?? null,
    costCenterId: r.costCenterId,
    costCenterName: r.costCenter?.name ?? null,
    isActive: r.isActive,
    dreSubcategory: r.dreSubcategory,
    enableHourRate: r.enableHourRate,
    enableAmount: r.enableAmount,
    enableBenefit: r.enableBenefit,
    enableReimbursement: r.enableReimbursement,
    enableDiscount: r.enableDiscount,
    enableComplementaryHours: r.enableComplementaryHours,
    enableInterestFine: r.enableInterestFine,
  };
}

function parseAccountFlags(body: Record<string, unknown>, type: string) {
  if (type === "RECEITA") {
    const dre =
      body.dreSubcategory !== undefined
        ? normalizeDreSubcategory(body.dreSubcategory, "RECEITA")
        : undefined;
    if (
      body.dreSubcategory !== undefined &&
      body.dreSubcategory !== null &&
      body.dreSubcategory !== "" &&
      dre === null
    ) {
      return {
        error: "Subcategoria inválida para receita. Use FATURAMENTO ou OUTRAS_RECEITAS.",
      } as const;
    }
    return {
      dreSubcategory: dre === undefined ? undefined : dre,
      enableHourRate: false,
      enableAmount: true,
      enableBenefit: false,
      enableReimbursement: false,
      enableDiscount: false,
      enableComplementaryHours: false,
      enableInterestFine: false,
    };
  }

  if (type !== "DESPESA") {
    return {
      dreSubcategory: null as string | null,
      enableHourRate: false,
      enableAmount: true,
      enableBenefit: false,
      enableReimbursement: false,
      enableDiscount: false,
      enableComplementaryHours: false,
      enableInterestFine: false,
    };
  }
  const dre =
    body.dreSubcategory !== undefined
      ? normalizeDreSubcategory(body.dreSubcategory, "DESPESA")
      : undefined;
  if (
    body.dreSubcategory !== undefined &&
    body.dreSubcategory !== null &&
    body.dreSubcategory !== "" &&
    dre === null
  ) {
    return { error: "Subcategoria DRE inválida. Use IMPOSTO, CUSTO ou REEMBOLSOS." } as const;
  }
  return {
    dreSubcategory: dre === undefined ? undefined : dre,
    enableHourRate: body.enableHourRate !== undefined ? boolOr(body.enableHourRate, false) : undefined,
    enableAmount: body.enableAmount !== undefined ? boolOr(body.enableAmount, true) : undefined,
    enableBenefit: body.enableBenefit !== undefined ? boolOr(body.enableBenefit, false) : undefined,
    enableReimbursement:
      body.enableReimbursement !== undefined ? boolOr(body.enableReimbursement, false) : undefined,
    enableDiscount: body.enableDiscount !== undefined ? boolOr(body.enableDiscount, false) : undefined,
    enableComplementaryHours:
      body.enableComplementaryHours !== undefined
        ? boolOr(body.enableComplementaryHours, false)
        : undefined,
    enableInterestFine:
      body.enableInterestFine !== undefined ? boolOr(body.enableInterestFine, false) : undefined,
  };
}

financialAccountsRouter.get(
  "/",
  requireAnyFeature([
    FEATURE,
    "configuracoes.financeiro.categoriasFinanceiras",
    "financeiro.lancamentos",
    "financeiro.contasPagar",
    "financeiro.contasReceber",
    "financeiro.projetos",
    "relatorios.financeiroCentroCusto",
    "relatorios.gestaoHoras.gerarContasPagar",
  ]),
  async (req, res) => {
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
        ...accountSelect,
        parent: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });
    res.json(rows.map(mapAccount));
  },
);

financialAccountsRouter.post(
  "/",
  requireAnyFeature([FEATURE, "configuracoes.financeiro.categoriasFinanceiras"]),
  async (req, res) => {
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

  const flags = parseAccountFlags(req.body ?? {}, type);
  if ("error" in flags) {
    res.status(400).json({ error: flags.error });
    return;
  }

  const created = await prisma.financialAccount.create({
    data: {
      tenantId: user.tenantId,
      name,
      type,
      code: normalizeOptionalCode(req.body?.code),
      parentId,
      costCenterId: type === "DESPESA" ? costCenterId : null,
      isActive: req.body?.isActive === false ? false : true,
      dreSubcategory: flags.dreSubcategory ?? null,
      enableHourRate: type === "DESPESA" ? (flags.enableHourRate ?? false) : false,
      enableAmount: type === "DESPESA" ? (flags.enableAmount ?? true) : true,
      enableBenefit: type === "DESPESA" ? (flags.enableBenefit ?? false) : false,
      enableReimbursement: type === "DESPESA" ? (flags.enableReimbursement ?? false) : false,
      enableDiscount: type === "DESPESA" ? (flags.enableDiscount ?? false) : false,
      enableComplementaryHours:
        type === "DESPESA" ? (flags.enableComplementaryHours ?? false) : false,
      enableInterestFine: type === "DESPESA" ? (flags.enableInterestFine ?? false) : false,
    },
    select: {
      ...accountSelect,
      parent: { select: { id: true, name: true } },
      costCenter: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(mapAccount(created));
});

financialAccountsRouter.patch(
  "/:id",
  requireAnyFeature([FEATURE, "configuracoes.financeiro.categoriasFinanceiras"]),
  async (req, res) => {
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

  const data: Record<string, unknown> = {};

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

  if (existing.type === "DESPESA" || existing.type === "RECEITA") {
    const flags = parseAccountFlags(req.body ?? {}, existing.type);
    if ("error" in flags) {
      res.status(400).json({ error: flags.error });
      return;
    }
    if (flags.dreSubcategory !== undefined) data.dreSubcategory = flags.dreSubcategory;
    if (existing.type === "DESPESA") {
      if (flags.enableHourRate !== undefined) data.enableHourRate = flags.enableHourRate;
      if (flags.enableAmount !== undefined) data.enableAmount = flags.enableAmount;
      if (flags.enableBenefit !== undefined) data.enableBenefit = flags.enableBenefit;
      if (flags.enableReimbursement !== undefined) data.enableReimbursement = flags.enableReimbursement;
      if (flags.enableDiscount !== undefined) data.enableDiscount = flags.enableDiscount;
      if (flags.enableComplementaryHours !== undefined) {
        data.enableComplementaryHours = flags.enableComplementaryHours;
      }
      if (flags.enableInterestFine !== undefined) data.enableInterestFine = flags.enableInterestFine;
    }
  }

  const updated = await prisma.financialAccount.update({
    where: { id },
    data,
    select: {
      ...accountSelect,
      parent: { select: { id: true, name: true } },
      costCenter: { select: { id: true, name: true } },
    },
  });
  res.json(mapAccount(updated));
});

financialAccountsRouter.delete(
  "/:id",
  requireAnyFeature([FEATURE, "configuracoes.financeiro.categoriasFinanceiras"]),
  async (req, res) => {
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

  // Checagens indexadas (evita DELETE + seq scan de FK em payables/receivables grandes).
  const [child, payable, receivable, entry, payRule, recRule] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { parentId: id, tenantId: user.tenantId }, select: { id: true } }),
    prisma.payable.findFirst({ where: { financialAccountId: id, tenantId: user.tenantId }, select: { id: true } }),
    prisma.receivable.findFirst({ where: { financialAccountId: id, tenantId: user.tenantId }, select: { id: true } }),
    prisma.financialEntry.findFirst({ where: { financialAccountId: id, tenantId: user.tenantId }, select: { id: true } }),
    prisma.payableRecurrenceRule.findFirst({
      where: { financialAccountId: id, tenantId: user.tenantId },
      select: { id: true },
    }),
    prisma.receivableRecurrenceRule.findFirst({
      where: { financialAccountId: id, tenantId: user.tenantId },
      select: { id: true },
    }),
  ]);
  if (child || payable || receivable || entry || payRule || recRule) {
    res.status(409).json({ error: financeConfigDeleteInUseError("conta") });
    return;
  }

  try {
    await prisma.financialAccount.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      res.status(409).json({ error: financeConfigDeleteInUseError("conta") });
      return;
    }
    throw err;
  }
});
