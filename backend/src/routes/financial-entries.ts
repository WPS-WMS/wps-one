import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import {
  formatCentsToBrl,
  parseFinancialEntryWriteBody,
  parseEntryDate,
  validateFinancialEntryCreate,
} from "../lib/financialEntryHelpers.js";
import { paginatedJson, parseListPagination } from "../lib/listPagination.js";

export const financialEntriesRouter = Router();
financialEntriesRouter.use(authMiddleware);

const FEATURE = "financeiro.lancamentos" as const;

type AuthUser = { id: string; tenantId: string; role: string };

function mapEntryRow(row: {
  id: string;
  costCenterId: string;
  financialAccountId: string;
  type: string;
  amountCents: number;
  entryDate: Date;
  description: string | null;
  status: string;
  supplierId: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  costCenter: { id: string; name: string; code: string | null };
  financialAccount: { id: string; name: string; type: string };
  supplier: { id: string; nomeApelido: string } | null;
  project: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  updatedBy?: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    costCenterId: row.costCenterId,
    costCenterName: row.costCenter.name,
    costCenterCode: row.costCenter.code,
    financialAccountId: row.financialAccountId,
    financialAccountName: row.financialAccount.name,
    type: row.type,
    amountCents: row.amountCents,
    amountFormatted: formatCentsToBrl(row.amountCents),
    entryDate: row.entryDate.toISOString().slice(0, 10),
    description: row.description,
    status: row.status,
    supplierId: row.supplierId,
    supplierName: row.supplier?.nomeApelido ?? null,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    createdById: row.createdBy.id,
    createdByName: row.createdBy.name,
    updatedById: row.updatedBy?.id ?? null,
    updatedByName: row.updatedBy?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const entryInclude = {
  costCenter: { select: { id: true, name: true, code: true } },
  financialAccount: { select: { id: true, name: true, type: true } },
  supplier: { select: { id: true, nomeApelido: true } },
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} as const;

async function validateReferences(
  user: AuthUser,
  data: {
    costCenterId: string;
    financialAccountId: string;
    type: string;
    supplierId?: string | null;
    projectId?: string | null;
  },
): Promise<string | null> {
  const cc = await prisma.costCenter.findFirst({
    where: { id: data.costCenterId, tenantId: user.tenantId, isActive: true },
    select: { id: true },
  });
  if (!cc) return "Centro de custo inválido ou inativo.";

  const account = await prisma.financialAccount.findFirst({
    where: { id: data.financialAccountId, tenantId: user.tenantId, isActive: true },
    select: { id: true, type: true },
  });
  if (!account) return "Conta do plano de contas inválida ou inativa.";
  if (account.type !== data.type) return "Tipo do lançamento deve corresponder ao tipo da conta.";

  if (data.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!supplier) return "Fornecedor inválido.";
  }

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, client: { tenantId: user.tenantId } },
      select: { id: true },
    });
    if (!project) return "Projeto inválido.";
    const canAccess = await userCanAccessProject(prisma, user, data.projectId);
    if (!canAccess) return "Sem acesso a este projeto.";
  }

  return null;
}

financialEntriesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);

  const start = String(req.query.start ?? "").trim();
  const end = String(req.query.end ?? "").trim();
  const costCenterId = String(req.query.costCenterId ?? "").trim();
  const type = String(req.query.type ?? "").trim().toUpperCase();
  const status = String(req.query.status ?? "LANCADO").trim().toUpperCase();
  const pagination = parseListPagination(req.query.limit, req.query.offset);

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (status && status !== "TODOS") where.status = status;
  if (type === "RECEITA" || type === "DESPESA") where.type = type;
  if (costCenterId) where.costCenterId = costCenterId;

  // Período obrigatório: default = mês corrente (UTC) para evitar full-scan.
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  const dateFilter: Record<string, Date> = {
    gte: parseEntryDate(start) ?? defaultStart,
    lte: parseEntryDate(end) ?? defaultEnd,
  };
  where.entryDate = dateFilter;

  const [total, rows] = await Promise.all([
    prisma.financialEntry.count({ where }),
    prisma.financialEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      include: entryInclude,
      take: pagination.limit,
      skip: pagination.offset,
    }),
  ]);
  res.json(paginatedJson(rows.map(mapEntryRow), total, pagination));
});

