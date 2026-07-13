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
  computeEffectiveInstallmentStatus,
  normalizeAllocations,
  parseEntryDate,
  parsePayableWriteBody,
  validatePayableCreate,
} from "../lib/payableHelpers.js";
import { generateRecurrencePayables, mapPayableListRow, markPayableAsPaid, payInstallment } from "../lib/payableService.js";

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
  professional: { select: { id: true, name: true } },
  financialAccount: { select: { id: true, name: true } },
  financialCategory: { select: { id: true, name: true } },
  corporateExpenseType: { select: { id: true, name: true } },
  contractType: { select: { id: true, name: true } },
  installments: { orderBy: { installmentNumber: "asc" as const } },
  allocations: {
    include: { costCenter: { select: { name: true } } },
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
  if (data.supplierId) {
    const s = await prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!s) return "Fornecedor inválido.";
  }
  if (data.professionalUserId) {
    const u = await prisma.user.findFirst({
      where: { id: data.professionalUserId, tenantId: user.tenantId, role: { not: "CLIENTE" } },
      select: { id: true },
    });
    if (!u) return "Profissional inválido.";
  }
  const account = await prisma.financialAccount.findFirst({
    where: { id: data.financialAccountId, tenantId: user.tenantId, type: "DESPESA", isActive: true },
    select: { id: true },
  });
  if (!account) return "Conta financeira inválida (deve ser DESPESA).";
  if (data.financialCategoryId) {
    const cat = await prisma.financialCategory.findFirst({
      where: { id: data.financialCategoryId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });
    if (!cat) return "Categoria financeira inválida.";
  }
  if (data.contractTypeId) {
    const ct = await prisma.contractType.findFirst({
      where: { id: data.contractTypeId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });
    if (!ct) return "Tipo de contrato inválido.";
  }
  if (data.corporateExpenseTypeId) {
    const t = await prisma.corporateExpenseType.findFirst({
      where: { id: data.corporateExpenseTypeId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });
    if (!t) return "Tipo de despesa inválido.";
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

payablesRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  await ensureFinanceDefaults(user.tenantId);
  await generateRecurrencePayables(user.tenantId, user.id).catch(() => 0);

  const status = String(req.query.status ?? "").trim().toUpperCase();
  const kind = String(req.query.kind ?? "").trim().toUpperCase();
  const where: Record<string, unknown> = { tenantId: user.tenantId };
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
      corporateExpenseType: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
});

payablesRouter.post("/recurrence/rules", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const b = req.body ?? {};
  const description = String(b.description ?? "").trim();
  const financialAccountId = String(b.financialAccountId ?? "").trim();
  const amountCents = Number(b.amountCents ?? 0);
  const startDate = parseEntryDate(b.startDate);
  const defaultCostCenterId = String(b.defaultCostCenterId ?? "").trim();
  if (!description || !financialAccountId || amountCents <= 0 || !startDate || !defaultCostCenterId) {
    res.status(400).json({ error: "Descrição, conta, valor, início e centro de custo são obrigatórios." });
    return;
  }
  const frequency = String(b.frequency ?? "MENSAL").toUpperCase();
  const dayOfMonth = Math.min(28, Math.max(1, Number(b.dayOfMonth ?? 1)));

  const created = await prisma.payableRecurrenceRule.create({
    data: {
      tenantId: user.tenantId,
      supplierId: b.supplierId ? String(b.supplierId) : null,
      financialAccountId,
      corporateExpenseTypeId: b.corporateExpenseTypeId ? String(b.corporateExpenseTypeId) : null,
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
  if (allocations.length === 0) {
    res.status(400).json({ error: "Informe ao menos um rateio por centro de custo." });
    return;
  }

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

  // Profissional com fornecedor vinculado: preenche supplierId para pagamento/NF futuros.
  if (parsed.data.professionalUserId && !parsed.data.supplierId) {
    const linked = await prisma.supplier.findFirst({
      where: { tenantId: user.tenantId, linkedUserId: parsed.data.professionalUserId },
      select: { id: true },
    });
    if (linked) parsed.data.supplierId = linked.id;
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
        hourRateCents: parsed.data.hourRateCents ?? null,
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
        allocations: {
          create: allocations.map((a) => ({
            costCenterId: a.costCenterId,
            projectId: a.projectId ?? null,
            percentBps: a.percentBps ?? 10000,
            amountCents: a.amountCents ?? installmentBase,
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

  res.status(201).json(mapPayableListRow(created));
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
    createdByName: row.createdBy.name,
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
      data: { status: "ABERTO", approvedById: user.id, approvedAt: new Date() },
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
    select: { id: true, status: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Conta a pagar não encontrada." });
    return;
  }
  if (existing.status === "PAGO") {
    res.status(400).json({ error: "Não é possível cancelar conta já paga." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.payable.update({ where: { id }, data: { status: "CANCELADO" } });
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
    include: { user: { select: { id: true, name: true, email: true } } },
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
    include: { user: { select: { id: true, name: true } } },
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
    await writeFile(join(uploadsDir, uniqueFileName), buffer);

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
          category: cat,
        },
        include: { user: { select: { id: true, name: true } } },
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
      select: { fileUrl: true, filename: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado." });
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
