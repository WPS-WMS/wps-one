import {
  classifyReceivableByAccountSubcategory,
  isReembolsoReceivableAccountName,
} from "./receivableRevenueClassification.js";

/** Documento a emitir a partir do CR. Invoice e ND são internos (não usam Focus). */
export type BillingDocumentType = "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE";

export type BillingDocumentProvider = "FOCUS_NFE" | "PROVISORIA" | "INTERNAL" | "NONE";

const DOCUMENT_LABEL: Record<BillingDocumentType, string> = {
  NOTA_FISCAL: "Nota fiscal",
  NOTA_DEBITO: "Nota de débito",
  INVOICE: "Invoice",
};

const EMIT_ACTION_LABEL: Record<BillingDocumentType, string> = {
  NOTA_FISCAL: "Emitir nota fiscal",
  NOTA_DEBITO: "Emitir nota de débito",
  INVOICE: "Emitir invoice",
};

export type ResolvedBillingDocument = {
  type: BillingDocumentType | null;
  label: string;
  emitActionLabel: string;
  moedaContrato: string;
  /** Só nota fiscal em BRL segue o fluxo Focus / NF provisória. */
  viaFocus: boolean;
  /** Invoice e nota de débito internas já podem ser emitidas. */
  canEmitNow: boolean;
  blockedReason: string | null;
};

export function normalizeContractCurrency(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toUpperCase();
  return value || "BRL";
}

/**
 * Regra de negócio:
 * - Nota fiscal: conta FATURAMENTO e moeda do cliente = BRL
 * - Invoice: conta FATURAMENTO e moeda do cliente ≠ BRL (cadastro financeiro do cliente)
 * - Nota de débito: conta OUTRAS_RECEITAS e conta Reembolso
 */
export function resolveReceivableBillingDocument(params: {
  dreSubcategory: string | null | undefined;
  accountName: string | null | undefined;
  moedaContrato: string | null | undefined;
}): ResolvedBillingDocument {
  const moedaContrato = normalizeContractCurrency(params.moedaContrato);
  const dreClass = classifyReceivableByAccountSubcategory(params.dreSubcategory);
  const isReembolso = isReembolsoReceivableAccountName(params.accountName);

  if (dreClass === "FATURAMENTO") {
    if (moedaContrato !== "BRL") {
      return {
        type: "INVOICE",
        label: DOCUMENT_LABEL.INVOICE,
        emitActionLabel: EMIT_ACTION_LABEL.INVOICE,
        moedaContrato,
        viaFocus: false,
        canEmitNow: true,
        blockedReason: null,
      };
    }
    return {
      type: "NOTA_FISCAL",
      label: DOCUMENT_LABEL.NOTA_FISCAL,
      emitActionLabel: EMIT_ACTION_LABEL.NOTA_FISCAL,
      moedaContrato,
      viaFocus: true,
      canEmitNow: true,
      blockedReason: null,
    };
  }

  if (dreClass === "OUTRAS_RECEITAS" && isReembolso) {
    return {
      type: "NOTA_DEBITO",
      label: DOCUMENT_LABEL.NOTA_DEBITO,
      emitActionLabel: EMIT_ACTION_LABEL.NOTA_DEBITO,
      moedaContrato,
      viaFocus: false,
      canEmitNow: true,
      blockedReason: null,
    };
  }

  return {
    type: null,
    label: "Sem documento",
    emitActionLabel: "Sem documento para emitir",
    moedaContrato,
    viaFocus: false,
    canEmitNow: false,
    blockedReason:
      dreClass === "OUTRAS_RECEITAS"
        ? "Contas de Outras receitas que não são Reembolso não emitem nota fiscal, invoice nem nota de débito."
        : "Defina a subcategoria da conta (Faturamento ou Outras receitas) no plano de contas para emitir o documento.",
  };
}

/** Filtro Prisma da lista de CR pelo tipo de documento (mesma regra de emissão). */
export function prismaWhereForBillingDocumentType(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  const type = String(raw ?? "").trim().toUpperCase();
  if (type === "NOTA_FISCAL") {
    return {
      financialAccount: { dreSubcategory: "FATURAMENTO" },
      client: {
        OR: [
          { financial: null },
          {
            financial: {
              OR: [
                { moedaContrato: null },
                { moedaContrato: "" },
                { moedaContrato: { equals: "BRL", mode: "insensitive" } },
              ],
            },
          },
        ],
      },
    };
  }
  if (type === "INVOICE") {
    return {
      financialAccount: { dreSubcategory: "FATURAMENTO" },
      client: {
        financial: {
          AND: [
            { moedaContrato: { not: null } },
            { NOT: { moedaContrato: "" } },
            { NOT: { moedaContrato: { equals: "BRL", mode: "insensitive" } } },
          ],
        },
      },
    };
  }
  if (type === "NOTA_DEBITO") {
    return {
      financialAccount: {
        dreSubcategory: "OUTRAS_RECEITAS",
        name: { contains: "reembolso", mode: "insensitive" },
      },
    };
  }
  return null;
}
