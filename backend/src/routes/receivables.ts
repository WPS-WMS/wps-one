import { Request, Router } from "express";
import { existsSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join, normalize, sep } from "path";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import { errorSummary } from "../lib/devLog.js";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { TICKET_ATTACHMENT_MAX_BYTES, ticketAttachmentMaxSizeError } from "../lib/ticketAttachmentLimits.js";
import { contentDispositionAttachment } from "../lib/contentDisposition.js";
import {
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  normalizeAllocations,
  parseEntryDate,
  parseInvoiceWriteBody,
  parseReceivableWriteBody,
  RECEIVABLE_ATTACHMENT_CATEGORIES,
  validateReceivableCreate,
} from "../lib/receivableHelpers.js";
import {
  computeAgingSummary,
  emitQuickInvoice,
  expandReceivableListRows,
  generateRecurrenceReceivables,
  issueInvoice,
  mapReceivableListRow,
  markReceivableAsReceived,
  receiveInstallment,
  setReceivableManualStatus,
  unmarkReceivableAsReceived,
  unreceiveInstallment,
} from "../lib/receivableService.js";
import {
  cleanupOrphanProjectReceivables,
  syncReceivableFromProjectRevenue,
} from "../lib/createReceivableFromProjectRevenue.js";
import { sendReceivableOverdueAlerts } from "../lib/receivableEmailNotifications.js";
import { paginatedJson, parseListPagination } from "../lib/listPagination.js";

export const receivablesRouter = Router();
receivablesRouter.use(authMiddleware);

const FEATURE = "financeiro.contasReceber" as const;

const uploadsDir = join(getUploadsRoot(), "receivables");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch((e) =>
    console.error("[receivables] mkdir uploads", errorSummary(e)),
  );
}

type AuthUser = { id: string; tenantId: string; role: string };

const listInclude = {
  client: { select: { id: true, name: true } },
  project: {
    select: {
      id: true,
      name: true,
      contracts: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { title: true },
      },
    },
  },
  projectRevenue: {
    select: {
      contractProposal: true,
      billingLines: {
        orderBy: { sortOrder: "asc" as const },
        select: { installmentNumber: true, milestone: true },
      },
    },
  },
  financialAccount: { select: { id: true, name: true } },
  invoice: { select: { nfNumber: true, emissionDate: true } },
  installments: { orderBy: { installmentNumber: "asc" as const } },
} as const;

