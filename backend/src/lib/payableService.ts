import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  computePayableTotalCents,
  derivePayableStatus,
  firstRecurrenceDueDate,
  listRecurrenceDueDates,
  normalizeAllocations,
  nextRecurrenceDueDate,
  parseEntryDate,
} from "./payableHelpers.js";
import { agingBucketForDueDate, type AgingBucket } from "./receivableHelpers.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";
import {
  resolveContractTypeFromUserId,
  resolveProfessionalFromSupplierId,
} from "./userContractTypeHelpers.js";

type Tx = Prisma.TransactionClient;

const MONTHLY_HOUR_DIVISOR = 168;

async function hourRateCentsForCategory(
  tx: Tx,
  tenantId: string,
  financialCategoryId: string | null,
  amountCents: number,
): Promise<number | null> {
  if (!financialCategoryId || amountCents <= 0) return null;
  const category = await tx.financialCategory.findFirst({
    where: { id: financialCategoryId, tenantId },
    select: { enableAmount: true, enableHourRate: true },
  });
  if (category?.enableAmount && category.enableHourRate) {
    return Math.round(amountCents / MONTHLY_HOUR_DIVISOR);
  }
  return null;
}

async function createPayableFromRecurrenceRule(
  tx: Tx,
  rule: {
    id: string;
    tenantId: string;
    supplierId: string | null;
    professionalUserId?: string | null;
    financialAccountId: string;
    financialCategoryId: string | null;
    corporateExpenseTypeId: string | null;
    defaultCostCenterId: string | null;
    projectId: string | null;
    description: string;
    amountCents: number;
  },
  dueDate: Date,
  userId: string,
): Promise<boolean> {
  const sourceId = `${rule.id}-${dueDate.toISOString().slice(0, 10)}`;
  const existing = await tx.payable.findFirst({
    where: { tenantId: rule.tenantId, sourceType: "RECURRENCE", sourceId },
    select: { id: true },
  });
  if (existing) return false;

  const allocations = normalizeAllocations(
    rule.amountCents,
    rule.defaultCostCenterId
      ? [{ costCenterId: rule.defaultCostCenterId, projectId: rule.projectId, percentBps: 10000 }]
      : [],
    rule.defaultCostCenterId,
  );
  if (allocations.length === 0) return false;

  const installments = buildInstallmentPlan(rule.amountCents, 1, dueDate);
  let payeeName: string | null = null;
  let professionalUserId: string | null = rule.professionalUserId ?? null;
  let contractTypeId: string | null = null;
  let supplierId: string | null = rule.supplierId;

  if (professionalUserId) {
    const fromUser = await resolveContractTypeFromUserId(rule.tenantId, professionalUserId, tx);
    if (fromUser) {
      contractTypeId = fromUser.contractTypeId;
      if (!payeeName && fromUser.name) payeeName = fromUser.name;
    }
  }

  if (supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, tenantId: rule.tenantId },
      select: { nomeApelido: true },
    });
    payeeName = supplier?.nomeApelido ?? payeeName;
    if (!professionalUserId || !contractTypeId) {
      const linked = await resolveProfessionalFromSupplierId(rule.tenantId, supplierId, tx);
      if (linked) {
        if (!professionalUserId) professionalUserId = linked.professionalUserId;
        if (!contractTypeId) contractTypeId = linked.contractTypeId;
      }
    }
  } else if (professionalUserId && !supplierId) {
    const link = await tx.supplierUserLink.findFirst({
      where: { userId: professionalUserId, supplier: { tenantId: rule.tenantId } },
      select: { supplierId: true, supplier: { select: { nomeApelido: true } } },
    });
    if (link) {
      supplierId = link.supplierId;
      payeeName = link.supplier.nomeApelido ?? payeeName;
    } else {
      const legacy = await tx.supplier.findFirst({
        where: { tenantId: rule.tenantId, linkedUserId: professionalUserId },
        select: { id: true, nomeApelido: true },
      });
      if (legacy) {
        supplierId = legacy.id;
        payeeName = legacy.nomeApelido ?? payeeName;
      }
    }
  }

  const hourRateCents = await hourRateCentsForCategory(
    tx,
    rule.tenantId,
    rule.financialCategoryId,
    rule.amountCents,
  );
  await tx.payable.create({
    data: {
      tenantId: rule.tenantId,
      supplierId,
      professionalUserId,
      payeeName,
      financialAccountId: rule.financialAccountId,
      financialCategoryId: rule.financialCategoryId,
      corporateExpenseTypeId: rule.corporateExpenseTypeId,
      contractTypeId,
      description: rule.description,
      totalAmountCents: rule.amountCents,
      hourRateCents,
      competenceDate: dueDate,
      kind: "MANUAL",
      status: "ABERTO",
      sourceType: "RECURRENCE",
      sourceId,
      recurrenceRuleId: rule.id,
      requiresApproval: false,
      createdById: userId,
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
          amountCents: a.amountCents ?? rule.amountCents,
        })),
      },
      history: {
        create: {
          userId,
          action: "CREATE",
          details: "Gerada automaticamente por recorrência.",
        },
      },
    },
  });
  return true;
}

