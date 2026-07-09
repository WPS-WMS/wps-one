import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  buildInstallmentPlan,
  computeEffectiveInstallmentStatus,
  derivePayableStatus,
  normalizeAllocations,
  nextRecurrenceDueDate,
  parseEntryDate,
} from "./payableHelpers.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";

type Tx = Prisma.TransactionClient;

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

export async function generateRecurrencePayables(tenantId: string, userId: string): Promise<number> {
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const rules = await prisma.payableRecurrenceRule.findMany({
    where: {
      tenantId,
      isActive: true,
      nextDueDate: { lte: todayDate },
    },
  });

  let created = 0;
  for (const rule of rules) {
    if (rule.endDate && rule.endDate < todayDate) {
      await prisma.payableRecurrenceRule.update({
        where: { id: rule.id },
        data: { isActive: false },
      });
      continue;
    }

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
      await tx.payable.create({
        data: {
          tenantId,
          supplierId: rule.supplierId,
          financialAccountId: rule.financialAccountId,
          corporateExpenseTypeId: rule.corporateExpenseTypeId,
          description: rule.description,
          totalAmountCents: rule.amountCents,
          competenceDate: dueDate,
          kind: "CORPORATIVA",
          status: "ABERTO",
          sourceType: "RECURRENCE",
          sourceId: `${rule.id}-${dueDate.toISOString().slice(0, 10)}`,
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

      const nextDue = nextRecurrenceDueDate(dueDate, rule.frequency, rule.dayOfMonth);
      await tx.payableRecurrenceRule.update({
        where: { id: rule.id },
        data: { nextDueDate: nextDue },
      });
    });
    created++;
  }
  return created;
}

export function mapPayableListRow(payable: {
  id: string;
  description: string;
  totalAmountCents: number;
  competenceDate: Date | null;
  kind: string;
  status: string;
  createdAt: Date;
  supplier: { id: string; nomeApelido: string } | null;
  financialAccount: { id: string; name: string };
  corporateExpenseType: { id: string; name: string } | null;
  installments: { id: string; dueDate: Date; amountCents: number; status: string; paidAt: Date | null }[];
}) {
  const effectiveStatus = derivePayableStatus(payable.installments, payable.status);
  const nextInstallment = payable.installments.find((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
  return {
    id: payable.id,
    description: payable.description,
    totalAmountCents: payable.totalAmountCents,
    totalAmountFormatted: formatCentsToBrl(payable.totalAmountCents),
    competenceDate: payable.competenceDate?.toISOString().slice(0, 10) ?? null,
    kind: payable.kind,
    status: effectiveStatus,
    supplierId: payable.supplier?.id ?? null,
    supplierName: payable.supplier?.nomeApelido ?? null,
    financialAccountId: payable.financialAccount.id,
    financialAccountName: payable.financialAccount.name,
    corporateExpenseTypeName: payable.corporateExpenseType?.name ?? null,
    nextDueDate: nextInstallment?.dueDate.toISOString().slice(0, 10) ?? null,
    installmentCount: payable.installments.length,
    createdAt: payable.createdAt,
  };
}
