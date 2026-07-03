import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";
import { loadAllMergedKanbanCustomColumns } from "@/lib/kanbanMergedStorage";

export type TaskFilterRow = {
  id?: string;
  code?: string | null;
  title?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  statusColor?: string | null;
  createdAt?: string | null;
  dataFimPrevista?: string | null;
  projectId?: string | null;
  project?: {
    id?: string;
    name?: string | null;
    client?: { id?: string; name?: string | null } | null;
  } | null;
  assignedTo?: { id?: string; name?: string | null } | null;
  responsibles?: Array<{ user?: { id?: string; name?: string | null } | null }> | null;
};

export type FilterOption = { id: string; label: string };

export const FIXED_KANBAN_COLUMNS = [
  { id: "BACKLOG", label: "Backlog" },
  { id: "EM_EXECUCAO", label: "Em execução" },
  { id: "FINALIZADAS", label: "Finalizadas" },
] as const;

export function collectMemberNames(t: TaskFilterRow): string {
  const names = new Set<string>();
  if (t.assignedTo?.name) names.add(t.assignedTo.name);
  if (t.responsibles) {
    for (const r of t.responsibles) {
      if (r?.user?.name) names.add(r.user.name);
    }
  }
  return Array.from(names.values()).join(", ");
}

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ticketDateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ymd = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return parseYmd(ymd);
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function matchesDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const date = ticketDateValue(value);
  if (!date) return false;
  const fromDate = from ? parseYmd(from) : null;
  const toDate = to ? parseYmd(to) : null;
  if (fromDate && date < fromDate) return false;
  if (toDate) {
    const end = new Date(toDate);
    end.setUTCDate(end.getUTCDate() + 1);
    if (date >= end) return false;
  }
  return true;
}

export function ticketMatchesSearch(t: TaskFilterRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const members = collectMemberNames(t).toLowerCase();
  return (
    String(t.code ?? "").toLowerCase().includes(q) ||
    String(t.title ?? "").toLowerCase().includes(q) ||
    String(t.project?.name ?? "").toLowerCase().includes(q) ||
    String(t.project?.client?.name ?? "").toLowerCase().includes(q) ||
    members.includes(q)
  );
}

export function ticketMatchesStatusFilter(t: TaskFilterRow, statusIds: string[]): boolean {
  if (statusIds.length === 0) return true;

  const statusUpper = String(t.status ?? "").toUpperCase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfTodayUtc = new Date(`${todayStr}T00:00:00.000Z`);
  const displayLabel = String(
    getTicketStatusDisplay({
      status: t.status,
      statusLabel: t.statusLabel,
      statusColor: t.statusColor,
      projectId: t.projectId ?? t.project?.id,
      dataFimPrevista: t.dataFimPrevista,
      allowOverdue: true,
    }).label ?? "",
  )
    .trim()
    .toLocaleLowerCase("pt-BR");

  for (const id of statusIds) {
    const up = id.toUpperCase();
    if (up.startsWith("__KANBAN_LABEL__:")) {
      const label = id.slice("__KANBAN_LABEL__:".length).trim().toLocaleLowerCase("pt-BR");
      if (label && displayLabel === label) return true;
      continue;
    }
    if (up === "__OPEN__" && ["ABERTO", "EM_ANALISE", "APROVADO"].includes(statusUpper)) return true;
    if (up === "BACKLOG" && ["ABERTO", "EM_ANALISE", "APROVADO", "BACKLOG"].includes(statusUpper)) return true;
    if (up === "__EXEC__" && ["EXECUCAO", "TESTE"].includes(statusUpper)) return true;
    if (up === "EM_EXECUCAO" && ["EXECUCAO", "TESTE", "EM_EXECUCAO", "EM_ANDAMENTO"].includes(statusUpper)) return true;
    if (up === "__DONE__" && statusUpper === "ENCERRADO") return true;
    if (up === "FINALIZADAS" && ["ENCERRADO", "FINALIZADAS"].includes(statusUpper)) return true;
    if (up === "__OVERDUE__") {
      if (statusUpper !== "ENCERRADO" && t.dataFimPrevista) {
        const due = ticketDateValue(t.dataFimPrevista);
        if (due && due < startOfTodayUtc) return true;
      }
      continue;
    }
    if (String(t.status ?? "") === id || statusUpper === up) return true;
  }
  return false;
}

