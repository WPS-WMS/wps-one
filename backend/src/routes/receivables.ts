import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import {
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  normalizeAllocations,
  parseEntryDate,
  parseInvoiceWriteBody,
  parseReceivableWriteBody,
  validateReceivableCreate,
} from "../lib/receivableHelpers.js";
import {
  computeAgingSummary,
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

export const receivablesRouter = Router();
receivablesRouter.use(authMiddleware);

const FEATURE = "financeiro.contasReceber" as const;

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
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!client) return "Cliente inválido.";

  const account = await prisma.financialAccount.findFirst({
    where: { id: data.financialAccountId, tenantId: user.tenantId, type: "RECEITA", isActive: true },
    select: { id: true },
  });
  if (!account) return "Conta financeira inválida (deve ser RECEITA).";

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, clientId: data.clientId, client: { tenantId: user.tenantId } },
      select: { id: true },
    });
    if (!project) return "Projeto inválido para o cliente.";
    if (!(await userCanAccessProject(prisma, user, data.projectId))) {
      return "Sem acesso ao projeto.";
    }
  }

  for (const a of data.allocations ?? []) {
    const cc = await prisma.costCenter.findFirst({
      where: { id: a.costCenterId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });
    if (!cc) return "Centro de custo inválido no rateio.";
    if (a.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: a.projectId, client: { tenantId: user.tenantId } },
        select: { id: true },
      });
      if (!project) return "Projeto inválido no rateio.";
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

receivablesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);
  await generateRecurrenceReceivables(user.tenantId, user.id).catch(() => 0);
  // CRs vinculadas a receitas de projeto já excluídas
  await cleanupOrphanProjectReceivables(user.tenantId, user.id).catch(() => 0);

  // Backfill: receitas de projeto com parcelas/valor ainda sem conta a receber
  const orphanRevenues = await prisma.projectRevenue.findMany({
    where: {
      tenantId: user.tenantId,
      status: { not: "CANCELADO" },
      receivable: null,
      OR: [
        { billingLines: { some: {} } },
        { expectedRevenue: { gt: 0 } },
        { contractedValue: { gt: 0 } },
      ],
    },
    select: { id: true },
    take: 50,
  });
  for (const orphan of orphanRevenues) {
    await syncReceivableFromProjectRevenue(user.tenantId, user.id, orphan.id).catch(() => null);
  }

  // Re-sincroniza receitas cuja composição de parcelas diverge da CR existente
  // ou que ficaram sem valor (remove CR pendente)
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
      receivable: { select: { _count: { select: { installments: true } } } },
    },
    take: 80,
  });
  for (const row of linkedRevenues) {
    const amount = row.expectedRevenue ?? row.contractedValue ?? 0;
    const billingCount = row._count.billingLines;
    const installmentCount = row.receivable?._count.installments ?? 0;
    const needsSync =
      amount <= 0 || (billingCount > 0 && billingCount !== installmentCount);
    if (needsSync) {
      await syncReceivableFromProjectRevenue(user.tenantId, user.id, row.id).catch(() => null);
    }
  }

  const status = String(req.query.status ?? "").trim().toUpperCase();
  const kind = String(req.query.kind ?? "").trim().toUpperCase();
  const competenceMonth = String(req.query.competenceMonth ?? "").trim();
  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (kind) where.kind = kind;
  // Contas canceladas só entram quando o filtro pede CANCELADO
  if (status === "CANCELADO") where.status = "CANCELADO";
  else if (!status) where.status = { not: "CANCELADO" };

  const rows = await prisma.receivable.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: listInclude,
  });

  let list = rows.flatMap(expandReceivableListRows).filter((row) => row.status !== "CANCELADO" || status === "CANCELADO");

  if (status) {
    const matchesDisplay = (rowStatus: string, nfNumber: string | null) => {
      if (status === "CANCELADO") return rowStatus === "CANCELADO";
      if (status === "FATURADO") {
        return rowStatus === "FATURADO" || rowStatus === "RECEBIDO" || !!nfNumber;
      }
      if (status === "PREVISTO") {
        return (
          rowStatus !== "CANCELADO" &&
          rowStatus !== "FATURADO" &&
          rowStatus !== "RECEBIDO" &&
          !nfNumber
        );
      }
      return rowStatus === status;
    };
    list = list.filter((row) => matchesDisplay(row.status, row.nfNumber));
  }

  if (/^\d{4}-\d{2}$/.test(competenceMonth)) {
    const [y, m] = competenceMonth.split("-").map(Number);
    const prefix = `${y}-${String(m).padStart(2, "0")}`;
    list = list.filter((row) => {
      const ref = row.competenceDate ?? row.nextDueDate;
      return ref != null && ref.startsWith(prefix);
    });
  }

  list.sort((a, b) => {
    const da = a.nextDueDate ?? a.competenceDate ?? "";
    const db = b.nextDueDate ?? b.competenceDate ?? "";
    if (da !== db) return da.localeCompare(db);
    return a.clientName.localeCompare(b.clientName, "pt-BR");
  });

  res.json(list);
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
  res.json(rows);
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
      invoice: true,
    },
  });
  if (!row) {
    res.status(404).json({ error: "Conta a receber não encontrada." });
    return;
  }
  res.json({
    ...mapReceivableListRow(row),
    notes: row.notes,
    netAmountCents: row.netAmountCents,
    taxAmountCents: row.taxAmountCents,
    retentionAmountCents: row.retentionAmountCents,
    createdByName: row.createdBy.name,
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
  } = {};

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
  const result = await issueInvoice(user.tenantId, user.id, id, {
    nfNumber: parsed.data.nfNumber!,
    nfSeries: parsed.data.nfSeries,
    emissionDate,
    grossAmountCents: parsed.data.grossAmountCents!,
    netAmountCents: parsed.data.netAmountCents!,
    taxAmountCents: parsed.data.taxAmountCents ?? 0,
    retentionAmountCents: parsed.data.retentionAmountCents ?? 0,
  });
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao faturar." });
    return;
  }
  res.json({ ok: true });
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
    await tx.receivable.update({ where: { id }, data: { status: "CANCELADO" } });
    await tx.receivableInstallment.updateMany({
      where: { receivableId: id, status: { not: "RECEBIDO" } },
      data: { status: "CANCELADO" },
    });
    await tx.receivableHistory.create({
      data: { receivableId: id, userId: user.id, action: "CANCEL", details: "Conta cancelada." },
    });
  });
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
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows);
});
