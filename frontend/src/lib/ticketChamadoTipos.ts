/** Tipos exibidos ao abrir chamado (tarefa). Não confundir com Atividades (apontamento de horas). */
export const TICKET_CHAMADO_TIPOS = [
  "Bug em PRD",
  "Melhoria",
  "Treinamento",
  "Garantia",
  "Dúvida",
] as const;

export type TicketChamadoTipo = (typeof TICKET_CHAMADO_TIPOS)[number];
