import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { DEFAULT_COST_CENTERS, DEFAULT_REVENUE_ACCOUNTS } from "./financeiroSeedDefaults.js";
import { buildInstallmentPlan } from "./payableHelpers.js";
import { deriveReceivableStatus } from "./receivableHelpers.js";

type PlannedInstallment = {
  installmentNumber: number;
  dueDate: Date;
  amountCents: number;
};

function buildPlannedInstallments(revenue: {
  expectedRevenue: number | null;
  contractedValue: number | null;
  startDate: Date | null;
  installmentCount: number | null;
  billingLines: Array<{
    installmentNumber: number;
    dueDate: Date;
    amount: number;
  }>;
}): { ok: true; totalAmountCents: number; installments: PlannedInstallment[]; competenceDate: Date } | { ok: false; error: string } {
  const amountReais = revenue.expectedRevenue ?? revenue.contractedValue;
  const billingSum = revenue.billingLines.reduce((acc, line) => acc + (line.amount || 0), 0);
  if (revenue.billingLines.length > 0 && billingSum <= 0) {
    return { ok: false, error: "Receita sem valor nas parcelas de faturamento." };
  }
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
  return {
    ok: true,
    totalAmountCents,
    installments,
    competenceDate: revenue.startDate ?? firstDue,
  };
}

async function resolveFinanceDefaults(tenantId: string) {
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
  return { account, costCenter };
}

type LinkedReceivable = {
  id: string;
  status: string;
  installments: Array<{ id: string; status: string }>;
};

/**
 * Remove ou cancela a CR vinculada à receita de projeto.
 * Sem parcelas RECEBIDAS: apaga a conta (some da listagem).
 * Com recebimentos: cancela apenas o que ainda está em aberto.
 */
export async function disposeReceivableForProjectRevenue(
  tenantId: string,
  userId: string,
  revenueId: string,
  reason = "Receita de projeto excluída ou zerada.",
): Promise<{ ok: true; disposed: boolean } | { ok: false; error: string }> {
  const receivables = await prisma.receivable.findMany({
    where: {
      tenantId,
      OR: [{ projectRevenueId: revenueId }, { sourceType: "PROJECT_REVENUE", sourceId: revenueId }],
    },
    include: { installments: { select: { id: true, status: true } } },
  });
  if (receivables.length === 0) return { ok: true, disposed: false };
  for (const receivable of receivables) {
    await disposeLinkedReceivable(receivable, userId, reason);
  }
  return { ok: true, disposed: true };
}

async function disposeLinkedReceivable(
  receivable: LinkedReceivable,
  userId: string,
  reason: string,
): Promise<void> {
  if (receivable.status === "CANCELADO") return;

  const hasReceived = receivable.installments.some((i) => i.status === "RECEBIDO");
  await prisma.$transaction(async (tx) => {
    await tx.receivableInstallment.updateMany({
      where: {
        receivableId: receivable.id,
        status: { not: "RECEBIDO" },
      },
      data: { status: "CANCELADO" },
    });
    await tx.receivable.update({
      where: { id: receivable.id },
      data: {
        status: hasReceived ? "RECEBIDO" : "CANCELADO",
        projectRevenueId: null,
        updatedById: userId,
      },
    });
    await tx.receivableHistory.create({
      data: {
        receivableId: receivable.id,
        userId,
        action: "CANCEL",
        details: reason,
      },
    });
  });
}

/** Cancela/remove CRs órfãs (receita apagada, vínculo perdido ou receita CANCELADO). */
export async function cleanupOrphanProjectReceivables(tenantId: string, userId: string): Promise<number> {
  const candidates = await prisma.receivable.findMany({
    where: {
      tenantId,
      status: { not: "CANCELADO" },
      OR: [{ sourceType: "PROJECT_REVENUE" }, { kind: "PROJETO" }],
    },
    include: {
      projectRevenue: { select: { id: true, status: true } },
      installments: { select: { id: true, status: true } },
    },
    take: 200,
  });

  let count = 0;
  for (const row of candidates) {
    const revenueMissing = !row.projectRevenueId || !row.projectRevenue;
    const revenueCancelled = row.projectRevenue?.status === "CANCELADO";
    if (!revenueMissing && !revenueCancelled) continue;
    await disposeLinkedReceivable(
      row,
      userId,
      revenueCancelled
        ? "Removida automaticamente: receita de projeto cancelada."
        : "Removida automaticamente: receita de projeto excluída.",
    );
    count += 1;
  }
  return count;
}

/**
 * Cria ou atualiza a conta a receber vinculada à receita de projeto (parcelas/faturamento).
 * Idempotente por projectRevenueId. Preserva parcelas já RECEBIDAS.
 */
