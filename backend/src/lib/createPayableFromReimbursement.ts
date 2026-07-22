import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { DEFAULT_REVENUE_ACCOUNTS } from "./financeiroSeedDefaults.js";
import { buildInstallmentPlan, normalizeAllocations } from "./payableHelpers.js";

export type ReimbursementFinanceSource = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  amountCents: number;
  description: string;
  paymentTo: string | null;
  expenseDate: Date | null;
  user: { name: string };
  project: { id: string; name: string; clientId: string; client?: { id: string; name: string } | null };
};

/**
 * Gera conta a pagar a partir de reembolso aprovado (Pagamento para = Consultor).
 * Idempotente: não duplica se já existir payable vinculado.
 */
export async function createPayableFromReimbursement(
  reimbursement: ReimbursementFinanceSource,
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

  const dueDate = reimbursement.expenseDate ?? new Date();
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

  return prisma.$transaction(async (tx) => {
    return tx.payable.create({
      data: {
        tenantId: reimbursement.tenantId,
        professionalUserId: reimbursement.userId,
        payeeName: reimbursement.user.name,
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
            details: "Conta a pagar gerada automaticamente a partir de reembolso aprovado (consultor).",
          },
        },
      },
      select: { id: true },
    });
  });
}

/**
 * Gera conta a receber do cliente do projeto (reembolso a recuperar).
 * Usado para Pagamento para = Empresa (só CR) e Consultor (CR + CP).
 */
export async function createReceivableFromReimbursement(
  reimbursement: ReimbursementFinanceSource,
  createdById: string,
): Promise<{ id: string } | null> {
  const existing = await prisma.receivable.findFirst({
    where: { tenantId: reimbursement.tenantId, sourceType: "REIMBURSEMENT", sourceId: reimbursement.id },
    select: { id: true },
  });
  if (existing) return existing;

  const clientId = reimbursement.project.clientId;
  if (!clientId) return null;

  await ensureFinanceDefaults(reimbursement.tenantId);

  const account =
    (await prisma.financialAccount.findFirst({
      where: {
        tenantId: reimbursement.tenantId,
        type: "RECEITA",
        isActive: true,
        name: DEFAULT_REVENUE_ACCOUNTS[0],
      },
      select: { id: true },
    })) ??
    (await prisma.financialAccount.findFirst({
      where: { tenantId: reimbursement.tenantId, type: "RECEITA", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    }));
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

  const dueDate = reimbursement.expenseDate ?? new Date();
  const competence = reimbursement.expenseDate ?? dueDate;
  const payeeLabel =
    reimbursement.paymentTo === "CONSULTOR" ? reimbursement.user.name : "Empresa";
  const description = `Reembolso (${payeeLabel}) — ${reimbursement.project.name}: ${reimbursement.description}`;
  const installments = buildInstallmentPlan(reimbursement.amountCents, 1, dueDate);

  return prisma.$transaction(async (tx) => {
    return tx.receivable.create({
      data: {
        tenantId: reimbursement.tenantId,
        clientId,
        projectId: reimbursement.projectId,
        financialAccountId: account.id,
        description,
        totalAmountCents: reimbursement.amountCents,
        competenceDate: competence,
        kind: "MANUAL",
        status: "PREVISTO",
        sourceType: "REIMBURSEMENT",
        sourceId: reimbursement.id,
        createdById,
        notes: null,
        installments: {
          create: installments.map((inst) => ({
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            amountCents: inst.amountCents,
            status: "PREVISTO",
          })),
        },
        ...(costCenter
          ? {
              allocations: {
                create: [
                  {
                    costCenterId: costCenter.id,
                    projectId: reimbursement.projectId,
                    percentBps: 10000,
                    amountCents: reimbursement.amountCents,
                  },
                ],
              },
            }
          : {}),
        history: {
          create: {
            userId: createdById,
            action: "CREATE",
            details:
              reimbursement.paymentTo === "CONSULTOR"
                ? "Conta a receber gerada automaticamente (reembolso ao consultor — recuperação junto ao cliente)."
                : "Conta a receber gerada automaticamente (reembolso para empresa — cobrança ao cliente).",
          },
        },
      },
      select: { id: true },
    });
  });
}

/**
 * Após aprovação: cria documentos financeiros conforme "Pagamento para".
 * - EMPRESA → apenas Contas a Receber (cliente → empresa)
 * - CONSULTOR → Contas a Pagar (empresa → consultor) + Contas a Receber (cliente → empresa)
 */
export async function createFinanceDocsFromApprovedReimbursement(
  reimbursement: ReimbursementFinanceSource,
  createdById: string,
): Promise<{ payableId: string | null; receivableId: string | null }> {
  const paymentTo = String(reimbursement.paymentTo ?? "").toUpperCase();
  let payableId: string | null = null;
  let receivableId: string | null = null;

  if (paymentTo === "CONSULTOR") {
    const payable = await createPayableFromReimbursement(reimbursement, createdById);
    payableId = payable?.id ?? null;
  }

  if (paymentTo === "EMPRESA" || paymentTo === "CONSULTOR") {
    const receivable = await createReceivableFromReimbursement(reimbursement, createdById);
    receivableId = receivable?.id ?? null;
  }

  return { payableId, receivableId };
}
