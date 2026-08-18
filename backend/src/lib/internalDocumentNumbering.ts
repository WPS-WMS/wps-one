import { prisma } from "./prisma.js";

export type DocumentNumberingConfig = {
  invoicePrefix: string | null;
  invoiceNextNumber: number;
  invoicePadLength: number;
  debitNotePrefix: string | null;
  debitNoteNextNumber: number;
  debitNotePadLength: number;
  debitNoteIncludeYear: boolean;
  debitNoteYear: number | null;
};

const INVOICE_COUNTER_KEY = "internalInvoice";

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizePrefix(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .slice(0, 20);
  return v || null;
}

export function parseDocumentNumbering(body: Record<string, unknown>): DocumentNumberingConfig {
  return {
    invoicePrefix: normalizePrefix(body.invoicePrefix),
    invoiceNextNumber: clampInt(body.invoiceNextNumber, 1, 1, 99_999_999),
    invoicePadLength: clampInt(body.invoicePadLength, 8, 1, 8),
    debitNotePrefix: normalizePrefix(body.debitNotePrefix),
    debitNoteNextNumber: clampInt(body.debitNoteNextNumber, 1, 1, 99_999_999),
    debitNotePadLength: clampInt(body.debitNotePadLength, 8, 1, 8),
    debitNoteIncludeYear: body.debitNoteIncludeYear !== false,
    debitNoteYear: new Date().getUTCFullYear(),
  };
}

export function formatDocumentNumber(params: {
  prefix: string | null | undefined;
  sequence: number;
  padLength: number;
  year?: number;
  includeYear?: boolean;
  padWithZeros?: boolean;
}): string {
  const maxDigits = Math.max(1, params.padLength);
  const maxValue = 10 ** maxDigits - 1;
  const n = Math.min(maxValue, Math.max(1, params.sequence));
  const core =
    params.padWithZeros === false ? String(n) : String(n).padStart(maxDigits, "0");
  const withYear =
    params.includeYear && params.year != null ? `${core}/${params.year}` : core;
  const prefix = String(params.prefix ?? "").trim();
  return prefix ? `${prefix}${withYear}` : withYear;
}

function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

function debitNoteSequenceForYear(
  config: Partial<Pick<DocumentNumberingConfig, "debitNoteNextNumber" | "debitNoteYear">> | null | undefined,
  year: number,
): number {
  if (config?.debitNoteYear != null && config.debitNoteYear !== year) return 1;
  return Math.max(1, config?.debitNoteNextNumber || 1);
}

export function formatInvoiceNumberFromConfig(
  config: Partial<DocumentNumberingConfig> | null | undefined,
  sequence?: number,
): string {
  const n = sequence ?? Math.max(1, config?.invoiceNextNumber ?? 1);
  return formatDocumentNumber({
    prefix: config?.invoicePrefix,
    sequence: n,
    padLength: 8,
    padWithZeros: false,
  });
}

export function formatDebitNoteNumberFromConfig(
  config: Partial<DocumentNumberingConfig> | null | undefined,
  year: number,
  sequence?: number,
): string {
  const n = sequence ?? debitNoteSequenceForYear(config, year);
  return formatDocumentNumber({
    prefix: config?.debitNotePrefix,
    sequence: n,
    padLength: 8,
    year,
    includeYear: config?.debitNoteIncludeYear !== false,
    padWithZeros: false,
  });
}

export function publicDocumentNumbering(config: DocumentNumberingConfig) {
  const year = currentUtcYear();
  return {
    ...config,
    previewInvoice: formatInvoiceNumberFromConfig(config),
    previewDebitNote: formatDebitNoteNumberFromConfig(config, year),
  };
}

export async function resolveDocumentNumbering(
  tenantId: string,
): Promise<DocumentNumberingConfig> {
  const year = currentUtcYear();
  const profile = await prisma.tenantCompanyProfile.findUnique({
    where: { tenantId },
    select: {
      invoicePrefix: true,
      invoiceNextNumber: true,
      invoicePadLength: true,
      debitNotePrefix: true,
      debitNoteNextNumber: true,
      debitNotePadLength: true,
      debitNoteIncludeYear: true,
      debitNoteYear: true,
    },
  });

  if (profile) {
    return {
      invoicePrefix: profile.invoicePrefix,
      invoiceNextNumber: Math.max(1, profile.invoiceNextNumber),
      invoicePadLength: profile.invoicePadLength || 8,
      debitNotePrefix: profile.debitNotePrefix,
      debitNoteNextNumber: debitNoteSequenceForYear(profile, year),
      debitNotePadLength: profile.debitNotePadLength || 8,
      debitNoteIncludeYear: profile.debitNoteIncludeYear,
      debitNoteYear: profile.debitNoteYear,
    };
  }

  const [invoiceCounter, debitCounter] = await Promise.all([
    prisma.tenantCounter.findUnique({
      where: { tenantId_key: { tenantId, key: INVOICE_COUNTER_KEY } },
      select: { value: true },
    }),
    prisma.tenantCounter.findUnique({
      where: { tenantId_key: { tenantId, key: `internalDebitNote:${year}` } },
      select: { value: true },
    }),
  ]);

  return {
    invoicePrefix: null,
    invoiceNextNumber: invoiceCounter ? invoiceCounter.value + 1 : 1,
    invoicePadLength: 8,
    debitNotePrefix: null,
    debitNoteNextNumber: debitCounter ? debitCounter.value + 1 : 1,
    debitNotePadLength: 8,
    debitNoteIncludeYear: true,
    debitNoteYear: debitCounter ? year : null,
  };
}

export async function allocateInternalInvoiceNumber(tenantId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.tenantCompanyProfile.findUnique({ where: { tenantId } });
    let n = Math.max(1, profile?.invoiceNextNumber ?? 1);
    if (!profile) {
      const counter = await tx.tenantCounter.findUnique({
        where: { tenantId_key: { tenantId, key: INVOICE_COUNTER_KEY } },
        select: { value: true },
      });
      if (counter) n = counter.value + 1;
    }
    const formatted = formatInvoiceNumberFromConfig(profile, n);
    await tx.tenantCompanyProfile.upsert({
      where: { tenantId },
      create: { tenantId, invoiceNextNumber: n + 1 },
      update: { invoiceNextNumber: n + 1 },
    });
    return formatted;
  });
}

export async function allocateInternalDebitNoteNumber(
  tenantId: string,
  year: number,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.tenantCompanyProfile.findUnique({ where: { tenantId } });
    let n = debitNoteSequenceForYear(profile, year);
    if (!profile) {
      const counter = await tx.tenantCounter.findUnique({
        where: { tenantId_key: { tenantId, key: `internalDebitNote:${year}` } },
        select: { value: true },
      });
      if (counter) n = counter.value + 1;
    }
    const formatted = formatDebitNoteNumberFromConfig(profile, year, n);
    await tx.tenantCompanyProfile.upsert({
      where: { tenantId },
      create: {
        tenantId,
        debitNoteNextNumber: n + 1,
        debitNoteYear: year,
      },
      update: {
        debitNoteNextNumber: n + 1,
        debitNoteYear: year,
      },
    });
    return formatted;
  });
}