export function ticketMatchesClientFilter(t: TaskFilterRow, clientIds: string[], selectableClientIds: string[]): boolean {
  if (clientIds.length === 0) return true;
  const clientTodosChecked =
    selectableClientIds.length > 0 && selectableClientIds.every((id) => clientIds.includes(id));
  if (clientTodosChecked) return true;
  const clientId = String(t.project?.client?.id ?? "").trim();
  return clientId !== "" && clientIds.includes(clientId);
}

export type TasksClientFilterState = {
  q: string;
  statusIds: string[];
  clientIds: string[];
  createdFrom: string;
  createdTo: string;
  dueFrom: string;
  dueTo: string;
};

export function applyTasksClientFilters<T extends TaskFilterRow>(
  rows: T[],
  filters: TasksClientFilterState,
  selectableClientIds: string[],
): T[] {
  return rows.filter((t) => {
    if (!ticketMatchesSearch(t, filters.q)) return false;
    if (!ticketMatchesStatusFilter(t, filters.statusIds)) return false;
    if (!ticketMatchesClientFilter(t, filters.clientIds, selectableClientIds)) return false;
    if (!matchesDateRange(t.createdAt, filters.createdFrom, filters.createdTo)) return false;
    if (!matchesDateRange(t.dataFimPrevista, filters.dueFrom, filters.dueTo)) return false;
    return true;
  });
}

export function buildStatusOptions(rows: TaskFilterRow[]): FilterOption[] {
  const base: FilterOption[] = [
    { id: "", label: "Todos" },
    { id: "__OVERDUE__", label: "Atrasados" },
    ...FIXED_KANBAN_COLUMNS.map((c) => ({ id: c.id, label: c.label })),
  ];

  const toKanbanLabelToken = (label: string) => `__KANBAN_LABEL__:${label}`;
  const normalizeLabelKey = (label: string) => label.trim().toLocaleLowerCase("pt-BR");

  const customColumns = loadAllMergedKanbanCustomColumns()
    .filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
    .map((c) => ({ id: String(c.id), label: String(c.label) }));
  const customByLabelKey = new Map<string, FilterOption>();
  for (const c of customColumns) {
    const key = normalizeLabelKey(c.label);
    if (!key || customByLabelKey.has(key)) continue;
    customByLabelKey.set(key, { id: toKanbanLabelToken(c.label.trim()), label: c.label.trim() });
  }
  const custom = Array.from(customByLabelKey.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );

  const inferredFromRows = Array.from(
    new Set(
      rows
        .map((r) => String(r.status ?? "").trim())
        .filter((s) => s && s.startsWith("CUSTOM_")),
    ),
  ).map((id) => {
    const st = getTicketStatusDisplay({
      status: id,
      projectId: rows.find((x) => x.status === id)?.projectId ?? rows.find((x) => x.status === id)?.project?.id,
    });
    const label = String(st.label || id).trim();
    return { id: toKanbanLabelToken(label), label };
  });

  const byId = new Map<string, FilterOption>();
  for (const o of [...base, ...custom, ...inferredFromRows]) {
    if (!o.id) continue;
    if (!byId.has(o.id)) byId.set(o.id, o);
  }
  return [{ id: "", label: "Todos" }, ...Array.from(byId.values()).filter((o) => o.id !== "")];
}

export function extractClientsFromRows(rows: TaskFilterRow[]): FilterOption[] {
  const byId = new Map<string, FilterOption>();
  for (const t of rows) {
    const c = t.project?.client;
    if (c?.id && c?.name) byId.set(c.id, { id: c.id, label: c.name });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
