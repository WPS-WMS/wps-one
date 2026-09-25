/** Espelha a regra do backend para exibir status de vínculo na UI. */
const CLOSED_STATUSES = new Set(["ENCERRADO", "FINALIZADAS"]);

export function isTicketClosedStatus(status: unknown): boolean {
  return CLOSED_STATUSES.has(String(status ?? "").trim().toUpperCase());
}
