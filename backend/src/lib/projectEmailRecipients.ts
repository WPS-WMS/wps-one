import type { PrismaClient } from "@prisma/client";
import type { EmailRecipientRole, EmailTrigger } from "./emailNotificationRules.js";

/** Destinatários de e-mail por vínculo no projeto (responsáveis / membros). */

export function uniqEmails(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .map((e) => String(e ?? "").trim().toLowerCase())
        .filter((e) => e && e.includes("@")),
    ),
  );
}

type ProjectUserRow = {
  id: string;
  user: { id?: string; email: string | null | undefined; ativo?: boolean | null };
};

function activeUserEmails(rows: ProjectUserRow[] | null | undefined): string[] {
  return uniqEmails(
    [...(rows ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((r) => r.user.ativo !== false)
      .map((r) => r.user.email),
  );
}

/** Responsáveis + membros do projeto (todos os vínculos ativos com e-mail). */
export function collectProjectResponsibleAndMemberEmails(project: {
  responsibles?: ProjectUserRow[];
  members?: ProjectUserRow[];
} | null | undefined): string[] {
  return uniqEmails([
    ...activeUserEmails(project?.responsibles),
    ...activeUserEmails(project?.members),
  ]);
}

export type ProjectNotificationRosterStats = {
  userCount: number;
  clienteCount: number;
  clienteMissingEmail: number;
  /** Clientes com acesso à empresa (ClientUser), mesmo sem ProjectMember explícito. */
  clienteViaClientAccessCount: number;
};

function isValidEmail(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim().includes("@");
}

/**
 * Responsáveis + membros do projeto (query única em `User`, com tenant).
 * Inclui perfil CLIENTE vinculado ao projeto (ProjectMember/Responsible) e usuários CLIENTE
 * com acesso à empresa do projeto via ClientUser (mesmo critério do portal do cliente).
 */
export async function loadProjectNotificationEmails(
  prisma: PrismaClient,
  args: { tenantId: string; projectId: string; ticketId?: string },
): Promise<{ emails: string[]; stats: ProjectNotificationRosterStats }> {
  const project = await prisma.project.findFirst({
    where: { id: args.projectId, client: { tenantId: args.tenantId } },
    select: { id: true, clientId: true },
  });
  if (!project) {
    return {
      emails: [],
      stats: { userCount: 0, clienteCount: 0, clienteMissingEmail: 0, clienteViaClientAccessCount: 0 },
    };
  }

  const rosterOr: Array<Record<string, unknown>> = [
    { projectMemberships: { some: { projectId: args.projectId } } },
    { projectResponsibles: { some: { projectId: args.projectId } } },
    {
      role: { equals: "CLIENTE", mode: "insensitive" },
      clientAccess: { some: { clientId: project.clientId } },
    },
  ];

  if (args.ticketId) {
    rosterOr.push({
      ticketResponsibles: { some: { ticketId: args.ticketId } },
    });
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId: args.tenantId,
      ativo: true,
      OR: rosterOr,
    },
    select: {
      id: true,
      email: true,
      role: true,
      projectMemberships: { where: { projectId: args.projectId }, select: { id: true } },
      projectResponsibles: { where: { projectId: args.projectId }, select: { id: true } },
      clientAccess: { where: { clientId: project.clientId }, select: { id: true } },
    },
    orderBy: { id: "asc" },
  });

  const emails = uniqEmails(users.map((u) => u.email));
  const clienteUsers = users.filter((u) => String(u.role ?? "").toUpperCase() === "CLIENTE");
  const clienteMissingEmail = clienteUsers.filter((u) => !isValidEmail(u.email)).length;
  const clienteViaClientAccessCount = clienteUsers.filter(
    (u) =>
      u.clientAccess.length > 0 &&
      u.projectMemberships.length === 0 &&
      u.projectResponsibles.length === 0,
  ).length;

  return {
    emails,
    stats: {
      userCount: users.length,
      clienteCount: clienteUsers.length,
      clienteMissingEmail,
      clienteViaClientAccessCount,
    },
  };
}

/**
 * Carrega o quadro do projeto direto do banco (evita include incompleto / dados desatualizados).
 * Inclui todos os perfis (CLIENTE, CONSULTOR, etc.) sem filtrar por role.
 */
