import type { PrismaClient } from "@prisma/client";

/**
 * Remove vínculos do usuário em projetos e tarefas ao inativar.
 * Evita que continue aparecendo em quadros e deixe de receber e-mails de notificação.
 */
export async function detachUserFromProjectsAndTickets(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { userId } }),
    prisma.projectResponsible.deleteMany({ where: { userId } }),
    prisma.ticketResponsible.deleteMany({ where: { userId } }),
    prisma.ticket.updateMany({
      where: { assignedToId: userId },
      data: { assignedToId: null },
    }),
  ]);
}
