import type { Prisma, PrismaClient } from "@prisma/client";
import { isConsultantLikeRole } from "./auth.js";
import { hasGlobalViewAccess, isFeatureAllowed } from "./permissions.js";

export type ProjectAuthUser = { id: string; role: string; tenantId: string };

const tenantProject = (tenantId: string): Prisma.ProjectWhereInput => ({
  client: { tenantId },
});

/** CLIENTE: todas as tarefas dos projetos da empresa (ClientUser) à qual está vinculado. */
function clientCompanyTicketsWhere(uid: string, tenantId: string): Prisma.TicketWhereInput {
  return {
    project: {
      client: {
        tenantId,
        users: { some: { userId: uid } },
      },
    },
  };
}

/**
 * Home / Lista de tarefas: usuário cadastrado só como **Membro** do projeto (não Responsável)
 * vê apenas tarefas em que é executante ou membro explícito da tarefa (`TicketResponsible`).
 */
export function ticketHomeMemberOr(uid: string): Prisma.TicketWhereInput[] {
  return [{ assignedToId: uid }, { responsibles: { some: { userId: uid } } }];
}

/** Projeto em que o usuário é Membro mas não Responsável (nem criador, no caso de gestor). */
function projectMemberOnlyWhere(uid: string, role: string): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [
    { members: { some: { userId: uid } } },
    { responsibles: { none: { userId: uid } } },
  ];
  if (role === "GESTOR_PROJETOS") {
    and.push({ createdById: { not: uid } });
  }
  return { AND: and };
}

/** Na Home / Lista de tarefas: responsável (ou gestor criador) vê todas as tarefas do projeto. */
function projectSeeAllTasksOnHomeWhere(uid: string, role: string): Prisma.ProjectWhereInput {
  if (role === "GESTOR_PROJETOS") {
    return {
      OR: [{ createdById: uid }, { responsibles: { some: { userId: uid } } }],
    };
  }
  return { responsibles: { some: { userId: uid } } };
}

function projectStaffAccessOr(uid: string, role: string): Prisma.ProjectWhereInput[] {
  if (role === "GESTOR_PROJETOS") {
    return [
      { createdById: uid },
      { responsibles: { some: { userId: uid } } },
      { members: { some: { userId: uid } } },
    ];
  }
  return [{ responsibles: { some: { userId: uid } } }, { members: { some: { userId: uid } } }];
}

/** Todos os projetos do tenant (feature `projeto.verTodos` ou SUPER_ADMIN). */
export async function hasAllTenantProjectsView(user: ProjectAuthUser): Promise<boolean> {
  return hasGlobalViewAccess({
    tenantId: user.tenantId,
    role: user.role,
    featureId: "projeto.verTodos",
  });
}

/**
 * Acesso à tela Projeto > Lista de Tarefas (`projeto.listaTarefas`).
 */
export async function canAccessTasksListScreen(user: ProjectAuthUser): Promise<boolean> {
  const role = String(user.role ?? "").toUpperCase();
  if (role === "SUPER_ADMIN") return true;
  return isFeatureAllowed({
    tenantId: user.tenantId,
    role: user.role,
    featureId: "projeto.listaTarefas",
  });
}

/**
 * Ver todas as tarefas de todos os usuários na Lista de Tarefas.
 * Exige `projeto.listaTarefas` + `tarefa.verTodos` (ou SUPER_ADMIN).
 */
export async function hasAllUsersTasksListView(user: ProjectAuthUser): Promise<boolean> {
  const role = String(user.role ?? "").toUpperCase();
  if (role === "SUPER_ADMIN") return true;
  const [canScreen, canAllUsers] = await Promise.all([
    canAccessTasksListScreen(user),
    isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureId: "tarefa.verTodos",
    }),
  ]);
  return canScreen && canAllUsers;
}

/**
 * Todas as tarefas/tópicos do tenant: `tarefa.verTodos` ou `projeto.verTodos`
 * (ver todos os projetos implica ver todas as tarefas vinculadas).
 */
export async function hasAllTenantTasksView(user: ProjectAuthUser): Promise<boolean> {
  if (await hasAllTenantProjectsView(user)) return true;
  return hasGlobalViewAccess({
    tenantId: user.tenantId,
    role: user.role,
    featureId: "tarefa.verTodos",
  });
}

/**
 * Escopo de **Project** (Lista de Projetos, detalhe do projeto, uploads).
 *
 * - SUPER_ADMIN: todos os projetos do tenant.
 * - GESTOR_PROJETOS: criou o projeto OU responsável OU membro do projeto.
 * - CONSULTOR / ADMIN_PORTAL: responsável OU membro do projeto.
 * - CLIENTE: projetos da empresa à qual está vinculado.
 */
