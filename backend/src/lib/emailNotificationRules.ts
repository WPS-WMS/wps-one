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
  const t = String(tipo ?? "").trim().toUpperCase();
  if (t === "FIXED_PRICE" || t === "TIME_MATERIAL" || t === "AMS" || t === "INTERNO") {
    return t as EmailProjectType;
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