export async function syncReceivableFromProjectRevenue(
  tenantId: string,
  userId: string,
  revenueId: string,
): Promise<{ ok: true; receivableId: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const revenue = await prisma.projectRevenue.findFirst({
    where: { id: revenueId, tenantId },
    include: {
      project: { select: { id: true, clientId: true, name: true } },
      receivable: {
        include: {
          installments: { orderBy: { installmentNumber: "asc" } },
          invoice: { select: { id: true } },
        },
      },
      billingLines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!revenue) return { ok: false, error: "Receita não encontrada." };

  if (revenue.status === "CANCELADO") {
    if (!revenue.receivable) return { ok: false, skipped: true };
    await disposeLinkedReceivable(
      revenue.receivable,
      userId,
      "Cancelada automaticamente: receita de projeto cancelada.",
    );
    return { ok: true, receivableId: revenue.receivable.id };
  }

  // NEGOCIACAO / ATIVO / FINALIZADO → espelha parcelas em Contas a receber
  const planned = buildPlannedInstallments(revenue);
  if (planned.ok === false) {
    // Valor zerado/vazio: remove CR pendente para não deixar parcelas fantasmas
    if (revenue.receivable) {
      await disposeLinkedReceivable(
        revenue.receivable,
        userId,
        "Removida automaticamente: receita de projeto sem valor.",
      );
    }
    return { ok: false, error: planned.error };
  }

  const description =
    revenue.title?.trim() ||
    `Receita projeto ${revenue.project.name}`.trim();

  if (!revenue.receivable) {
    const defaults = await resolveFinanceDefaults(tenantId);
    if (!defaults.account) return { ok: false, error: "Nenhuma conta de receita configurada." };
    if (!defaults.costCenter) return { ok: false, error: "Nenhum centro de custo configurado." };

    const created = await prisma.$transaction(async (tx) => {
      return tx.receivable.create({
        data: {
          tenantId,
          clientId: revenue.project.clientId,
          projectId: revenue.projectId,
          projectRevenueId: revenue.id,
          financialAccountId: defaults.account!.id,
          description,
          totalAmountCents: planned.totalAmountCents,
          competenceDate: planned.competenceDate,
          kind: "PROJETO",
          status: "PREVISTO",
          paymentMethod: revenue.paymentMethod ?? null,
          sourceType: "PROJECT_REVENUE",
          sourceId: revenue.id,
          createdById: userId,
          installments: {
            create: planned.installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              amountCents: inst.amountCents,
              status: "PREVISTO",
            })),
          },
          allocations: {
            create: [
              {
                costCenterId: defaults.costCenter!.id,
                projectId: revenue.projectId,
                percentBps: 10000,
                amountCents: planned.totalAmountCents,
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

  const existing = revenue.receivable;
  if (existing.status === "CANCELADO") return { ok: false, skipped: true };

  await prisma.$transaction(async (tx) => {
    const byNumber = new Map(existing.installments.map((i) => [i.installmentNumber, i]));
    const plannedNumbers = new Set(planned.installments.map((i) => i.installmentNumber));

    for (const inst of planned.installments) {
      const current = byNumber.get(inst.installmentNumber);
      if (!current) {
        await tx.receivableInstallment.create({
          data: {
            receivableId: existing.id,
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            amountCents: inst.amountCents,
            status: "PREVISTO",
          },
        });
        continue;
      }
      if (current.status === "RECEBIDO") continue;
      await tx.receivableInstallment.update({
        where: { id: current.id },
        data: {
          dueDate: inst.dueDate,
          amountCents: inst.amountCents,
          status: current.status === "CANCELADO" ? "PREVISTO" : current.status,
        },
      });
    }

    for (const current of existing.installments) {
      if (plannedNumbers.has(current.installmentNumber)) continue;
      if (current.status === "RECEBIDO") continue;
      await tx.receivableInstallment.delete({ where: { id: current.id } });
    }

    const refreshed = await tx.receivableInstallment.findMany({
      where: { receivableId: existing.id },
      select: { status: true, dueDate: true },
    });
    const nextStatus = deriveReceivableStatus(refreshed, existing.status, !!existing.invoice);

    await tx.receivable.update({
      where: { id: existing.id },
      data: {
        description,
        totalAmountCents: planned.totalAmountCents,
        competenceDate: planned.competenceDate,
        clientId: revenue.project.clientId,
        projectId: revenue.projectId,
        paymentMethod: revenue.paymentMethod ?? null,
        status: nextStatus,
        updatedById: userId,
      },
    });

    await tx.receivableAllocation.deleteMany({ where: { receivableId: existing.id } });
    const costCenter =
      (await tx.costCenter.findFirst({
        where: { tenantId, isActive: true, name: DEFAULT_COST_CENTERS[0] },
        select: { id: true },
      })) ??
      (await tx.costCenter.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true },
      }));
    if (costCenter) {
      await tx.receivableAllocation.create({
        data: {
          receivableId: existing.id,
          costCenterId: costCenter.id,
          projectId: revenue.projectId,
          percentBps: 10000,
          amountCents: planned.totalAmountCents,
        },
      });
    }

    await tx.receivableHistory.create({
      data: {
        receivableId: existing.id,
        userId,
        action: "UPDATE",
        details: "Parcelas sincronizadas a partir da receita de projeto.",
      },
    });
  });

  return { ok: true, receivableId: existing.id };
}

/** @deprecated Prefer syncReceivableFromProjectRevenue — mantido para imports existentes. */
export async function createReceivableFromProjectRevenue(
  tenantId: string,
  userId: string,
  revenueId: string,
) {
  return syncReceivableFromProjectRevenue(tenantId, userId, revenueId);
}