export async function loadProjectRosterEmails(
  prisma: PrismaClient,
  projectId: string,
  tenantId?: string,
): Promise<string[]> {
  if (tenantId) {
    const { emails } = await loadProjectNotificationEmails(prisma, { tenantId, projectId });
    return emails;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { client: { select: { tenantId: true } } },
  });
  const tid = project?.client?.tenantId;
  if (tid) {
    const { emails } = await loadProjectNotificationEmails(prisma, { tenantId: tid, projectId });
    return emails;
  }

  const [responsibles, members] = await Promise.all([
    prisma.projectResponsible.findMany({
      where: { projectId },
      select: { id: true, user: { select: { id: true, email: true, ativo: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { id: true, user: { select: { id: true, email: true, ativo: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return collectProjectResponsibleAndMemberEmails({ responsibles, members });
}

/** Garante vínculo ClientUser ao salvar membro CLIENTE (evita remoção no modal de edição). */
export async function syncClienteMembersClientAccess(
  prisma: PrismaClient,
  args: { tenantId: string; clientId: string; userIds: string[] },
): Promise<void> {
  const ids = Array.from(new Set(args.userIds.map((x) => String(x ?? "").trim()).filter(Boolean)));
  if (ids.length === 0) return;

  const clienteUsers = await prisma.user.findMany({
    where: {
      id: { in: ids },
      tenantId: args.tenantId,
      role: { equals: "CLIENTE", mode: "insensitive" },
    },
    select: { id: true },
  });
  if (clienteUsers.length === 0) return;

  await prisma.clientUser.createMany({
    data: clienteUsers.map((u) => ({ userId: u.id, clientId: args.clientId })),
    skipDuplicates: true,
  });
}

/** Somente o responsável principal do projeto (primeiro vínculo ativo em `ProjectResponsible`). */
export function primaryProjectResponsibleEmail(
  rows: ProjectUserRow[] | null | undefined,
  opts?: { excludeUserId?: string },
): string | null {
  const sorted = [...(rows ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sorted) {
    if (r.user.ativo === false) continue;
    if (opts?.excludeUserId && r.user.id === opts.excludeUserId) continue;
    const raw = String(r.user?.email ?? "").trim();
    if (raw.includes("@")) return raw;
  }
  if (opts?.excludeUserId) {
    for (const r of sorted) {
      if (r.user.ativo === false) continue;
      const raw = String(r.user?.email ?? "").trim();
      if (raw.includes("@")) return raw;
    }
  }
  return null;
}

export function primaryProjectResponsibleEmailList(
  rows: ProjectUserRow[] | null | undefined,
  opts?: { excludeUserId?: string },
): string[] {
  const email = primaryProjectResponsibleEmail(rows, opts);
  return email ? [email] : [];
}

type RosterUser = {
  id: string;
  email: string | null;
  role: string;
  projectMemberships: Array<{ id: string }>;
  projectResponsibles: Array<{ id: string }>;
  clientAccess: Array<{ id: string }>;
  ticketResponsibles: Array<{ id: string }>;
};

type RecipientRoleMatchContext = {
  /** Consultor padrão em chamados do cliente (Project.defaultTaskAssigneeId). */
  defaultTaskAssigneeId?: string | null;
  trigger?: EmailTrigger | string;
};

function isDefaultTaskAssignee(userId: string, ctx?: RecipientRoleMatchContext): boolean {
  const defaultId = String(ctx?.defaultTaskAssigneeId ?? "").trim();
  return Boolean(defaultId && userId === defaultId);
}

function userMatchesRecipientRole(
  user: RosterUser,
  role: EmailRecipientRole,
  ctx?: RecipientRoleMatchContext,
): boolean {
  const roleUpper = String(user.role ?? "").trim().toUpperCase();
  const isCliente = roleUpper === "CLIENTE";
  const isProjectResponsible = user.projectResponsibles.length > 0;
  const isTicketResponsible = user.ticketResponsibles.length > 0;
  const isProjectMember = user.projectMemberships.length > 0;
  const hasClientAccess = user.clientAccess.length > 0;
  const isDefaultAssignee = isDefaultTaskAssignee(user.id, ctx);

  if (role === "RESPONSAVEL") {
    if (isDefaultAssignee) {
      if (isProjectResponsible) return true;
      if (ctx?.trigger === "CRIACAO") return false;
      return isTicketResponsible;
    }
    return isProjectResponsible || isTicketResponsible;
  }
  if (role === "MEMBRO") {
    if (isDefaultAssignee) return false;
    return isProjectMember && !isCliente;
  }
  if (role === "CLIENTE") {
    return isCliente && (isProjectMember || isProjectResponsible || hasClientAccess || isTicketResponsible);
  }
  return false;
}

/**
 * E-mails do projeto filtrados pelos tipos de destinatário configurados em Configurações → E-mails.
 */
export async function loadProjectEmailsForRecipientRoles(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    projectId: string;
    ticketId?: string;
    recipientRoles: EmailRecipientRole[];
    excludeUserId?: string;
    trigger?: EmailTrigger | string;
  },
): Promise<{ emails: string[]; stats: ProjectNotificationRosterStats }> {
  const roles = args.recipientRoles.filter(Boolean);
  if (roles.length === 0) {
    return {
      emails: [],
      stats: { userCount: 0, clienteCount: 0, clienteMissingEmail: 0, clienteViaClientAccessCount: 0 },
    };
  }

  const project = await prisma.project.findFirst({
    where: { id: args.projectId, client: { tenantId: args.tenantId } },
    select: { id: true, clientId: true, defaultTaskAssigneeId: true },
  });
  if (!project) {
    return {
      emails: [],
      stats: { userCount: 0, clienteCount: 0, clienteMissingEmail: 0, clienteViaClientAccessCount: 0 },
    };
  }

  const roleMatchCtx: RecipientRoleMatchContext = {
    defaultTaskAssigneeId: project.defaultTaskAssigneeId,
    trigger: args.trigger,
  };

  const rosterOr: Array<Record<string, unknown>> = [
    { projectMemberships: { some: { projectId: args.projectId } } },
    { projectResponsibles: { some: { projectId: args.projectId } } },
    {
      role: { equals: "CLIENTE", mode: "insensitive" },
      clientAccess: { some: { clientId: project.clientId } },
    },
  ];

  if (args.ticketId) {
    rosterOr.push({
      ticketResponsibles: { some: { ticketId: args.ticketId } },
    });
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId: args.tenantId,
      ativo: true,
      OR: rosterOr,
    },
    select: {
      id: true,
      email: true,
      role: true,
      projectMemberships: { where: { projectId: args.projectId }, select: { id: true } },
      projectResponsibles: { where: { projectId: args.projectId }, select: { id: true } },
      clientAccess: { where: { clientId: project.clientId }, select: { id: true } },
      ...(args.ticketId
        ? { ticketResponsibles: { where: { ticketId: args.ticketId }, select: { id: true } } }
        : {}),
    },
    orderBy: { id: "asc" },
  });

  const matched = users.filter((u) => {
    if (args.excludeUserId && u.id === args.excludeUserId) return false;
    const rosterUser: RosterUser = {
      id: u.id,
      email: u.email,
      role: u.role,
      projectMemberships: u.projectMemberships,
      projectResponsibles: u.projectResponsibles,
      clientAccess: u.clientAccess,
      ticketResponsibles: "ticketResponsibles" in u ? (u.ticketResponsibles as Array<{ id: string }>) : [],
    };
    return roles.some((role) => userMatchesRecipientRole(rosterUser, role, roleMatchCtx));
  });

  const emails = uniqEmails(matched.map((u) => u.email));
  const clienteUsers = matched.filter((u) => String(u.role ?? "").toUpperCase() === "CLIENTE");
  const clienteMissingEmail = clienteUsers.filter((u) => !isValidEmail(u.email)).length;
  const clienteViaClientAccessCount = clienteUsers.filter(
    (u) =>
      u.clientAccess.length > 0 &&
      u.projectMemberships.length === 0 &&
      u.projectResponsibles.length === 0,
  ).length;

  return {
    emails,
    stats: {
      userCount: matched.length,
      clienteCount: clienteUsers.length,
      clienteMissingEmail,
      clienteViaClientAccessCount,
    },
  };
}
