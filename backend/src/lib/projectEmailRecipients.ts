import type { PrismaClient } from "@prisma/client";

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
      ativo: { not: false },
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
