/**
 * Módulo financeiro só é exposto no build QA (Firebase hosting:qa) ou em localhost.
 * Builds de produção não definem NEXT_PUBLIC_ENABLE_FINANCEIRO — menu e telas ficam ocultos.
 * O gate do backend (FINANCEIRO_MODULE_ENABLED) é a fonte de verdade; o FE só esconde UI.
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
