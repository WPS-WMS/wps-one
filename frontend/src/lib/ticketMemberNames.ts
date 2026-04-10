/** Fonte mínima para montar a lista de “membros” da tarefa na UI. */
export type TicketMemberSource = {
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  responsibles?: Array<{ user: { id: string; name: string } }>;
};

/**
 * Ordem: atribuído → responsáveis da tarefa → criador (se ainda não listado).
 * Garante que o cliente criador apareça quando estiver em `responsibles` ou como `createdBy`.
 */
export function collectTicketMemberNames(ticket: TicketMemberSource): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  if (ticket.assignedTo?.name && !seen.has(ticket.assignedTo.id)) {
    seen.add(ticket.assignedTo.id);
    names.push(ticket.assignedTo.name);
  }
  ticket.responsibles?.forEach((r) => {
    if (r.user?.name && !seen.has(r.user.id)) {
      seen.add(r.user.id);
      names.push(r.user.name);
    }
  });
  if (ticket.createdBy?.name && ticket.createdBy.id && !seen.has(ticket.createdBy.id)) {
    seen.add(ticket.createdBy.id);
    names.push(ticket.createdBy.name);
  }
  return names;
}

export function formatMemberNamesChip(names: string[]): {
  display: string | null;
  title: string | undefined;
} {
  if (names.length === 0) return { display: null, title: undefined };
  const full = names.join(", ");
  return {
    display: names.length > 1 ? `${names[0]}...` : names[0],
    title: names.length > 1 ? full : undefined,
  };
}

type SelectUserLike = { id: string; name: string };

/**
 * `/api/users/for-select` exclui CLIENTE; IDs de cliente em `responsibleIds` não aparecem em `users`.
 * Resolve nome para chips na modal: lista do select → responsibles do ticket → criador → atribuído.
 */
export function resolveTicketResponsibleMembers(args: {
  responsibleIds: string[];
  users: SelectUserLike[];
  ticket: TicketMemberSource;
}): Array<{ id: string; name: string }> {
  const ids =
    args.responsibleIds.length > 0
      ? args.responsibleIds
      : args.ticket.createdBy?.id
        ? [args.ticket.createdBy.id]
        : [];
  return ids.map((id) => {
    const fromList = args.users.find((u) => u.id === id);
    if (fromList) return { id, name: fromList.name };
    const fromResp = args.ticket.responsibles?.find((r) => r.user?.id === id);
    if (fromResp?.user?.name) return { id, name: fromResp.user.name };
    if (args.ticket.createdBy?.id === id && args.ticket.createdBy?.name) {
      return { id, name: args.ticket.createdBy.name };
    }
    if (args.ticket.assignedTo?.id === id && args.ticket.assignedTo?.name) {
      return { id, name: args.ticket.assignedTo.name };
    }
    return { id, name: "Usuário" };
  });
}
