import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  agingBucketForDueDate,
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  deriveReceivableStatus,
  normalizeAllocations,
  nextRecurrenceDueDate,
  parseEntryDate,
  type AgingBucket,
} from "./receivableHelpers.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";

type Tx = Prisma.TransactionClient;

export async function receiveInstallment(
  tenantId: string,
  userId: string,
  receivableId: string,
  installmentId: string,
  receivedAtRaw?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: {
      allocations: true,
      invoice: { select: { id: true } },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const installment = receivable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.status === "RECEBIDO") return { ok: false, error: "Parcela já recebida." };
  if (installment.status === "CANCELADO") return { ok: false, error: "Parcela cancelada." };

  const receivedAt = receivedAtRaw ? parseEntryDate(receivedAtRaw) : new Date();
  if (!receivedAt) return { ok: false, error: "Data de recebimento inválida." };

  const primaryAllocation = receivable.allocations[0];
  if (!primaryAllocation) return { ok: false, error: "Rateio não configurado." };

  await prisma.$transaction(async (tx) => {
    const entry = await tx.financialEntry.create({
      data: {
        tenantId,
        costCenterId: primaryAllocation.costCenterId,
        financialAccountId: receivable.financialAccountId,
        type: "RECEITA",
        amountCents: installment.amountCents,
        entryDate: receivedAt,
        description: `${receivable.description} — parcela ${installment.installmentNumber}`,
        status: "LANCADO",
        projectId: primaryAllocation.projectId ?? receivable.projectId,
        createdById: userId,
        receivableInstallmentId: installment.id,
      },
    });

    await tx.receivableInstallment.update({
      where: { id: installment.id },
      data: { status: "RECEBIDO", receivedAt: new Date() },
    });

    const remaining = receivable.installments.filter((i) => i.id !== installment.id);
    const updatedStatuses = remaining.map((i) =>
      i.status === "RECEBIDO" ? "RECEBIDO" : computeEffectiveInstallmentStatus(i),
    );
    updatedStatuses.push("RECEBIDO");
    const allReceived = updatedStatuses.every((s) => s === "RECEBIDO");
    const anyOverdue = remaining.some(
      (i) => i.status !== "RECEBIDO" && computeEffectiveInstallmentStatus(i) === "ATRASADO",
    );
    const hasInvoice = !!receivable.invoice;

    let newStatus = deriveReceivableStatus(
      receivable.installments.map((i) =>
        i.id === installment.id ? { ...i, status: "RECEBIDO" } : i,
      ),
      receivable.status,
      hasInvoice,
    );
    if (allReceived) newStatus = "RECEBIDO";
    else if (anyOverdue) newStatus = "ATRASADO";
    else if (hasInvoice) newStatus = "FATURADO";

    await tx.receivable.update({
      where: { id: receivableId },
      data: { status: newStatus },
    });

    await tx.receivableHistory.create({
      data: {
        receivableId,
        userId,
        action: "RECEIPT",
        details: `Parcela ${installment.installmentNumber} recebida (${formatCentsToBrl(installment.amountCents)}). Lançamento ${entry.id}.`,
      },
    });
  });

  return { ok: true };
}

export async function unreceiveInstallment(
  tenantId: string,
  userId: string,
  receivableId: string,
  installmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: {
      invoice: { select: { id: true } },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const installment = receivable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.status !== "RECEBIDO") return { ok: false, error: "Parcela não está recebida." };

  const hasInvoice = !!receivable.invoice;

  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.updateMany({
      where: { receivableInstallmentId: installment.id, status: "LANCADO" },
      data: { status: "CANCELADO" },
    });

    await tx.receivableInstallment.update({
      where: { id: installment.id },
      data: { status: "PREVISTO", receivedAt: null },
    });

    const updatedInstallments = receivable.installments.map((i) =>
      i.id === installment.id ? { ...i, status: "PREVISTO", receivedAt: null } : i,
    );
    const newStatus = deriveReceivableStatus(updatedInstallments, "PREVISTO", hasInvoice);

    await tx.receivable.update({
      where: { id: receivableId },
      data: { status: newStatus },
    });

    await tx.receivableHistory.create({
      data: {
        receivableId,
        userId,
        action: "RECEIPT_REVERT",
        details: `Recebimento da parcela ${installment.installmentNumber} desfeito (${formatCentsToBrl(installment.amountCents)}).`,
      },
    });
  });

  return { ok: true };
}