async function validateReceivableRefs(
  user: AuthUser,
  data: {
    clientId: string;
    financialAccountId: string;
    projectId?: string | null;
    allocations?: { costCenterId: string; projectId?: string | null }[];
  },
): Promise<string | null> {
  const [client, account, headerProject] = await Promise.all([
    prisma.client.findFirst({
      where: { id: data.clientId, tenantId: user.tenantId },
      select: { id: true },
    }),
    prisma.financialAccount.findFirst({
      where: { id: data.financialAccountId, tenantId: user.tenantId, type: "RECEITA", isActive: true },
      select: { id: true },
    }),
    data.projectId
      ? prisma.project.findFirst({
          where: { id: data.projectId, clientId: data.clientId, client: { tenantId: user.tenantId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!client) return "Cliente inválido.";
  if (!account) return "Conta financeira inválida (deve ser RECEITA).";
  if (data.projectId) {
    if (!headerProject) return "Projeto inválido para o cliente.";
    if (!(await userCanAccessProject(prisma, user, data.projectId))) {
      return "Sem acesso ao projeto.";
    }
  }

  const allocations = data.allocations ?? [];
  if (allocations.length === 0) return null;

  const costCenterIds = [...new Set(allocations.map((a) => a.costCenterId))];
  const projectIds = [...new Set(allocations.map((a) => a.projectId).filter(Boolean) as string[])];

  const [costCenters, projects] = await Promise.all([
    prisma.costCenter.findMany({
      where: { id: { in: costCenterIds }, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    }),
    projectIds.length
      ? prisma.project.findMany({
          where: {
            id: { in: projectIds },
            clientId: data.clientId,
            client: { tenantId: user.tenantId },
          },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);

  const ccOk = new Set(costCenters.map((c) => c.id));
  const projectOk = new Set(projects.map((p) => p.id));

  for (const a of allocations) {
    if (!ccOk.has(a.costCenterId)) return "Centro de custo inválido no rateio.";
    if (a.projectId) {
      if (!projectOk.has(a.projectId)) return "Projeto inválido no rateio.";
      if (!(await userCanAccessProject(prisma, user, a.projectId))) {
        return "Sem acesso ao projeto no rateio.";
      }
    }
  }
  return null;
}

receivablesRouter.get("/aging", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const summary = await computeAgingSummary(user.tenantId);
  res.json(summary);
});

receivablesRouter.post("/alerts/send", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const result = await sendReceivableOverdueAlerts(user.tenantId);
  res.json(result);
});

receivablesRouter.post("/sync", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);
  const generated = await generateRecurrenceReceivables(user.tenantId, user.id).catch(() => 0);
  const cleaned = await cleanupOrphanProjectReceivables(user.tenantId, user.id).catch(() => 0);

  const orphanRevenues = await prisma.projectRevenue.findMany({
    where: {
      tenantId: user.tenantId,
      status: { not: "CANCELADO" },
      receivable: null,
      OR: [
        { billingLines: { some: { amount: { gt: 0 } } } },
        { expectedRevenue: { gt: 0 } },
        { contractedValue: { gt: 0 } },
      ],
    },
    select: { id: true },
    take: 50,
  });
  let syncedOrphans = 0;
  for (const orphan of orphanRevenues) {
    const ok = await syncReceivableFromProjectRevenue(user.tenantId, user.id, orphan.id).catch(() => null);
    if (ok) syncedOrphans += 1;
  }

  const linkedRevenues = await prisma.projectRevenue.findMany({
    where: {
      tenantId: user.tenantId,
      status: { not: "CANCELADO" },
      receivable: { isNot: null },
    },
    select: {
      id: true,
      expectedRevenue: true,
      contractedValue: true,
      _count: { select: { billingLines: true } },
      billingLines: { select: { amount: true }, take: 50 },
      receivable: { select: { _count: { select: { installments: true } } } },
    },
    take: 80,
  });
  let resynced = 0;
  for (const row of linkedRevenues) {
    const amount = row.expectedRevenue ?? row.contractedValue ?? 0;
    const positiveBilling = row.billingLines.some((l) => l.amount > 0);
    const billingCount = row._count.billingLines;
    const installmentCount = row.receivable?._count.installments ?? 0;
    const needsSync =
      amount <= 0 ||
      (billingCount > 0 && !positiveBilling) ||
      (billingCount > 0 && billingCount !== installmentCount);
    if (needsSync) {
      const ok = await syncReceivableFromProjectRevenue(user.tenantId, user.id, row.id).catch(() => null);
      if (ok) resynced += 1;
    }
  }

  res.json({ generated, cleaned, syncedOrphans, resynced });
});

receivablesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);

  const status = String(req.query.status ?? "").trim().toUpperCase();
  const kind = String(req.query.kind ?? "").trim().toUpperCase();
  const competenceMonth = String(req.query.competenceMonth ?? "").trim();
  const clientId = String(req.query.clientId ?? "").trim();
  const projectId = String(req.query.projectId ?? "").trim();
  const dueFromRaw = String(req.query.dueFrom ?? "").trim();
  const dueToRaw = String(req.query.dueTo ?? "").trim();
  const q = String(req.query.q ?? "").trim();
  const pagination = parseListPagination(req.query.limit, req.query.offset);

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (kind) where.kind = kind;
  if (clientId) where.clientId = clientId;
  if (projectId) where.projectId = projectId;
  if (status === "CANCELADO") where.status = "CANCELADO";
  else if (!status) where.status = { not: "CANCELADO" };
  else if (status === "FATURADO") {
    where.status = "FATURADO";
  } else if (status === "PREVISTO") {
    where.status = { notIn: ["CANCELADO", "FATURADO", "RECEBIDO"] };
    where.invoice = null;
  } else if (status === "RECEBIDO") {
    where.status = "RECEBIDO";
  } else {
    where.status = status;
  }

  const dueFrom = /^\d{4}-\d{2}-\d{2}$/.test(dueFromRaw) ? new Date(`${dueFromRaw}T00:00:00.000Z`) : null;
  const dueTo = /^\d{4}-\d{2}-\d{2}$/.test(dueToRaw) ? new Date(`${dueToRaw}T23:59:59.999Z`) : null;
  const dateRange: Record<string, Date> | null =
    dueFrom || dueTo
      ? {
          ...(dueFrom ? { gte: dueFrom } : {}),
          ...(dueTo ? { lte: dueTo } : {}),
        }
      : null;

  // Alinhado ao dashboard: filtro de período = vencimento da parcela (não competência do CR).
  if (dateRange) {
    where.AND = [
      {
        installments: {
          some: { dueDate: dateRange, status: { not: "CANCELADO" } },
        },
      },
    ];
  }

  if (/^\d{4}-\d{2}$/.test(competenceMonth)) {
    const [y, m] = competenceMonth.split("-").map(Number);
    const monthStart = new Date(Date.UTC(y!, m! - 1, 1));
    const monthEnd = new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999));
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
      {
        installments: {
          some: {
            dueDate: { gte: monthStart, lte: monthEnd },
            status: { not: "CANCELADO" },
          },
        },
      },
    ];
  }

  if (q) {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
      {
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { client: { name: { contains: q, mode: "insensitive" } } },
          { project: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const installmentWhere: Record<string, unknown> = {
    status: status === "CANCELADO" ? "CANCELADO" : { not: "CANCELADO" },
    receivable: where,
  };
  if (dateRange) {
    installmentWhere.dueDate = dateRange;
  } else if (/^\d{4}-\d{2}$/.test(competenceMonth)) {
    const [y, m] = competenceMonth.split("-").map(Number);
    installmentWhere.dueDate = {
      gte: new Date(Date.UTC(y!, m! - 1, 1)),
      lte: new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999)),
    };
  }

  const [rows, installmentCount, sumAgg] = await Promise.all([
    prisma.receivable.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: listInclude,
      take: pagination.limit,
      skip: pagination.offset,
    }),
    prisma.receivableInstallment.count({ where: installmentWhere }),
    prisma.receivableInstallment.aggregate({
      where: installmentWhere,
      _sum: { amountCents: true },
    }),
  ]);

  let list = rows.flatMap(expandReceivableListRows).filter((row) => row.status !== "CANCELADO" || status === "CANCELADO");

  // Mantém só parcelas cujo vencimento cai no período filtrado (evita puxar irmãs de outros meses).
  if (dueFromRaw || dueToRaw || /^\d{4}-\d{2}$/.test(competenceMonth)) {
    let fromIso = dueFromRaw || "";
    let toIso = dueToRaw || "";
    if (/^\d{4}-\d{2}$/.test(competenceMonth) && !fromIso && !toIso) {
      const [y, m] = competenceMonth.split("-").map(Number);
      const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
      fromIso = `${y}-${String(m).padStart(2, "0")}-01`;
      toIso = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    }
    list = list.filter((row) => {
      const d = row.nextDueDate ?? row.competenceDate;
      if (!d) return false;
      if (fromIso && d < fromIso) return false;
      if (toIso && d > toIso) return false;
      return true;
    });
  }

  if (status && status !== "CANCELADO" && status !== "FATURADO" && status !== "PREVISTO" && status !== "RECEBIDO") {
    list = list.filter((row) => row.status === status);
  } else if (status === "FATURADO") {
    list = list.filter((row) => row.status === "FATURADO");
  } else if (status === "RECEBIDO") {
    list = list.filter((row) => row.status === "RECEBIDO" || row.paid);
  } else if (status === "PREVISTO") {
    list = list.filter(
      (row) =>
        row.status !== "CANCELADO" &&
        row.status !== "FATURADO" &&
        row.status !== "RECEBIDO" &&
        !row.nfNumber &&
        !row.paid,
    );
  }

  list.sort((a, b) => {
    const da = a.nextDueDate ?? a.competenceDate ?? "";
    const db = b.nextDueDate ?? b.competenceDate ?? "";
    if (da !== db) return da.localeCompare(db);
    return a.clientName.localeCompare(b.clientName, "pt-BR");
  });

  const sumCents = sumAgg._sum.amountCents ?? 0;
  res.json(
    paginatedJson(list, installmentCount, pagination, {
      sumCents,
    }),
  );
});