export async function synchronizeRecurrenceSchedule(
  tx: Tx,
  tenantId: string,
  userId: string,
  ruleId: string,
): Promise<{ created: number; deleted: number }> {
  const rule = await tx.payableRecurrenceRule.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!rule || !rule.endDate) return { created: 0, deleted: 0 };

  const dueDates = listRecurrenceDueDates(
    rule.startDate,
    rule.endDate,
    rule.frequency,
    rule.dayOfMonth,
  );
  const expectedSourceIds = new Set(
    dueDates.map((dueDate) => `${rule.id}-${dueDate.toISOString().slice(0, 10)}`),
  );
  const linkedPayables = await tx.payable.findMany({
    where: { tenantId, recurrenceRuleId: rule.id },
    select: {
      id: true,
      sourceId: true,
      status: true,
      installments: { select: { status: true } },
    },
  });
  const obsolete = linkedPayables.filter(
    (payable) => !payable.sourceId || !expectedSourceIds.has(payable.sourceId),
  );
  const paidObsolete = obsolete.some(
    (payable) =>
      payable.status === "PAGO" ||
      payable.installments.some((installment) => installment.status === "PAGO"),
  );
  if (paidObsolete) {
    throw new Error(
      "Não é possível reduzir ou alterar o período: há conta paga fora da nova recorrência.",
    );
  }

  const obsoleteIds = obsolete.map((payable) => payable.id);
  if (obsoleteIds.length > 0) {
    await tx.payable.deleteMany({ where: { id: { in: obsoleteIds } } });
  }

  let created = 0;
  for (const dueDate of dueDates) {
    const ok = await createPayableFromRecurrenceRule(tx, rule, dueDate, userId);
    if (ok) created += 1;
  }

  // Recalcula campos das contas em aberto (parcelas futuras ainda não pagas).
  const hourRateCents = await hourRateCentsForCategory(
    tx,
    tenantId,
    rule.financialCategoryId,
    rule.amountCents,
  );

  let payeeName: string | null = null;
  let professionalUserId: string | null = rule.professionalUserId ?? null;
  let contractTypeId: string | null = null;
  let supplierId: string | null = rule.supplierId;
  if (professionalUserId) {
    const fromUser = await resolveContractTypeFromUserId(tenantId, professionalUserId, tx);
    if (fromUser) contractTypeId = fromUser.contractTypeId;
  }
  if (supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, tenantId: rule.tenantId },
      select: { nomeApelido: true },
    });
    payeeName = supplier?.nomeApelido ?? null;
    if (!professionalUserId || !contractTypeId) {
      const linked = await resolveProfessionalFromSupplierId(rule.tenantId, supplierId, tx);
      if (linked) {
        if (!professionalUserId) professionalUserId = linked.professionalUserId;
        if (!contractTypeId) contractTypeId = linked.contractTypeId;
      }
    }
  }

  const openPayables = await tx.payable.findMany({
    where: {
      tenantId,
      recurrenceRuleId: rule.id,
      status: { notIn: ["PAGO", "CANCELADO"] },
      NOT: { installments: { some: { status: "PAGO" } } },
    },
    select: { id: true },
  });

  for (const open of openPayables) {
    await tx.payable.update({
      where: { id: open.id },
      data: {
        description: rule.description,
        totalAmountCents: rule.amountCents,
        hourRateCents,
        financialAccountId: rule.financialAccountId,
        financialCategoryId: rule.financialCategoryId,
        corporateExpenseTypeId: rule.corporateExpenseTypeId,
        supplierId,
        professionalUserId,
        contractTypeId,
        payeeName,
      },
    });
    await tx.payableInstallment.updateMany({
      where: { payableId: open.id, status: { notIn: ["PAGO", "CANCELADO"] } },
      data: { amountCents: rule.amountCents },
    });
    if (rule.defaultCostCenterId) {
      await tx.payableAllocation.deleteMany({ where: { payableId: open.id } });
      await tx.payableAllocation.create({
        data: {
          payableId: open.id,
          costCenterId: rule.defaultCostCenterId,
          projectId: rule.projectId,
          percentBps: 10000,
          amountCents: rule.amountCents,
        },
      });
    }
  }

  const lastDue = dueDates[dueDates.length - 1];
  const nextAfterLast = lastDue
    ? nextRecurrenceDueDate(lastDue, rule.frequency, rule.dayOfMonth)
    : firstRecurrenceDueDate(rule.startDate, rule.dayOfMonth);
  // Agenda materializada; isActive permanece sob controle do usuário (ativar/inativar).
  await tx.payableRecurrenceRule.update({
    where: { id: rule.id },
    data: { nextDueDate: nextAfterLast },
  });
  return { created, deleted: obsoleteIds.length };
}

