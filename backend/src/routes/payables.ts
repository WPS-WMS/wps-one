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
import {
  ATTACHMENT_CATEGORIES,
  buildInstallmentPlan,
  clampDayOfMonth,
  computeEffectiveInstallmentStatus,
  firstRecurrenceDueDate,
  listRecurrenceDueDates,
  normalizeAllocations,
  parseEntryDate,
  parsePayableWriteBody,
  validatePayableCreate,
} from "../lib/payableHelpers.js";
import {
  generateRecurrencePayables,
  mapPayableListRow,
  markPayableAsPaid,
  materializeRecurrenceSchedule,
  payInstallment,
  recurrenceRuleHasPaidPayable,
  removeUnpaidRecurrencePayables,
  setPayableManualStatus,
  synchronizeRecurrenceSchedule,
  unlinkPaidRecurrencePayables,
  unmarkPayableAsPaid,
} from "../lib/payableService.js";
import { contentDispositionAttachment } from "../lib/contentDisposition.js";

export const payablesRouter = Router();
payablesRouter.use(authMiddleware);

const FEATURE = "financeiro.contasPagar" as const;
const FEATURE_APPROVE = "financeiro.contasPagar.aprovar" as const;

type AuthUser = { id: string; tenantId: string; role: string };

const uploadsDir = join(getUploadsRoot(), "payables");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch((e) =>
    console.error("[payables] mkdir uploads", errorSummary(e)),
  );
}

const listInclude = {
  supplier: { select: { id: true, nomeApelido: true } },
  professional: { select: { id: true, name: true, employmentType: true } },
  financialAccount: { select: { id: true, name: true } },
  financialCategory: { select: { id: true, name: true } },
  corporateExpenseType: { select: { id: true, name: true } },
  contractType: { select: { id: true, name: true } },
  installments: { orderBy: { installmentNumber: "asc" as const } },
  allocations: {
    include: { costCenter: { select: { id: true, name: true } } },
    orderBy: { percentBps: "desc" as const },
  },
} as const;

