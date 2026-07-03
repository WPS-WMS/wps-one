import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { buildInstallmentPlan, normalizeAllocations } from "./payableHelpers.js";

type ReimbursementForPayable = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  amountCents: number;
  description: string;
  expenseDate: Date | null;
  paidAt: Date | null;
  user: { name: string };
  project: { name: string };
};

/**
 * Gera conta a pagar a partir de reembolso marcado como PAID.
 * Idempotente: não duplica se já existir payable vinculado.
 */
export async function createPayableFromReimbursement(
  reimbursement: ReimbursementForPayable,
  createdById: string,
): Promise<{ id: string } | null> {
  const existing = await prisma.payable.findFirst({
    where: { reimbursementId: reimbursement.id },
    select: { id: true },
  });
  if (existing) return existing;

  await ensureFinanceDefaults(reimbursement.tenantId);

  const account = await prisma.financialAccount.findFirst({
    where: { tenantId: reimbursement.tenantId, type: "DESPESA", name: "Reembolsos", isActive: true },
    select: { id: true },
  });
  if (!account) return null;

  const costCenter =
    (await prisma.costCenter.findFirst({
      where: { tenantId: reimbursement.tenantId, name: "Projetos internos", isActive: true },
      select: { id: true },
    })) ??
    (await prisma.costCenter.findFirst({
      where: { tenantId: reimbursement.tenantId, isActive: true },
      select: { id: true },
      orderBy: { name: "asc" },
    }));
  if (!costCenter) return null;

  const dueDate = reimbursement.paidAt ?? reimbursement.expenseDate ?? new Date();
  const competence = reimbursement.expenseDate ?? dueDate;
  const description = `Reembolso — ${reimbursement.user.name} — ${reimbursement.project.name}: ${reimbursement.description}`;

  const allocations = normalizeAllocations(reimbursement.amountCents, [
    {
      costCenterId: costCenter.id,
      projectId: reimbursement.projectId,
      percentBps: 10000,
    },
  ]);

  const installments = buildInstallmentPlan(reimbursement.amountCents, 1, dueDate);

  const payable = await prisma.$transaction(async (tx) => {
    const created = await tx.payable.create({
      data: {
        tenantId: reimbursement.tenantId,
        financialAccountId: account.id,
        description,
        totalAmountCents: reimbursement.amountCents,
        competenceDate: competence,
        kind: "REEMBOLSO",
        status: "ABERTO",
        sourceType: "REIMBURSEMENT",
        sourceId: reimbursement.id,
        reimbursementId: reimbursement.id,
        requiresApproval: false,
        createdById,
        notes: null,
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
            amountCents: a.amountCents ?? reimbursement.amountCents,
          })),
        },
        history: {
          create: {
            userId: createdById,
            action: "CREATE",
            details: "Conta a pagar gerada automaticamente a partir de reembolso aprovado.",
          },
        },
      },
      select: { id: true },
    });
    return created;
  });

  return payable;
}