export async function unmarkReceivableAsReceived(
  tenantId: string,
  userId: string,
  receivableId: string,
): Promise<{ ok: true; unreceivedCount: number } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const received = receivable.installments.filter((i) => i.status === "RECEBIDO");
  if (received.length === 0) return { ok: true, unreceivedCount: 0 };

  let unreceivedCount = 0;
  for (const inst of received) {
    const result = await unreceiveInstallment(tenantId, userId, receivableId, inst.id);
    if (result.ok === false) return { ok: false, error: result.error };
    unreceivedCount += 1;
  }
  return { ok: true, unreceivedCount };
}

export async function setReceivableManualStatus(
  tenantId: string,
  userId: string,
  receivableId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = String(status).trim().toUpperCase();
  if (!["PREVISTO", "FATURADO", "RECEBIDO", "ATRASADO", "CANCELADO"].includes(normalized)) {
    return { ok: false, error: "Status inválido." };
  }

  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: {
      invoice: { select: { id: true } },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };

  if (normalized === "RECEBIDO") {
    const marked = await markReceivableAsReceived(tenantId, userId, receivableId);
    return marked.ok ? { ok: true } : marked;
  }

  if (normalized === "CANCELADO") {
    if (receivable.status === "CANCELADO") return { ok: true };
    await prisma.$transaction(async (tx) => {
      await tx.receivableInstallment.updateMany({
        where: { receivableId, status: { not: "RECEBIDO" } },
        data: { status: "CANCELADO" },
      });
      await tx.receivable.update({
        where: { id: receivableId },
        data: { status: "CANCELADO" },
      });
      await tx.receivableHistory.create({
        data: {
          receivableId,
          userId,
          action: "STATUS",
          field: "status",
          oldValue: receivable.status,
          newValue: "CANCELADO",
          details: "Status alterado manualmente para Cancelado.",
        },
      });
    });
    return { ok: true };
  }

  if (receivable.installments.some((i) => i.status === "RECEBIDO")) {
    const unmark = await unmarkReceivableAsReceived(tenantId, userId, receivableId);
    if (!unmark.ok) return unmark;
  }

  if (receivable.status === "CANCELADO" || normalized === "PREVISTO" || normalized === "FATURADO" || normalized === "ATRASADO") {
    await prisma.receivableInstallment.updateMany({
      where: { receivableId, status: "CANCELADO" },
      data: { status: "PREVISTO" },
    });
  }

  const finalStatus = normalized;

  await prisma.receivable.update({
    where: { id: receivableId },
    data: { status: finalStatus },
  });
  await prisma.receivableHistory.create({
    data: {
      receivableId,
      userId,
      action: "STATUS",
      field: "status",
      oldValue: receivable.status,
      newValue: finalStatus,
      details: `Status alterado manualmente para ${finalStatus}.`,
    },
  });

  return { ok: true };
}

export async function issueInvoice(
  tenantId: string,
  userId: string,
  receivableId: string,
  invoice: {
    nfNumber: string;
    nfSeries?: string | null;
    emissionDate: Date;
    grossAmountCents: number;
    netAmountCents: number;
    taxAmountCents: number;
    retentionAmountCents: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: { invoice: { select: { id: true } }, installments: true },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };
  if (receivable.invoice) return { ok: false, error: "Nota fiscal já registrada." };

  await prisma.$transaction(async (tx) => {
    await tx.receivableInvoice.create({
      data: {
        receivableId,
        nfNumber: invoice.nfNumber,
        nfSeries: invoice.nfSeries ?? null,
        emissionDate: invoice.emissionDate,
        grossAmountCents: invoice.grossAmountCents,
        netAmountCents: invoice.netAmountCents,
        taxAmountCents: invoice.taxAmountCents,
        retentionAmountCents: invoice.retentionAmountCents,
      },
    });

    await tx.receivable.update({
      where: { id: receivableId },
      data: {
        status: receivable.status === "RECEBIDO" ? "RECEBIDO" : "FATURADO",
        netAmountCents: invoice.netAmountCents,
        taxAmountCents: invoice.taxAmountCents,
        retentionAmountCents: invoice.retentionAmountCents,
        competenceDate: invoice.emissionDate,
      },
    });

    await tx.receivableInstallment.updateMany({
      where: { receivableId, status: "PREVISTO" },
      data: { status: "FATURADO" },
    });

    await tx.receivableHistory.create({
      data: {
        receivableId,
        userId,
        action: "INVOICE",
        details: `NF ${invoice.nfNumber} emitida em ${invoice.emissionDate.toISOString().slice(0, 10)}.`,
      },
    });
  });

  return { ok: true };
}

