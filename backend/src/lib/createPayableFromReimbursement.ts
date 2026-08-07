import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { DEFAULT_REVENUE_ACCOUNTS } from "./financeiroSeedDefaults.js";
import { buildInstallmentPlan, normalizeAllocations } from "./payableHelpers.js";
import { resolveContractTypeIdFromEmploymentType } from "./userContractTypeHelpers.js";

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

function normalizeCostCenterName(name: string): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Centro de custo padrão para reembolsos: Variável (não Administrativo). */
async function resolveReimbursementCostCenter(tenantId: string): Promise<{ id: string } | null> {
  const centers = await prisma.costCenter.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const preferred = centers.find((c) => {
    const n = normalizeCostCenterName(c.name);
    return n === "variavel" || n.startsWith("variavel");
  });
  if (preferred) return { id: preferred.id };

  const created = await prisma.costCenter.create({
    data: { tenantId, name: "Variável", isActive: true },
    select: { id: true },
  });
  return created;
}

/** Categoria financeira padrão do CP gerado por reembolso aprovado. */
async function resolveReimbursementFinancialCategory(tenantId: string): Promise<{ id: string } | null> {
  const categories = await prisma.financialCategory.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, dreSubcategory: true },
    orderBy: { name: "asc" },
  });
  const byNormalizedName = (want: string) => {
    const target = normalizeCostCenterName(want);
    return categories.find((c) => normalizeCostCenterName(c.name) === target);
  };
  const preferred =
    byNormalizedName("Reembolso") ??
    byNormalizedName("Reembolsos") ??
    categories.find((c) => String(c.dreSubcategory ?? "").toUpperCase() === "REEMBOLSOS");
  if (preferred) return { id: preferred.id };

  try {
    const created = await prisma.financialCategory.create({
      data: {
        tenantId,
        name: "Reembolso",
        isActive: true,
        dreSubcategory: "REEMBOLSOS",
        enableAmount: true,
        enableReimbursement: true,
      },
      select: { id: true },
    });
    return created;
  } catch {
    const again = await prisma.financialCategory.findFirst({
      where: { tenantId, name: "Reembolso" },
      select: { id: true },
    });
    return again;
  }
}

async function resolveRequesterPayee(
  tenantId: string,
  userId: string,
  fallbackName: string,
): Promise<{
  professionalUserId: string | null;
  supplierId: string | null;
  payeeName: string;
  contractTypeId: string | null;
}> {
  const requester = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, name: true, employmentType: true },
  });
  const userName = requester?.name?.trim() || fallbackName;
  const contractTypeId = await resolveContractTypeIdFromEmploymentType(
    tenantId,
    requester?.employmentType,
  );

  const linkedSupplier = await prisma.supplierUserLink.findFirst({
    where: { userId, supplier: { tenantId } },
    select: { supplier: { select: { id: true, nomeApelido: true } } },
  });
  if (linkedSupplier?.supplier) {
    return {
      professionalUserId: userId,
      supplierId: linkedSupplier.supplier.id,
      payeeName: linkedSupplier.supplier.nomeApelido?.trim() || userName,
      contractTypeId,
    };
  }
  const legacySupplier = await prisma.supplier.findFirst({
    where: { tenantId, linkedUserId: userId },
    select: { id: true, nomeApelido: true },
  });
  if (legacySupplier) {
    return {
      professionalUserId: userId,
      supplierId: legacySupplier.id,
      payeeName: legacySupplier.nomeApelido?.trim() || userName,
      contractTypeId,
    };
  }
  return {
    professionalUserId: userId,
    supplierId: null,
    payeeName: userName,
    contractTypeId,
  };
}

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
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "CANCELADO") {
      await prisma.$transaction(async (tx) => {
        await tx.payableInstallment.updateMany({
          where: { payableId: existing.id, status: "CANCELADO" },
          data: { status: "ABERTO" },
        });
        await tx.payable.update({
          where: { id: existing.id },
          data: { status: "ABERTO", updatedById: createdById },
        });
        await tx.payableHistory.create({
          data: {
            payableId: existing.id,
            userId: createdById,
            action: "STATUS",
            details: "Conta a pagar reaberta após nova aprovação do reembolso.",
          },
        });
      });
    }
    return { id: existing.id };
  }

  await ensureFinanceDefaults(reimbursement.tenantId);

  const account = await prisma.financialAccount.findFirst({
    where: { tenantId: reimbursement.tenantId, type: "DESPESA", name: "Reembolsos", isActive: true },
    select: { id: true },
  });
  if (!account) return null;

  const costCenter = await resolveReimbursementCostCenter(reimbursement.tenantId);
  if (!costCenter) return null;

  const financialCategory = await resolveReimbursementFinancialCategory(reimbursement.tenantId);
  if (!financialCategory) return null;

  const payee = await resolveRequesterPayee(
    reimbursement.tenantId,
    reimbursement.userId,
    reimbursement.user.name,
  );

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
        professionalUserId: payee.professionalUserId,
        supplierId: payee.supplierId,
        payeeName: payee.payeeName,
        contractTypeId: payee.contractTypeId,
        financialAccountId: account.id,
        financialCategoryId: financialCategory.id,
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
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "CANCELADO") {
      await prisma.$transaction(async (tx) => {
        await tx.receivableInstallment.updateMany({
          where: { receivableId: existing.id, status: "CANCELADO" },
          data: { status: "PREVISTO" },
        });
        await tx.receivable.update({
          where: { id: existing.id },
          data: { status: "PREVISTO", updatedById: createdById },
        });
        await tx.receivableHistory.create({
          data: {
            receivableId: existing.id,
            userId: createdById,
            action: "STATUS",
            details: "Conta a receber reaberta após nova aprovação do reembolso.",
          },
        });
      });
    }
    return { id: existing.id };
  }

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

  const costCenter = await resolveReimbursementCostCenter(reimbursement.tenantId);

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
