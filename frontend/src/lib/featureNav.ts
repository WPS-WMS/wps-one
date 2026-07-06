/**
 * O layout usa permissões granulares; o menu pai não pode depender só da feature
 * do menu (ex.: "relatorios") se o perfil tiver apenas "relatorios.reembolsos".
 */
import { canFinanceFeature, isFinanceiroModuleEnabled } from "./financeiroEnv";
const PROJETO_MENU_FEATURES = [
  "projeto.lista",
  "projeto.novo",
  "projeto.editar",
  "projeto.verDetalhes",
  "projeto.arquivar",
  "projeto.excluir",
  "projeto.dashboardDaily",
  "projeto.listaTarefas",
  "projeto.gestaoTm",
] as const;

const RELATORIOS_MENU_FEATURES = [
  "relatorios",
  "relatorios.gestaoHoras",
  "relatorios.gestaoHorasVerTodos",
  "relatorios.horas",
  "relatorios.reembolsos",
  "relatorios.reembolsosVerTodos",
  "relatorios.utilizacao",
  "relatorios.chamados",
  "relatorios.exportacao",
  "relatorios.financeiroCentroCusto",
  "relatorios.financeiroDashboard",
  "relatorios.financeiroDre",
  "relatorios.financeiroFluxoCaixa",
  "relatorios.financeiroAnalises",
] as const;

export function canSeeProjetosMenu(can: (featureId: string) => boolean): boolean {
  return can("projeto") || PROJETO_MENU_FEATURES.some((f) => can(f));
}

export function canAccessRelatorioGestaoHoras(can: (featureId: string) => boolean): boolean {
  return (
    can("relatorios.gestaoHoras") ||
    can("relatorios.gestaoHorasVerTodos") ||
    can("relatorios.horas")
  );
}

/** Filtro por usuário no relatório Gestão de horas (todos os colaboradores). */
export function canViewAllUsersInGestaoHorasReport(
  role: string | undefined | null,
  can: (featureId: string) => boolean,
): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "SUPER_ADMIN" || r === "GESTOR_PROJETOS" || can("relatorios.gestaoHorasVerTodos");
}

/** Acesso ao relatório Relatórios > Reembolsos (próprio escopo ou todos os usuários). */
export function canAccessRelatorioReembolsos(can: (featureId: string) => boolean): boolean {
  return (
    can("relatorios.reembolsos") ||
    can("relatorios.reembolsosVerTodos") ||
    can("configuracoes.reembolso")
  );
}

export function canSeeRelatoriosMenu(can: (featureId: string) => boolean): boolean {
  const financeRelatorioFeatures = [
    "relatorios.financeiroCentroCusto",
    "relatorios.financeiroDashboard",
    "relatorios.financeiroDre",
    "relatorios.financeiroFluxoCaixa",
    "relatorios.financeiroAnalises",
  ] as const;
  return RELATORIOS_MENU_FEATURES.some((f) => {
    if (!isFinanceiroModuleEnabled() && (financeRelatorioFeatures as readonly string[]).includes(f)) {
      return false;
    }
    return can(f);
  });
}

