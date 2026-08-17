import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { issueInvoice } from "./receivableService.js";
import { resolveReceivableBillingDocument } from "./receivableBillingDocument.js";
import { valorPorExtensoBRL } from "./valorPorExtenso.js";
import {
  allocateInternalDebitNoteNumber,
  formatDebitNoteNumberFromConfig,
} from "./internalDocumentNumbering.js";

export type InternalDebitNoteSnapshot = {
  kind: "NOTA_DEBITO";
  debitNoteNumber: string;
  emissionDate: string;
  issuerName: string;
  issuerDocument: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  recipientName: string;
  recipientDocument: string;
  recipientAddress: string;
  referenteA: string;
  amount: number;
  amountFormatted: string;
  amountInWords: string;
  bankName: string;
  agency: string;
  account: string;
  pixKey: string;
  paymentDeadline: string;
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function joinParts(parts: Array<string | null | undefined>, sep = ", "): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(sep);
}

function formatDateBr(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function formatCnpjCpf(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return String(raw ?? "").trim();
}

function formatPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return String(raw ?? "").trim();
}

function formatBRL(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function companyAddress(profile: {
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  pais: string | null;
}): string {
  const street = joinParts([profile.endereco, profile.numero, profile.complemento]);
  const city = joinParts([profile.bairro, profile.cidade, profile.estado], " - ");
  return joinParts([street, city, profile.cep, profile.pais]);
}

function clientAddress(client: {
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
}): string {
  const street = joinParts([client.endereco, client.numero, client.complemento]);
  const city = joinParts([client.bairro, client.cidade, client.estado], " - ");
  return joinParts([street, city, client.cep]);
}


export function isDebitNoteSnapshot(value: unknown): value is InternalDebitNoteSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.kind === "NOTA_DEBITO" || typeof row.referenteA === "string";
}

export async function buildInternalDebitNoteSnapshot(params: {
  tenantId: string;
  receivableId: string;
  installmentId?: string | null;
  debitNoteNumber?: string;
  emissionDate?: Date;
}): Promise<{ ok: true; snapshot: InternalDebitNoteSnapshot } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: {
      client: { include: { financial: true } },
      financialAccount: { select: { name: true, dreSubcategory: true } },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };

  const billing = resolveReceivableBillingDocument({
    dreSubcategory: receivable.financialAccount.dreSubcategory,
    accountName: receivable.financialAccount.name,
    moedaContrato: receivable.client.financial?.moedaContrato,
  });
  if (billing.type !== "NOTA_DEBITO") {
    return { ok: false, error: "Esta conta não emite nota de débito." };
  }

  const installmentId =
    params.installmentId?.trim() ||
    (receivable.installments.length === 1 ? receivable.installments[0]!.id : null);
  if (!installmentId) return { ok: false, error: "Selecione a parcela para emitir a nota de débito." };
  const installment = receivable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };

  const profile = await prisma.tenantCompanyProfile.findUnique({
    where: { tenantId: params.tenantId },
  });
  const issuerName = (profile?.razaoSocial || profile?.nomeFantasia || "").trim();
  if (!issuerName) {
    return {
      ok: false,
      error: "Cadastre a razão social da empresa em Configurações > Financeiro > Cadastro da empresa.",
    };
  }

  const emissionDate = params.emissionDate ?? new Date();
  const emissionUtc = new Date(
    Date.UTC(emissionDate.getUTCFullYear(), emissionDate.getUTCMonth(), emissionDate.getUTCDate()),
  );
  const amount = Math.round(installment.amountCents) / 100;
  const prazoDias = receivable.client.financial?.prazoMedioPagamentoDias;
  const paymentDeadline =
    prazoDias != null && prazoDias > 0
      ? `${prazoDias} dia${prazoDias === 1 ? "" : "s"} (até ${formatDateBr(installment.dueDate)})`
      : formatDateBr(installment.dueDate);

  const snapshot: InternalDebitNoteSnapshot = {
    kind: "NOTA_DEBITO",
    debitNoteNumber:
      params.debitNoteNumber ||
      formatDebitNoteNumberFromConfig(profile, emissionUtc.getUTCFullYear()),
    emissionDate: formatDateBr(emissionUtc),
    issuerName,
    issuerDocument: formatCnpjCpf(profile?.cnpj),
    issuerAddress: profile ? companyAddress(profile) : "",
    issuerPhone: formatPhone(profile?.telefone),
    issuerEmail: (profile?.email || "").trim(),
    recipientName:
      receivable.client.financial?.razaoSocial?.trim() || receivable.client.name.trim(),
    recipientDocument: formatCnpjCpf(receivable.client.cnpj),
    recipientAddress: clientAddress(receivable.client),
    referenteA: receivable.description.trim() || "Reembolso",
    amount,
    amountFormatted: formatBRL(amount),
    amountInWords: valorPorExtensoBRL(amount),
    bankName: (profile?.banco || "").trim(),
    agency: (profile?.agencia || "").trim(),
    account: (profile?.conta || "").trim(),
    pixKey: (profile?.pixKey || "").trim(),
    paymentDeadline,
  };

  return { ok: true, snapshot };
}

