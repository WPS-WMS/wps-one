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

/**
 * No payload do projeto: staff com acesso ao projeto (membro ou responsável) enxerga todos os tickets.
 * Caso contrário, lista vazia (defesa em profundidade).
 */
export function consultantTicketsForProject<T extends TicketForFilter>(
  tickets: T[],
  uid: string,
  projectMembers: Array<{ userId: string }> | null | undefined,
  projectResponsibles?: Array<{ userId: string }> | null | undefined,
): T[] {
  const isProjectMember = Array.isArray(projectMembers) && projectMembers.some((r) => r.userId === uid);
  const isResponsible =
    Array.isArray(projectResponsibles) && projectResponsibles.some((r) => r.userId === uid);
  if (isProjectMember || isResponsible) return tickets;
  return [];
}