export function buildRelatoriosNavChildren(
  basePath: string,
  can: (featureId: string) => boolean,
): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [];
  if (can("relatorios")) items.push({ href: `${basePath}/relatorios`, label: "Visão geral" });
  if (canAccessRelatorioGestaoHoras(can)) {
    items.push({ href: `${basePath}/relatorios/gestao-horas`, label: "Gestão de horas" });
  }
  if (can("relatorios.horas")) {
    items.push({ href: `${basePath}/relatorios/horas`, label: "Horas" });
  }
  if (canAccessRelatorioReembolsos(can)) {
    items.push({ href: `${basePath}/relatorios/reembolsos`, label: "Reembolsos" });
  }
  if (can("relatorios.utilizacao")) {
    items.push({ href: `${basePath}/relatorios/utilizacao`, label: "Utilização" });
  }
  if (can("relatorios.chamados")) {
    items.push({ href: `${basePath}/relatorios/chamados`, label: "Tarefas" });
  }
  if (can("relatorios.exportacao")) {
    items.push({ href: `${basePath}/relatorios/exportacao`, label: "Exportar faturamento" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroCentroCusto")) {
    items.push({ href: `${basePath}/relatorios/centro-custo`, label: "Centro de custo" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroDashboard")) {
    items.push({ href: `${basePath}/relatorios/financeiro/dashboard`, label: "Dashboard financeiro" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroDre")) {
    items.push({ href: `${basePath}/relatorios/financeiro/dre`, label: "DRE gerencial" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroFluxoCaixa")) {
    items.push({ href: `${basePath}/relatorios/financeiro/fluxo-caixa`, label: "Fluxo de caixa" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroAnalises")) {
    items.push({ href: `${basePath}/relatorios/financeiro/analises`, label: "Análises financeiras" });
  }
  return items;
}

export function canSeeConfiguracoesMenu(can: (featureId: string) => boolean): boolean {
  const financeConfigFeatures = [
    "configuracoes.financeiro.categorias",
    "configuracoes.financeiro.centrosCusto",
    "configuracoes.financeiro.planoContas",
    "configuracoes.financeiro.tiposCobranca",
    "configuracoes.financeiro.tiposContrato",
    "configuracoes.financeiro.tiposDespesa",
  ] as const;
  return (
    can("configuracoes") ||
    can("configuracoes.usuarios") ||
    can("configuracoes.permissoes") ||
    can("configuracoes.clientes") ||
    can("configuracoes.gestaoPerfis") ||
    can("configuracoes.atividades") ||
    can("configuracoes.emails") ||
    can("configuracoes.sharepoint") ||
    can("configuracoes.reembolso") ||
    can("configuracoes.feriados") ||
    (isFinanceiroModuleEnabled() &&
      financeConfigFeatures.some((f) => can(f)))
  );
}

const FINANCEIRO_MENU_FEATURES = [
  "financeiro",
  "financeiro.fornecedores",
  "financeiro.clientesFinanceiros",
  "financeiro.lancamentos",
  "financeiro.contasPagar",
  "financeiro.contasReceber",
  "configuracoes.reembolso",
] as const;

export function canSeeFinanceiroMenu(can: (featureId: string) => boolean): boolean {
  if (!isFinanceiroModuleEnabled()) return false;
  return FINANCEIRO_MENU_FEATURES.some((f) => can(f));
}

export function buildFinanceiroNavChildren(
  basePath: string,
  can: (featureId: string) => boolean,
): { href: string; label: string }[] {
  if (!isFinanceiroModuleEnabled()) return [];
  const items: { href: string; label: string }[] = [];
  if (canFinanceFeature(can, "financeiro.fornecedores")) {
    items.push({ href: `${basePath}/financeiro/fornecedores`, label: "Fornecedores" });
  }
  if (canFinanceFeature(can, "financeiro.clientesFinanceiros")) {
    items.push({ href: `${basePath}/financeiro/clientes-financeiros`, label: "Clientes financeiros" });
  }
  if (canFinanceFeature(can, "financeiro.lancamentos")) {
    items.push({ href: `${basePath}/financeiro/lancamentos`, label: "Lançamentos" });
  }
  if (canFinanceFeature(can, "financeiro.contasPagar")) {
    items.push({ href: `${basePath}/financeiro/contas-pagar`, label: "Contas a pagar" });
  }
  if (canFinanceFeature(can, "financeiro.contasReceber")) {
    items.push({ href: `${basePath}/financeiro/contas-receber`, label: "Contas a receber" });
  }
  if (can("configuracoes.reembolso")) {
    items.push({ href: `${basePath}/financeiro/reembolsos-aprovacao`, label: "Aprovar reembolsos" });
  }
  return items;
}
