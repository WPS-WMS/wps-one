/**
 * Módulo financeiro no FE: NEXT_PUBLIC_ENABLE_FINANCEIRO=true no build (QA e prod)
 * ou localhost / hostname *-qa.*.
 * O gate do backend (FINANCEIRO_MODULE_ENABLED) continua sendo a fonte de verdade na API.
 */
export function isFinanceiroModuleEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_FINANCEIRO === "true") return true;
  if (typeof window === "undefined") return false;

  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;

  // Preview/QA Firebase: hostname contém "-qa." (ex.: app-qa.web.app), não qualquer substring.
  if (host.includes("-qa.") || host.endsWith("-qa.web.app") || host.endsWith("-qa.firebaseapp.com")) {
    return true;
  }
  return false;
}

/** Combina permissão do perfil com o gate de ambiente (QA). */
export function canFinanceFeature(
  can: (featureId: string) => boolean,
  featureId: string,
): boolean {
  if (!isFinanceiroModuleEnabled()) return false;
  return can(featureId);
}

/** Features do módulo financeiro (exclui reembolsos legado). */
export function isFinanceiroFeatureId(featureId: string): boolean {
  return (
    featureId.startsWith("financeiro.") ||
    featureId === "financeiro" ||
    featureId === "configuracoes.financeiro" ||
    featureId.startsWith("configuracoes.financeiro.") ||
    featureId.startsWith("relatorios.financeiro")
  );
}
