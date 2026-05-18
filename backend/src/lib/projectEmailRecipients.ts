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

/**
 * Carrega o quadro do projeto direto do banco (evita include incompleto / dados desatualizados).
 * Inclui todos os perfis (CLIENTE, CONSULTOR, etc.) sem filtrar por role.
 */
export async function loadProjectRosterEmails(
  prisma: PrismaClient,
  projectId: string,
): Promise<string[]> {
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
