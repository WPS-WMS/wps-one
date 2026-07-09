/**
 * Módulo financeiro só é exposto no build QA (Firebase hosting:qa).
 * Builds de produção não definem NEXT_PUBLIC_ENABLE_FINANCEIRO — menu e telas ficam ocultos.
 */
export function isFinanceiroModuleEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_FINANCEIRO === "true") return true;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host.includes("-qa") || host === "localhost" || host === "127.0.0.1";
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
    featureId.startsWith("configuracoes.financeiro.") ||
    featureId.startsWith("relatorios.financeiro")
  );
}
