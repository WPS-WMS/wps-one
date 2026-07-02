import { seedFinanceiroDefaultsForTenant } from "./financeiroSeedDefaults.js";

export function normalizeConfigName(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  return name.length > 0 ? name : null;
}

export function normalizeOptionalCode(raw: unknown): string | null {
  const code = String(raw ?? "").trim();
  return code.length > 0 ? code : null;
}

export function normalizeAccountType(raw: unknown): "RECEITA" | "DESPESA" | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "RECEITA" || t === "DESPESA") return t;
  return null;
}

/** Garante categorias, centros e contas padrão (idempotente). */
export async function ensureFinanceDefaults(tenantId: string): Promise<void> {
  await seedFinanceiroDefaultsForTenant(tenantId);
}
