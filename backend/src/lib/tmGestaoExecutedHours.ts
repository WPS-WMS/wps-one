import type { Prisma } from "@prisma/client";

/** Tipos de projeto incluídos na Gestão T&M. */
export const TM_PROJECT_TIPOS = ["TIME_MATERIAL", "AMS"] as const;

/** Tópicos/subtarefas não entram no «executado» (só tarefas/chamados). */
const TASK_TICKET_TYPES_EXCLUDED = ["SUBPROJETO", "SUBTAREFA"] as const;

/**
 * Apontamentos que contam para Mensal/Executado na Gestão T&M:
 * - projeto T&M ou AMS (lista já filtrada por `projectIds`);
 * - data no intervalo [dateGte, dateLt);
 * - ligados a uma tarefa do mesmo projeto (não tópico).
 */
export function timeEntryExecWhereForTm(
  projectIds: string[],
  dateGte: Date,
  dateLt: Date,
): Prisma.TimeEntryWhereInput {
  if (projectIds.length === 0) {
    return { id: { in: [] } };
  }
  return {
    projectId: { in: projectIds },
    date: { gte: dateGte, lt: dateLt },
    project: { tipoProjeto: { in: [...TM_PROJECT_TIPOS] } },
    ticketId: { not: null },
    ticket: {
      projectId: { in: projectIds },
      type: { notIn: [...TASK_TICKET_TYPES_EXCLUDED] },
    },
  };
}
