import { prisma } from "./prisma.js";

/** Alinhado ao enum Prisma `TipoProjeto` */
export const EMAIL_PROJECT_TYPES = ["INTERNO", "FIXED_PRICE", "TIME_MATERIAL", "AMS"] as const;
export type EmailProjectType = (typeof EMAIL_PROJECT_TYPES)[number];

export const EMAIL_TRIGGERS = [
  "CRIACAO",
  "STATUS_CHANGE",
  "COMENTARIO",
  "ORCAMENTO",
  "RESPOSTA_ORCAMENTO",
  "MODIFICACAO",
  "LIMITE_DIARIO_EXCEDIDO",
] as const;
export type EmailTrigger = (typeof EMAIL_TRIGGERS)[number];

export function normalizeProjectTypeForEmail(tipo: string | null | undefined): EmailProjectType {
  const raw = String(tipo ?? "").trim();
  const t = raw.toUpperCase();
  if (t === "FIXED_PRICE" || t === "TIME_MATERIAL" || t === "AMS" || t === "INTERNO") {
    return t as EmailProjectType;
  }

  // Compat: bases antigas podem ter salvo labels/variações como texto livre
  // (ex.: "Projeto Fechado", "PROJETO_FECHADO", "Time & Material", etc).
  const compact = t.replace(/\s+/g, " ").trim();
  const normalized = compact.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (normalized === "PROJETO_FECHADO" || normalized === "FECHADO" || normalized === "FIXEDPRICE") {
    return "FIXED_PRICE";
  }
  if (normalized === "PROJETO_INTERNO" || normalized === "INTERNO" || normalized === "INTERNAL") {
    return "INTERNO";
  }
  if (
    normalized === "TIME_MATERIAL" ||
    normalized === "TIME_AND_MATERIAL" ||
    normalized === "TIME_MATERIAL_" ||
    normalized === "TIME_MATERIALS"
  ) {
    return "TIME_MATERIAL";
  }
  if (normalized === "AMS") {
    return "AMS";
  }

  return "INTERNO";
}

/**
 * Se não existir linha no banco para (tenant, tipo, gatilho), considera **ativo** (compatível com instalações antigas).
 */
export async function isTenantEmailTriggerEnabled(
  tenantId: string,
  projectTipo: string | null | undefined,
  trigger: string,
): Promise<boolean> {
  const projectType = normalizeProjectTypeForEmail(projectTipo);
  const row = await prisma.tenantEmailNotificationRule.findUnique({
    where: {
      tenantId_projectType_trigger: { tenantId, projectType, trigger },
    },
    select: { isActive: true },
  });
  if (!row) return true;
  return row.isActive;
}
