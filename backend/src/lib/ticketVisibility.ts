/**
 * Tipos usados por filtros legados de tarefa (tópico / assignee / responsáveis).
 */

export type TicketForFilter = {
  id: string;
  type: string;
  parentTicketId?: string | null;
  assignedTo?: { id: string } | null;
  createdBy?: { id: string } | null;
  responsibles?: Array<{ user: { id: string } }>;
};

export type ProjectRosterForTicketFilter = {
  members?: Array<{ userId?: string }> | null;
  responsibles?: Array<{ userId?: string }> | null;
};

function uidOnProjectRoster(uid: string, roster: ProjectRosterForTicketFilter): boolean {
  const m = roster.members ?? [];
  const r = roster.responsibles ?? [];
  if (m.some((x) => x.userId === uid)) return true;
  if (r.some((x) => x.userId === uid)) return true;
  return false;
}

/**
 * Payload do projeto (lista/detalhe na Lista de Projetos): CONSULTOR / ADMIN_PORTAL
 * só vê tópicos/tarefas se for responsável ou membro do projeto; caso contrário, lista vazia.
 * (Home / Lista de tarefas agregadas usam {@link ticketHomeAndListaWhere} — Membro vê só suas tarefas.)
 */
export function consultantTicketsForProject<T extends TicketForFilter>(
  tickets: T[],
  uid: string,
  roster: ProjectRosterForTicketFilter,
): T[] {
  if (uidOnProjectRoster(uid, roster)) return tickets;
  return [];
}
