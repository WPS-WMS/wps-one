import { loadKanbanCustomColumns, type KanbanColumn } from "./ticketStatusDisplay";

/** Une colunas customizadas salvas no `localStorage` de vários projetos (primeiro rótulo/cor vence por id). */
export function loadMergedKanbanCustomColumns(projectIds: string[]): KanbanColumn[] {
  const byId = new Map<string, KanbanColumn>();
  for (const pid of projectIds) {
    if (!pid) continue;
    for (const col of loadKanbanCustomColumns(pid)) {
      if (!byId.has(col.id)) byId.set(col.id, col);
    }
  }
  return Array.from(byId.values());
}

/**
 * Une colunas customizadas do Kanban varrendo o `localStorage` (keys `kanban_columns_<projectId>`).
 * Útil em telas "globais" (ex.: Lista de Tarefas) onde não queremos depender das tarefas carregadas
 * para descobrir todos os status/colunas existentes no Kanban.
 */
export function loadAllMergedKanbanCustomColumns(): KanbanColumn[] {
  if (typeof window === "undefined") return [];
  const byId = new Map<string, KanbanColumn>();
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("kanban_columns_")) continue;
      const projectId = key.slice("kanban_columns_".length);
      if (!projectId) continue;
      for (const col of loadKanbanCustomColumns(projectId)) {
        if (!byId.has(col.id)) byId.set(col.id, col);
      }
    }
  } catch {
    return Array.from(byId.values());
  }
  return Array.from(byId.values());
}

/**
 * Une ordens de colunas salvas por projeto: percorre os projetos na ordem dada e acrescenta ids ainda não vistos.
 */
export function loadMergedKanbanColumnOrder(projectIds: string[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const pid of projectIds) {
    if (!pid || typeof window === "undefined") continue;
    try {
      const raw = window.localStorage.getItem(`kanban_column_order_${pid}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const id of parsed) {
        if (typeof id !== "string" || seen.has(id)) continue;
        seen.add(id);
        order.push(id);
      }
    } catch {
      /* ignore */
    }
  }
  return order;
}
