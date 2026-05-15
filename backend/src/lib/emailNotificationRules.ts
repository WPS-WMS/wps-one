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
 * Se não existir linha no banco para (tenant, tipo, gatilho), considera **ativo** (compatível com instalações antigas).
 */
export async function isTenantEmailTriggerEnabled(
  tenantId: string,
  projectTipo: string | null | undefined,
  trigger: string,
): Promise<boolean> {
  const projectType = normalizeProjectTypeForEmail(projectTipo);
  const rawTipo = String(projectTipo ?? "").trim();
  let row = await prisma.tenantEmailNotificationRule.findUnique({
    where: {
      tenantId_projectType_trigger: { tenantId, projectType, trigger },
    },
    select: { isActive: true },
  });
  // Compat: regra salva com tipo legado/texto livre no banco.
  if (!row && rawTipo && rawTipo !== projectType) {
    row = await prisma.tenantEmailNotificationRule.findUnique({
      where: {
        tenantId_projectType_trigger: { tenantId, projectType: rawTipo, trigger },
      },
      select: { isActive: true },
    });
  }
  if (!row) {
    /**
     * Fail-open foi útil para tenants antigos (sem nenhuma regra salva).
     * Porém, quando o tenant já usa a tela Configurações → E-mails, esperamos que a matriz esteja completa.
     * Se por qualquer motivo faltar uma combinação (dado legado/inconsistência), preferimos FAIL-CLOSED para
     * não disparar e-mails “indevidos” mesmo com checkbox desmarcada.
     */
    const ttlMs = 5 * 60 * 1000;
    const now = Date.now();
    const cache = emailRulesCacheStore()[EMAIL_RULES_CACHE_KEY];
    const cached = cache.get(tenantId);
    if (cached && now - cached.at < ttlMs) {
      return cached.hasAny ? false : true;
    }
    const count = await prisma.tenantEmailNotificationRule.count({ where: { tenantId } });
    const hasAny = count > 0;
    cache.set(tenantId, { at: now, hasAny });
    return hasAny ? false : true;
  }
  return row.isActive;
}
