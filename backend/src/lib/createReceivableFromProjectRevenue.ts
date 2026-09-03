import { prisma } from "./prisma.js";
import { ensureFinanceDefaults } from "./financeConfigHelpers.js";
import { DEFAULT_COST_CENTERS, DEFAULT_REVENUE_ACCOUNTS } from "./financeiroSeedDefaults.js";
import { buildInstallmentPlan } from "./payableHelpers.js";
import { deriveReceivableStatus } from "./receivableHelpers.js";

export const RECEIVABLE_SOURCE_PROJECT_REVENUE = "PROJECT_REVENUE";
export const RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT = "PROJECT_REVENUE_MEASUREMENT";

type PlannedInstallment = {
  installmentNumber: number;
  dueDate: Date;
  competenceDate: Date;
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
    expectedPaymentDate?: Date | null;
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
  const installments: PlannedInstallment[] =
    revenue.billingLines.length > 0
      ? revenue.billingLines.map((line) => ({
          installmentNumber: line.installmentNumber,
          dueDate: line.expectedPaymentDate ?? line.dueDate,
          competenceDate: line.dueDate,
          amountCents: Math.round(line.amount * 100),
        }))
      : buildInstallmentPlan(
          totalAmountCents,
          Math.max(1, revenue.installmentCount ?? 1),
          firstDue,
        ).map((line) => ({
          ...line,
          competenceDate: line.dueDate,
        }));
  const sortedByDue = [...installments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return {
    ok: true,
    totalAmountCents,
    installments,
    competenceDate: sortedByDue[0]?.competenceDate ?? revenue.startDate ?? firstDue,
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
        name: DEFAULT_REVENUE_ACCOUNTS[0].name,
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

function contractTitleFromRevenue(revenue: { contractProposal?: string | null }): string | null {
  const value = revenue.contractProposal?.trim();
  return value || null;
}

function descriptionFromProjectRevenue(revenue: {
  title?: string | null;
  contractProposal?: string | null;
  project: { name: string };
  billingLines: Array<{ milestone?: string | null }>;
}): string {
  const fromMilestone = revenue.billingLines
    .map((line) => String(line.milestone ?? "").trim())
    .find((value) => value.length > 0);
  if (fromMilestone) return fromMilestone;
  const title = revenue.title?.trim() || "";
  const contract = revenue.contractProposal?.trim() || "";
  if (title && title !== contract) return title;
  return `Receita projeto ${revenue.project.name}`.trim();
}

type LinkedReceivable = {
  id: string;
  status: string;
  sourceType?: string | null;
  sourceId?: string | null;
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
  const entryIds = await prisma.projectRevenueVariableEntry.findMany({
    where: { revenueId },
    select: { id: true },
  });
  const receivables = await prisma.receivable.findMany({
    where: {
      tenantId,
      OR: [
        { projectRevenueId: revenueId },
        { sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE, sourceId: revenueId },
        ...(entryIds.length > 0
          ? [
              {
                sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT,
                sourceId: { in: entryIds.map((row) => row.id) },
              },
            ]
          : []),
      ],
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
        sourceType: null,
        sourceId: null,
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

    // Ao cancelar a conta vinculada a uma medição variável,
    // limpa receivableGeneratedAt para reabilitar "Gerar conta a receber".
    if (
      receivable.sourceType === RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT &&
      receivable.sourceId
    ) {
      await tx.projectRevenueVariableEntry.updateMany({
        where: { id: receivable.sourceId },
        data: { receivableGeneratedAt: null },
      });
    }
  });
}

/** Cancela/remove CRs órfãs (receita apagada, vínculo perdido ou receita CANCELADO). */
export async function cleanupOrphanProjectReceivables(tenantId: string, userId: string): Promise<number> {
  const candidates = await prisma.receivable.findMany({
    where: {
      tenantId,
      status: { not: "CANCELADO" },
      OR: [
        { sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE },
        { sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT },
        { kind: "PROJETO" },
      ],
    },
    include: {
      projectRevenue: { select: { id: true, status: true } },
      installments: { select: { id: true, status: true } },
    },
    take: 200,
  });

  let count = 0;
  for (const row of candidates) {
    if (row.sourceType === RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT) {
      const entry = row.sourceId
        ? await prisma.projectRevenueVariableEntry.findFirst({
            where: { id: row.sourceId },
            select: { id: true, revenue: { select: { status: true } } },
          })
        : null;
      const entryMissing = !entry;
      const revenueCancelled = entry?.revenue.status === "CANCELADO";
      if (!entryMissing && !revenueCancelled) continue;
      await disposeLinkedReceivable(
        row,
        userId,
        revenueCancelled
          ? "Removida automaticamente: receita de projeto cancelada."
          : "Removida automaticamente: medição da receita excluída.",
      );
      count += 1;
      continue;
    }
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

  const description = descriptionFromProjectRevenue(revenue);

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
          contractTitle: contractTitleFromRevenue(revenue),
          sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE,
          sourceId: revenue.id,
          createdById: userId,
          installments: {
            create: planned.installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              competenceDate: inst.competenceDate,
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
            competenceDate: inst.competenceDate,
            amountCents: inst.amountCents,
            status: "PREVISTO",
          },
        });
        continue;
      }
      if (current.status === "RECEBIDO" || receivableInstallmentIsInvoiced(current)) continue;
      await tx.receivableInstallment.update({
        where: { id: current.id },
        data: {
          dueDate: inst.dueDate,
          competenceDate: inst.competenceDate,
          amountCents: inst.amountCents,
          status: current.status === "CANCELADO" ? "PREVISTO" : current.status,
        },
      });
    }

    for (const current of existing.installments) {
      if (plannedNumbers.has(current.installmentNumber)) continue;
      if (current.status === "RECEBIDO" || receivableInstallmentIsInvoiced(current)) continue;
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
        contractTitle: contractTitleFromRevenue(revenue),
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

export async function disposeReceivableForVariableEntry(
  tenantId: string,
  userId: string,
  entryId: string,
  reason = "Medição da receita variável excluída.",
): Promise<{ ok: true; disposed: boolean } | { ok: false; error: string }> {
  const receivables = await prisma.receivable.findMany({
    where: {
      tenantId,
      sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT,
      sourceId: entryId,
    },
    include: { installments: { select: { id: true, status: true } } },
  });
  if (receivables.length === 0) return { ok: true, disposed: false };
  for (const receivable of receivables) {
    await disposeLinkedReceivable(receivable, userId, reason);
  }
  return { ok: true, disposed: true };
}

export function receivableInstallmentIsInvoiced(inst: {
  nfNumber?: string | null;
  nfEmissionDate?: Date | null;
  status: string;
  billingDocumentType?: string | null;
}): boolean {
  return (
    Boolean(inst.nfNumber) ||
    Boolean(inst.nfEmissionDate) ||
    inst.status === "FATURADO" ||
    inst.status === "RECEBIDO" ||
    inst.billingDocumentType === "NOTA_FISCAL" ||
    inst.billingDocumentType === "INVOICE"
  );
}

type MeasurementReceivableInstallment = {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  competenceDate?: Date | null;
  nfNumber?: string | null;
  nfEmissionDate?: Date | null;
  billingDocumentType?: string | null;
  status: string;
  amountCents?: number;
};

export type MeasurementReceivableOverlay = {
  sourceId: string | null;
  installments: MeasurementReceivableInstallment[];
  hasInvoice?: boolean;
};

export type LinkedReceivableLookup = {
  byEntryId: Map<string, MeasurementReceivableOverlay>;
  byRevenueId: Map<string, MeasurementReceivableOverlay>;
};

export function measurementReceivableIsInvoiced(
  overlay: MeasurementReceivableOverlay | undefined,
): boolean {
  if (!overlay) return false;
  if (overlay.hasInvoice) return true;
  return overlay.installments.some(
    (inst) => inst.status !== "CANCELADO" && receivableInstallmentIsInvoiced(inst),
  );
}

export async function loadMeasurementReceivablesByEntryIds(
  entryIds: string[],
  revenueIds: string[] = [],
): Promise<LinkedReceivableLookup> {
  const uniqueEntries = [...new Set(entryIds.filter(Boolean))];
  const uniqueRevenues = [...new Set(revenueIds.filter(Boolean))];
  const byEntryId = new Map<string, MeasurementReceivableOverlay>();
  const byRevenueId = new Map<string, MeasurementReceivableOverlay>();
  if (uniqueEntries.length === 0 && uniqueRevenues.length === 0) {
    return { byEntryId, byRevenueId };
  }

  const rows = await prisma.receivable.findMany({
    where: {
      status: { not: "CANCELADO" },
      OR: [
        ...(uniqueEntries.length > 0
          ? [
              {
                sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT,
                sourceId: { in: uniqueEntries },
              },
            ]
          : []),
        ...(uniqueRevenues.length > 0
          ? [
              { projectRevenueId: { in: uniqueRevenues } },
              {
                sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE,
                sourceId: { in: uniqueRevenues },
              },
            ]
          : []),
      ],
    },
    select: {
      sourceId: true,
      sourceType: true,
      projectRevenueId: true,
      invoice: { select: { nfNumber: true } },
      installments: {
        orderBy: { installmentNumber: "asc" },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          competenceDate: true,
          nfNumber: true,
          nfEmissionDate: true,
          billingDocumentType: true,
          status: true,
          amountCents: true,
        },
      },
    },
  });

  for (const row of rows) {
    const overlay: MeasurementReceivableOverlay = {
      sourceId: row.sourceId,
      installments: row.installments,
      hasInvoice: Boolean(row.invoice?.nfNumber),
    };
    if (
      row.sourceType === RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT &&
      row.sourceId
    ) {
      byEntryId.set(row.sourceId, overlay);
      continue;
    }
    const revenueId = row.projectRevenueId ?? row.sourceId;
    if (revenueId) byRevenueId.set(revenueId, overlay);
  }
  return { byEntryId, byRevenueId };
}

function matchInstallmentsToBillingLines(
  installments: MeasurementReceivableInstallment[],
  billingLines: Array<{ installmentNumber: number; amount: number }>,
): MeasurementReceivableInstallment[] {
  const open = installments.filter((inst) => inst.status !== "CANCELADO");
  if (open.length === 0 || billingLines.length === 0) return [];
  const byNumber = billingLines
    .map((line) => open.find((inst) => inst.installmentNumber === line.installmentNumber))
    .filter((inst): inst is MeasurementReceivableInstallment => Boolean(inst));
  if (byNumber.length > 0) return byNumber;
  if (billingLines.length === 1) {
    const cents = Math.round(billingLines[0]!.amount * 100);
    const hits = open.filter((inst) => inst.amountCents === cents);
    if (hits.length === 1) return hits;
  }
  return [];
}

export function receivableOverlayForEntry(
  entry: {
    id: string;
    billingLines: Array<{ installmentNumber: number; amount: number }>;
  },
  revenueId: string,
  lookup: LinkedReceivableLookup | undefined,
): MeasurementReceivableOverlay | undefined {
  if (!lookup) return undefined;
  const direct = lookup.byEntryId.get(entry.id);
  if (direct) return direct;
  const combined = lookup.byRevenueId.get(revenueId);
  if (!combined) return undefined;
  const installments = matchInstallmentsToBillingLines(combined.installments, entry.billingLines);
  if (installments.length === 0) return undefined;
  return { sourceId: entry.id, installments, hasInvoice: combined.hasInvoice };
}

function isReferenteMonthStart(competenceDate: Date, entryCompetenceDate?: Date | null): boolean {
  if (!entryCompetenceDate) return false;
  return (
    competenceDate.getUTCDate() === 1 &&
    competenceDate.getUTCFullYear() === entryCompetenceDate.getUTCFullYear() &&
    competenceDate.getUTCMonth() === entryCompetenceDate.getUTCMonth()
  );
}

export function overlayExpectedPaymentFromReceivable<
  T extends { installmentNumber: number; dueDate: Date; expectedPaymentDate?: Date | null },
>(
  billingLines: T[],
  receivable: MeasurementReceivableOverlay | undefined,
  entryCompetenceDate?: Date | null,
): T[] {
  if (!receivable || billingLines.length === 0) return billingLines;
  const insts = receivable.installments
    .filter((inst) => inst.status !== "CANCELADO")
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (insts.length === 0) return billingLines;
  const sortedLines = [...billingLines].sort((a, b) => a.installmentNumber - b.installmentNumber);
  return billingLines.map((line) => {
    const sortedIndex = sortedLines.indexOf(line);
    const inst =
      (sortedIndex >= 0 ? insts[sortedIndex] : undefined) ??
      insts.find((item) => item.installmentNumber === line.installmentNumber) ??
      (insts.length === 1 && billingLines.length === 1 ? insts[0] : undefined);
    if (!inst || receivableInstallmentIsInvoiced(inst)) return line;
    const next: T = { ...line, expectedPaymentDate: inst.dueDate };
    if (
      inst.competenceDate &&
      !isReferenteMonthStart(inst.competenceDate, entryCompetenceDate)
    ) {
      next.dueDate = inst.competenceDate;
    }
    return next;
  });
}

function measurementDatesFromReceivable(
  expectedPaymentDate: Date | undefined,
  billingDate: Date | undefined,
  entryCompetenceDate?: Date | null,
): { expectedPaymentDate?: Date; dueDate?: Date } | null {
  const copyBilling =
    Boolean(billingDate) && !isReferenteMonthStart(billingDate!, entryCompetenceDate);
  const data = {
    ...(expectedPaymentDate ? { expectedPaymentDate } : {}),
    ...(copyBilling ? { dueDate: billingDate! } : {}),
  };
  if (!data.expectedPaymentDate && !data.dueDate) return null;
  return data;
}

/** Espelha Data e prev. pagamento da CR na medição, enquanto a parcela não tiver NF. */
export async function persistMeasurementExpectedPaymentFromReceivable(
  tenantId: string,
  receivableId: string,
  installmentId: string | null,
  dates: { expectedPaymentDate?: Date | null; billingDate?: Date | null },
): Promise<void> {
  const expectedPaymentDate = dates.expectedPaymentDate ?? undefined;
  const billingDate = dates.billingDate ?? undefined;
  if (!expectedPaymentDate && !billingDate) return;

  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, tenantId },
    include: {
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable || receivable.status === "CANCELADO") return;

  const target = installmentId
    ? receivable.installments.find((inst) => inst.id === installmentId)
    : receivable.installments.find(
        (inst) => inst.status !== "RECEBIDO" && inst.status !== "CANCELADO",
      );
  if (!target || receivableInstallmentIsInvoiced(target)) return;

  const openInst = receivable.installments.filter((inst) => inst.status !== "CANCELADO");
  const instIndex = openInst.findIndex((inst) => inst.id === target.id);

  if (
    receivable.sourceType === RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT &&
    receivable.sourceId
  ) {
    const entry = await prisma.projectRevenueVariableEntry.findFirst({
      where: { id: receivable.sourceId },
      include: { billingLines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!entry) return;
    const line =
      (instIndex >= 0 ? entry.billingLines[instIndex] : undefined) ??
      entry.billingLines.find((item) => item.installmentNumber === target.installmentNumber) ??
      (entry.billingLines.length === 1 ? entry.billingLines[0] : undefined);
    if (!line) return;
    const lineData = measurementDatesFromReceivable(
      expectedPaymentDate,
      billingDate,
      entry.competenceDate,
    );
    if (!lineData) return;
    await prisma.projectRevenueBillingLine.update({
      where: { id: line.id },
      data: lineData,
    });
    return;
  }

  if (receivable.projectRevenueId || receivable.sourceType === RECEIVABLE_SOURCE_PROJECT_REVENUE) {
    const revenueId = receivable.projectRevenueId ?? receivable.sourceId;
    if (!revenueId) return;
    const lines = await prisma.projectRevenueBillingLine.findMany({
      where: { revenueId },
      orderBy: { sortOrder: "asc" },
      include: { variableEntry: { select: { competenceDate: true } } },
    });
    const line =
      (instIndex >= 0 ? lines[instIndex] : undefined) ??
      lines.find((item) => item.installmentNumber === target.installmentNumber) ??
      (lines.length === 1 ? lines[0] : undefined);
    if (!line) return;
    const lineData = measurementDatesFromReceivable(
      expectedPaymentDate,
      billingDate,
      line.variableEntry?.competenceDate,
    );
    if (!lineData) return;
    await prisma.projectRevenueBillingLine.update({
      where: { id: line.id },
      data: lineData,
    });
  }
}

function buildPlannedFromVariableEntry(entry: {
  competenceDate: Date;
  amount: number;
  billingLines: Array<{
    installmentNumber: number;
    dueDate: Date;
    expectedPaymentDate?: Date | null;
    amount: number;
  }>;
}): { ok: true; totalAmountCents: number; installments: PlannedInstallment[]; competenceDate: Date } | { ok: false; error: string } {
  const billingSum = entry.billingLines.reduce((acc, line) => acc + (line.amount || 0), 0);
  const amountReais = billingSum > 0 ? billingSum : entry.amount;
  if (entry.billingLines.length === 0 || amountReais <= 0) {
    return { ok: false, error: "Medição sem valor nas parcelas de faturamento." };
  }
  const installments: PlannedInstallment[] = [...entry.billingLines]
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((line, index) => ({
      // A CR da medição numera 1..n nesta entrada; o faturamento da receita usa número global.
      installmentNumber: index + 1,
      dueDate: line.expectedPaymentDate ?? line.dueDate,
      competenceDate: line.dueDate,
      amountCents: Math.round(line.amount * 100),
    }));
  const totalAmountCents = installments.reduce((sum, line) => sum + line.amountCents, 0);
  if (totalAmountCents <= 0) {
    return { ok: false, error: "Medição sem valor nas parcelas de faturamento." };
  }
  return {
    ok: true,
    totalAmountCents,
    installments,
    competenceDate: installments[0]?.competenceDate ?? entry.competenceDate,
  };
}

/**
 * Cria ou atualiza a conta a receber de uma medição (T&M/AMS).
 * Idempotente por sourceId = entry.id. Não usa projectRevenueId (único por receita).
 * `createIfMissing: false` só atualiza CR já gerada (salvar receita não duplica contas).
 */
export async function syncReceivableFromVariableEntry(
  tenantId: string,
  userId: string,
  revenueId: string,
  entryId: string,
  options?: { createIfMissing?: boolean },
): Promise<{ ok: true; receivableId: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const createIfMissing = options?.createIfMissing !== false;
  const revenue = await prisma.projectRevenue.findFirst({
    where: { id: revenueId, tenantId },
    include: {
      project: { select: { id: true, clientId: true, name: true } },
    },
  });
  if (!revenue) return { ok: false, error: "Receita não encontrada." };
  if (revenue.revenueType !== "VARIAVEL") {
    return { ok: false, error: "Só medições de receita variável geram conta a receber individual." };
  }
  if (revenue.status === "CANCELADO") {
    await disposeReceivableForVariableEntry(
      tenantId,
      userId,
      entryId,
      "Cancelada automaticamente: receita de projeto cancelada.",
    );
    return { ok: false, skipped: true };
  }

  const entry = await prisma.projectRevenueVariableEntry.findFirst({
    where: { id: entryId, revenueId },
    include: { billingLines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!entry) return { ok: false, error: "Medição não encontrada." };

  const planned = buildPlannedFromVariableEntry(entry);
  if (planned.ok === false) return { ok: false, error: planned.error };

  const fromMilestone = entry.billingLines
    .map((line) => String(line.milestone ?? "").trim())
    .find((value) => value.length > 0);
  const title = entry.title?.trim() || "";
  const contract = revenue.contractProposal?.trim() || "";
  const description =
    fromMilestone ||
    (title && title !== contract ? title : "") ||
    `Medição ${entry.competenceDate.toISOString().slice(0, 7)} — ${revenue.project.name}`;

  const existing = await prisma.receivable.findFirst({
    where: {
      tenantId,
      sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT,
      sourceId: entryId,
    },
    include: {
      installments: { orderBy: { installmentNumber: "asc" } },
      invoice: { select: { id: true } },
    },
  });

  if (existing?.status === "CANCELADO") {
    if (!createIfMissing) return { ok: false, skipped: true };
    await prisma.receivable.update({
      where: { id: existing.id },
      data: { sourceType: null, sourceId: null, projectRevenueId: null },
    });
  }

  const activeExisting = existing && existing.status !== "CANCELADO" ? existing : null;

  if (!activeExisting) {
    if (!createIfMissing) return { ok: false, skipped: true };
    const defaults = await resolveFinanceDefaults(tenantId);
    if (!defaults.account) return { ok: false, error: "Nenhuma conta de receita configurada." };
    if (!defaults.costCenter) return { ok: false, error: "Nenhum centro de custo configurado." };

    const created = await prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.create({
        data: {
          tenantId,
          clientId: revenue.project.clientId,
          projectId: revenue.projectId,
          financialAccountId: defaults.account!.id,
          description,
          totalAmountCents: planned.totalAmountCents,
          competenceDate: planned.competenceDate,
          kind: "PROJETO",
          status: "PREVISTO",
          paymentMethod: revenue.paymentMethod ?? null,
          contractTitle: contractTitleFromRevenue(revenue),
          sourceType: RECEIVABLE_SOURCE_PROJECT_REVENUE_MEASUREMENT,
          sourceId: entry.id,
          createdById: userId,
          installments: {
            create: planned.installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              competenceDate: inst.competenceDate,
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
              details: "Gerada a partir da medição da receita variável.",
            },
          },
        },
        select: { id: true },
      });
      await tx.projectRevenueVariableEntry.update({
        where: { id: entry.id },
        data: { receivableGeneratedAt: new Date() },
      });
      return receivable;
    });
    return { ok: true, receivableId: created.id };
  }

  await prisma.$transaction(async (tx) => {
    const existingSorted = [...activeExisting.installments].sort(
      (a, b) => a.installmentNumber - b.installmentNumber,
    );
    const usedIds = new Set<string>();

    for (let index = 0; index < planned.installments.length; index++) {
      const inst = planned.installments[index]!;
      const current =
        existingSorted.find(
          (row) => row.installmentNumber === inst.installmentNumber && !usedIds.has(row.id),
        ) ??
        existingSorted.find((row) => !usedIds.has(row.id)) ??
        null;
      if (!current) {
        await tx.receivableInstallment.create({
          data: {
            receivableId: activeExisting.id,
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            competenceDate: inst.competenceDate,
            amountCents: inst.amountCents,
            status: "PREVISTO",
          },
        });
        continue;
      }
      usedIds.add(current.id);
      if (
        current.status === "RECEBIDO" ||
        current.status === "CANCELADO" ||
        receivableInstallmentIsInvoiced(current)
      ) {
        continue;
      }
      await tx.receivableInstallment.update({
        where: { id: current.id },
        data: {
          dueDate: inst.dueDate,
          competenceDate: inst.competenceDate,
          amountCents: inst.amountCents,
          installmentNumber: inst.installmentNumber,
        },
      });
    }

    for (const current of activeExisting.installments) {
      if (usedIds.has(current.id)) continue;
      if (current.status === "RECEBIDO" || receivableInstallmentIsInvoiced(current)) continue;
      await tx.receivableInstallment.delete({ where: { id: current.id } });
    }

    const refreshed = await tx.receivableInstallment.findMany({
      where: { receivableId: activeExisting.id },
      select: { status: true, dueDate: true },
    });
    const nextStatus = deriveReceivableStatus(refreshed, activeExisting.status, !!activeExisting.invoice);

    await tx.receivable.update({
      where: { id: activeExisting.id },
      data: {
        description,
        totalAmountCents: planned.totalAmountCents,
        competenceDate: planned.competenceDate,
        clientId: revenue.project.clientId,
        projectId: revenue.projectId,
        paymentMethod: revenue.paymentMethod ?? null,
        contractTitle: contractTitleFromRevenue(revenue),
        status: nextStatus,
        updatedById: userId,
      },
    });

    await tx.receivableAllocation.deleteMany({ where: { receivableId: activeExisting.id } });
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
          receivableId: activeExisting.id,
          costCenterId: costCenter.id,
          projectId: revenue.projectId,
          percentBps: 10000,
          amountCents: planned.totalAmountCents,
        },
      });
    }

    await tx.receivableHistory.create({
      data: {
        receivableId: activeExisting.id,
        userId,
        action: "UPDATE",
        details: "Parcelas sincronizadas a partir da medição da receita variável.",
      },
    });

    if (!entry.receivableGeneratedAt) {
      await tx.projectRevenueVariableEntry.update({
        where: { id: entry.id },
        data: { receivableGeneratedAt: new Date() },
      });
    }
  });

  return { ok: true, receivableId: activeExisting.id };
}

/** @deprecated Prefer syncReceivableFromProjectRevenue — mantido para imports existentes. */
export async function createReceivableFromProjectRevenue(
  tenantId: string,
  userId: string,
  revenueId: string,
) {
  return syncReceivableFromProjectRevenue(tenantId, userId, revenueId);
}
