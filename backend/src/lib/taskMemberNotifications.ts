import { prisma } from "./prisma.js";

/** Notifica usuários recém-adicionados como membros/responsáveis da tarefa. */
export async function createTaskMemberAddedNotifications(params: {
  tenantId: string;
  actorId: string;
  actorName: string;
  ticketId: string;
  ticketCode: string;
  newlyAddedUserIds: string[];
}): Promise<void> {
  const recipients = [
    ...new Set(
      params.newlyAddedUserIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => id && id !== params.actorId),
    ),
  ];
  if (recipients.length === 0) return;

  const title = `${params.actorName} adicionou você como membro da tarefa`;
  const body = params.ticketCode ? `#${params.ticketCode}` : null;

  await prisma.userNotification.createMany({
    data: recipients.map((userId) => ({
      tenantId: params.tenantId,
      userId,
      actorId: params.actorId,
      type: "TASK_MEMBER_ADDED",
      title,
      body,
      ticketId: params.ticketId,
      commentId: null,
    })),
  });
}