/**
 * Remove contas futuras em aberto da recorrência, preservando as já pagas.
 */
export async function removeUnpaidRecurrencePayables(
  tx: Tx,
  tenantId: string,
  ruleId: string,
): Promise<{ removed: number; keptPaid: number }> {
  const linked = await tx.payable.findMany({
    where: { tenantId, recurrenceRuleId: ruleId },
    select: {
      id: true,
      status: true,
      installments: { select: { status: true } },
    },
  });
  const unpaidIds: string[] = [];
  let keptPaid = 0;
  for (const payable of linked) {
    const isPaid =
      payable.status === "PAGO" ||
      payable.installments.some((installment) => installment.status === "PAGO");
    if (isPaid) {
      keptPaid += 1;
      continue;
    }
    unpaidIds.push(payable.id);
  }
  if (unpaidIds.length > 0) {
    await tx.payable.deleteMany({ where: { id: { in: unpaidIds } } });
  }
  return { removed: unpaidIds.length, keptPaid };
}

/**
 * Desvincula contas pagas da regra (para permitir excluir a recorrência).
 */
export async function unlinkPaidRecurrencePayables(
  tx: Tx,
  tenantId: string,
  ruleId: string,
): Promise<number> {
  const result = await tx.payable.updateMany({
    where: {
      tenantId,
      recurrenceRuleId: ruleId,
      OR: [{ status: "PAGO" }, { installments: { some: { status: "PAGO" } } }],
    },
    data: { recurrenceRuleId: null },
  });
  return result.count;
}

/**
 * Sincroniza todas as contas do período (início → término) na listagem de Contas a pagar.
 */
export async function materializeRecurrenceSchedule(
  tenantId: string,
  userId: string,
  ruleId: string,
): Promise<number> {
  const result = await prisma.$transaction((tx) =>
    synchronizeRecurrenceSchedule(tx, tenantId, userId, ruleId),
  );
  return result.created;
}

