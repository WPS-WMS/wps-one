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
] as const;

const FINANCEIRO_RELATORIO_FEATURES = [
  "relatorios.financeiroCentroCusto",
  "relatorios.financeiroDashboard",
  "relatorios.financeiroDre",
  "relatorios.financeiroFluxoCaixa",
  "relatorios.financeiroAnalises",
  "relatorios.financeiroMedicaoHoras",
] as const;

export function canSeeProjetosMenu(can: (featureId: string) => boolean): boolean {
  return (
    can("projeto") ||
    PROJETO_MENU_FEATURES.some((f) => can(f)) ||
    can("configuracoes.permissoes")
  );
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
  return RELATORIOS_MENU_FEATURES.some((f) => can(f));
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
  return items;
}

export function canSeeConfiguracoesMenu(can: (featureId: string) => boolean): boolean {
  return buildConfiguracoesNavChildren("/admin", can).length > 0;
}

/** Submenu de Configurações: Geral, Cadastro e Financeiro (somente seções com itens visíveis). */
export function buildConfiguracoesNavChildren(
  basePath: string,
  can: (featureId: string) => boolean,
): { href: string; label: string; matchPrefixes?: string[] }[] {
  const items: { href: string; label: string; matchPrefixes?: string[] }[] = [];

  const canGeral =
    can("configuracoes") ||
    can("configuracoes.emails") ||
    can("configuracoes.feriados") ||
    can("configuracoes.sharepoint") ||
    can("configuracoes.atividades");
  if (canGeral) {
    items.push({
      href: `${basePath}/configuracoes/geral`,
      label: "Geral",
      matchPrefixes: [
        `${basePath}/configuracoes/emails`,
        `${basePath}/configuracoes/feriados`,
        `${basePath}/configuracoes/sharepoint`,
        `${basePath}/configuracoes/atividades`,
      ],
    });
  }

  const canCadastro =
    can("configuracoes") ||
    can("configuracoes.usuarios") ||
    can("configuracoes.clientes") ||
    canFinanceFeature(can, "financeiro.fornecedores") ||
    can("configuracoes.gestaoPerfis");
  if (canCadastro) {
    items.push({
      href: `${basePath}/configuracoes/cadastro`,
      label: "Cadastro",
      matchPrefixes: [
        `${basePath}/usuarios`,
        `${basePath}/clientes`,
        `${basePath}/fornecedores`,
        `${basePath}/gestao-perfis`,
      ],
    });
  }

  const financeConfigFeatures = [
    "configuracoes.financeiro.categorias",
    "configuracoes.financeiro.centrosCusto",
    "configuracoes.financeiro.planoContas",
    "configuracoes.financeiro.tiposCobranca",
    "configuracoes.financeiro.tiposContrato",
    "configuracoes.financeiro.tiposDespesa",
    "configuracoes.financeiro.tiposReceita",
    "configuracoes.financeiro.impostos",
    "configuracoes.financeiro.categoriasFinanceiras",
  ] as const;
  const canFinanceiroSecao =
    can("configuracoes.reembolso") ||
    (isFinanceiroModuleEnabled() &&
      (can("configuracoes") || financeConfigFeatures.some((f) => can(f))));
  if (canFinanceiroSecao) {
    items.push({
      href: `${basePath}/configuracoes/financeiro`,
      label: "Financeiro",
      matchPrefixes: [`${basePath}/configuracoes/reembolsos`],
    });
  }

  return items;
}

const FINANCEIRO_MENU_FEATURES = [
  "financeiro",
  "financeiro.projetos",
  "financeiro.projetos.receitas",
  "financeiro.projetos.contratos",
  "financeiro.projetos.resultado",
  "financeiro.lancamentos",
  "financeiro.contasPagar",
  "financeiro.contasReceber",
  "configuracoes.reembolso",
  ...FINANCEIRO_RELATORIO_FEATURES,
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
  if (
    canFinanceFeature(can, "financeiro.projetos") ||
    canFinanceFeature(can, "financeiro.projetos.receitas") ||
    canFinanceFeature(can, "financeiro.projetos.contratos") ||
    canFinanceFeature(can, "financeiro.projetos.resultado")
  ) {
    items.push({ href: `${basePath}/financeiro/projetos`, label: "Projetos" });
    items.push({ href: `${basePath}/financeiro/dashboard-projetos`, label: "Dashboard projetos" });
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
  if (canFinanceFeature(can, "relatorios.financeiroCentroCusto")) {
    items.push({ href: `${basePath}/financeiro/controle-orcamento`, label: "Controle de orçamento" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroDashboard")) {
    items.push({ href: `${basePath}/financeiro/dashboard`, label: "Dashboard financeiro" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroDre")) {
    items.push({ href: `${basePath}/financeiro/dre`, label: "DRE gerencial" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroFluxoCaixa")) {
    items.push({ href: `${basePath}/financeiro/fluxo-caixa`, label: "Fluxo de caixa" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroAnalises")) {
    items.push({ href: `${basePath}/financeiro/analises`, label: "Análises financeiras" });
  }
  if (canFinanceFeature(can, "relatorios.financeiroMedicaoHoras")) {
    items.push({
      href: `${basePath}/financeiro/medicao-horas`,
      label: "Medição horas vs receita",
    });
  }
  return items;
}
