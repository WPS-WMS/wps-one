/** Tamanho máximo de um anexo de tarefa (bytes). */
export const TICKET_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export const TICKET_ATTACHMENT_MAX_MB = 50;

export function ticketAttachmentMaxSizeError(): string {
  return `Arquivo muito grande. Tamanho máximo: ${TICKET_ATTACHMENT_MAX_MB}MB`;
}