/** Há parcela/conta paga vinculada à recorrência. */
export async function recurrenceRuleHasPaidPayable(
  tenantId: string,
  ruleId: string,
): Promise<boolean> {
  const paid = await prisma.payable.findFirst({
    where: {
      tenantId,
      recurrenceRuleId: ruleId,
      OR: [{ status: "PAGO" }, { installments: { some: { status: "PAGO" } } }],
    },
    select: { id: true },
  });
  return Boolean(paid);
}

export async function payInstallment(
  tenantId: string,
  userId: string,
  payableId: string,
  installmentId: string,
  paidAtRaw?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: {
      allocations: true,
      installments: { orderBy: { installmentNumber: "asc" } },
      financialAccount: { select: { id: true, type: true } },
    },
  });
  if (!payable) return { ok: false, error: "Conta a pagar não encontrada." };
  if (payable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };
  if (payable.status === "PENDENTE_APROVACAO") {
    return { ok: false, error: "Despesa aguardando aprovação." };
  }

  const installment = payable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.status === "PAGO") return { ok: false, error: "Parcela já paga." };
  if (installment.status === "CANCELADO") return { ok: false, error: "Parcela cancelada." };

  const paidAt = paidAtRaw ? parseEntryDate(paidAtRaw) : new Date();
  if (!paidAt) return { ok: false, error: "Data de pagamento inválida." };

  const primaryAllocation =
    payable.allocations.find((allocation) => allocation.projectId) ?? payable.allocations[0];
  if (!primaryAllocation) {
    return {
      ok: false,
      error: "É necessário preencher o centro de custo antes de marcar como paga.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // Reutiliza o lançamento cancelado de um pagamento desfeito (vínculo com a parcela é único).
    const existingEntry = await tx.financialEntry.findUnique({
      where: { payableInstallmentId: installment.id },
      select: { id: true },
    });
    const entryData = {
      costCenterId: primaryAllocation.costCenterId,
      financialAccountId: payable.financialAccountId,
      type: "DESPESA",
      amountCents: installment.amountCents,
      entryDate: paidAt,
      description: `${payable.description} — parcela ${installment.installmentNumber}`,
      status: "LANCADO",
      supplierId: payable.supplierId,
      projectId: primaryAllocation.projectId,
    };
    const entry = existingEntry
      ? await tx.financialEntry.update({
          where: { id: existingEntry.id },
          data: { ...entryData, updatedById: userId },
        })
      : await tx.financialEntry.create({
          data: {
            tenantId,
            ...entryData,
            createdById: userId,
            payableInstallmentId: installment.id,
          },
        });

    await tx.financialEntryHistory.create({
      data: {
        financialEntryId: entry.id,
        userId,
        action: existingEntry ? "UPDATE" : "CREATE",
        details: existingEntry
          ? "Lançamento reativado pelo novo pagamento da parcela."
          : "Lançamento gerado pelo pagamento da parcela.",
      },
    });

    await tx.payableInstallment.update({
      where: { id: installment.id },
      data: { status: "PAGO", paidAt },
    });

    const remaining = payable.installments.filter((i) => i.id !== installment.id);
    const updatedStatuses = remaining.map((i) =>
      i.status === "PAGO" ? "PAGO" : computeEffectiveInstallmentStatus(i),
    );
    updatedStatuses.push("PAGO");
    const allPaid = updatedStatuses.every((s) => s === "PAGO");
    const anyOverdue = remaining.some(
      (i) => i.status !== "PAGO" && computeEffectiveInstallmentStatus(i) === "VENCIDO",
    );

    await tx.payable.update({
      where: { id: payableId },
      data: {
        status: allPaid ? "PAGO" : anyOverdue ? "VENCIDO" : "ABERTO",
        updatedById: userId,
      },
    });

    await tx.payableHistory.create({
      data: {
        payableId,
        userId,
        action: "PAYMENT",
        details: `Parcela ${installment.installmentNumber} paga (${formatCentsToBrl(installment.amountCents)}). Lançamento ${entry.id}.`,
      },
    });
  });

  try {
    const { syncReimbursementPaidFromFinance } = await import("./syncReimbursementFinanceStatus.js");
    await syncReimbursementPaidFromFinance({ tenantId, payableId });
  } catch {
    /* ignore */
  }

  return { ok: true };
}

