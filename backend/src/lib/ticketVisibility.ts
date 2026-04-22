/**
 * Regras de visibilidade para consultor:
 * - Tópico (SUBPROJETO): visível se é membro do tópico OU é membro de alguma tarefa do tópico.
 * - Tarefa: visível se é membro da tarefa OU é membro do tópico pai.
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
 * Membro explícito do projeto (ProjectResponsible): enxerga todos os tickets do projeto.
 * Caso contrário, aplica {@link filterTicketsForConsultant} (membro da tarefa ou do tópico).
 */
export function consultantTicketsForProject<T extends TicketForFilter>(
  tickets: T[],
  uid: string,
  projectResponsibles: Array<{ userId: string }> | null | undefined,
): T[] {
  const isProjectResponsible =
    Array.isArray(projectResponsibles) && projectResponsibles.some((r) => r.userId === uid);
  if (isProjectResponsible) return tickets;
  return filterTicketsForConsultant(tickets, uid);
}

/** Filtra tickets para o consultor conforme regras de visibilidade (tópico/tarefa). */
export function filterTicketsForConsultant<T extends TicketForFilter>(tickets: T[], uid: string): T[] {
  const isMember = (t: TicketForFilter) =>
    (t.assignedTo && t.assignedTo.id === uid) ||
    (t.createdBy && t.createdBy.id === uid) ||
    (Array.isArray(t.responsibles) && t.responsibles.some((r) => r.user.id === uid));

  const topics = tickets.filter((t) => t.type === "SUBPROJETO");
  const tasks = tickets.filter((t) => t.type !== "SUBPROJETO" && t.parentTicketId);

  const topicIdsWhereConsultantIsMember = new Set(topics.filter(isMember).map((t) => t.id));
  const topicIdsWithTaskWhereConsultantIsMember = new Set(
    tasks.filter(isMember).map((t) => t.parentTicketId!).filter(Boolean)
  );

  return tickets.filter((t) => {
    if (t.type === "SUBPROJETO") {
      return topicIdsWhereConsultantIsMember.has(t.id) || topicIdsWithTaskWhereConsultantIsMember.has(t.id);
    }
    if (t.parentTicketId) {
      return isMember(t) || topicIdsWhereConsultantIsMember.has(t.parentTicketId);
    }
    return isMember(t);
  });
}
