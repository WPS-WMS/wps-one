import { prisma } from "./prisma.js";
import { computePayableTotalCents } from "./payableHelpers.js";
import { expandReceivableListRows } from "./receivableService.js";
import { mapPayableListRow } from "./payableService.js";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

export async function createReceivableBillingGroup(params: {
  tenantId: string;
  userId: string;
  installmentIds: string[];
  description: string;
}): Promise<{ ok: true; groupId: string } | { ok: false; error: string }> {
  const description = params.description.trim();
  if (!description) return { ok: false, error: "Informe a atividade/descrição do grupo." };
  const ids = uniqueStrings(params.installmentIds);
  if (ids.length < 2) return { ok: false, error: "Selecione ao menos duas contas para agrupar." };

  const installments = await prisma.receivableInstallment.findMany({
    where: { id: { in: ids }, receivable: { tenantId: params.tenantId } },
    include: {
      receivable: { select: { id: true, clientId: true, projectId: true, status: true } },
    },
  });
  if (installments.length !== ids.length) {
    return { ok: false, error: "Uma ou mais contas não foram encontradas." };
  }
  if (installments.some((i) => i.billingGroupId)) {
    return { ok: false, error: "Há contas que já fazem parte de um grupo." };
  }
  if (installments.some((i) => i.status === "CANCELADO" || i.receivable.status === "CANCELADO")) {
    return { ok: false, error: "Não é possível agrupar contas canceladas." };
  }
  const clientIds = uniqueStrings(installments.map((i) => i.receivable.clientId));
  if (clientIds.length !== 1) {
    return { ok: false, error: "Só é possível agrupar contas do mesmo cliente." };
  }
  const projectKeys = [...new Set(installments.map((i) => i.receivable.projectId ?? ""))];
  if (projectKeys.length !== 1) {
    return { ok: false, error: "Só é possível agrupar contas do mesmo projeto." };
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.receivableBillingGroup.create({
      data: {
        tenantId: params.tenantId,
        description,
        clientId: clientIds[0]!,
        projectId: projectKeys[0] || null,
        createdById: params.userId,
      },
      select: { id: true },
    });
    await tx.receivableInstallment.updateMany({
      where: { id: { in: ids } },
      data: { billingGroupId: created.id },
    });
    return created;
  });
  return { ok: true, groupId: group.id };
}

