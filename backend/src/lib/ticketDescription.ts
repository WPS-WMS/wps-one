export const TICKET_DESCRIPTION_MAX_LEN = 2000;

export function ticketDescriptionErrorMessage(): string {
  return `A descrição deve ter no máximo ${TICKET_DESCRIPTION_MAX_LEN} caracteres.`;
}

export function normalizeTicketDescription(description: unknown): string | null {
  if (description === undefined || description === null) return null;
  const trimmed = String(description).trim();
  return trimmed || null;
}

export function assertTicketDescriptionLength(description: unknown): string | null | { error: string } {
  const normalized = normalizeTicketDescription(description);
  if (normalized && normalized.length > TICKET_DESCRIPTION_MAX_LEN) {
    return { error: ticketDescriptionErrorMessage() };
  }
  return normalized;
}
