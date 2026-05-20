import type { Prisma, PrismaClient } from "@prisma/client";

type DeactivationDb = PrismaClient | Prisma.TransactionClient;

/**
 * Remove vínculos do usuário em projetos e tarefas ao inativar.
 * Evita que continue aparecendo em quadros e deixe de receber e-mails de notificação.
 * (Sem `$transaction` interno — pode ser chamado dentro de uma transação existente.)
 */
export async function detachUserFromProjectsAndTickets(
  db: DeactivationDb,
  userId: string,
): Promise<void> {
  await db.projectMember.deleteMany({ where: { userId } });
  await db.projectResponsible.deleteMany({ where: { userId } });
  await db.ticketResponsible.deleteMany({ where: { userId } });
  await db.ticket.updateMany({
    where: { assignedToId: userId },
    data: { assignedToId: null },
  });
}