export async function markPayableAsPaid(
  tenantId: string,
  userId: string,
  payableId: string,
  paidAtRaw?: string,
): Promise<{ ok: true; paidCount: number } | { ok: false; error: string }> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!payable) return { ok: false, error: "Conta a pagar não encontrada." };
  if (payable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };
  if (payable.status === "PENDENTE_APROVACAO") {
    return { ok: false, error: "Despesa aguardando aprovação." };
  }

  const open = payable.installments.filter((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
  if (open.length === 0) return { ok: true, paidCount: 0 };

  let paidCount = 0;
  for (const inst of open) {
    const result = await payInstallment(tenantId, userId, payableId, inst.id, paidAtRaw);
    if (result.ok === false) return { ok: false, error: result.error };
    paidCount += 1;
  }
  try {
    const { syncReimbursementPaidFromFinance } = await import("./syncReimbursementFinanceStatus.js");
    await syncReimbursementPaidFromFinance({ tenantId, payableId });
  } catch {
    /* ignore sync errors */
  }
  return { ok: true, paidCount };
}

export async function unpayInstallment(
  tenantId: string,
  userId: string,
  payableId: string,
  installmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!payable) return { ok: false, error: "Conta a pagar não encontrada." };
  if (payable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };
  if (payable.status === "PENDENTE_APROVACAO") {
    return { ok: false, error: "Despesa aguardando aprovação." };
  }

  const installment = payable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.status !== "PAGO") return { ok: false, error: "Parcela não está paga." };

  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.updateMany({
      where: { payableInstallmentId: installment.id, status: "LANCADO" },
      data: { status: "CANCELADO", updatedById: userId },
    });

    await tx.payableInstallment.update({
      where: { id: installment.id },
      data: { status: "ABERTO", paidAt: null },
    });

    const updatedInstallments = payable.installments.map((i) =>
      i.id === installment.id ? { ...i, status: "ABERTO", paidAt: null } : i,
    );
    const newStatus = derivePayableStatus(updatedInstallments, "ABERTO");

    await tx.payable.update({
      where: { id: payableId },
      data: { status: newStatus, updatedById: userId },
    });

    await tx.payableHistory.create({
      data: {
        payableId,
        userId,
        action: "PAYMENT_REVERT",
        details: `Pagamento da parcela ${installment.installmentNumber} desfeito (${formatCentsToBrl(installment.amountCents)}).`,
      },
    });
  });

  try {
    const { syncReimbursementPaidFromFinance } = await import("./syncReimbursementFinanceStatus.js");
    await syncReimbursementPaidFromFinance({ tenantId, payableId });
  } catch {
    /* ignore */
  }

  return { ok: true };
}

export async function unmarkPayableAsPaid(
  tenantId: string,
  userId: string,
  payableId: string,
): Promise<{ ok: true; unpaidCount: number } | { ok: false; error: string }> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!payable) return { ok: false, error: "Conta a pagar não encontrada." };
  if (payable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const paid = payable.installments.filter((i) => i.status === "PAGO");
  if (paid.length === 0) return { ok: true, unpaidCount: 0 };

  let unpaidCount = 0;
  for (const inst of paid) {
    const result = await unpayInstallment(tenantId, userId, payableId, inst.id);
    if (result.ok === false) return { ok: false, error: result.error };
    unpaidCount += 1;
  }
  try {
    const { syncReimbursementPaidFromFinance } = await import("./syncReimbursementFinanceStatus.js");
    await syncReimbursementPaidFromFinance({ tenantId, payableId });
  } catch {
    /* ignore sync errors */
  }
  return { ok: true, unpaidCount };
}

