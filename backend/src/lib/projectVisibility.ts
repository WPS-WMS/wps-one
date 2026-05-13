import type { Prisma, PrismaClient } from "@prisma/client";
import { isConsultantLikeRole } from "./auth.js";

export type ProjectAuthUser = { id: string; role: string; tenantId: string };

const tenantProject = (tenantId: string): Prisma.ProjectWhereInput => ({
  client: { tenantId },
});

/** Partilhado: assignee, criador ou responsável na tarefa. */
function ticketParticipantOr(uid: string): Prisma.TicketWhereInput[] {
  return [
    { assignedToId: uid },
    { createdById: uid },
    { responsibles: { some: { userId: uid } } },
  ];
}

/**
 * Home / “minhas tarefas”: só quem está na tarefa como **executante** ou **membro explícito**
 * (`TicketResponsible`), não apenas criador da tarefa (nem membro só do projeto).
 */
export function ticketHomeMemberOr(uid: string): Prisma.TicketWhereInput[] {
  return [{ assignedToId: uid }, { responsibles: { some: { userId: uid } } }];
}

/**
 * Escopo de **Project** (Lista de Projetos, detalhe do projeto, uploads).
 *
 * - SUPER_ADMIN: todos os projetos do tenant.
 * - GESTOR_PROJETOS: criou o projeto OU responsável OU membro do projeto.
 * - CONSULTOR / ADMIN_PORTAL: responsável OU membro do projeto.
 * - CLIENTE: projetos da empresa à qual está vinculado.
 */
export function projectVisibilityWhere(user: ProjectAuthUser): Prisma.ProjectWhereInput {
  const tid = user.tenantId;
  const uid = user.id;
  const role = String(user.role ?? "").toUpperCase();

  if (role === "SUPER_ADMIN") {
    return tenantProject(tid);
  }
  if (role === "GESTOR_PROJETOS") {
    return {
      client: { tenantId: tid },
      OR: [
        { createdById: uid },
        { responsibles: { some: { userId: uid } } },
        { members: { some: { userId: uid } } },
      ],
    };
  }
  if (isConsultantLikeRole(user.role)) {
    return {
      client: { tenantId: tid },
      OR: [{ responsibles: { some: { userId: uid } } }, { members: { some: { userId: uid } } }],
    };
  }
  if (role === "CLIENTE") {
    return {
      client: {
        tenantId: tid,
        users: { some: { userId: uid } },
      },
    };
  }
  return { client: { tenantId: tid }, id: { in: [] } };
}

/**
 * Filtro de **Ticket** para Kanban, Dashboard Daily e Lista de tarefas (e `GET /api/tickets`).
 * Combina membro/responsável (e criador, para gestor) **no projeto** com **membro da tarefa**
 * (assignee, criador da tarefa, responsáveis da tarefa).
 */
export function ticketTaskListWhere(user: ProjectAuthUser): Prisma.TicketWhereInput {
  const tid = user.tenantId;
  const uid = user.id;
  const role = String(user.role ?? "").toUpperCase();
  const tProj = tenantProject(tid);

  if (role === "SUPER_ADMIN") {
    return { project: tProj };
  }
  if (role === "CLIENTE") {
    return {
      AND: [
        { project: tProj },
        {
          OR: [
            { project: { client: { users: { some: { userId: uid } } } } },
            { createdById: uid },
          ],
        },
      ],
    };
  }
  const taskPart = ticketParticipantOr(uid);
  if (role === "GESTOR_PROJETOS") {
    return {
      AND: [
        { project: tProj },
        {
          OR: [
            {
              project: {
                OR: [
                  { createdById: uid },
                  { responsibles: { some: { userId: uid } } },
                  { members: { some: { userId: uid } } },
                ],
              },
            },
            ...taskPart,
          ],
        },
      ],
    };
  }
  if (isConsultantLikeRole(user.role)) {
    return {
      AND: [
        { project: tProj },
        {
          OR: [
            {
              project: {
                OR: [{ responsibles: { some: { userId: uid } } }, { members: { some: { userId: uid } } }],
              },
            },
            ...taskPart,
          ],
        },
      ],
    };
  }
  return { project: { ...tProj, id: { in: [] } } };
}

/** Leitura de um ticket (detalhe, PATCH, orçamento, anexos). Mesma lógica que {@link ticketTaskListWhere}. */
export function ticketDetailWhere(ticketId: string, user: ProjectAuthUser): Prisma.TicketWhereInput {
  return { id: ticketId, ...ticketTaskListWhere(user) };
}

export async function userCanAccessProject(
  prisma: PrismaClient,
  user: ProjectAuthUser,
  projectId: string,
): Promise<boolean> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, ...projectVisibilityWhere(user) },
    select: { id: true },
  });
  return Boolean(row);
}

export async function userCanReadTicket(
  prisma: PrismaClient,
  user: ProjectAuthUser,
  ticketId: string,
): Promise<boolean> {
  const row = await prisma.ticket.findFirst({
    where: ticketDetailWhere(ticketId, user),
    select: { id: true },
  });
  return Boolean(row);
}