receivablesRouter.get("/recurrence/rules", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const rows = await prisma.receivableRecurrenceRule.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      financialAccount: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  // Após o último vencimento, o nextDueDate persistido avança para além do término
  // (marcador de agenda). Para exibição, não mostrar datas fora do período.
  res.json(
    rows.map((rule) =>
      rule.endDate && rule.nextDueDate > rule.endDate ? { ...rule, nextDueDate: null } : rule,
    ),
  );
});

receivablesRouter.post("/recurrence/rules", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const b = req.body ?? {};
  const description = String(b.description ?? "").trim();
  const clientId = String(b.clientId ?? "").trim();
  const financialAccountId = String(b.financialAccountId ?? "").trim();
  const amountCents = Number(b.amountCents ?? 0);
  const startDate = parseEntryDate(b.startDate);
  const defaultCostCenterId = String(b.defaultCostCenterId ?? "").trim();
  if (!description || !clientId || !financialAccountId || amountCents <= 0 || !startDate || !defaultCostCenterId) {
    res.status(400).json({ error: "Descrição, cliente, conta, valor, início e centro de custo são obrigatórios." });
    return;
  }
  const frequency = String(b.frequency ?? "MENSAL").toUpperCase();
  const dayOfMonth = Math.min(28, Math.max(1, Number(b.dayOfMonth ?? 1)));

  const refErr = await validateReceivableRefs(user, {
    clientId,
    financialAccountId,
    projectId: b.projectId ? String(b.projectId) : null,
    allocations: [{ costCenterId: defaultCostCenterId }],
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const created = await prisma.receivableRecurrenceRule.create({
    data: {
      tenantId: user.tenantId,
      clientId,
      financialAccountId,
      defaultCostCenterId,
      projectId: b.projectId ? String(b.projectId) : null,
      description,
      amountCents: Math.round(amountCents),
      frequency,
      dayOfMonth,
      startDate,
      endDate: b.endDate ? parseEntryDate(b.endDate) : null,
      nextDueDate: startDate,
      isActive: true,
    },
  });
  res.status(201).json(created);
});

receivablesRouter.post("/recurrence/generate", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const count = await generateRecurrenceReceivables(user.tenantId, user.id);
  res.json({ generated: count });
});

receivablesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const parsed = parseReceivableWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const err = validateReceivableCreate(parsed.data);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);

  const kind = parsed.data.kind ?? "MANUAL";
  const dueDate = parseEntryDate(parsed.data.dueDate!)!;
  const count = parsed.data.installmentCount ?? 1;
  const allocations = normalizeAllocations(
    parsed.data.totalAmountCents!,
    parsed.data.allocations,
    parsed.data.allocations?.[0]?.costCenterId,
  );
  if (allocations.length === 0) {
    res.status(400).json({ error: "Informe ao menos um rateio por centro de custo." });
    return;
  }

  const refErr = await validateReceivableRefs(user, {
    clientId: parsed.data.clientId!,
    financialAccountId: parsed.data.financialAccountId!,
    projectId: parsed.data.projectId,
    allocations,
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const competence = parsed.data.competenceDate
    ? parseEntryDate(parsed.data.competenceDate)
    : dueDate;
  const installments = buildInstallmentPlan(parsed.data.totalAmountCents!, count, dueDate);

  const created = await prisma.$transaction(async (tx) => {
    return tx.receivable.create({
      data: {
        tenantId: user.tenantId,
        clientId: parsed.data.clientId!,
        projectId: parsed.data.projectId ?? null,
        financialAccountId: parsed.data.financialAccountId!,
        description: parsed.data.description!,
        totalAmountCents: parsed.data.totalAmountCents!,
        netAmountCents: parsed.data.netAmountCents ?? null,
        taxAmountCents: parsed.data.taxAmountCents ?? null,
        retentionAmountCents: parsed.data.retentionAmountCents ?? null,
        competenceDate: competence,
        kind,
        status: "PREVISTO",
        createdById: user.id,
        notes: parsed.data.notes ?? null,
        recurrenceRuleId: parsed.data.recurrenceRuleId ?? null,
        installments: {
          create: installments.map((inst) => ({
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            amountCents: inst.amountCents,
            status: "PREVISTO",
          })),
        },
        allocations: {
          create: allocations.map((a) => ({
            costCenterId: a.costCenterId,
            projectId: a.projectId ?? null,
            percentBps: a.percentBps ?? 10000,
            amountCents: a.amountCents ?? parsed.data.totalAmountCents!,
          })),
        },
        history: {
          create: {
            userId: user.id,
            action: "CREATE",
            details: parsed.data.description!,
          },
        },
      },
      include: listInclude,
    });
  });

  res.status(201).json(mapReceivableListRow(created));
});