export function renderInternalDebitNoteHtml(snapshot: InternalDebitNoteSnapshot): string {
  const field = (label: string, value: string) =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "")}</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Nota de Débito ${escapeHtml(snapshot.debitNoteNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      color: #111;
      margin: 0;
      background: #fff;
    }
    .page { width: 210mm; min-height: 297mm; padding: 22mm 24mm; margin: 0 auto; }
    h1 {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin: 0 0 18px;
    }
    .date { margin: 0 0 10px; font-size: 14px; font-weight: 400; }
    hr { border: none; border-top: 1px solid #111; margin: 16px 0; }
    h2 { font-size: 15px; font-weight: 700; margin: 0 0 10px; }
    p { margin: 0 0 5px; font-size: 14px; line-height: 1.45; }
    .block { margin-top: 12px; }
    .block h2 { margin-bottom: 4px; }
    @media print {
      .no-print { display: none !important; }
      .page { padding: 12mm 16mm; width: auto; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;font-family:Arial,sans-serif;">
    <button type="button" onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">Imprimir / salvar PDF</button>
  </div>
  <section class="page">
    <h1>NOTA DE DÉBITO Nº ${escapeHtml(snapshot.debitNoteNumber)}</h1>
    <p class="date">Data de Emissão: ${escapeHtml(snapshot.emissionDate)}</p>
    <hr />

    <h2>Emitente:</h2>
    ${field("Nome/Razão Social", snapshot.issuerName)}
    ${field("CNPJ/CPF", snapshot.issuerDocument)}
    ${field("Endereço", snapshot.issuerAddress)}
    ${field("Telefone", snapshot.issuerPhone)}
    ${field("Email", snapshot.issuerEmail)}
    <hr />

    <h2>Destinatário:</h2>
    ${field("Nome/Razão Social", snapshot.recipientName)}
    ${field("CNPJ/CPF", snapshot.recipientDocument)}
    ${field("Endereço", snapshot.recipientAddress)}
    <hr />

    <h2>Referente a:</h2>
    <p>${escapeHtml(snapshot.referenteA)}</p>
    <div class="block">
      <h2>Valor:</h2>
      <p>${escapeHtml(snapshot.amountFormatted)}</p>
    </div>
    <div class="block">
      <h2>Valor por extenso:</h2>
      <p>${escapeHtml(snapshot.amountInWords)}</p>
    </div>
    <hr />

    <h2>Forma de Pagamento:</h2>
    <p>Transferência</p>
    ${field("Banco", snapshot.bankName)}
    ${field("Agência", snapshot.agency)}
    ${field("Conta", snapshot.account)}
    ${field("Pix", snapshot.pixKey)}
    ${field("Prazo para pagamento", snapshot.paymentDeadline)}
  </section>
</body>
</html>`;
}

export async function emitInternalDebitNote(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId?: string | null;
}): Promise<
  | { ok: true; nfNumber: string; emissionDate: string; html: string; snapshot: InternalDebitNoteSnapshot }
  | { ok: false; error: string }
> {
  const built = await buildInternalDebitNoteSnapshot({
    tenantId: params.tenantId,
    receivableId: params.receivableId,
    installmentId: params.installmentId,
  });
  if (built.ok === false) return built;

  const today = new Date();
  const emissionDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const debitNoteNumber = await allocateInternalDebitNoteNumber(
    params.tenantId,
    emissionDate.getUTCFullYear(),
  );
  const snapshot: InternalDebitNoteSnapshot = {
    ...built.snapshot,
    debitNoteNumber,
    emissionDate: `${String(emissionDate.getUTCDate()).padStart(2, "0")}/${String(emissionDate.getUTCMonth() + 1).padStart(2, "0")}/${emissionDate.getUTCFullYear()}`,
  };

  const issued = await issueInvoice(
    params.tenantId,
    params.userId,
    params.receivableId,
    {
      nfNumber: debitNoteNumber,
      nfSeries: null,
      emissionDate,
      grossAmountCents: Math.round(snapshot.amount * 100),
      netAmountCents: Math.round(snapshot.amount * 100),
      taxAmountCents: 0,
      retentionAmountCents: 0,
    },
    { installmentId: params.installmentId },
  );
  if (issued.ok === false) return issued;

  const installmentId =
    params.installmentId?.trim() ||
    (
      await prisma.receivable.findFirst({
        where: { id: params.receivableId },
        select: { installments: { select: { id: true }, take: 1, orderBy: { installmentNumber: "asc" } } },
      })
    )?.installments[0]?.id;
  if (installmentId) {
    await prisma.receivableInstallment.update({
      where: { id: installmentId },
      data: {
        billingDocumentType: "NOTA_DEBITO",
        internalDocumentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return {
    ok: true,
    nfNumber: debitNoteNumber,
    emissionDate: emissionDate.toISOString().slice(0, 10),
    html: renderInternalDebitNoteHtml(snapshot),
    snapshot,
  };
}

export async function loadInternalDebitNoteHtml(params: {
  tenantId: string;
  receivableId: string;
  installmentId?: string | null;
}): Promise<{ ok: true; html: string; snapshot: InternalDebitNoteSnapshot } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  const installment =
    (params.installmentId
      ? receivable.installments.find((i) => i.id === params.installmentId)
      : null) ??
    receivable.installments.find((i) => i.internalDocumentSnapshot) ??
    (receivable.installments.length === 1 ? receivable.installments[0] : null);
  if (!installment) return { ok: false, error: "Parcela da nota de débito não encontrada." };

  const stored = installment.internalDocumentSnapshot;
  if (isDebitNoteSnapshot(stored)) {
    return { ok: true, html: renderInternalDebitNoteHtml(stored), snapshot: stored };
  }

  const rebuilt = await buildInternalDebitNoteSnapshot({
    tenantId: params.tenantId,
    receivableId: params.receivableId,
    installmentId: installment.id,
    debitNoteNumber: installment.nfNumber ?? undefined,
    emissionDate: installment.nfEmissionDate ?? undefined,
  });
  if (rebuilt.ok === false) return rebuilt;
  return { ok: true, html: renderInternalDebitNoteHtml(rebuilt.snapshot), snapshot: rebuilt.snapshot };
}