export async function generateRecurrenceReceivables(tenantId: string, userId: string): Promise<number> {
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const rules = await prisma.receivableRecurrenceRule.findMany({
    where: {
      tenantId,
      isActive: true,
      nextDueDate: { lte: todayDate },
    },
  });

  let created = 0;
  for (const rule of rules) {
    if (rule.endDate && rule.endDate < todayDate) {
      await prisma.receivableRecurrenceRule.update({
        where: { id: rule.id },
        data: { isActive: false },
      });
      continue;
    }
    if (!rule.clientId) continue;

    const dueDate = rule.nextDueDate;
    const allocations = normalizeAllocations(
      rule.amountCents,
      rule.defaultCostCenterId
        ? [{ costCenterId: rule.defaultCostCenterId, projectId: rule.projectId, percentBps: 10000 }]
        : [],
      rule.defaultCostCenterId,
    );
    if (allocations.length === 0) continue;

    const installments = buildInstallmentPlan(rule.amountCents, 1, dueDate);

    await prisma.$transaction(async (tx: Tx) => {
      await tx.receivable.create({
        data: {
          tenantId,
          clientId: rule.clientId!,
          projectId: rule.projectId,
          financialAccountId: rule.financialAccountId,
          description: rule.description,
          totalAmountCents: rule.amountCents,
          competenceDate: dueDate,
          kind: "RECORRENTE",
          status: "PREVISTO",
          sourceType: "RECURRENCE",
          sourceId: `${rule.id}-${dueDate.toISOString().slice(0, 10)}`,
          recurrenceRuleId: rule.id,
          createdById: userId,
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

      const nextDue = nextRecurrenceDueDate(dueDate, rule.frequency, rule.dayOfMonth);
      await tx.receivableRecurrenceRule.update({
        where: { id: rule.id },
        data: { nextDueDate: nextDue },
      });
    });
    created++;
  }
  return created;
}

const COMPETENCE_MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

function formatCompetenceMonthLabel(date: Date | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const month = COMPETENCE_MONTH_SHORT[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month}/${year}`;
}

export async function markReceivableAsReceived(
  tenantId: string,
  userId: string,
  receivableId: string,
  receivedAtRaw?: string,
): Promise<{ ok: true; receivedCount: number } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const open = receivable.installments.filter(
    (i) => i.status !== "RECEBIDO" && i.status !== "CANCELADO",
  );
  if (open.length === 0) return { ok: true, receivedCount: 0 };

  let receivedCount = 0;
  for (const inst of open) {
    const result = await receiveInstallment(tenantId, userId, receivableId, inst.id, receivedAtRaw);
    if (result.ok === false) return { ok: false, error: result.error };
    receivedCount += 1;
  }
  return { ok: true, receivedCount };
}

export function mapReceivableListRow(receivable: {
  id: string;
  description: string;
  totalAmountCents: number;
  competenceDate: Date | null;
  kind: string;
  status: string;
  createdAt: Date;
  client: { id: string; name: string };
  project:
    | {
        id: string;
        name: string;
        contracts?: { title: string }[];
      }
    | null;
  financialAccount: { id: string; name: string };
  invoice: { nfNumber: string; emissionDate: Date } | null;
  installments: { id: string; dueDate: Date; amountCents: number; status: string; receivedAt: Date | null }[];
}) {
  const effectiveStatus = deriveReceivableStatus(
    receivable.installments,
    receivable.status,
    !!receivable.invoice,
  );
  const openInstallments = receivable.installments.filter(
    (i) => i.status !== "RECEBIDO" && i.status !== "CANCELADO",
  );
  const nextInstallment = openInstallments.sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
  )[0];
  const nfNumber = receivable.invoice?.nfNumber ?? null;
  const nfEmissionDate = receivable.invoice?.emissionDate.toISOString().slice(0, 10) ?? null;
  const nextDueDate = nextInstallment?.dueDate.toISOString().slice(0, 10) ?? null;
  const contractTitle = receivable.project?.contracts?.[0]?.title ?? null;
  const incomplete =
    effectiveStatus !== "CANCELADO" &&
    effectiveStatus !== "RECEBIDO" &&
    (!nfNumber || !nfEmissionDate || !nextDueDate || receivable.totalAmountCents <= 0);

  return {
    id: receivable.id,
    description: receivable.description,
    totalAmountCents: receivable.totalAmountCents,
    totalAmountFormatted: formatCentsToBrl(receivable.totalAmountCents),
    competenceDate: receivable.competenceDate?.toISOString().slice(0, 10) ?? null,
    competenceMonthLabel: formatCompetenceMonthLabel(receivable.competenceDate),
    kind: receivable.kind,
    status: effectiveStatus,
    clientId: receivable.client.id,
    clientName: receivable.client.name,
    projectId: receivable.project?.id ?? null,
    projectName: receivable.project?.name ?? null,
    contractTitle,
    financialAccountId: receivable.financialAccount.id,
    financialAccountName: receivable.financialAccount.name,
    nfNumber,
    nfEmissionDate,
    nextDueDate,
    nextInstallmentId: nextInstallment?.id ?? null,
    paid: effectiveStatus === "RECEBIDO",
    incomplete,
    installmentCount: receivable.installments.length,
    createdAt: receivable.createdAt,
  };
}

export type AgingSummary = {
  buckets: Record<AgingBucket, { count: number; totalCents: number }>;
  overdueTotalCents: number;
  overdueCount: number;
  items: Array<{
    installmentId: string;
    receivableId: string;
    description: string;
    clientName: string;
    dueDate: string;
    amountCents: number;
    daysOverdue: number;
    bucket: AgingBucket;
  }>;
};

export async function computeAgingSummary(tenantId: string): Promise<AgingSummary> {
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const installments = await prisma.receivableInstallment.findMany({
    where: {
      status: { in: ["PREVISTO", "FATURADO", "ATRASADO"] },
      receivable: { tenantId, status: { not: "CANCELADO" } },
    },
    include: {
      receivable: {
        select: {
          id: true,
          description: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const buckets: AgingSummary["buckets"] = {
    A_VENCER: { count: 0, totalCents: 0 },
    "1_30": { count: 0, totalCents: 0 },
    "31_60": { count: 0, totalCents: 0 },
    "61_90": { count: 0, totalCents: 0 },
    "90_PLUS": { count: 0, totalCents: 0 },
  };

  const items: AgingSummary["items"] = [];
  let overdueTotalCents = 0;
  let overdueCount = 0;

  for (const inst of installments) {
    const effective = computeEffectiveInstallmentStatus(inst, today);
    if (effective === "RECEBIDO" || effective === "CANCELADO") continue;

    const bucket = agingBucketForDueDate(inst.dueDate, today);
    buckets[bucket].count += 1;
    buckets[bucket].totalCents += inst.amountCents;

    const due = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
    const diffDays = Math.max(
      0,
      Math.floor((todayStart.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)),
    );

    if (bucket !== "A_VENCER") {
      overdueTotalCents += inst.amountCents;
      overdueCount += 1;
    }

    items.push({
      installmentId: inst.id,
      receivableId: inst.receivable.id,
      description: inst.receivable.description,
      clientName: inst.receivable.client.name,
      dueDate: due.toISOString().slice(0, 10),
      amountCents: inst.amountCents,
      daysOverdue: diffDays,
      bucket,
    });
  }

  return { buckets, overdueTotalCents, overdueCount, items };
}