export async function getProjectVisibilityWhere(user: ProjectAuthUser): Promise<Prisma.ProjectWhereInput> {
  if (await hasAllTenantProjectsView(user)) {
    return tenantProject(user.tenantId);
  }
  return projectVisibilityWhere(user);
}

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
      OR: projectStaffAccessOr(uid, role),
    };
  }
  if (isConsultantLikeRole(user.role)) {
    return {
      client: { tenantId: tid },
      OR: projectStaffAccessOr(uid, role),
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
 * Tarefas visíveis no Kanban, detalhe do projeto, `GET /api/tickets?projectId=…` e leitura.
 * - CLIENTE: todas as tarefas dos projetos da empresa vinculada (somente leitura na UI; PATCH bloqueado).
 * - Staff: vínculo no projeto (responsável ou membro). Participação só na tarefa não abre o projeto.
 */
export async function getTicketTaskListWhere(user: ProjectAuthUser): Promise<Prisma.TicketWhereInput> {
  if (await hasAllTenantTasksView(user)) {
    return { project: tenantProject(user.tenantId) };
  }
  return ticketTaskListWhere(user);
}

export async function getTicketHomeAndListaWhere(user: ProjectAuthUser): Promise<Prisma.TicketWhereInput> {
  if (await hasAllTenantTasksView(user)) {
    return { project: tenantProject(user.tenantId) };
  }
  return ticketHomeAndListaWhere(user);
}

export function ticketTaskListWhere(user: ProjectAuthUser): Prisma.TicketWhereInput {
  const tid = user.tenantId;
  const uid = user.id;
  const role = String(user.role ?? "").toUpperCase();
  const tProj = tenantProject(tid);

  if (role === "SUPER_ADMIN") {
    return { project: tProj };
  }
  if (role === "CLIENTE") {
    return clientCompanyTicketsWhere(uid, tid);
  }
  if (role === "GESTOR_PROJETOS" || isConsultantLikeRole(user.role)) {
    return {
      AND: [{ project: tProj }, { project: { OR: projectStaffAccessOr(uid, role) } }],
    };
  }
  return { project: { ...tProj, id: { in: [] } } };
}

/**
 * Home e Lista de tarefas (agregado): responsável/criador vê todas as tarefas do projeto;
 * **Membro** do projeto vê só tarefas em que é membro da tarefa (assignee / TicketResponsible).
 */
export function ticketHomeAndListaWhere(user: ProjectAuthUser): Prisma.TicketWhereInput {
  const tid = user.tenantId;
  const uid = user.id;
  const role = String(user.role ?? "").toUpperCase();
  const tProj = tenantProject(tid);

  if (role === "SUPER_ADMIN") {
    return { project: tProj };
  }
  if (role === "CLIENTE") {
    return clientCompanyTicketsWhere(uid, tid);
  }
  if (role === "GESTOR_PROJETOS" || isConsultantLikeRole(user.role)) {
    return {
      AND: [
        { project: tProj },
        {
          OR: [
            { project: projectSeeAllTasksOnHomeWhere(uid, role) },
            {
              AND: [{ project: projectMemberOnlyWhere(uid, role) }, { OR: ticketHomeMemberOr(uid) }],
            },
          ],
        },
      ],
    };
  }
  return { project: { ...tProj, id: { in: [] } } };
}

/**
 * Lista de Tarefas sem `tarefa.verTodos`: apenas tarefas em que o usuário é membro
 * (responsável, criador ou assignee) — vale para Administrativo, Consultor, etc.
 */
export function ticketListaMemberOnlyWhere(user: ProjectAuthUser): Prisma.TicketWhereInput {
  const uid = user.id;
  const tProj = tenantProject(user.tenantId);
  return {
    AND: [
      { project: tProj },
      {
        OR: [
          { assignedToId: uid },
          { createdById: uid },
          { responsibles: { some: { userId: uid } } },
        ],
      },
    ],
  };
}

/**
 * Escopo da tela Projeto > Lista de Tarefas (`GET /api/tickets/tasks-list`).
 * - Sem `projeto.listaTarefas`: vazio (rota já bloqueia com 403).
 * - Com tela, sem `tarefa.verTodos`: só tarefas em que é membro.
 * - Com ambos: todas as tarefas do tenant.
 */
export async function getTasksListWhere(user: ProjectAuthUser): Promise<Prisma.TicketWhereInput> {
  if (!(await canAccessTasksListScreen(user))) {
    return { project: { client: { tenantId: user.tenantId }, id: { in: [] } } };
  }
  if (await hasAllUsersTasksListView(user)) {
    return { project: tenantProject(user.tenantId) };
  }
  return ticketListaMemberOnlyWhere(user);
}

/** Leitura/PATCH: membro do projeto + ticket no escopo {@link ticketTaskListWhere}. */
export async function ticketDetailWhere(ticketId: string, user: ProjectAuthUser): Promise<Prisma.TicketWhereInput> {
  const scope = await getTicketTaskListWhere(user);
  return { id: ticketId, ...scope };
}

export async function userCanAccessProject(
  prisma: PrismaClient,
  user: ProjectAuthUser,
  projectId: string,
): Promise<boolean> {
  const visibility = await getProjectVisibilityWhere(user);
  const row = await prisma.project.findFirst({
    where: { id: projectId, ...visibility },
    select: { id: true },
  });
  return Boolean(row);
}

export async function userCanReadTicket(
  prisma: PrismaClient,
  user: ProjectAuthUser,
  ticketId: string,
): Promise<boolean> {
  const where = await ticketDetailWhere(ticketId, user);
  const row = await prisma.ticket.findFirst({
    where,
    select: { id: true },
  });
  return Boolean(row);
}