financialEntriesRouter.post(
  "/import-csv",
  requireFeature(FEATURE),
  requireAnyFeature(["financeiro.contasPagar", "financeiro.contasReceber"]),
  async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const csvText =
      typeof req.body?.csvText === "string"
        ? req.body.csvText
        : typeof req.body?.content === "string"
          ? req.body.content
          : "";
    if (!csvText.trim()) {
      res.status(400).json({ error: "Envie o conteúdo do CSV (csvText)." });
      return;
    }

    const kindRaw = String(req.body?.importKind ?? req.body?.kind ?? "")
      .trim()
      .toUpperCase();
    const importKind = kindRaw === "RECEITA" || kindRaw === "DESPESA" ? kindRaw : null;
    if (!importKind) {
      res.status(400).json({ error: "Informe importKind: RECEITA ou DESPESA." });
      return;
    }

    await ensureFinanceDefaults(user.tenantId);
    const { importFinanceCsv } = await import("../lib/financeCsvImport.js");
    const result = await importFinanceCsv({
      prisma,
      tenantId: user.tenantId,
      userId: user.id,
      csvText,
      importKind,
    });
    const created = result.createdPayables + result.createdReceivables;
    if (created === 0 && result.errors.length > 0) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  },
);

financialEntriesRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const entry = await prisma.financialEntry.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!entry) {
    res.status(404).json({ error: "Lançamento não encontrado." });
    return;
  }
  const rows = await prisma.financialEntryHistory.findMany({
    where: { financialEntryId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

financialEntriesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const parsed = parseFinancialEntryWriteBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const err = validateFinancialEntryCreate(parsed.data);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  const refErr = await validateReferences(user, {
    costCenterId: parsed.data.costCenterId!,
    financialAccountId: parsed.data.financialAccountId!,
    type: parsed.data.type!,
    supplierId: parsed.data.supplierId,
    projectId: parsed.data.projectId,
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const entryDate = parseEntryDate(parsed.data.entryDate!)!;
  const created = await prisma.$transaction(async (tx) => {
    const entry = await tx.financialEntry.create({
      data: {
        tenantId: user.tenantId,
        costCenterId: parsed.data.costCenterId!,
        financialAccountId: parsed.data.financialAccountId!,
        type: parsed.data.type!,
        amountCents: parsed.data.amountCents!,
        entryDate,
        description: parsed.data.description ?? null,
        status: parsed.data.status ?? "LANCADO",
        supplierId: parsed.data.supplierId ?? null,
        projectId: parsed.data.projectId ?? null,
        createdById: user.id,
      },
      include: entryInclude,
    });
    await tx.financialEntryHistory.create({
      data: {
        financialEntryId: entry.id,
        userId: user.id,
        action: "CREATE",
        details: "Lançamento criado.",
      },
    });
    return entry;
  });
  res.status(201).json(mapEntryRow(created));
});

financialEntriesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.financialEntry.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Lançamento não encontrado." });
    return;
  }

  const parsed = parseFinancialEntryWriteBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const next = {
    costCenterId: parsed.data.costCenterId ?? existing.costCenterId,
    financialAccountId: parsed.data.financialAccountId ?? existing.financialAccountId,
    type: parsed.data.type ?? existing.type,
    supplierId: parsed.data.supplierId !== undefined ? parsed.data.supplierId : existing.supplierId,
    projectId: parsed.data.projectId !== undefined ? parsed.data.projectId : existing.projectId,
  };

  const refErr = await validateReferences(user, next);
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const data: Record<string, unknown> = {
    costCenterId: next.costCenterId,
    financialAccountId: next.financialAccountId,
    type: next.type,
    supplierId: next.supplierId,
    projectId: next.projectId,
    updatedById: user.id,
  };
  if (parsed.data.amountCents != null) data.amountCents = parsed.data.amountCents;
  if (parsed.data.entryDate != null) data.entryDate = parseEntryDate(parsed.data.entryDate)!;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.status != null) data.status = parsed.data.status;

  const updated = await prisma.$transaction(async (tx) => {
    const entry = await tx.financialEntry.update({
      where: { id },
      data,
      include: entryInclude,
    });
    await tx.financialEntryHistory.create({
      data: {
        financialEntryId: id,
        userId: user.id,
        action: "UPDATE",
        details: "Lançamento atualizado.",
      },
    });
    return entry;
  });
  res.json(mapEntryRow(updated));
});

financialEntriesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.financialEntry.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Lançamento não encontrado." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.update({
      where: { id },
      data: { status: "CANCELADO", updatedById: user.id },
    });
    await tx.financialEntryHistory.create({
      data: {
        financialEntryId: id,
        userId: user.id,
        action: "CANCEL",
        details: "Lançamento cancelado.",
      },
    });
  });
  res.status(204).end();
});