async function validatePayableRefs(
  user: AuthUser,
  data: {
    supplierId?: string | null;
    professionalUserId?: string | null;
    financialAccountId: string;
    financialCategoryId?: string | null;
    corporateExpenseTypeId?: string | null;
    contractTypeId?: string | null;
    allocations?: { costCenterId: string; projectId?: string | null }[];
  },
): Promise<string | null> {
  const [supplier, professional, account, category, contractType, corporateExpenseType] = await Promise.all([
    data.supplierId
      ? prisma.supplier.findFirst({
          where: { id: data.supplierId, tenantId: user.tenantId },
          select: { id: true },
        })
      : Promise.resolve(null),
    data.professionalUserId
      ? prisma.user.findFirst({
          where: { id: data.professionalUserId, tenantId: user.tenantId, role: { not: "CLIENTE" } },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.financialAccount.findFirst({
      where: { id: data.financialAccountId, tenantId: user.tenantId, type: "DESPESA", isActive: true },
      select: { id: true },
    }),
    data.financialCategoryId
      ? prisma.financialCategory.findFirst({
          where: { id: data.financialCategoryId, tenantId: user.tenantId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    data.contractTypeId
      ? prisma.contractType.findFirst({
          where: { id: data.contractTypeId, tenantId: user.tenantId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    data.corporateExpenseTypeId
      ? prisma.corporateExpenseType.findFirst({
          where: { id: data.corporateExpenseTypeId, tenantId: user.tenantId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (data.supplierId && !supplier) return "Fornecedor inválido.";
  if (data.professionalUserId && !professional) return "Profissional inválido.";
  if (!account) return "Conta financeira inválida (deve ser DESPESA).";
  if (data.financialCategoryId && !category) return "Categoria financeira inválida.";
  if (data.contractTypeId && !contractType) return "Tipo de contrato inválido.";
  if (data.corporateExpenseTypeId && !corporateExpenseType) return "Tipo de despesa inválido.";

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
          where: { id: { in: projectIds }, client: { tenantId: user.tenantId } },
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

payablesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);
  await generateRecurrencePayables(user.tenantId, user.id).catch(() => 0);

  const status = String(req.query.status ?? "").trim().toUpperCase();
  const kind = String(req.query.kind ?? "").trim().toUpperCase();
  const where: Record<string, unknown> = {
    tenantId: user.tenantId,
    // Contas de recorrência inativa não entram (exceto já pagas, para histórico)
    OR: [
      { recurrenceRuleId: null },
      { recurrenceRule: { isActive: true } },
      { status: "PAGO" },
    ],
  };
  if (status) where.status = status;
  if (kind) where.kind = kind;

  const rows = await prisma.payable.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: listInclude,
  });
  res.json(rows.map(mapPayableListRow));
});

payablesRouter.get("/recurrence/rules", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const rows = await prisma.payableRecurrenceRule.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, nomeApelido: true } },
      financialAccount: { select: { id: true, name: true } },
      financialCategory: { select: { id: true, name: true } },
      corporateExpenseType: { select: { id: true, name: true } },
    },
  });
  const paidRuleIds = new Set(
    (
      await prisma.payable.findMany({
        where: {
          tenantId: user.tenantId,
          recurrenceRuleId: { in: rows.map((rule) => rule.id) },
          OR: [{ status: "PAGO" }, { installments: { some: { status: "PAGO" } } }],
        },
        select: { recurrenceRuleId: true },
        distinct: ["recurrenceRuleId"],
      })
    )
      .map((row) => row.recurrenceRuleId)
      .filter((ruleId): ruleId is string => Boolean(ruleId)),
  );
  // nextDueDate persistido é o marcador de agenda (após materializar, aponta para
  // depois do término). Para exibição: próximo vencimento real dentro do período;
  // null quando todos os vencimentos já passaram.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  res.json(
    rows.map((rule) => {
      const hasPaidPayable = paidRuleIds.has(rule.id);
      if (!rule.endDate) return { ...rule, hasPaidPayable };
      const dueDates = listRecurrenceDueDates(
        rule.startDate,
        rule.endDate,
        rule.frequency,
        rule.dayOfMonth,
      );
      const upcoming = dueDates.find((d) => d >= today) ?? null;
      return { ...rule, nextDueDate: upcoming, hasPaidPayable };
    }),
  );
});

payablesRouter.post("/recurrence/rules", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);
  const b = req.body ?? {};
  const description = String(b.description ?? "").trim();
  const financialCategoryId = String(b.financialCategoryId ?? "").trim();
  const amountCents = Number(b.amountCents ?? 0);
  const startDate = parseEntryDate(b.startDate);
  const endDate = parseEntryDate(b.endDate);
  const defaultCostCenterId = String(b.defaultCostCenterId ?? "").trim();

  let financialAccountId = String(b.financialAccountId ?? "").trim();
  if (!financialAccountId) {
    const defaultAccount = await prisma.financialAccount.findFirst({
      where: { tenantId: user.tenantId, type: "DESPESA", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    if (!defaultAccount) {
      res.status(400).json({ error: "Nenhuma conta de despesa configurada no plano de contas." });
      return;
    }
    financialAccountId = defaultAccount.id;
  }

  if (!description || !financialCategoryId || amountCents <= 0 || !startDate || !endDate || !defaultCostCenterId) {
    res.status(400).json({
      error: "Atividade, categoria financeira, valor, início, término e centro de custo são obrigatórios.",
    });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "Término deve ser igual ou posterior ao início." });
    return;
  }

  const category = await prisma.financialCategory.findFirst({
    where: { id: financialCategoryId, tenantId: user.tenantId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    res.status(400).json({ error: "Categoria financeira inválida." });
    return;
  }

  const refErr = await validatePayableRefs(user, {
    supplierId: b.supplierId ? String(b.supplierId) : null,
    financialAccountId,
    financialCategoryId,
    corporateExpenseTypeId: b.corporateExpenseTypeId ? String(b.corporateExpenseTypeId) : null,
    allocations: [
      {
        costCenterId: defaultCostCenterId,
        projectId: b.projectId ? String(b.projectId) : null,
      },
    ],
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const frequency = String(b.frequency ?? "MENSAL").toUpperCase();
  const dayOfMonth = clampDayOfMonth(Number(b.dayOfMonth ?? 1));
  const nextDueDate = firstRecurrenceDueDate(startDate, dayOfMonth);

  const created = await prisma.payableRecurrenceRule.create({
    data: {
      tenantId: user.tenantId,
      supplierId: b.supplierId ? String(b.supplierId) : null,
      financialAccountId,
      financialCategoryId,
      corporateExpenseTypeId: b.corporateExpenseTypeId ? String(b.corporateExpenseTypeId) : null,
      defaultCostCenterId,
      projectId: b.projectId ? String(b.projectId) : null,
      description,
      amountCents: Math.round(amountCents),
      frequency,
      dayOfMonth,
      startDate,
      endDate,
      nextDueDate,
      isActive: true,
    },
  });
  await materializeRecurrenceSchedule(user.tenantId, user.id, created.id).catch(() => 0);
  const refreshed = await prisma.payableRecurrenceRule.findFirst({
    where: { id: created.id },
    include: {
      supplier: { select: { id: true, nomeApelido: true } },
      financialAccount: { select: { id: true, name: true } },
      financialCategory: { select: { id: true, name: true } },
      corporateExpenseType: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(refreshed ?? created);
});

payablesRouter.patch("/recurrence/rules/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.payableRecurrenceRule.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Recorrência não encontrada." });
    return;
  }
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.description !== undefined) {
    const description = String(b.description ?? "").trim();
    if (!description) {
      res.status(400).json({ error: "Informe a atividade." });
      return;
    }
    data.description = description;
  }
  if (b.amountCents !== undefined) {
    const amountCents = Math.round(Number(b.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      res.status(400).json({ error: "Valor inválido." });
      return;
    }
    data.amountCents = amountCents;
  }
  if (b.frequency !== undefined) data.frequency = String(b.frequency).toUpperCase();
  if (b.dayOfMonth !== undefined) data.dayOfMonth = clampDayOfMonth(Number(b.dayOfMonth ?? 1));
  if (b.supplierId !== undefined) data.supplierId = b.supplierId ? String(b.supplierId) : null;
  if (b.financialAccountId !== undefined) {
    const financialAccountId = String(b.financialAccountId ?? "").trim();
    if (financialAccountId) data.financialAccountId = financialAccountId;
  }
  if (b.financialCategoryId !== undefined) {
    const financialCategoryId = String(b.financialCategoryId ?? "").trim();
    if (!financialCategoryId) {
      res.status(400).json({ error: "Categoria financeira é obrigatória." });
      return;
    }
    const category = await prisma.financialCategory.findFirst({
      where: { id: financialCategoryId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });
    if (!category) {
      res.status(400).json({ error: "Categoria financeira inválida." });
      return;
    }
    data.financialCategoryId = financialCategoryId;
  }
  if (b.defaultCostCenterId !== undefined) data.defaultCostCenterId = String(b.defaultCostCenterId);
  if (b.projectId !== undefined) data.projectId = b.projectId ? String(b.projectId) : null;
  if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
  if (b.startDate !== undefined) {
    const startDate = parseEntryDate(b.startDate);
    if (!startDate) {
      res.status(400).json({ error: "Início inválido." });
      return;
    }
    data.startDate = startDate;
  }
  if (b.endDate !== undefined) {
    const endDate = parseEntryDate(b.endDate);
    if (!endDate) {
      res.status(400).json({ error: "Término é obrigatório." });
      return;
    }
    data.endDate = endDate;
  }
  if (b.nextDueDate !== undefined) {
    const nextDueDate = parseEntryDate(b.nextDueDate);
    if (!nextDueDate) {
      res.status(400).json({ error: "Próximo vencimento inválido." });
      return;
    }
    data.nextDueDate = nextDueDate;
  }

  const nextStart = (data.startDate as Date | undefined) ?? existing.startDate;
  const nextEnd = (data.endDate as Date | undefined) ?? existing.endDate;
  if (!nextEnd) {
    res.status(400).json({ error: "Término é obrigatório." });
    return;
  }
  if (nextEnd < nextStart) {
    res.status(400).json({ error: "Término deve ser igual ou posterior ao início." });
    return;
  }

  const nextAccountId =
    (data.financialAccountId as string | undefined) ?? existing.financialAccountId;
  const nextCategoryId =
    (data.financialCategoryId as string | undefined) ?? existing.financialCategoryId;
  const nextCostCenterId =
    (data.defaultCostCenterId as string | undefined) ?? existing.defaultCostCenterId;
  const nextProjectId =
    data.projectId !== undefined ? (data.projectId as string | null) : existing.projectId;
  const nextSupplierId =
    data.supplierId !== undefined ? (data.supplierId as string | null) : existing.supplierId;

  if (nextCostCenterId) {
    const refErr = await validatePayableRefs(user, {
      supplierId: nextSupplierId,
      financialAccountId: nextAccountId,
      financialCategoryId: nextCategoryId,
      allocations: [{ costCenterId: nextCostCenterId, projectId: nextProjectId }],
    });
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
  }

  const dayOfMonth = (data.dayOfMonth as number | undefined) ?? existing.dayOfMonth;
  if (data.startDate !== undefined || data.dayOfMonth !== undefined) {
    data.nextDueDate = firstRecurrenceDueDate(nextStart, dayOfMonth);
    data.isActive = true;
  }

  const togglingActiveOnly =
    b.isActive !== undefined &&
    b.description === undefined &&
    b.amountCents === undefined &&
    b.startDate === undefined &&
    b.endDate === undefined &&
    b.dayOfMonth === undefined &&
    b.frequency === undefined;

  const scheduleChanged =
    data.startDate !== undefined ||
    data.endDate !== undefined ||
    data.dayOfMonth !== undefined ||
    data.frequency !== undefined ||
    data.amountCents !== undefined ||
    data.defaultCostCenterId !== undefined ||
    data.financialCategoryId !== undefined ||
    data.supplierId !== undefined ||
    data.projectId !== undefined ||
    data.description !== undefined ||
    (b.isActive !== undefined && Boolean(b.isActive));

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.payableRecurrenceRule.update({
        where: { id },
        data,
      });
      // Inativar: cancela apenas parcelas futuras em aberto; contas pagas permanecem.
      if (togglingActiveOnly && b.isActive === false) {
        await removeUnpaidRecurrencePayables(tx, user.tenantId, id);
      }
      if (scheduleChanged && (!togglingActiveOnly || Boolean(b.isActive))) {
        await synchronizeRecurrenceSchedule(tx, user.tenantId, user.id, id);
      }
      return row;
    });

    const refreshed = await prisma.payableRecurrenceRule.findFirst({
      where: { id },
      include: {
        supplier: { select: { id: true, nomeApelido: true } },
        financialAccount: { select: { id: true, name: true } },
        financialCategory: { select: { id: true, name: true } },
        corporateExpenseType: { select: { id: true, name: true } },
      },
    });
    res.json(refreshed ?? updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar recorrência.";
    res.status(400).json({ error: message });
  }
});

payablesRouter.delete("/recurrence/rules/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.payableRecurrenceRule.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Recorrência não encontrada." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Remove futuras em aberto; preserva e desvincula as já pagas.
    await removeUnpaidRecurrencePayables(tx, user.tenantId, id);
    await unlinkPaidRecurrencePayables(tx, user.tenantId, id);
    // Qualquer residual sem pagamento também some.
    await tx.payable.deleteMany({
      where: { tenantId: user.tenantId, recurrenceRuleId: id },
    });
    await tx.payableRecurrenceRule.delete({ where: { id } });
  });

  res.status(204).end();
});

