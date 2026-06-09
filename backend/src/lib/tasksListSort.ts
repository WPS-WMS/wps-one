type TasksListSortTicket = {
  status?: unknown;
  dataFimPrevista?: Date | string | null;
  queuePriority?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

const CLOSED_STATUSES = new Set(["ENCERRADO", "FINALIZADAS"]);

const BACKLOG_STATUSES = new Set(["ABERTO", "EM_ANALISE", "APROVADO", "BACKLOG"]);

function statusUpper(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

function isClosedStatus(status: unknown): boolean {
  return CLOSED_STATUSES.has(statusUpper(status));
}

function isBacklogStatus(status: unknown): boolean {
  return BACKLOG_STATUSES.has(statusUpper(status));
}

function isOverdue(t: TasksListSortTicket): boolean {
  if (isClosedStatus(t.status)) return false;
  const due = t.dataFimPrevista;
  if (!due) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  const fimStr = String(due).slice(0, 10);
  return fimStr < todayStr;
}

/** Ordem: Atrasado (0) > Backlog (1) > demais ativos / colunas custom (2) > Finalizadas (3). */
export function getTasksListSortBucket(t: TasksListSortTicket): number {
  if (isOverdue(t)) return 0;
  const s = statusUpper(t.status);
  if (isClosedStatus(s)) return 3;
  if (isBacklogStatus(s)) return 1;
  return 2;
}

function compareQueuePriority(a: TasksListSortTicket, b: TasksListSortTicket): number {
  const pa = typeof a.queuePriority === "number" ? a.queuePriority : null;
  const pb = typeof b.queuePriority === "number" ? b.queuePriority : null;
  if (pa != null && pb != null && pa !== pb) return pa - pb;
  if (pa != null && pb == null) return -1;
  if (pa == null && pb != null) return 1;
  return 0;
}

function compareDateDesc(a: unknown, b: unknown): number {
  return String(b ?? "").localeCompare(String(a ?? ""));
}

export function sortTasksListRows<T extends TasksListSortTicket>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ba = getTasksListSortBucket(a);
    const bb = getTasksListSortBucket(b);
    if (ba !== bb) return ba - bb;

    const qp = compareQueuePriority(a, b);
    if (qp !== 0) return qp;

    if (ba === 3) {
      return compareDateDesc(a.updatedAt ?? a.createdAt, b.updatedAt ?? b.createdAt);
    }
    return compareDateDesc(a.createdAt, b.createdAt);
  });
}
