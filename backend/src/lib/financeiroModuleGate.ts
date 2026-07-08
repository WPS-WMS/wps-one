import type { FeatureId } from "./permissions.js";

/** Módulo financeiro ativo apenas quando FINANCEIRO_MODULE_ENABLED=true (Render QA). */
export function isFinanceiroModuleEnabled(): boolean {
  return process.env.FINANCEIRO_MODULE_ENABLED === "true";
}

export const FINANCEIRO_MODULE_FEATURE_IDS: FeatureId[] = [
  "relatorios.financeiroCentroCusto",
  "relatorios.financeiroDashboard",
  "relatorios.financeiroDre",
  "relatorios.financeiroFluxoCaixa",
  "relatorios.financeiroAnalises",
  "financeiro",
  "financeiro.fornecedores",
  "financeiro.clientesFinanceiros",
  "financeiro.lancamentos",
  "financeiro.contasPagar",
  "financeiro.contasPagar.aprovar",
  "financeiro.contasReceber",
  "financeiro.projetos",
  "financeiro.projetos.receitas",
  "financeiro.projetos.contratos",
  "financeiro.projetos.resultado",
  "configuracoes.financeiro.categorias",
  "configuracoes.financeiro.centrosCusto",
  "configuracoes.financeiro.planoContas",
  "configuracoes.financeiro.tiposCobranca",
  "configuracoes.financeiro.tiposContrato",
  "configuracoes.financeiro.tiposDespesa",
  "configuracoes.financeiro.tiposReceita",
];

export function isFinanceiroFeatureId(featureId: FeatureId): boolean {
  return FINANCEIRO_MODULE_FEATURE_IDS.includes(featureId);
}
