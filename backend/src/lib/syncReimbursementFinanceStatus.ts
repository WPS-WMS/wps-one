import { prisma } from "./prisma.js";

/**
 * Atualiza o status do reembolso para PAID ou APPROVED conforme liquidação no financeiro.
 *
 * - EMPRESA: PAID quando a conta a receber estiver RECEBIDO
 * - CONSULTOR: PAID quando a conta a pagar estiver PAGO
 * - Caso contrário permanece APPROVED (se já aprovado)
 */
export async function syncReimbursementPaidFromFinance(params: {
  tenantId: string;
  reimbursementId?: string | null;
  payableId?: string | null;
  receivableId?: string | null;
}): Promise<void> {
  let reimbursementId = params.reimbursementId ?? null;

  if (!reimbursementId && params.payableId) {
    const payable = await prisma.payable.findFirst({
      where: { id: params.payableId, tenantId: params.tenantId },
      select: { reimbursementId: true, sourceType: true, sourceId: true },
    });
    reimbursementId =
      payable?.reimbursementId ??
      (payable?.sourceType === "REIMBURSEMENT" ? payable.sourceId : null);
  }

  if (!reimbursementId && params.receivableId) {
    const receivable = await prisma.receivable.findFirst({
      where: { id: params.receivableId, tenantId: params.tenantId },
      select: { sourceType: true, sourceId: true },
    });
    if (receivable?.sourceType === "REIMBURSEMENT") {
      reimbursementId = receivable.sourceId;
    }
  }

  if (!reimbursementId) return;

  const reimbursement = await prisma.reimbursement.findFirst({
    where: { id: reimbursementId, tenantId: params.tenantId },
    select: { id: true, status: true, paymentTo: true },
  });
  if (!reimbursement) return;
  if (reimbursement.status === "IN_PROGRESS" || reimbursement.status === "REJECTED") return;

  const paymentTo = String(reimbursement.paymentTo ?? "").toUpperCase();

  const [payable, receivable] = await Promise.all([
    prisma.payable.findFirst({
      where: { reimbursementId: reimbursement.id, tenantId: params.tenantId },
      select: { status: true },
    }),
    prisma.receivable.findFirst({
      where: {
        tenantId: params.tenantId,
        sourceType: "REIMBURSEMENT",
        sourceId: reimbursement.id,
      },
      select: { status: true },
    }),
  ]);

  const receivableReceived = receivable?.status === "RECEBIDO";
  const payablePaid = payable?.status === "PAGO";

  let shouldBePaid = false;
  if (paymentTo === "EMPRESA") {
    shouldBePaid = receivableReceived;
  } else if (paymentTo === "CONSULTOR") {
    shouldBePaid = payablePaid;
  } else {
    shouldBePaid = payablePaid || receivableReceived;
  }

  if (shouldBePaid && reimbursement.status !== "PAID") {
    await prisma.reimbursement.update({
      where: { id: reimbursement.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    return;
  }

  if (!shouldBePaid && reimbursement.status === "PAID") {
    await prisma.reimbursement.update({
      where: { id: reimbursement.id },
      data: { status: "APPROVED", paidAt: null },
    });
  }
}

/**
 * Corrige reembolsos legados marcados como PAID na aprovação (antes do fluxo APPROVED).
 * Só rebaixa para APPROVED se ainda não houver liquidação no financeiro.
 */
export async function normalizeLegacyPaidReimbursements(tenantId: string): Promise<number> {
  const rows = await prisma.reimbursement.findMany({
    where: { tenantId, status: "PAID" },
    select: { id: true },
    take: 200,
  });
  let fixed = 0;
  for (const row of rows) {
    const before = await prisma.reimbursement.findFirst({
      where: { id: row.id },
      select: { status: true },
    });
    await syncReimbursementPaidFromFinance({ tenantId, reimbursementId: row.id });
    const after = await prisma.reimbursement.findFirst({
      where: { id: row.id },
      select: { status: true },
    });
    if (before?.status === "PAID" && after?.status === "APPROVED") fixed += 1;
  }
  return fixed;
}
