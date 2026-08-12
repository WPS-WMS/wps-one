import { Prisma } from "@prisma/client";
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

/** Evita re-seed + sync em todo GET de config financeira (TTL em memória do processo). */
const FINANCE_DEFAULTS_TTL_MS = 15 * 60 * 1000;
const financeDefaultsCheckedAt = new Map<string, number>();

/** Garante categorias, centros e contas padrão (idempotente). */
export async function ensureFinanceDefaults(tenantId: string): Promise<void> {
  const now = Date.now();
  const last = financeDefaultsCheckedAt.get(tenantId);
  if (last != null && now - last < FINANCE_DEFAULTS_TTL_MS) return;
  await seedFinanceiroDefaultsForTenant(tenantId);
  financeDefaultsCheckedAt.set(tenantId, now);
}

/** Mensagem amigável quando exclusão falha por vínculo (FK). */
export function financeConfigDeleteInUseError(label = "registro"): string {
  return `Não é possível excluir este ${label}: ele está em uso por outros cadastros.`;
}

export function isPrismaForeignKeyError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014");
}