export async function ungroupReceivableBillingGroup(params: {
  tenantId: string;
  groupId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const group = await prisma.receivableBillingGroup.findFirst({
    where: { id: params.groupId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!group) return { ok: false, error: "Grupo não encontrado." };
  await prisma.$transaction(async (tx) => {
    await tx.receivableInstallment.updateMany({
      where: { billingGroupId: group.id },
      data: { billingGroupId: null },
    });
    await tx.receivableBillingGroup.delete({ where: { id: group.id } });
  });
  return { ok: true };
}

export async function createPayableBillingGroup(params: {
  tenantId: string;
  userId: string;
  payableIds: string[];
  description: string;
}): Promise<{ ok: true; groupId: string } | { ok: false; error: string }> {
  const description = params.description.trim();
  if (!description) return { ok: false, error: "Informe a descrição do grupo." };
  const ids = uniqueStrings(params.payableIds);
  if (ids.length < 2) return { ok: false, error: "Selecione ao menos duas contas para agrupar." };

  const payables = await prisma.payable.findMany({
    where: { id: { in: ids }, tenantId: params.tenantId },
    include: { allocations: { select: { costCenterId: true } } },
  });
  if (payables.length !== ids.length) {
    return { ok: false, error: "Uma ou mais contas não foram encontradas." };
  }
  if (payables.some((p) => p.billingGroupId)) {
    return { ok: false, error: "Há contas que já fazem parte de um grupo." };
  }
  if (payables.some((p) => p.status === "CANCELADO")) {
    return { ok: false, error: "Não é possível agrupar contas canceladas." };
  }
  const accountIds = uniqueStrings(payables.map((p) => p.financialAccountId));
  if (accountIds.length !== 1) {
    return { ok: false, error: "Só é possível agrupar contas da mesma categoria financeira." };
  }
  const professionalIds = [...new Set(payables.map((p) => p.professionalUserId ?? ""))];
  const supplierIds = [...new Set(payables.map((p) => p.supplierId ?? ""))];
  if (professionalIds.length !== 1 || supplierIds.length !== 1) {
    return { ok: false, error: "Só é possível agrupar contas do mesmo profissional ou do mesmo fornecedor." };
  }
  if (!professionalIds[0] && !supplierIds[0]) {
    const names = uniqueStrings(payables.map((p) => p.payeeName));
    if (names.length !== 1) {
      return { ok: false, error: "Só é possível agrupar contas do mesmo profissional ou do mesmo fornecedor." };
    }
  }
  const costCenterKeys = payables.map((p) => {
    const ccs = uniqueStrings(p.allocations.map((a) => a.costCenterId));
    return ccs.length === 1 ? ccs[0]! : ccs.sort().join(",");
  });
  const uniqueCcs = [...new Set(costCenterKeys)];
  if (uniqueCcs.length !== 1 || !uniqueCcs[0] || uniqueCcs[0].includes(",")) {
    return { ok: false, error: "Só é possível agrupar contas do mesmo centro de custo." };
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.payableBillingGroup.create({
      data: {
        tenantId: params.tenantId,
        description,
        financialAccountId: accountIds[0]!,
        professionalUserId: professionalIds[0] || null,
        supplierId: supplierIds[0] || null,
        payeeName: payables[0]?.payeeName ?? null,
        costCenterId: uniqueCcs[0]!,
        createdById: params.userId,
      },
      select: { id: true },
    });
    await tx.payable.updateMany({
      where: { id: { in: ids } },
      data: { billingGroupId: created.id },
    });
    return created;
  });
  return { ok: true, groupId: group.id };
}

export async function ungroupPayableBillingGroup(params: {
  tenantId: string;
  groupId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const group = await prisma.payableBillingGroup.findFirst({
    where: { id: params.groupId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!group) return { ok: false, error: "Grupo não encontrado." };
  await prisma.$transaction(async (tx) => {
    await tx.payable.updateMany({
      where: { billingGroupId: group.id },
      data: { billingGroupId: null },
    });
    await tx.payableBillingGroup.delete({ where: { id: group.id } });
  });
  return { ok: true };
}

export async function listReceivableBillingGroupRows(params: {
  tenantId: string;
  receivableWhere: Record<string, unknown>;
  installmentWhere: Record<string, unknown>;
}) {
  const groups = await prisma.receivableBillingGroup.findMany({
    where: {
      tenantId: params.tenantId,
      installments: {
        some: {
          ...params.installmentWhere,
          receivable: params.receivableWhere,
        },
      },
    },
    include: {
      installments: {
        include: {
          receivable: {
            include: {
              client: {
                select: { id: true, name: true, financial: { select: { moedaContrato: true } } },
              },
              project: {
                select: {
                  id: true,
                  name: true,
                  contracts: { orderBy: { createdAt: "desc" }, take: 1, select: { title: true } },
                },
              },
              projectRevenue: {
                select: {
                  contractProposal: true,
                  paymentMethod: true,
                  billingLines: {
                    orderBy: { sortOrder: "asc" },
                    select: { installmentNumber: true, milestone: true },
                  },
                },
              },
              financialAccount: { select: { id: true, name: true, dreSubcategory: true } },
              invoice: { select: { nfNumber: true, emissionDate: true } },
              installments: { orderBy: { installmentNumber: "asc" } },
            },
          },
        },
        orderBy: { competenceDate: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return groups.flatMap((group) => {
    const members = group.installments.flatMap((inst) => {
      const rows = expandReceivableListRows(inst.receivable);
      return rows.filter((row) => row.installmentId === inst.id);
    });
    if (members.length === 0) return [];
    const first = members[0]!;
    const totalCents = members.reduce((sum, row) => sum + (row.totalAmountCents ?? 0), 0);
    const statuses = new Set(members.map((m) => m.status));
    const status = statuses.has("CANCELADO")
      ? "CANCELADO"
      : statuses.size === 1
        ? members[0]!.status
        : statuses.has("RECEBIDO")
          ? "RECEBIDO"
          : statuses.has("FATURADO")
            ? "FATURADO"
            : first.status;
    const paid = members.every((m) => m.paid);
    return [
      {
        ...first,
        id: first.id,
        listRowId: `group:${group.id}`,
        installmentId: first.installmentId,
        activityDescription: group.description,
        description: group.description,
        totalAmountCents: totalCents,
        totalAmountFormatted: (totalCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        status,
        paid,
        isGroup: true,
        groupId: group.id,
        groupMemberCount: members.length,
        groupMembers: members,
      },
    ];
  });
}

export async function listPayableBillingGroupRows(params: {
  tenantId: string;
  payableWhere: Record<string, unknown>;
  listInclude: object;
}) {
  const groups = await prisma.payableBillingGroup.findMany({
    where: {
      tenantId: params.tenantId,
      payables: { some: params.payableWhere },
    },
    include: {
      payables: {
        where: params.payableWhere,
        include: params.listInclude,
        orderBy: { competenceDate: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return groups.flatMap((group) => {
    const members = group.payables.map((payable) =>
      mapPayableListRow(payable as unknown as Parameters<typeof mapPayableListRow>[0]),
    );
    if (members.length === 0) return [];
    const first = members[0]!;
    const totalCents = group.payables.reduce((sum, p) => sum + computePayableTotalCents(p), 0);
    return [
      {
        ...first,
        id: first.id,
        description: group.description,
        computedTotalCents: totalCents,
        computedTotalFormatted: (totalCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        totalAmountCents: totalCents,
        totalAmountFormatted: (totalCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        isGroup: true,
        groupId: group.id,
        groupMemberCount: members.length,
        groupMembers: members,
      },
    ];
  });
}

function groupedDocumentText(
  groupDescription: string,
  userDescription: string | null | undefined,
  installments: Array<{ receivable: { description: string }; amountCents: number }>,
): string {
  const header = String(userDescription ?? "").trim() || groupDescription.trim();
  const lines = installments.map(
    (i) => `- ${i.receivable.description}: ${formatBrlFromCents(i.amountCents)}`,
  );
  return [header, ...lines].filter(Boolean).join("\n");
}

function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function emitReceivableBillingGroup(params: {
  tenantId: string;
  userId: string;
  groupId: string;
  codigoTributacaoNacionalIss?: string | null;
  descricaoServico?: string | null;
}): Promise<
  | {
      ok: true;
      documentType: string;
      nfNumber: string | null;
      emissionDate?: string;
      provider?: string;
      html?: string;
    }
  | { ok: false; error: string }
> {
  const { buildInternalInvoiceSnapshot, renderInternalInvoiceHtml } = await import("./internalInvoice.js");
  const { buildInternalDebitNoteSnapshot, renderInternalDebitNoteHtml } = await import("./internalDebitNote.js");
  const { allocateInternalInvoiceNumber, allocateInternalDebitNoteNumber } = await import(
    "./internalDocumentNumbering.js"
  );
  const { issueInvoice } = await import("./receivableService.js");
  const { resolveReceivableBillingDocument } = await import("./receivableBillingDocument.js");
  const { emitFocusNfseNacional } = await import("./focusNfeService.js");
  const { valorPorExtensoBRL } = await import("./valorPorExtenso.js");

  const group = await prisma.receivableBillingGroup.findFirst({
    where: { id: params.groupId, tenantId: params.tenantId },
    include: {
      installments: {
        include: {
          receivable: {
            include: {
              client: { include: { financial: true } },
              financialAccount: true,
            },
          },
        },
        orderBy: { competenceDate: "asc" },
      },
    },
  });
  if (!group || group.installments.length === 0) {
    return { ok: false, error: "Grupo não encontrado." };
  }
  if (group.installments.some((i) => i.nfNumber)) {
    return { ok: false, error: "Já existe nota emitida em uma das contas do grupo." };
  }

  const first = group.installments[0]!;
  const billing = resolveReceivableBillingDocument({
    dreSubcategory: first.receivable.financialAccount.dreSubcategory,
    accountName: first.receivable.financialAccount.name,
    moedaContrato: first.receivable.client.financial?.moedaContrato,
  });
  const totalCents = group.installments.reduce((sum, i) => sum + i.amountCents, 0);
  const lineText = groupedDocumentText(group.description, params.descricaoServico, group.installments);
  const today = new Date();
  const emissionDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (billing.type === "INVOICE") {
    const services: Array<{
      consultant: string;
      activity: string;
      hours: number | null;
      rate: number | null;
      amount: number;
    }> = [];
    let header: Awaited<ReturnType<typeof buildInternalInvoiceSnapshot>> | null = null;
    for (const inst of group.installments) {
      const built = await buildInternalInvoiceSnapshot({
        tenantId: params.tenantId,
        receivableId: inst.receivableId,
        installmentId: inst.id,
      });
      if (built.ok === false) return built;
      header = built;
      services.push(...built.snapshot.services);
    }
    if (!header || header.ok === false) return { ok: false, error: "Não foi possível montar a invoice." };
    const invoiceNumber = await allocateInternalInvoiceNumber(params.tenantId);
    const snapshot = {
      ...header.snapshot,
      invoiceNumber: invoiceNumber,
      services,
      notes: lineText,
    };
    for (const inst of group.installments) {
      const issued = await issueInvoice(
        params.tenantId,
        params.userId,
        inst.receivableId,
        {
          nfNumber: invoiceNumber,
          nfSeries: null,
          emissionDate,
          grossAmountCents: totalCents,
          netAmountCents: totalCents,
          taxAmountCents: 0,
          retentionAmountCents: 0,
        },
        { installmentId: inst.id },
      );
      if (issued.ok === false) return issued;
      await prisma.receivableInstallment.update({
        where: { id: inst.id },
        data: {
          billingDocumentType: "INVOICE",
          internalDocumentSnapshot: snapshot as object,
        },
      });
    }
    return {
      ok: true,
      documentType: "INVOICE",
      provider: "INTERNAL",
      nfNumber: invoiceNumber,
      emissionDate: emissionDate.toISOString().slice(0, 10),
      html: renderInternalInvoiceHtml(snapshot),
    };
  }

  if (billing.type === "NOTA_DEBITO") {
    const built = await buildInternalDebitNoteSnapshot({
      tenantId: params.tenantId,
      receivableId: first.receivableId,
      installmentId: first.id,
    });
    if (built.ok === false) return built;
    const debitNoteNumber = await allocateInternalDebitNoteNumber(
      params.tenantId,
      emissionDate.getUTCFullYear(),
    );
    const snapshot = {
      ...built.snapshot,
      debitNoteNumber: debitNoteNumber,
      referenteA: lineText,
      amount: totalCents / 100,
      amountFormatted: formatBrlFromCents(totalCents),
      amountInWords: valorPorExtensoBRL(totalCents / 100),
    };
    for (const inst of group.installments) {
      const issued = await issueInvoice(
        params.tenantId,
        params.userId,
        inst.receivableId,
        {
          nfNumber: debitNoteNumber,
          nfSeries: null,
          emissionDate,
          grossAmountCents: totalCents,
          netAmountCents: totalCents,
          taxAmountCents: 0,
          retentionAmountCents: 0,
        },
        { installmentId: inst.id },
      );
      if (issued.ok === false) return issued;
      await prisma.receivableInstallment.update({
        where: { id: inst.id },
        data: {
          billingDocumentType: "NOTA_DEBITO",
          internalDocumentSnapshot: snapshot as object,
        },
      });
    }
    return {
      ok: true,
      documentType: "NOTA_DEBITO",
      provider: "INTERNAL",
      nfNumber: debitNoteNumber,
      emissionDate: emissionDate.toISOString().slice(0, 10),
      html: renderInternalDebitNoteHtml(snapshot),
    };
  }

  if (billing.type === "NOTA_FISCAL") {
    const result = await emitFocusNfseNacional({
      tenantId: params.tenantId,
      userId: params.userId,
      receivableId: first.receivableId,
      installmentId: first.id,
      codigoTributacaoNacionalIss: params.codigoTributacaoNacionalIss,
      descricaoServico: params.descricaoServico?.trim() || lineText,
      valorServicoCents: totalCents,
    });
    if (result.ok === false) return result;
    const primary = await prisma.receivableInstallment.findFirst({ where: { id: first.id } });
    if (primary) {
      for (const inst of group.installments.filter((i) => i.id !== first.id)) {
        await prisma.receivableInstallment.update({
          where: { id: inst.id },
          data: {
            nfNumber: primary.nfNumber,
            nfEmissionDate: primary.nfEmissionDate,
            focusNfeRef: primary.focusNfeRef,
            focusNfeStatus: primary.focusNfeStatus,
            focusNfeUrl: primary.focusNfeUrl,
            focusNfeDanfseUrl: primary.focusNfeDanfseUrl,
            billingDocumentType: "NOTA_FISCAL",
            status: primary.status,
          },
        });
      }
    }
    return {
      ok: true,
      documentType: "NOTA_FISCAL",
      provider: "FOCUS_NFE",
      nfNumber: result.nfNumber,
    };
  }

  return { ok: false, error: "Este grupo não tem documento para emitir." };
}

export async function previewReceivableBillingGroup(params: {
  tenantId: string;
  groupId: string;
}): Promise<{ ok: true; preview: Record<string, unknown> } | { ok: false; error: string }> {
  const { buildEmitInvoicePreview } = await import("./focusNfeService.js");
  const { valorPorExtensoBRL } = await import("./valorPorExtenso.js");

  const group = await prisma.receivableBillingGroup.findFirst({
    where: { id: params.groupId, tenantId: params.tenantId },
    include: {
      installments: {
        include: {
          receivable: {
            include: {
              client: { include: { financial: true } },
              financialAccount: true,
            },
          },
        },
        orderBy: { competenceDate: "asc" },
      },
    },
  });
  if (!group || group.installments.length === 0) {
    return { ok: false, error: "Grupo não encontrado." };
  }

  const first = group.installments[0]!;
  const previewResult = await buildEmitInvoicePreview({
    tenantId: params.tenantId,
    receivableId: first.receivableId,
    installmentId: first.id,
  });
  if (previewResult.ok === false) return previewResult;

  const totalCents = group.installments.reduce((sum, i) => sum + i.amountCents, 0);
  const lineText = groupedDocumentText(group.description, null, group.installments);
  const amountFormatted = formatBrlFromCents(totalCents);
  const preview = previewResult.preview as Record<string, unknown>;
  const debitNotePreview =
    preview.debitNotePreview && typeof preview.debitNotePreview === "object"
      ? {
          ...(preview.debitNotePreview as Record<string, unknown>),
          referenteA: lineText,
          amountFormatted,
          amountInWords: valorPorExtensoBRL(totalCents / 100),
        }
      : undefined;
  const invoicePreview =
    preview.invoicePreview && typeof preview.invoicePreview === "object"
      ? {
          ...(preview.invoicePreview as Record<string, unknown>),
          notes: lineText,
        }
      : undefined;

  return {
    ok: true,
    preview: {
      ...preview,
      description: group.description,
      descricaoServico: group.description,
      amountCents: totalCents,
      amountFormatted,
      debitNotePreview,
      invoicePreview,
    },
  };
}
