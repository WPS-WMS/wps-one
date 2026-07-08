import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { DEFAULT_COST_CENTERS, DEFAULT_REVENUE_ACCOUNTS } from "./financeiroSeedDefaults.js";
import { buildInstallmentPlan } from "./payableHelpers.js";

/**
 * Gera conta a receber idempotente quando a receita de projeto fica ATIVA.
 */
export async function createReceivableFromProjectRevenue(
  tenantId: string,
  userId: string,
  revenueId: string,
): Promise<{ ok: true; receivableId: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const revenue = await prisma.projectRevenue.findFirst({
    where: { id: revenueId, tenantId },
    include: {
      project: { select: { id: true, clientId: true, name: true } },
      receivable: { select: { id: true } },
      billingLines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!revenue) return { ok: false, error: "Receita não encontrada." };
  if (revenue.status !== "ATIVO") return { ok: false, skipped: true };
  if (revenue.receivable) return { ok: false, skipped: true };

  const amountReais = revenue.expectedRevenue ?? revenue.contractedValue;
  if (amountReais == null || amountReais <= 0) {
    return { ok: false, error: "Receita sem valor previsto ou contratado." };
  }
  const totalAmountCents = Math.round(amountReais * 100);
  const firstDue = revenue.startDate ?? new Date();
  const installments =
    revenue.billingLines.length > 0
      ? revenue.billingLines.map((line) => ({
          installmentNumber: line.installmentNumber,
          dueDate: line.dueDate,
          amountCents: Math.round(line.amount * 100),
        }))
      : buildInstallmentPlan(
          totalAmountCents,
          Math.max(1, revenue.installmentCount ?? 1),
          firstDue,
        );
  const competenceDate = revenue.startDate ?? firstDue;

  await ensureFinanceDefaults(tenantId);

  const account =
    (await prisma.financialAccount.findFirst({
      where: {
        tenantId,
        type: "RECEITA",
        isActive: true,
        name: DEFAULT_REVENUE_ACCOUNTS[0],
      },
      select: { id: true },
    })) ??
    (await prisma.financialAccount.findFirst({
      where: { tenantId, type: "RECEITA", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    }));
  if (!account) return { ok: false, error: "Nenhuma conta de receita configurada." };

  const costCenter =
    (await prisma.costCenter.findFirst({
      where: { tenantId, isActive: true, name: DEFAULT_COST_CENTERS[0] },
      select: { id: true },
    })) ??
    (await prisma.costCenter.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    }));
  if (!costCenter) return { ok: false, error: "Nenhum centro de custo configurado." };

  const description =
    revenue.title?.trim() ||
    `Receita projeto ${revenue.project.name}`.trim();

  const created = await prisma.$transaction(async (tx) => {
    return tx.receivable.create({
      data: {
        tenantId,
        clientId: revenue.project.clientId,
        projectId: revenue.projectId,
        projectRevenueId: revenue.id,
        financialAccountId: account.id,
        description,
        totalAmountCents,
        competenceDate,
        kind: "PROJETO",
        status: "PREVISTO",
        sourceType: "PROJECT_REVENUE",
        sourceId: revenue.id,
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
          create: [
            {
              costCenterId: costCenter.id,
              projectId: revenue.projectId,
              percentBps: 10000,
              amountCents: totalAmountCents,
            },
          ],
        },
        history: {
          create: {
            userId,
            action: "CREATE",
            details: "Gerada automaticamente a partir da receita de projeto.",
          },
        },
      },
      select: { id: true },
    });
  });

  return { ok: true, receivableId: created.id };
}
