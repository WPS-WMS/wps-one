/**
 * O layout usa permissões granulares; o menu pai não pode depender só da feature
 * do menu (ex.: "relatorios") se o perfil tiver apenas "relatorios.reembolsos".
 */
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
  return (
    can("configuracoes") ||
    can("configuracoes.usuarios") ||
    can("configuracoes.permissoes") ||
    can("configuracoes.clientes") ||
    can("configuracoes.gestaoPerfis") ||
    can("configuracoes.atividades") ||
    can("configuracoes.emails") ||
    can("configuracoes.reembolso") ||
    can("configuracoes.feriados")
  );
}