payablesRouter.post("/recurrence/generate", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const count = await generateRecurrencePayables(user.tenantId, user.id);
  res.json({ generated: count });
});

payablesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const parsed = parsePayableWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (parsed.data.totalAmountCents == null) parsed.data.totalAmountCents = 0;
  const err = validatePayableCreate(parsed.data);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);

  const totalAmountCents = parsed.data.totalAmountCents ?? 0;
  const installmentTotalCents = Math.max(
    0,
    totalAmountCents +
      (parsed.data.benefitCents ?? 0) +
      (parsed.data.reimbursementCents ?? 0) -
      (parsed.data.discountCents ?? 0) +
      (parsed.data.interestFineCents ?? 0),
  );
  let financialAccountId = parsed.data.financialAccountId?.trim() ?? "";
  if (!financialAccountId) {
    const defaultAccount = await prisma.financialAccount.findFirst({
      where: { tenantId: user.tenantId, type: "DESPESA", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    if (!defaultAccount) {
      res.status(400).json({ error: "Nenhuma conta de despesa configurada no plano de contas." });
      return;
    }
    financialAccountId = defaultAccount.id;
  }

  const isCorporate = parsed.data.isCorporate === true || parsed.data.kind === "CORPORATIVA";
  const kind = isCorporate ? "CORPORATIVA" : (parsed.data.kind ?? "MANUAL");
  const status = isCorporate ? "PENDENTE_APROVACAO" : "ABERTO";
  const dueDate = parseEntryDate(parsed.data.dueDate!)!;
  const count = parsed.data.installmentCount ?? 1;
  const allocations = normalizeAllocations(
    installmentTotalCents > 0 ? installmentTotalCents : totalAmountCents,
    parsed.data.allocations,
    parsed.data.allocations?.[0]?.costCenterId,
  );
  // Rateio opcional na criação (ex.: importação CSV — CC preenchido depois na listagem)

  const refErr = await validatePayableRefs(user, {
    supplierId: parsed.data.supplierId,
    professionalUserId: parsed.data.professionalUserId,
    financialAccountId,
    financialCategoryId: parsed.data.financialCategoryId,
    corporateExpenseTypeId: parsed.data.corporateExpenseTypeId,
    contractTypeId: parsed.data.contractTypeId,
    allocations,
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  let effectiveHourRateCents = parsed.data.hourRateCents ?? null;
  if (parsed.data.financialCategoryId) {
    const category = await prisma.financialCategory.findFirst({
      where: { id: parsed.data.financialCategoryId, tenantId: user.tenantId },
      select: { enableAmount: true, enableHourRate: true },
    });
    if (category?.enableAmount && category.enableHourRate) {
      effectiveHourRateCents = Math.round(totalAmountCents / 168);
    }
  }

  // Profissional com fornecedor vinculado: preenche supplierId para pagamento/NF futuros.
  if (parsed.data.professionalUserId && !parsed.data.supplierId) {
    const link = await prisma.supplierUserLink.findFirst({
      where: {
        userId: parsed.data.professionalUserId,
        supplier: { tenantId: user.tenantId },
      },
      select: { supplierId: true },
    });
    if (link) {
      parsed.data.supplierId = link.supplierId;
    } else {
      const linked = await prisma.supplier.findFirst({
        where: { tenantId: user.tenantId, linkedUserId: parsed.data.professionalUserId },
        select: { id: true },
      });
      if (linked) parsed.data.supplierId = linked.id;
    }
  }

  const competence = parsed.data.competenceDate
    ? parseEntryDate(parsed.data.competenceDate)
    : dueDate;
  const installmentBase = installmentTotalCents > 0 ? installmentTotalCents : Math.max(totalAmountCents, 0);
  const installments = buildInstallmentPlan(Math.max(installmentBase, 0) || 0, count, dueDate);
  // Garante parcela mínima quando todos os valores são zero (conta ainda sem regras de valor).
  if (installments.length === 1 && installments[0]!.amountCents === 0 && installmentBase === 0) {
    installments[0]!.amountCents = 0;
  }

  const created = await prisma.$transaction(async (tx) => {
    return tx.payable.create({
      data: {
        tenantId: user.tenantId,
        supplierId: parsed.data.supplierId ?? null,
        professionalUserId: parsed.data.professionalUserId ?? null,
        payeeName: parsed.data.payeeName ?? null,
        financialAccountId,
        financialCategoryId: parsed.data.financialCategoryId ?? null,
        corporateExpenseTypeId: parsed.data.corporateExpenseTypeId ?? null,
        contractTypeId: parsed.data.contractTypeId ?? null,
        description: parsed.data.description!,
        totalAmountCents,
        hourRateCents: effectiveHourRateCents,
        benefitCents: parsed.data.benefitCents ?? null,
        reimbursementCents: parsed.data.reimbursementCents ?? null,
        discountCents: parsed.data.discountCents ?? null,
        complementaryHours: parsed.data.complementaryHours ?? null,
        interestFineCents: parsed.data.interestFineCents ?? null,
        competenceDate: competence,
        kind,
        status,
        requiresApproval: isCorporate,
        createdById: user.id,
        notes: parsed.data.notes ?? null,
        recurrenceRuleId: parsed.data.recurrenceRuleId ?? null,
        installments: {
          create: installments.map((inst) => ({
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            amountCents: inst.amountCents,
            status: "ABERTO",
          })),
        },
        ...(allocations.length > 0
          ? {
              allocations: {
                create: allocations.map((a) => ({
                  costCenterId: a.costCenterId,
                  projectId: a.projectId ?? null,
                  percentBps: a.percentBps ?? 10000,
                  amountCents: a.amountCents ?? installmentBase,
                })),
              },
            }
          : {}),
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

  res.status(201).json(mapPayableListRow(created));
});

payablesRouter.post("/import-csv", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);

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

  const { importPayablesFromC6Csv } = await import("../lib/payableCsvImport.js");
  const result = await importPayablesFromC6Csv({
    prisma,
    tenantId: user.tenantId,
    userId: user.id,
    csvText,
    dueDate: req.body?.dueDate ? String(req.body.dueDate) : null,
    supplierId: req.body?.supplierId ? String(req.body.supplierId) : null,
    payeeName: req.body?.payeeName ? String(req.body.payeeName) : "Cartão C6 Bank",
  });

  if (result.created === 0 && result.errors.length > 0 && result.skipped === 0) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

payablesRouter.get("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const row = await prisma.payable.findFirst({
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
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!row) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  res.json({
    ...mapPayableListRow(row),
    notes: row.notes,
    requiresApproval: row.requiresApproval,
    approvedAt: row.approvedAt,
    approvedByName: row.approvedBy?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: row.createdBy.name,
    updatedByName: row.updatedBy?.name ?? null,
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
      paidAt: i.paidAt,
    })),
  });
});

payablesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  if (existing.status === "CANCELADO") {
    res.status(400).json({ error: "Conta cancelada não pode ser editada." });
    return;
  }
  if (existing.status === "PAGO") {
    res.status(400).json({ error: "Conta paga: desmarque o pagamento antes de editar valores." });
    return;
  }

  const b = req.body ?? {};
  const data: {
    description?: string;
    totalAmountCents?: number;
    hourRateCents?: number | null;
    benefitCents?: number | null;
    reimbursementCents?: number | null;
    discountCents?: number | null;
    complementaryHours?: number | null;
    interestFineCents?: number | null;
    notes?: string | null;
    financialCategoryId?: string | null;
    professionalUserId?: string | null;
    supplierId?: string | null;
    updatedById?: string;
  } = { updatedById: user.id };

  if (b.description !== undefined) {
    const description = String(b.description ?? "").trim();
    if (!description) {
      res.status(400).json({ error: "Informe a atividade." });
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
  if (b.hourRateCents !== undefined) data.hourRateCents = b.hourRateCents == null ? null : Math.round(Number(b.hourRateCents));
  if (b.benefitCents !== undefined) data.benefitCents = b.benefitCents == null ? null : Math.round(Number(b.benefitCents));
  if (b.reimbursementCents !== undefined) {
    data.reimbursementCents = b.reimbursementCents == null ? null : Math.round(Number(b.reimbursementCents));
  }
  if (b.discountCents !== undefined) data.discountCents = b.discountCents == null ? null : Math.round(Number(b.discountCents));
  if (b.interestFineCents !== undefined) {
    data.interestFineCents = b.interestFineCents == null ? null : Math.round(Number(b.interestFineCents));
  }
  if (b.complementaryHours !== undefined) {
    data.complementaryHours =
      b.complementaryHours == null || b.complementaryHours === "" ? null : Number(b.complementaryHours);
  }
  if (b.notes !== undefined) data.notes = b.notes == null ? null : String(b.notes);
  if (b.financialCategoryId !== undefined) {
    data.financialCategoryId = b.financialCategoryId ? String(b.financialCategoryId) : null;
  }
  if (b.professionalUserId !== undefined) {
    data.professionalUserId = b.professionalUserId ? String(b.professionalUserId) : null;
  }
  if (b.supplierId !== undefined) {
    data.supplierId = b.supplierId ? String(b.supplierId) : null;
  }

  const dueDate = b.dueDate !== undefined ? parseEntryDate(b.dueDate) : undefined;
  if (b.dueDate !== undefined && !dueDate) {
    res.status(400).json({ error: "Data de vencimento inválida." });
    return;
  }

  const clearAllocations = Array.isArray(b.allocations) && b.allocations.length === 0;
  const allocationRows =
    Array.isArray(b.allocations) && b.allocations.length > 0
      ? normalizeAllocations(
          data.totalAmountCents ?? existing.totalAmountCents,
          b.allocations.map((a: { costCenterId?: string; projectId?: string | null; percentBps?: number; amountCents?: number }) => ({
            costCenterId: String(a.costCenterId ?? ""),
            projectId: a.projectId ? String(a.projectId) : null,
            percentBps: a.percentBps != null ? Number(a.percentBps) : undefined,
            amountCents: a.amountCents != null ? Number(a.amountCents) : undefined,
          })),
          null,
        )
      : null;
  if (allocationRows && allocationRows.length === 0) {
    res.status(400).json({ error: "Informe ao menos uma linha de rateio por centro de custo." });
    return;
  }

  const refErr = await validatePayableRefs(user, {
    supplierId: data.supplierId !== undefined ? data.supplierId : existing.supplierId,
    professionalUserId:
      data.professionalUserId !== undefined ? data.professionalUserId : existing.professionalUserId,
    financialAccountId: existing.financialAccountId,
    financialCategoryId:
      data.financialCategoryId !== undefined ? data.financialCategoryId : existing.financialCategoryId,
    corporateExpenseTypeId: existing.corporateExpenseTypeId,
    contractTypeId: existing.contractTypeId,
    allocations: allocationRows ?? undefined,
  });
  if (refErr) {
    res.status(400).json({ error: refErr });
    return;
  }

  const effectiveCategoryId =
    data.financialCategoryId !== undefined
      ? data.financialCategoryId
      : existing.financialCategoryId;
  if (effectiveCategoryId) {
    const category = await prisma.financialCategory.findFirst({
      where: { id: effectiveCategoryId, tenantId: user.tenantId },
      select: { enableAmount: true, enableHourRate: true },
    });
    if (category?.enableAmount && category.enableHourRate) {
      data.hourRateCents = Math.round(
        (data.totalAmountCents ?? existing.totalAmountCents) / 168,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.payable.update({ where: { id }, data });

    if (clearAllocations) {
      await tx.payableAllocation.deleteMany({ where: { payableId: id } });
    } else if (allocationRows) {
      await tx.payableAllocation.deleteMany({ where: { payableId: id } });
      await tx.payableAllocation.createMany({
        data: allocationRows.map((a) => ({
          payableId: id,
          costCenterId: a.costCenterId,
          projectId: a.projectId ?? null,
          percentBps: a.percentBps ?? 10000,
          amountCents: a.amountCents ?? data.totalAmountCents ?? existing.totalAmountCents,
        })),
      });
    }

    if (data.totalAmountCents != null) {
      const open = existing.installments.filter((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
      if (open.length === 1) {
        await tx.payableInstallment.update({
          where: { id: open[0]!.id },
          data: { amountCents: data.totalAmountCents },
        });
      } else if (open.length > 1) {
        const plan = buildInstallmentPlan(data.totalAmountCents, open.length, open[0]!.dueDate);
        for (let i = 0; i < open.length; i++) {
          await tx.payableInstallment.update({
            where: { id: open[i]!.id },
            data: { amountCents: plan[i]!.amountCents },
          });
        }
      }
    }

    if (dueDate) {
      const nextOpen = existing.installments.find((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
      if (nextOpen) {
        await tx.payableInstallment.update({
          where: { id: nextOpen.id },
          data: { dueDate },
        });
      }
    }

    await tx.payableHistory.create({
      data: {
        payableId: id,
        userId: user.id,
        action: "UPDATE",
        details: "Conta a pagar atualizada.",
      },
    });
  });

  const updated = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    include: listInclude,
  });
  res.json(updated ? mapPayableListRow(updated) : { ok: true });
});

payablesRouter.patch("/:id/approve", requireFeature(FEATURE_APPROVE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  if (existing.status !== "PENDENTE_APROVACAO") {
    res.status(400).json({ error: "Despesa não está pendente de aprovação." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.payable.update({
      where: { id },
      data: { status: "ABERTO", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
    });
    await tx.payableHistory.create({
      data: { payableId: id, userId: user.id, action: "APPROVE", details: "Despesa corporativa aprovada." },
    });
  });
  res.json({ ok: true });
});

payablesRouter.patch("/:id/cancel", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      status: true,
      installments: { select: { status: true } },
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  if (
    existing.status === "PAGO" ||
    existing.installments.some((installment) => installment.status === "PAGO")
  ) {
    res.status(400).json({ error: "Não é possível cancelar conta já paga." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.payable.update({ where: { id }, data: { status: "CANCELADO", updatedById: user.id } });
    await tx.payableInstallment.updateMany({
      where: { payableId: id, status: { not: "PAGO" } },
      data: { status: "CANCELADO" },
    });
    await tx.payableHistory.create({
      data: { payableId: id, userId: user.id, action: "CANCEL", details: "Conta cancelada." },
    });
  });
  res.json({ ok: true });
});

payablesRouter.post("/:id/mark-paid", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const payableId = String(req.params.id);
  const paidAt = req.body?.paidAt as string | undefined;
  const result = await markPayableAsPaid(user.tenantId, user.id, payableId, paidAt);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao marcar como pago." });
    return;
  }
  res.json({ ok: true, paidCount: result.paidCount });
});

payablesRouter.post("/:id/unmark-paid", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const payableId = String(req.params.id);
  const result = await unmarkPayableAsPaid(user.tenantId, user.id, payableId);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao desmarcar pagamento." });
    return;
  }
  res.json({ ok: true, unpaidCount: result.unpaidCount });
});

payablesRouter.patch("/:id/status", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const payableId = String(req.params.id);
  const status = String(req.body?.status ?? "");
  const result = await setPayableManualStatus(user.tenantId, user.id, payableId, status);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao alterar status." });
    return;
  }
  res.json({ ok: true });
});

payablesRouter.post("/:id/installments/:installmentId/pay", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const payableId = String(req.params.id);
  const installmentId = String(req.params.installmentId);
  const paidAt = req.body?.paidAt as string | undefined;
  const result = await payInstallment(user.tenantId, user.id, payableId, installmentId, paidAt);
  if (!result.ok) {
    res.status(400).json({ error: "error" in result ? result.error : "Erro ao pagar." });
    return;
  }
  res.json({ ok: true });
});

payablesRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const payable = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!payable) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  const rows = await prisma.payableHistory.findMany({
    where: { payableId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

payablesRouter.get("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const payable = await prisma.payable.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!payable) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  const rows = await prisma.payableAttachment.findMany({
    where: { payableId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      payableId: true,
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

payablesRouter.post("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const payableId = String(req.params.id);
    const { fileName, fileData, fileType, fileSize, category } = req.body ?? {};

    const payable = await prisma.payable.findFirst({
      where: { id: payableId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!payable) {
      res.status(404).json({ error: "Conta a pagar não encontrada." });
      return;
    }
    if (!fileName || !fileData) {
      res.status(400).json({ error: "fileName e fileData são obrigatórios." });
      return;
    }
    const cat = String(category ?? "OUTRO").toUpperCase();
    if (!ATTACHMENT_CATEGORIES.includes(cat as (typeof ATTACHMENT_CATEGORIES)[number])) {
      res.status(400).json({ error: "Categoria de anexo inválida." });
      return;
    }

    const base64Data = String(fileData).replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > TICKET_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ error: ticketAttachmentMaxSizeError() });
      return;
    }

    const uniqueFileName = `${payableId}-${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    // Espelho em disco (opcional); fonte da verdade é o BYTEA no banco.
    try {
      await writeFile(join(uploadsDir, uniqueFileName), buffer);
    } catch (e) {
      console.error("[payables] writeFile disk (continuing with DB)", errorSummary(e));
    }

    const mimeFromDataUrl =
      typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
    const effectiveType = String(fileType || mimeFromDataUrl || "application/octet-stream");

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.payableAttachment.create({
        data: {
          payableId,
          userId: user.id,
          filename: String(fileName),
          fileUrl: `/uploads/payables/${uniqueFileName}`,
          fileType: effectiveType,
          fileSize: fileSize || buffer.length,
          fileContent: buffer,
          category: cat,
        },
        select: {
          id: true,
          payableId: true,
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
      await tx.payableHistory.create({
        data: {
          payableId,
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
    console.error("[payables] upload", errorSummary(error));
    res.status(500).json({ error: "Erro ao fazer upload." });
  }
});

payablesRouter.get("/:id/attachments/:attachmentId/file", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const payableId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);
    const attachment = await prisma.payableAttachment.findFirst({
      where: { id: attachmentId, payableId, payable: { tenantId: user.tenantId } },
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
    const root = normalize(join(getUploadsRoot(), "payables")) + sep;
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
    console.error("[payables] download", errorSummary(error));
    res.status(500).json({ error: "Erro ao baixar anexo." });
  }
});

payablesRouter.delete("/:id/attachments/:attachmentId", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const payableId = String(req.params.id);
  const attachmentId = String(req.params.attachmentId);
  const attachment = await prisma.payableAttachment.findFirst({
    where: { id: attachmentId, payableId, payable: { tenantId: user.tenantId } },
    select: { id: true, fileUrl: true },
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
  await prisma.payableAttachment.delete({ where: { id: attachmentId } });
  res.status(204).end();
});
