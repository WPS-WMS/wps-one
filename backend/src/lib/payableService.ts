import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  derivePayableStatus,
  firstRecurrenceDueDate,
  listRecurrenceDueDates,
  normalizeAllocations,
  nextRecurrenceDueDate,
  parseEntryDate,
} from "./payableHelpers.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";

type Tx = Prisma.TransactionClient;

async function createPayableFromRecurrenceRule(
  tx: Tx,
  rule: {
    id: string;
    tenantId: string;
    supplierId: string | null;
    financialAccountId: string;
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
  await tx.payable.create({
    data: {
      tenantId: rule.tenantId,
      supplierId: rule.supplierId,
      financialAccountId: rule.financialAccountId,
      corporateExpenseTypeId: rule.corporateExpenseTypeId,
      description: rule.description,
      totalAmountCents: rule.amountCents,
      competenceDate: dueDate,
      kind: "CORPORATIVA",
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

/**
 * Materializa todas as contas do período (início → término) na listagem de Contas a pagar.
 */
export async function materializeRecurrenceSchedule(
  tenantId: string,
  userId: string,
  ruleId: string,
): Promise<number> {
  const rule = await prisma.payableRecurrenceRule.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!rule || !rule.endDate) return 0;

  const dueDates = listRecurrenceDueDates(
    rule.startDate,
    rule.endDate,
    rule.frequency,
    rule.dayOfMonth,
  );
  let created = 0;
  await prisma.$transaction(async (tx: Tx) => {
    for (const dueDate of dueDates) {
      const ok = await createPayableFromRecurrenceRule(tx, rule, dueDate, userId);
      if (ok) created += 1;
    }
    const lastDue = dueDates[dueDates.length - 1];
    const nextAfterLast = lastDue
      ? nextRecurrenceDueDate(lastDue, rule.frequency, rule.dayOfMonth)
      : firstRecurrenceDueDate(rule.startDate, rule.dayOfMonth);
    // Agenda completa materializada até o término → regra deixa de gerar novas.
    await tx.payableRecurrenceRule.update({
      where: { id: rule.id },
      data: {
        nextDueDate: nextAfterLast,
        isActive: false,
      },
    });
  });
  return created;
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
  if (!primaryAllocation) return { ok: false, error: "Rateio não configurado." };

  await prisma.$transaction(async (tx) => {
    const entry = await tx.financialEntry.create({
      data: {
        tenantId,
        costCenterId: primaryAllocation.costCenterId,
        financialAccountId: payable.financialAccountId,
        type: "DESPESA",
        amountCents: installment.amountCents,
        entryDate: paidAt,
        description: `${payable.description} — parcela ${installment.installmentNumber}`,
        status: "LANCADO",
        supplierId: payable.supplierId,
        projectId: primaryAllocation.projectId,
        createdById: userId,
        payableInstallmentId: installment.id,
      },
    });

    await tx.payableInstallment.update({
      where: { id: installment.id },
      data: { status: "PAGO", paidAt: new Date() },
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
      data: { status: "CANCELADO" },
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
      data: { status: newStatus },
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
        data: { status: "CANCELADO" },
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
    data: { status: finalStatus },
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
  competenceDate: Date | null;
  kind: string;
  status: string;
  createdAt: Date;
  supplier: { id: string; nomeApelido: string } | null;
  professional: { id: string; name: string } | null;
  financialAccount: { id: string; name: string };
  financialCategory: { id: string; name: string } | null;
  corporateExpenseType: { id: string; name: string } | null;
  contractType: { id: string; name: string } | null;
  installments: { id: string; dueDate: Date; amountCents: number; status: string; paidAt: Date | null }[];
  allocations?: { costCenter: { name: string } }[];
}) {
  const effectiveStatus = derivePayableStatus(payable.installments, payable.status);
  const nextInstallment = payable.installments.find((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
  const referenceDate = payable.competenceDate ?? nextInstallment?.dueDate ?? payable.createdAt;
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
  const payeeDisplayName =
    payable.professional?.name ??
    payable.supplier?.nomeApelido ??
    payable.payeeName ??
    null;
  const primaryCostCenter = payable.allocations?.[0]?.costCenter.name ?? null;
  const computedTotalCents =
    payable.totalAmountCents +
    (payable.benefitCents ?? 0) +
    (payable.reimbursementCents ?? 0) -
    (payable.discountCents ?? 0) +
    (payable.interestFineCents ?? 0);

  const formatOptionalCents = (cents: number | null) =>
    cents != null ? formatCentsToBrl(cents) : null;

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
    referenceDate: ref.toISOString().slice(0, 10),
    monthName: monthNames[ref.getUTCMonth()] ?? "",
    monthNumber,
    kind: payable.kind,
    status: effectiveStatus,
    supplierId: payable.supplier?.id ?? null,
    supplierName: payable.supplier?.nomeApelido ?? null,
    professionalUserId: payable.professional?.id ?? null,
    professionalName: payable.professional?.name ?? null,
    payeeName: payable.payeeName,
    payeeDisplayName,
    financialAccountId: payable.financialAccount.id,
    financialAccountName: payable.financialAccount.name,
    financialCategoryId: payable.financialCategory?.id ?? null,
    financialCategoryName: payable.financialCategory?.name ?? null,
    corporateExpenseTypeName: payable.corporateExpenseType?.name ?? null,
    contractTypeId: payable.contractType?.id ?? null,
    contractTypeName: payable.contractType?.name ?? null,
    primaryCostCenterName: primaryCostCenter,
    nextDueDate: nextInstallment?.dueDate.toISOString().slice(0, 10) ?? null,
    nextInstallmentId: nextInstallment?.id ?? null,
    installmentCount: payable.installments.length,
    createdAt: payable.createdAt,
  };
}