export async function setPayableManualStatus(
  tenantId: string,
  userId: string,
  payableId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = String(status).trim().toUpperCase();
  if (!["ABERTO", "VENCIDO", "PAGO", "CANCELADO"].includes(normalized)) {
    return { ok: false, error: "Status inválido." };
  }

  const payable = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!payable) return { ok: false, error: "Conta a pagar não encontrada." };
  if (payable.status === "PENDENTE_APROVACAO") {
    return { ok: false, error: "Despesa aguardando aprovação." };
  }

  if (normalized === "PAGO") {
    const marked = await markPayableAsPaid(tenantId, userId, payableId);
    return marked.ok ? { ok: true } : marked;
  }

  if (normalized === "CANCELADO") {
    if (payable.status === "CANCELADO") return { ok: true };
    await prisma.$transaction(async (tx) => {
      await tx.payableInstallment.updateMany({
        where: { payableId, status: { not: "PAGO" } },
        data: { status: "CANCELADO" },
      });
      await tx.payable.update({
        where: { id: payableId },
        data: { status: "CANCELADO", updatedById: userId },
      });
      await tx.payableHistory.create({
        data: {
          payableId,
          userId,
          action: "STATUS",
          field: "status",
          oldValue: payable.status,
          newValue: "CANCELADO",
          details: "Status alterado manualmente para Cancelado.",
        },
      });
    });
    try {
      const { syncReimbursementCancelledFromFinance } = await import(
        "./syncReimbursementFinanceStatus.js"
      );
      await syncReimbursementCancelledFromFinance({ tenantId, payableId });
    } catch {
      /* ignore sync errors */
    }
    return { ok: true };
  }

  if (payable.installments.some((i) => i.status === "PAGO")) {
    const unmark = await unmarkPayableAsPaid(tenantId, userId, payableId);
    if (!unmark.ok) return unmark;
  }

  const after = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: true },
  });
  if (!after) return { ok: false, error: "Conta a pagar não encontrada." };

  if (after.status === "CANCELADO") {
    await prisma.payableInstallment.updateMany({
      where: { payableId, status: "CANCELADO" },
      data: { status: "ABERTO" },
    });
  }

  const fresh = await prisma.payable.findFirst({
    where: { id: payableId, tenantId },
    include: { installments: true },
  });
  if (!fresh) return { ok: false, error: "Conta a pagar não encontrada." };

  const derived = derivePayableStatus(fresh.installments, "ABERTO");
  const finalStatus = normalized === "VENCIDO" ? "VENCIDO" : derived === "VENCIDO" ? "VENCIDO" : "ABERTO";

  await prisma.payable.update({
    where: { id: payableId },
    data: { status: finalStatus, updatedById: userId },
  });
  await prisma.payableHistory.create({
    data: {
      payableId,
      userId,
      action: "STATUS",
      field: "status",
      oldValue: payable.status,
      newValue: finalStatus,
      details: `Status alterado manualmente para ${finalStatus}.`,
    },
  });

  return { ok: true };
}

export async function generateRecurrencePayables(tenantId: string, userId: string): Promise<number> {
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const rules = await prisma.payableRecurrenceRule.findMany({
    where: { tenantId, isActive: true },
  });

  let created = 0;
  for (const rule of rules) {
    if (!rule.endDate) {
      await prisma.payableRecurrenceRule.update({
        where: { id: rule.id },
        data: { isActive: false },
      });
      continue;
    }

    // Passou do término: encerra a regra (contas já geradas permanecem até pagar/cancelar).
    if (rule.endDate < todayDate && rule.nextDueDate > rule.endDate) {
      await prisma.payableRecurrenceRule.update({
        where: { id: rule.id },
        data: { isActive: false },
      });
      continue;
    }

    created += await materializeRecurrenceSchedule(tenantId, userId, rule.id);
  }
  return created;
}

