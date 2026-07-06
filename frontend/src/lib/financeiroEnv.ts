/**
 * Módulo financeiro só é exposto no build QA (Firebase hosting:qa).
 * Builds de produção não definem NEXT_PUBLIC_ENABLE_FINANCEIRO — menu e telas ficam ocultos.
 */
export function isFinanceiroModuleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_FINANCEIRO === "true";
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
