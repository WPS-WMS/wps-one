import type { ProjectContract } from "@prisma/client";

export type ProjectContractWriteBody = {
  title?: string;
  contractTypeId?: string | null;
  vigencyStart?: Date | null;
  vigencyEnd?: Date | null;
  slaDays?: number | null;
  readjustmentMonths?: number | null;
};

export function parseOptionalDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function normalizeOptionalInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseProjectContractWriteBody(body: unknown): {
  ok: true;
  data: ProjectContractWriteBody;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ProjectContractWriteBody = {};

  if (b.title !== undefined) {
    const title = String(b.title ?? "").trim();
    if (!title) return { ok: false, error: "Título do contrato é obrigatório." };
    data.title = title;
  }
  if (b.contractTypeId !== undefined) {
    const id = String(b.contractTypeId ?? "").trim();
    data.contractTypeId = id.length > 0 ? id : null;
  }
  if (b.vigencyStart !== undefined) {
    data.vigencyStart = b.vigencyStart ? parseOptionalDate(b.vigencyStart) : null;
    if (b.vigencyStart && !data.vigencyStart) {
      return { ok: false, error: "Data de início da vigência inválida." };
    }
  }
  if (b.vigencyEnd !== undefined) {
    data.vigencyEnd = b.vigencyEnd ? parseOptionalDate(b.vigencyEnd) : null;
    if (b.vigencyEnd && !data.vigencyEnd) {
      return { ok: false, error: "Data de fim da vigência inválida." };
    }
  }
  if (b.slaDays !== undefined) {
    data.slaDays = normalizeOptionalInt(b.slaDays);
    if (b.slaDays != null && b.slaDays !== "" && data.slaDays == null) {
      return { ok: false, error: "SLA (dias) inválido." };
    }
  }
  if (b.readjustmentMonths !== undefined) {
    data.readjustmentMonths = normalizeOptionalInt(b.readjustmentMonths);
    if (b.readjustmentMonths != null && b.readjustmentMonths !== "" && data.readjustmentMonths == null) {
      return { ok: false, error: "Reajuste (meses) inválido." };
    }
  }

  return { ok: true, data };
}

export const CONTRACT_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  contractTypeId: "Tipo de contrato",
  vigencyStart: "Início da vigência",
  vigencyEnd: "Fim da vigência",
  slaDays: "SLA (dias)",
  readjustmentMonths: "Reajuste (meses)",
};

function formatContractFieldValue(
  field: string,
  value: unknown,
  contractTypeNames: Map<string, string>,
): string {
  if (value == null || value === "") return "—";
  if (field === "contractTypeId") {
    return contractTypeNames.get(String(value)) ?? String(value);
  }
  if (field === "vigencyStart" || field === "vigencyEnd") {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  return String(value);
}

export function buildContractHistoryEntries(
  before: ProjectContract,
  after: Partial<ProjectContract>,
  contractTypeNames: Map<string, string>,
): Array<{ field: string; oldValue: string; newValue: string }> {
  const fields = ["title", "contractTypeId", "vigencyStart", "vigencyEnd", "slaDays", "readjustmentMonths"] as const;
  const entries: Array<{ field: string; oldValue: string; newValue: string }> = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const oldRaw = before[field as keyof ProjectContract];
    const newRaw = after[field as keyof ProjectContract];
    const oldStr = formatContractFieldValue(field, oldRaw, contractTypeNames);
    const newStr = formatContractFieldValue(field, newRaw, contractTypeNames);
    if (oldStr !== newStr) {
      entries.push({ field, oldValue: oldStr, newValue: newStr });
    }
  }
  return entries;
}