export function mapPayableListRow(payable: {
  id: string;
  description: string;
  totalAmountCents: number;
  hourRateCents: number | null;
  benefitCents: number | null;
  reimbursementCents: number | null;
  discountCents: number | null;
  complementaryHours: number | null;
  interestFineCents: number | null;
  payeeName: string | null;
  cardLastFour?: string | null;
  competenceDate: Date | null;
  paymentMethod?: string | null;
  kind: string;
  status: string;
  createdAt: Date;
  supplier: {
    id: string;
    nomeApelido: string;
    linkedUser?: { employmentType: string | null } | null;
    userLinks?: Array<{ user: { employmentType: string | null } }>;
  } | null;
  professional: { id: string; name: string; employmentType: string | null } | null;
  financialAccount: { id: string; name: string };
  financialCategory: { id: string; name: string } | null;
  corporateExpenseType: { id: string; name: string } | null;
  contractType: { id: string; name: string } | null;
  installments: { id: string; dueDate: Date; amountCents: number; status: string; paidAt: Date | null }[];
  allocations?: { costCenter: { id: string; name: string } }[];
}) {
  const effectiveStatus = derivePayableStatus(payable.installments, payable.status);
  const openInstallments = payable.installments.filter(
    (i) => i.status !== "PAGO" && i.status !== "CANCELADO",
  );
  const nextInstallment = openInstallments[0] ?? null;
  // Contas já pagas: ainda exibe o vencimento da parcela (importação / histórico).
  const displayDueInstallment =
    nextInstallment ??
    [...payable.installments]
      .filter((i) => i.status !== "CANCELADO")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ??
    null;
  const referenceDate = payable.competenceDate ?? displayDueInstallment?.dueDate ?? payable.createdAt;
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const monthNumber = ref.getUTCMonth() + 1;
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const payeeBase =
    payable.kind === "REEMBOLSO"
      ? (payable.supplier?.nomeApelido ??
        payable.professional?.name ??
        payable.payeeName ??
        null)
      : (payable.professional?.name ??
        payable.supplier?.nomeApelido ??
        payable.payeeName ??
        null);
  const cardSuffix =
    payable.cardLastFour && !String(payeeBase ?? "").includes(payable.cardLastFour)
      ? ` ****${payable.cardLastFour}`
      : "";
  const payeeDisplayName = payeeBase ? `${payeeBase}${cardSuffix}` : cardSuffix.trim() || null;
  const primaryCostCenter = payable.allocations?.[0]?.costCenter ?? null;
  // Data de pagamento exibida ao lado do "Pago": o pagamento mais recente das parcelas.
  const lastPaidAt = payable.installments.reduce<Date | null>((latest, inst) => {
    if (inst.status !== "PAGO" || !inst.paidAt) return latest;
    return !latest || inst.paidAt > latest ? inst.paidAt : latest;
  }, null);
  const computedTotalCents = computePayableTotalCents(payable);

  const formatOptionalCents = (cents: number | null) =>
    cents != null ? formatCentsToBrl(cents) : null;

  const supplierEmploymentType =
    payable.supplier?.userLinks?.find((l) => l.user.employmentType)?.user.employmentType ??
    payable.supplier?.userLinks?.[0]?.user.employmentType ??
    payable.supplier?.linkedUser?.employmentType ??
    null;

  return {
    id: payable.id,
    description: payable.description,
    totalAmountCents: payable.totalAmountCents,
    totalAmountFormatted: formatCentsToBrl(payable.totalAmountCents),
    computedTotalCents,
    computedTotalFormatted: formatCentsToBrl(computedTotalCents),
    hourRateCents: payable.hourRateCents,
    hourRateFormatted: formatOptionalCents(payable.hourRateCents),
    benefitCents: payable.benefitCents,
    benefitFormatted: formatOptionalCents(payable.benefitCents),
    reimbursementCents: payable.reimbursementCents,
    reimbursementFormatted: formatOptionalCents(payable.reimbursementCents),
    discountCents: payable.discountCents,
    discountFormatted: formatOptionalCents(payable.discountCents),
    complementaryHours: payable.complementaryHours,
    interestFineCents: payable.interestFineCents,
    interestFineFormatted: formatOptionalCents(payable.interestFineCents),
    competenceDate: payable.competenceDate?.toISOString().slice(0, 10) ?? null,
    paymentMethod: payable.paymentMethod ?? null,
    referenceDate: ref.toISOString().slice(0, 10),
    monthName: monthNames[ref.getUTCMonth()] ?? "",
    monthNumber,
    yearNumber: ref.getUTCFullYear(),
    kind: payable.kind,
    status: effectiveStatus,
    paidAt: lastPaidAt?.toISOString().slice(0, 10) ?? null,
    supplierId: payable.supplier?.id ?? null,
    supplierName: payable.supplier?.nomeApelido ?? null,
    professionalUserId: payable.professional?.id ?? null,
    professionalName: payable.professional?.name ?? null,
    payeeName: payable.payeeName,
    cardLastFour: payable.cardLastFour ?? null,
    payeeDisplayName,
    financialAccountId: payable.financialAccount.id,
    financialAccountName: payable.financialAccount.name,
    financialCategoryId: payable.financialCategory?.id ?? null,
    financialCategoryName: payable.financialCategory?.name ?? null,
    corporateExpenseTypeName: payable.corporateExpenseType?.name ?? null,
    contractTypeId: payable.contractType?.id ?? null,
    contractTypeName:
      payable.contractType?.name ??
      payable.professional?.employmentType ??
      supplierEmploymentType ??
      null,
    primaryCostCenterId: primaryCostCenter?.id ?? null,
    primaryCostCenterName: primaryCostCenter?.name ?? null,
    nextDueDate: displayDueInstallment?.dueDate.toISOString().slice(0, 10) ?? null,
    nextInstallmentId: nextInstallment?.id ?? null,
    installmentCount: payable.installments.length,
    createdAt: payable.createdAt,
  };
}