receivablesRouter.get("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const row = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      ...listInclude,
      allocations: {
        include: {
          costCenter: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      invoice: true,
    },
  });
  if (!row) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  res.json({
    ...mapReceivableListRow(row),
    clientId: row.clientId,
    clientName: row.client.name,
    notes: row.notes,
    netAmountCents: row.netAmountCents,
    taxAmountCents: row.taxAmountCents,
    retentionAmountCents: row.retentionAmountCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: row.createdBy.name,
    updatedByName: row.updatedBy?.name ?? null,
    invoice: row.invoice
      ? {
          nfNumber: row.invoice.nfNumber,
          nfSeries: row.invoice.nfSeries,
          emissionDate: row.invoice.emissionDate.toISOString().slice(0, 10),
          grossAmountCents: row.invoice.grossAmountCents,
          netAmountCents: row.invoice.netAmountCents,
          taxAmountCents: row.invoice.taxAmountCents,
          retentionAmountCents: row.invoice.retentionAmountCents,
        }
      : null,
    allocations: row.allocations.map((a) => ({
      id: a.id,
      costCenterId: a.costCenterId,
      costCenterName: a.costCenter.name,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      percentBps: a.percentBps,
      amountCents: a.amountCents,
    })),
    installments: row.installments.map((i) => ({
      id: i.id,
      installmentNumber: i.installmentNumber,
      dueDate: i.dueDate.toISOString().slice(0, 10),
      amountCents: i.amountCents,
      status: computeEffectiveInstallmentStatus(i),
      receivedAt: i.receivedAt,
      nfNumber: i.nfNumber ?? null,
      nfEmissionDate: i.nfEmissionDate?.toISOString().slice(0, 10) ?? null,
    })),
  });
});

receivablesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  if (existing.status === "CANCELADO") {
    res.status(400).json({ error: "Conta cancelada não pode ser editada." });
    return;
  }
  if (existing.status === "RECEBIDO") {
    res.status(400).json({ error: "Conta recebida: desmarque o recebimento antes de editar." });
    return;
  }

  const b = req.body ?? {};
  const data: {
    description?: string;
    totalAmountCents?: number;
    competenceDate?: Date | null;
    notes?: string | null;
    projectId?: string | null;
    updatedById?: string;
  } = { updatedById: user.id };

  if (b.description !== undefined) {
    const description = String(b.description ?? "").trim();
    if (!description) {
      res.status(400).json({ error: "Informe a descrição." });
      return;
    }
    data.description = description;
  }
  if (b.totalAmountCents !== undefined) {
    const cents = Number(b.totalAmountCents);
    if (!Number.isFinite(cents) || cents < 0) {
      res.status(400).json({ error: "Valor inválido." });
      return;
    }
    data.totalAmountCents = Math.round(cents);
  }
  if (b.competenceDate !== undefined) {
    data.competenceDate = b.competenceDate ? parseEntryDate(b.competenceDate) : null;
  }
  if (b.notes !== undefined) data.notes = b.notes == null ? null : String(b.notes);
  if (b.projectId !== undefined) data.projectId = b.projectId ? String(b.projectId) : null;

  const dueDate = b.dueDate !== undefined ? parseEntryDate(b.dueDate) : undefined;
  if (b.dueDate !== undefined && !dueDate) {
    res.status(400).json({ error: "Previsão de pagamento inválida." });
    return;
  }

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, clientId: existing.clientId, client: { tenantId: user.tenantId } },
      select: { id: true },
    });
    if (!project) {
      res.status(400).json({ error: "Projeto inválido para o cliente." });
      return;
    }
    if (!(await userCanAccessProject(prisma, user, data.projectId))) {
      res.status(400).json({ error: "Sem acesso ao projeto." });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.receivable.update({ where: { id }, data });

    if (data.totalAmountCents != null) {
      const open = existing.installments.filter((i) => i.status !== "RECEBIDO" && i.status !== "CANCELADO");
      if (open.length === 1) {
        await tx.receivableInstallment.update({
          where: { id: open[0]!.id },
          data: { amountCents: data.totalAmountCents },
        });
      } else if (open.length > 1) {
        const plan = buildInstallmentPlan(data.totalAmountCents, open.length, open[0]!.dueDate);
        for (let i = 0; i < open.length; i++) {
          await tx.receivableInstallment.update({
            where: { id: open[i]!.id },
            data: { amountCents: plan[i]!.amountCents },
          });
        }
      }
    }

    if (dueDate) {
      const nextOpen = existing.installments.find((i) => i.status !== "RECEBIDO" && i.status !== "CANCELADO");
      if (nextOpen) {
        await tx.receivableInstallment.update({
          where: { id: nextOpen.id },
          data: { dueDate },
        });
      }
    }

    await tx.receivableHistory.create({
      data: {
        receivableId: id,
        userId: user.id,
        action: "UPDATE",
        details: "Conta a receber atualizada.",
      },
    });
  });

  const updated = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    include: listInclude,
  });
  res.json(updated ? mapReceivableListRow(updated) : { ok: true });
});

receivablesRouter.post("/:id/invoice", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const parsed = parseInvoiceWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const emissionDate = parseEntryDate(parsed.data.emissionDate!);
  if (!emissionDate) {
    res.status(400).json({ error: "Data de emissão inválida." });
    return;
  }
  const result = await issueInvoice(
    user.tenantId,
    user.id,
    id,
    {
      nfNumber: parsed.data.nfNumber!,
      nfSeries: parsed.data.nfSeries,
      emissionDate,
      grossAmountCents: parsed.data.grossAmountCents!,
      netAmountCents: parsed.data.netAmountCents!,
      taxAmountCents: parsed.data.taxAmountCents ?? 0,
      retentionAmountCents: parsed.data.retentionAmountCents ?? 0,
    },
    {
      installmentId:
        typeof req.body?.installmentId === "string" ? req.body.installmentId : null,
    },
  );
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao faturar." });
    return;
  }
  res.json({ ok: true });
});

