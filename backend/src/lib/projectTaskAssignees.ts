import type { PrismaClient } from "@prisma/client";

/** Usuários que podem ser membros de tarefas: membro, responsável do projeto ou atribuição padrão. */
export async function getProjectTaskAssignableUserIds(
  prisma: PrismaClient,
  projectId: string,
  tenantId: string,
): Promise<Set<string>> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId } },
    select: {
      defaultTaskAssigneeId: true,
      members: { select: { userId: true } },
      responsibles: { select: { userId: true } },
    },
  });
  if (!project) return new Set();
  const ids = new Set<string>();
  for (const m of project.members) ids.add(m.userId);
  for (const r of project.responsibles) ids.add(r.userId);
  if (project.defaultTaskAssigneeId) ids.add(project.defaultTaskAssigneeId);
  return ids;
}

export async function assertUsersAreProjectTaskAssignees(
  prisma: PrismaClient,
  projectId: string,
  tenantId: string,
  userIds: string[],
): Promise<{ ok: true } | { ok: false; invalid: string[] }> {
  if (userIds.length === 0) return { ok: true };
  const assignable = await getProjectTaskAssignableUserIds(prisma, projectId, tenantId);
  const invalid = userIds.filter((id) => !assignable.has(id));
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true };
}

export const PROJECT_TASK_ASSIGNEE_ERROR =
  "Um ou mais responsáveis não pertencem ao projeto. Adicione-os como membro, responsável do projeto ou atribuição de tarefa.";
