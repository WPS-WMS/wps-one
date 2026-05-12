/**
 * O layout usa permissões granulares; o menu pai não pode depender só da feature
 * do menu (ex.: "relatorios") se o perfil tiver apenas "relatorios.reembolsos".
 */
export function canSeeRelatoriosMenu(can: (featureId: string) => boolean): boolean {
  return (
    can("relatorios") ||
    can("relatorios.horas") ||
    can("relatorios.utilizacao") ||
    can("relatorios.chamados") ||
    can("relatorios.exportacao") ||
    can("relatorios.reembolsos")
  );
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