/** Atalho da listagem: gera Nro NF aleatório + Dt emissão = hoje e marca como Faturado (só a parcela). */
receivablesRouter.post("/:id/emit-invoice", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const installmentId =
    typeof req.body?.installmentId === "string" ? req.body.installmentId : null;
  const result = await emitQuickInvoice(user.tenantId, user.id, id, installmentId);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao emitir nota." });
    return;
  }
  res.json({ ok: true, nfNumber: result.nfNumber, emissionDate: result.emissionDate });
});

receivablesRouter.patch("/:id/cancel", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  if (existing.status === "RECEBIDO") {
    res.status(400).json({ error: "Não é possível cancelar conta já recebida." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.receivable.update({ where: { id }, data: { status: "CANCELADO", updatedById: user.id } });
    await tx.receivableInstallment.updateMany({
      where: { receivableId: id, status: { not: "RECEBIDO" } },
      data: { status: "CANCELADO" },
    });
    await tx.receivableHistory.create({
      data: { receivableId: id, userId: user.id, action: "CANCEL", details: "Conta cancelada." },
    });
  });
  try {
    const { syncReimbursementCancelledFromFinance } = await import(
      "../lib/syncReimbursementFinanceStatus.js"
    );
    await syncReimbursementCancelledFromFinance({ tenantId: user.tenantId, receivableId: id });
  } catch {
    /* ignore */
  }
  res.json({ ok: true });
});

receivablesRouter.post("/:id/mark-received", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const receivedAt = req.body?.receivedAt as string | undefined;
  const result = await markReceivableAsReceived(user.tenantId, user.id, receivableId, receivedAt);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao marcar como recebido." });
    return;
  }
  res.json({ ok: true, receivedCount: result.receivedCount });
});

receivablesRouter.post("/:id/unmark-received", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const result = await unmarkReceivableAsReceived(user.tenantId, user.id, receivableId);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao desmarcar recebimento." });
    return;
  }
  res.json({ ok: true, unreceivedCount: result.unreceivedCount });
});

receivablesRouter.patch("/:id/status", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const status = String(req.body?.status ?? "");
  const result = await setReceivableManualStatus(user.tenantId, user.id, receivableId, status);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao alterar status." });
    return;
  }
  res.json({ ok: true });
});

receivablesRouter.post("/:id/installments/:installmentId/receive", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const installmentId = String(req.params.installmentId);
  const receivedAt = req.body?.receivedAt as string | undefined;
  const result = await receiveInstallment(user.tenantId, user.id, receivableId, installmentId, receivedAt);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao receber." });
    return;
  }
  res.json({ ok: true });
});

receivablesRouter.post("/:id/installments/:installmentId/unreceive", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const installmentId = String(req.params.installmentId);
  const result = await unreceiveInstallment(user.tenantId, user.id, receivableId, installmentId);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao desmarcar recebimento." });
    return;
  }
  res.json({ ok: true });
});

receivablesRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const receivable = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!receivable) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  const rows = await prisma.receivableHistory.findMany({
    where: { receivableId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

receivablesRouter.get("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const receivable = await prisma.receivable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!receivable) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  const rows = await prisma.receivableAttachment.findMany({
    where: { receivableId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      receivableId: true,
      userId: true,
      filename: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      category: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
});

receivablesRouter.post("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const receivableId = String(req.params.id);
    const { fileName, fileData, fileType, fileSize, category } = req.body ?? {};

    const receivable = await prisma.receivable.findFirst({
      where: { id: receivableId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!receivable) {
      res.status(404).json({ error: "Conta a receber não encontrada." });
      return;
    }
    if (!fileName || !fileData) {
      res.status(400).json({ error: "fileName e fileData são obrigatórios." });
      return;
    }
    const cat = String(category ?? "NOTA_FISCAL").toUpperCase();
    if (
      !RECEIVABLE_ATTACHMENT_CATEGORIES.includes(
        cat as (typeof RECEIVABLE_ATTACHMENT_CATEGORIES)[number],
      )
    ) {
      res.status(400).json({ error: "Categoria de anexo inválida. Use Nota fiscal ou Boleto." });
      return;
    }

    const base64Data = String(fileData).replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > TICKET_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ error: ticketAttachmentMaxSizeError() });
      return;
    }

    const uniqueFileName = `${receivableId}-${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      await writeFile(join(uploadsDir, uniqueFileName), buffer);
    } catch (e) {
      console.error("[receivables] writeFile disk (continuing with DB)", errorSummary(e));
    }

    const mimeFromDataUrl =
      typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
    const effectiveType = String(fileType || mimeFromDataUrl || "application/octet-stream");

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.receivableAttachment.create({
        data: {
          receivableId,
          userId: user.id,
          filename: String(fileName),
          fileUrl: `/uploads/receivables/${uniqueFileName}`,
          fileType: effectiveType,
          fileSize: fileSize || buffer.length,
          fileContent: buffer,
          category: cat,
        },
        select: {
          id: true,
          receivableId: true,
          userId: true,
          filename: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          category: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      });
      await tx.receivableHistory.create({
        data: {
          receivableId,
          userId: user.id,
          action: "ATTACHMENT_ADDED",
          newValue: String(fileName),
          details: `Anexo (${cat}) adicionado`,
        },
      });
      return att;
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("[receivables] upload", errorSummary(error));
    res.status(500).json({ error: "Erro ao fazer upload." });
  }
});

receivablesRouter.get("/:id/attachments/:attachmentId/file", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const receivableId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);
    const attachment = await prisma.receivableAttachment.findFirst({
      where: { id: attachmentId, receivableId, receivable: { tenantId: user.tenantId } },
      select: { fileUrl: true, filename: true, fileType: true, fileContent: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado." });
      return;
    }

    if (attachment.fileContent && attachment.fileContent.length > 0) {
      res.setHeader("Content-Type", attachment.fileType || "application/octet-stream");
      res.setHeader("Content-Disposition", contentDispositionAttachment(attachment.filename));
      res.send(Buffer.from(attachment.fileContent));
      return;
    }

    const abs = resolveUploadsPublicPath(attachment.fileUrl);
    const root = normalize(join(getUploadsRoot(), "receivables")) + sep;
    if (!abs || !(normalize(abs) + sep).startsWith(root)) {
      res.status(403).json({ error: "Caminho inválido." });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "Arquivo não encontrado." });
      return;
    }
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: "Erro ao enviar arquivo." });
    });
  } catch (error) {
    console.error("[receivables] download", errorSummary(error));
    res.status(500).json({ error: "Erro ao baixar anexo." });
  }
});

receivablesRouter.delete("/:id/attachments/:attachmentId", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const receivableId = String(req.params.id);
  const attachmentId = String(req.params.attachmentId);
  const attachment = await prisma.receivableAttachment.findFirst({
    where: { id: attachmentId, receivableId, receivable: { tenantId: user.tenantId } },
    select: { id: true, fileUrl: true, filename: true },
  });
  if (!attachment) {
    res.status(404).json({ error: "Anexo não encontrado." });
    return;
  }
  const abs = resolveUploadsPublicPath(attachment.fileUrl);
  if (abs) {
    try {
      await unlink(abs);
    } catch {
      /* ignore */
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.receivableAttachment.delete({ where: { id: attachmentId } });
    await tx.receivableHistory.create({
      data: {
        receivableId,
        userId: user.id,
        action: "ATTACHMENT_REMOVED",
        oldValue: attachment.filename,
        details: "Anexo removido",
      },
    });
  });
  res.status(204).end();
});
