import { prisma } from "./prisma.js";

const MENTION_ID_RE = /data-mention-id=["']([^"']+)["']/gi;

/** Extrai IDs únicos de menções (@) no HTML do comentário. */
export function extractMentionUserIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  const input = String(html ?? "");
  let match: RegExpExecArray | null;
  MENTION_ID_RE.lastIndex = 0;
  while ((match = MENTION_ID_RE.exec(input)) !== null) {
    const id = String(match[1] ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Quem pode ser mencionado: responsável/membro do projeto
 * ou responsável/atribuído/membro da tarefa.
 */
export async function loadMentionableUserIdsForTicket(ticketId: string): Promise<Set<string>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      assignedToId: true,
      projectId: true,
      responsibles: { select: { userId: true } },
      project: {
        select: {
          responsibles: { select: { userId: true } },
          members: { select: { userId: true } },
        },
      },
    },
  });
  const allowed = new Set<string>();
  if (!ticket) return allowed;
  if (ticket.assignedToId) allowed.add(ticket.assignedToId);
  for (const row of ticket.responsibles) allowed.add(row.userId);
  for (const row of ticket.project.responsibles) allowed.add(row.userId);
  for (const row of ticket.project.members) allowed.add(row.userId);
  return allowed;
}

export async function createCommentMentionNotifications(params: {
  tenantId: string;
  actorId: string;
  actorName: string;
  ticketId: string;
  ticketCode: string;
  commentId: string;
  htmlContent: string;
}): Promise<void> {
  const mentioned = extractMentionUserIdsFromHtml(params.htmlContent);
  if (mentioned.length === 0) return;

  const allowed = await loadMentionableUserIdsForTicket(params.ticketId);
  const recipients = mentioned.filter(
    (id) => id !== params.actorId && allowed.has(id),
  );
  if (recipients.length === 0) return;

  const title = `${params.actorName} marcou você em um comentário`;
  const body = params.ticketCode ? `#${params.ticketCode}` : null;

  await prisma.userNotification.createMany({
    data: recipients.map((userId) => ({
      tenantId: params.tenantId,
      userId,
      actorId: params.actorId,
      type: "COMMENT_MENTION",
      title,
      body,
      ticketId: params.ticketId,
      commentId: params.commentId,
    })),
  });
}
