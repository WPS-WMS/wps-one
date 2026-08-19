import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { issueInvoice } from "./receivableService.js";
import { resolveReceivableBillingDocument } from "./receivableBillingDocument.js";
import {
  isDebitNoteSnapshot,
  renderInternalDebitNoteHtml,
  buildInternalDebitNoteSnapshot,
} from "./internalDebitNote.js";
import {
  allocateInternalInvoiceNumber,
  formatInvoiceNumberFromConfig,
} from "./internalDocumentNumbering.js";

export type InvoiceServiceLine = {
  consultant: string;
  activity: string;
  hours: number | null;
  rate: number | null;
  amount: number;
};

export type InvoiceExpenseLine = {
  description: string;
  amount: number;
};

export type InternalInvoiceSnapshot = {
  invoiceNumber: string;
  date: string;
  project: string;
  currency: string;
  issuerName: string;
  issuerAddress: string;
  billToName: string;
  billToAddress: string;
  customer: string;
  services: InvoiceServiceLine[];
  expenses: InvoiceExpenseLine[];
  notes: string;
  beneficiaryName: string;
  accountName: string;
  iban: string;
  bankName: string;
  bankSwift: string;
  bankAddress: string;
  intermediaryName: string;
  intermediarySwift: string;
  intermediaryCurrency: string;
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function formatDateBr(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function formatMonthYear(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${m}.${date.getUTCFullYear()}`;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHours(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "";
  return hours.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}


function companyAddress(profile: {
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
}): string {
  const street = joinParts([profile.endereco, profile.numero, profile.complemento]);
  return joinParts([street, profile.bairro, profile.cidade, profile.estado, profile.pais || "Brazil"]);
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
  return joinParts([street, client.bairro, client.cidade, client.estado, client.cep]);
}

export async function buildInternalInvoiceSnapshot(params: {
  tenantId: string;
  receivableId: string;
  installmentId?: string | null;
  invoiceNumber?: string;
  emissionDate?: Date;
}): Promise<{ ok: true; snapshot: InternalInvoiceSnapshot } | { ok: false; error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: {
      client: {
        include: {
          financial: true,
          contacts: { orderBy: { createdAt: "asc" }, take: 1, select: { name: true } },
        },
      },
      project: { select: { id: true, name: true } },
      financialAccount: { select: { name: true, dreSubcategory: true } },
      projectRevenue: {
        include: {
          billingType: { select: { name: true } },
          costLines: { orderBy: { sortOrder: "asc" } },
          billingLines: {
            orderBy: { sortOrder: "asc" },
            include: { variableEntry: true },
          },
        },
      },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };

  const billing = resolveReceivableBillingDocument({
    dreSubcategory: receivable.financialAccount.dreSubcategory,
    accountName: receivable.financialAccount.name,
    moedaContrato: receivable.client.financial?.moedaContrato,
  });
  if (billing.type !== "INVOICE") {
    return { ok: false, error: "Esta conta não emite invoice." };
  }

  const installmentId =
    params.installmentId?.trim() ||
    (receivable.installments.length === 1 ? receivable.installments[0]!.id : null);
  if (!installmentId) return { ok: false, error: "Selecione a parcela para emitir a invoice." };
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
  const competence = installment.competenceDate ?? receivable.competenceDate ?? installment.dueDate;
  const activityFallback =
    receivable.projectRevenue?.billingType?.name?.trim() ||
    receivable.projectRevenue?.title?.trim() ||
    receivable.project?.name?.trim() ||
    "Professional services";

  const services = resolveServiceLines({
    installmentAmount: centsToAmount(installment.amountCents),
    installmentNumber: installment.installmentNumber,
    description: receivable.description,
    activityFallback,
    revenue: receivable.projectRevenue,
  });

  const snapshot: InternalInvoiceSnapshot = {
    invoiceNumber: params.invoiceNumber || formatInvoiceNumberFromConfig(profile),
    date: formatDateBr(emissionUtc),
    project: receivable.project?.name?.trim() || receivable.contractTitle?.trim() || "",
    currency: billing.moedaContrato,
    issuerName,
    issuerAddress: profile ? companyAddress(profile) : "",
    billToName:
      receivable.client.financial?.razaoSocial?.trim() || receivable.client.name.trim(),
    billToAddress: clientAddress(receivable.client),
    customer: receivable.client.contacts[0]?.name?.trim() || receivable.client.name.trim(),
    services,
    expenses: [],
    notes: `Services provided during the month of ${formatMonthYear(competence)}`,
    beneficiaryName: (profile?.invoiceTitularConta || issuerName).trim(),
    accountName: (profile?.invoiceTitularConta || issuerName).trim(),
    iban: (profile?.iban || "").trim(),
    bankName: (profile?.invoiceBanco || "").trim(),
    bankSwift: (profile?.bancoSwift || "").trim(),
    bankAddress: (profile?.bancoEndereco || "").trim(),
    intermediaryName: (profile?.intermediarioBanco || "").trim(),
    intermediarySwift: (profile?.intermediarioSwift || "").trim(),
    intermediaryCurrency: (profile?.intermediarioMoeda || billing.moedaContrato).trim(),
  };

  return { ok: true, snapshot };
}

function resolveServiceLines(params: {
  installmentAmount: number;
  installmentNumber: number;
  description: string;
  activityFallback: string;
  revenue: {
    title: string | null;
    costLines: Array<{ skill: string; hourlyRate: number; hours: number; isDiscount: boolean }>;
    billingLines: Array<{
      installmentNumber: number;
      amount: number;
      milestone: string | null;
      variableEntry: {
        description: string | null;
        hours: number | null;
        hourlyRate: number | null;
        amount: number;
      } | null;
    }>;
  } | null;
}): InvoiceServiceLine[] {
  const fallback: InvoiceServiceLine[] = [
    {
      consultant: params.description.trim() || params.activityFallback,
      activity: params.activityFallback,
      hours: null,
      rate: null,
      amount: params.installmentAmount,
    },
  ];
  if (!params.revenue) return fallback;

  const billingLine = params.revenue.billingLines.find(
    (line) => line.installmentNumber === params.installmentNumber,
  );
  const variable = billingLine?.variableEntry;
  if (variable) {
    const consultant =
      variable.description?.trim() || params.description.trim() || params.activityFallback;
    const milestone = billingLine?.milestone?.trim() || "";
    const activity =
      milestone &&
      milestone.toLowerCase() !== consultant.toLowerCase() &&
      !/^medi[cç][aã]o\s/i.test(milestone)
        ? milestone
        : params.activityFallback;
    const amount = variable.amount || params.installmentAmount;
    const rate = variable.hourlyRate;
    const hours =
      variable.hours != null && variable.hours > 0
        ? variable.hours
        : rate != null && rate > 0 && amount > 0
          ? Math.round((amount / rate) * 100) / 100
          : variable.hours;
    return [
      {
        consultant,
        activity,
        hours,
        rate,
        amount,
      },
    ];
  }

  const costLines = params.revenue.costLines.filter((line) => !line.isDiscount);
  const hasDiscount = params.revenue.costLines.some((line) => line.isDiscount);
  if (costLines.length === 0 || hasDiscount) return fallback;

  const costTotal = costLines.reduce((acc, line) => acc + line.hourlyRate * line.hours, 0);
  const matchesInstallment = Math.abs(costTotal - params.installmentAmount) < 0.05;
  if (!matchesInstallment) return fallback;

  return costLines.map((line) => ({
    consultant: line.skill.trim() || params.activityFallback,
    activity: params.activityFallback,
    hours: line.hours,
    rate: line.hourlyRate,
    amount: Math.round(line.hourlyRate * line.hours * 100) / 100,
  }));
}

export function renderInternalInvoiceHtml(snapshot: InternalInvoiceSnapshot): string {
  const hoursTotal = snapshot.services.reduce((acc, line) => acc + (line.hours ?? 0), 0);
  const servicesTotal = snapshot.services.reduce((acc, line) => acc + line.amount, 0);
  const expensesTotal = snapshot.expenses.reduce((acc, line) => acc + line.amount, 0);
  const grandTotal = servicesTotal + expensesTotal;
  const serviceRows =
    snapshot.services.length > 0
      ? snapshot.services
          .map(
            (line) => `<tr>
          <td>${escapeHtml(line.consultant)}</td>
          <td>${escapeHtml(line.activity)}</td>
          <td class="num">${escapeHtml(formatHours(line.hours))}</td>
          <td class="num">${line.rate == null ? "" : escapeHtml(formatMoney(line.rate))}</td>
          <td class="num">${escapeHtml(formatMoney(line.amount))}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">—</td></tr>`;
  const expenseRows =
    snapshot.expenses.length > 0
      ? snapshot.expenses
          .map(
            (line) => `<tr>
          <td>${escapeHtml(line.description)}</td>
          <td class="num">${escapeHtml(formatMoney(line.amount))}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td class="muted">—</td><td class="num">—</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(snapshot.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 18mm 16mm; margin: 0 auto; }
    h1 { text-align: center; letter-spacing: 0.35em; font-size: 22px; font-weight: 800; margin: 0 0 18px; }
    .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .issuer { font-size: 13px; line-height: 1.35; max-width: 58%; }
    .issuer strong { font-size: 14px; }
    .meta { border: 1px solid #222; padding: 8px 12px; min-width: 210px; font-size: 12px; }
    .meta p { margin: 0 0 4px; }
    .section { margin-top: 22px; }
    .label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 6px; }
    .billto { font-size: 13px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; }
    th { text-align: left; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #777; }
    .totals { width: 280px; margin-left: auto; }
    .notes { font-size: 12px; line-height: 1.45; }
    .bank { font-size: 12px; line-height: 1.5; }
    .page-break { page-break-before: always; }
    @media print {
      body { background: #fff; }
      .page { padding: 12mm; width: auto; min-height: auto; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;">
    <button type="button" onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">Imprimir / salvar PDF</button>
  </div>
  <section class="page">
    <h1>INVOICE</h1>
    <div class="top">
      <div class="issuer">
        <strong>${escapeHtml(snapshot.issuerName)}</strong><br />
        ${escapeHtml(snapshot.issuerAddress)}
      </div>
      <div class="meta">
        <p><strong>Invoice Number:</strong> ${escapeHtml(snapshot.invoiceNumber)}</p>
        <p><strong>Date:</strong> ${escapeHtml(snapshot.date)}</p>
        <p><strong>Project:</strong> ${escapeHtml(snapshot.project)}</p>
      </div>
    </div>

    <div class="section">
      <div class="label">BILL TO:</div>
      <div class="billto">
        <strong>${escapeHtml(snapshot.billToName)}</strong><br />
        ${escapeHtml(snapshot.billToAddress)}<br />
        Customer: ${escapeHtml(snapshot.customer)}
      </div>
    </div>

    <div class="section">
      <div class="label">SERVICES</div>
      <table>
        <thead>
          <tr>
            <th>Consultant Description</th>
            <th>Activity</th>
            <th class="num">Hours</th>
            <th class="num">Rate</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="label">EXPENSES</div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${expenseRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="label">TOTALS</div>
      <table class="totals">
        <tr><th>Hours</th><td class="num">${escapeHtml(formatHours(hoursTotal || null))}</td></tr>
        <tr><th>Expenses</th><td class="num">${escapeHtml(formatMoney(expensesTotal))}</td></tr>
        <tr><th>Total (${escapeHtml(snapshot.currency)})</th><td class="num">${escapeHtml(formatMoney(grandTotal))}</td></tr>
      </table>
    </div>

    <div class="section notes">
      <div class="label">NOTES</div>
      <p style="white-space:pre-wrap">${escapeHtml(snapshot.notes)}</p>
      <div class="bank">
        <p><strong>Beneficiary Account Name:</strong> ${escapeHtml(snapshot.accountName)}</p>
        <p><strong>Account Number / IBAN:</strong> ${escapeHtml(snapshot.iban)}</p>
      </div>
    </div>
  </section>

  <section class="page page-break">
    <div class="section bank">
      <p><strong>Beneficiary Bank</strong></p>
      <p>Bank Name: ${escapeHtml(snapshot.bankName)}</p>
      <p>SWIFT/BIC: ${escapeHtml(snapshot.bankSwift)}</p>
      <p>Bank Address: ${escapeHtml(snapshot.bankAddress)}</p>
    </div>
    <div class="section bank">
      <p><strong>Intermediary Bank</strong></p>
      <p>Bank Name: ${escapeHtml(snapshot.intermediaryName)}</p>
      <p>SWIFT/BIC: ${escapeHtml(snapshot.intermediarySwift)}</p>
      <p>Currency: ${escapeHtml(snapshot.intermediaryCurrency)}</p>
    </div>
  </section>
</body>
</html>`;
}

export async function emitInternalInvoice(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId?: string | null;
  descricaoServico?: string | null;
}): Promise<
  | { ok: true; nfNumber: string; emissionDate: string; html: string; snapshot: InternalInvoiceSnapshot }
  | { ok: false; error: string }
> {
  const built = await buildInternalInvoiceSnapshot({
    tenantId: params.tenantId,
    receivableId: params.receivableId,
    installmentId: params.installmentId,
  });
  if (built.ok === false) return built;

  const invoiceNumber = await allocateInternalInvoiceNumber(params.tenantId);
  const today = new Date();
  const emissionDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const snapshot: InternalInvoiceSnapshot = {
    ...built.snapshot,
    invoiceNumber,
    date: formatDateBr(emissionDate),
    notes: String(params.descricaoServico ?? "").trim() || built.snapshot.notes,
  };

  const amountCents = Math.round(
    (snapshot.services.reduce((acc, line) => acc + line.amount, 0) +
      snapshot.expenses.reduce((acc, line) => acc + line.amount, 0)) *
      100,
  );

  const issued = await issueInvoice(
    params.tenantId,
    params.userId,
    params.receivableId,
    {
      nfNumber: invoiceNumber,
      nfSeries: null,
      emissionDate,
      grossAmountCents: amountCents,
      netAmountCents: amountCents,
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
        billingDocumentType: "INVOICE",
        internalDocumentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return {
    ok: true,
    nfNumber: invoiceNumber,
    emissionDate: emissionDate.toISOString().slice(0, 10),
    html: renderInternalInvoiceHtml(snapshot),
    snapshot,
  };
}

export async function loadInternalInvoiceHtml(params: {
  tenantId: string;
  receivableId: string;
  installmentId?: string | null;
}): Promise<{ ok: true; html: string; snapshot: unknown } | { ok: false; error: string }> {
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
  if (!installment) return { ok: false, error: "Parcela do documento não encontrada." };

  const stored = installment.internalDocumentSnapshot;
  if (isDebitNoteSnapshot(stored) || installment.billingDocumentType === "NOTA_DEBITO") {
    if (isDebitNoteSnapshot(stored)) {
      return { ok: true, html: renderInternalDebitNoteHtml(stored), snapshot: stored };
    }
    const rebuiltNd = await buildInternalDebitNoteSnapshot({
      tenantId: params.tenantId,
      receivableId: params.receivableId,
      installmentId: installment.id,
      debitNoteNumber: installment.nfNumber ?? undefined,
      emissionDate: installment.nfEmissionDate ?? undefined,
    });
    if (rebuiltNd.ok === false) return rebuiltNd;
    return { ok: true, html: renderInternalDebitNoteHtml(rebuiltNd.snapshot), snapshot: rebuiltNd.snapshot };
  }

  if (stored && typeof stored === "object") {
    const snapshot = stored as InternalInvoiceSnapshot;
    return { ok: true, html: renderInternalInvoiceHtml(snapshot), snapshot };
  }

  const rebuilt = await buildInternalInvoiceSnapshot({
    tenantId: params.tenantId,
    receivableId: params.receivableId,
    installmentId: installment.id,
    invoiceNumber: installment.nfNumber ?? undefined,
    emissionDate: installment.nfEmissionDate ?? undefined,
  });
  if (rebuilt.ok === false) return rebuilt;
  return { ok: true, html: renderInternalInvoiceHtml(rebuilt.snapshot), snapshot: rebuilt.snapshot };
}
