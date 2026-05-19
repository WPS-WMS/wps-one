/** Tipos exibidos ao abrir chamado (tarefa). Não confundir com Atividades (apontamento de horas). */
export const TICKET_CHAMADO_TIPOS = [
  "Bug em PRD",
  "Melhoria",
  "Treinamento",
  "Garantia",
  "Dúvida",
] as const;

export type TicketChamadoTipo = (typeof TICKET_CHAMADO_TIPOS)[number];

const STRUCTURAL_TICKET_TYPES = new Set(["SUBPROJETO", "SUBTAREFA", "Tarefa"]);

export function isStructuralTicketType(type: string | null | undefined): boolean {
  return STRUCTURAL_TICKET_TYPES.has(String(type ?? "").trim());
}

/** Rótulo de tipo para exibição (chamados); oculta tipos estruturais do sistema. */
export function ticketTipoDisplayLabel(type: string | null | undefined): string | null {
  const t = String(type ?? "").trim();
  if (!t || isStructuralTicketType(t)) return null;
  return t;
}

export function initialTicketTipoValue(type: string | null | undefined): string {
  return ticketTipoDisplayLabel(type) ?? "";
}

export function ticketTipoForApi(ticketTipo: string): string {
  const t = String(ticketTipo ?? "").trim();
  return t || "Tarefa";
}
