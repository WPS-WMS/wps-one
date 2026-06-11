/** Limite único da descrição de tarefa/chamado em todos os perfis e fluxos. */
export const TICKET_DESCRIPTION_MAX_LEN = 2000;

export function ticketDescriptionErrorMessage(): string {
  return `A descrição deve ter no máximo ${TICKET_DESCRIPTION_MAX_LEN} caracteres.`;
}