export type PayableAgingSummary = {
  buckets: Record<AgingBucket, { count: number; totalCents: number }>;
  overdueTotalCents: number;
  overdueCount: number;
};

export async function computePayableAgingSummary(tenantId: string): Promise<PayableAgingSummary> {
  const today = new Date();

  const installments = await prisma.payableInstallment.findMany({
    where: {
      status: { in: ["ABERTO", "VENCIDO"] },
      payable: {
        tenantId,
        status: { notIn: ["CANCELADO", "PENDENTE_APROVACAO"] },
      },
    },
    select: {
      dueDate: true,
      amountCents: true,
      status: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const buckets: PayableAgingSummary["buckets"] = {
    VENCIDOS: { count: 0, totalCents: 0 },
    A_VENCER: { count: 0, totalCents: 0 },
    "1_30": { count: 0, totalCents: 0 },
    "31_60": { count: 0, totalCents: 0 },
    "61_90": { count: 0, totalCents: 0 },
    "90_PLUS": { count: 0, totalCents: 0 },
  };

  let overdueTotalCents = 0;
  let overdueCount = 0;

  for (const inst of installments) {
    const effective = computeEffectiveInstallmentStatus(inst, today);
    if (effective === "PAGO" || effective === "CANCELADO") continue;

    const bucket = agingBucketForDueDate(inst.dueDate, today);
    buckets[bucket].count += 1;
    buckets[bucket].totalCents += inst.amountCents;

    if (bucket === "VENCIDOS") {
      overdueTotalCents += inst.amountCents;
      overdueCount += 1;
    }
  }

  return { buckets, overdueTotalCents, overdueCount };
}
