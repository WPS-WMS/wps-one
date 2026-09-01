import type { Prisma } from "@prisma/client";

/** Apontamentos visíveis em telas, totais e relatórios (não soft-deleted). */
export const ACTIVE_TIME_ENTRY_FILTER: Prisma.TimeEntryWhereInput = {
  deletedAt: null,
};

export function activeTimeEntryWhere(
  where: Prisma.TimeEntryWhereInput = {},
): Prisma.TimeEntryWhereInput {
  return { AND: [ACTIVE_TIME_ENTRY_FILTER, where] };
}
