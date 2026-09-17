/** Espelho leve do gate de módulos do plano (FE). */

export type TenantModulesState = {
  projetos: boolean;
  financeiro: boolean;
  portal: boolean;
  sharepoint: boolean;
  locked?: boolean;
  status?: string;
};

export function featurePlanModule(
  featureId: string,
): "projetos" | "financeiro" | "portal" | "sharepoint" | null {
  if (
    featureId === "projeto" ||
    featureId.startsWith("projeto.") ||
    featureId === "tarefa.editar" ||
    featureId === "tarefa.verTodos" ||
    featureId === "apontamentos" ||
    featureId === "hora-banco" ||
    featureId.startsWith("hora-banco.") ||
    featureId === "chamados.criacao" ||
    featureId.startsWith("relatorios.gestaoHoras") ||
    featureId === "relatorios.horas" ||
    featureId === "relatorios.utilizacao" ||
    featureId === "relatorios.chamados"
  ) {
    return "projetos";
  }
  if (
    featureId === "financeiro" ||
    featureId.startsWith("financeiro.") ||
    featureId.startsWith("relatorios.financeiro") ||
    featureId === "configuracoes.financeiro" ||
    featureId.startsWith("configuracoes.financeiro.")
  ) {
    return "financeiro";
  }
  if (featureId.startsWith("portal.")) return "portal";
  if (featureId === "configuracoes.sharepoint") return "sharepoint";
  return null;
}

export function isFeatureAllowedByTenantModules(
  modules: TenantModulesState | null | undefined,
  featureId: string,
): boolean {
  if (!modules) return true;
  if (modules.locked) return false;
  const mod = featurePlanModule(featureId);
  if (!mod) return true;
  return modules[mod] === true;
}
