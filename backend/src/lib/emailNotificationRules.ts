import { prisma } from "./prisma.js";

/** Alinhado ao enum Prisma `TipoProjeto` */
export const EMAIL_PROJECT_TYPES = [
  "INTERNO",
  "CUSTOS_OPERACIONAIS",
  "FIXED_PRICE",
  "TIME_MATERIAL",
  "AMS",
] as const;
export type EmailProjectType = (typeof EMAIL_PROJECT_TYPES)[number];

export const EMAIL_TRIGGERS = [
  "CRIACAO",
  "STATUS_CHANGE",
  "COMENTARIO",
  "ORCAMENTO",
  "RESPOSTA_ORCAMENTO",
  "MODIFICACAO",
  "LIMITE_DIARIO_EXCEDIDO",
  /** Apontamento de horas em tarefa (e-mail ao responsável do projeto). */
  "APONTAMENTO",
  /** Nova solicitação de reembolso (e-mail ao responsável do projeto). */
  "REEMBOLSOS",
] as const;
export type EmailTrigger = (typeof EMAIL_TRIGGERS)[number];

export const EMAIL_RECIPIENT_ROLES = ["RESPONSAVEL", "MEMBRO", "CLIENTE"] as const;
export type EmailRecipientRole = (typeof EMAIL_RECIPIENT_ROLES)[number];

const RESPONSIBLE_ONLY_TRIGGERS = new Set<string>([
  "LIMITE_DIARIO_EXCEDIDO",
  "APONTAMENTO",
  "REEMBOLSOS",
]);

/** Padrão quando o tenant ainda não tem regras salvas (fail-open legado). */
export function defaultRecipientRolesForTrigger(trigger: string): EmailRecipientRole[] {
  if (RESPONSIBLE_ONLY_TRIGGERS.has(trigger)) return ["RESPONSAVEL"];
  return ["RESPONSAVEL", "MEMBRO", "CLIENTE"];
}

export function parseRecipientRoles(raw: unknown): EmailRecipientRole[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v ?? "").trim().toUpperCase())
      .filter((v): v is EmailRecipientRole => EMAIL_RECIPIENT_ROLES.includes(v as EmailRecipientRole));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseRecipientRoles(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function serializeRecipientRoles(roles: EmailRecipientRole[]): string {
  const uniq = Array.from(new Set(roles.filter((r) => EMAIL_RECIPIENT_ROLES.includes(r))));
  return JSON.stringify(uniq);
}

export function normalizeProjectTypeForEmail(tipo: string | null | undefined): EmailProjectType {
  const raw = String(tipo ?? "").trim();
  const t = raw.toUpperCase();
  if (
    t === "FIXED_PRICE" ||
    t === "TIME_MATERIAL" ||
    t === "AMS" ||
    t === "INTERNO" ||
    t === "CUSTOS_OPERACIONAIS"
  ) {
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
  if (
    normalized === "CUSTOS_OPERACIONAIS" ||
    normalized === "CUSTOS_OPERACIONAL" ||
    normalized === "OPERATIONAL_COSTS"
  ) {
    return "CUSTOS_OPERACIONAIS";
  }

  return "INTERNO";
}

const EMAIL_RULES_CACHE_KEY = "__wpsEmailRulesTenantHasAny";

type EmailRulesCache = Map<string, { at: number; hasAny: boolean }>;

function emailRulesCacheStore(): Record<string, EmailRulesCache> {
  const g = globalThis as unknown as Record<string, EmailRulesCache | undefined>;
  if (!g[EMAIL_RULES_CACHE_KEY]) g[EMAIL_RULES_CACHE_KEY] = new Map();
  return g as Record<string, EmailRulesCache>;
}

/** Limpa cache de regras (chamar após salvar Configurações → E-mails). */
export function clearTenantEmailRulesCache(tenantId?: string): void {
  const cache = emailRulesCacheStore()[EMAIL_RULES_CACHE_KEY];
  if (!cache) return;
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/**
 * Destinatários configurados para (tenant, tipo de projeto, gatilho).
 * Só retorna papéis marcados na matriz; array vazio = não envia e-mail.
 */
export async function getTenantEmailRecipientRoles(
  tenantId: string,
  projectTipo: string | null | undefined,
  trigger: string,
): Promise<EmailRecipientRole[]> {
  const projectType = normalizeProjectTypeForEmail(projectTipo);
  const rawTipo = String(projectTipo ?? "").trim();
  let row = await prisma.tenantEmailNotificationRule.findUnique({
    where: {
      tenantId_projectType_trigger: { tenantId, projectType, trigger },
    },
    select: { recipientRoles: true },
  });
  if (!row && rawTipo && rawTipo !== projectType) {
    row = await prisma.tenantEmailNotificationRule.findUnique({
      where: {
        tenantId_projectType_trigger: { tenantId, projectType: rawTipo, trigger },
      },
      select: { recipientRoles: true },
    });
  }
  if (!row) return [];
  return parseRecipientRoles(row.recipientRoles);
}

/**
 * Se não existir linha no banco para (tenant, tipo, gatilho), considera **ativo** (compatível com instalações antigas).
 */
export async function isTenantEmailTriggerEnabled(
  tenantId: string,
  projectTipo: string | null | undefined,
  trigger: string,
): Promise<boolean> {
  const roles = await getTenantEmailRecipientRoles(tenantId, projectTipo, trigger);
  return roles.length > 0;
}
