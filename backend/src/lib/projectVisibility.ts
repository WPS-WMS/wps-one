import type { Prisma, PrismaClient } from "@prisma/client";
import { isConsultantLikeRole } from "./auth.js";

export type ProjectAuthUser = { id: string; role: string; tenantId: string };

/**
 * Escopo de `Project` (lista, detalhe, uploads) e filtro aninhado em `Ticket.project`.
 *
 * - SUPER_ADMIN: todos os projetos do tenant.
 * - GESTOR_PROJETOS: criou o projeto OU é responsável OU é membro.
 * - CONSULTOR / ADMIN_PORTAL: responsável OU membro.
 * - CLIENTE: projetos da empresa (cliente) à qual o usuário está vinculado.
 */
export function projectVisibilityWhere(user: ProjectAuthUser): Prisma.ProjectWhereInput {
  const tid = user.tenantId;
  const uid = user.id;
  const role = String(user.role ?? "").toUpperCase();

  if (role === "SUPER_ADMIN") {
    return { client: { tenantId: tid } };
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
  if (isConsultantLikeRole(role)) {
    return {
      client: { tenantId: tid },
      OR: [{ responsibles: { some: { userId: uid } } }, { members: { some: { userId: uid } } }],
    };
  }
  if (role === "CLIENTE") {
    return {
      client: {
        tenantId: tid,
        users: { some: { userId: uid } } },
    };
  }
  return { client: { tenantId: tid }, id: { in: [] } };
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
