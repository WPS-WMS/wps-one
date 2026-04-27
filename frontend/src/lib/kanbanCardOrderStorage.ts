import type { PackageTicket } from "@/components/PackageCard";

/** Mesmo mapeamento do Kanban: status da tarefa → id da coluna. */
export const STATUS_TO_KANBAN_COLUMN: Record<string, string> = {
  ABERTO: "BACKLOG",
  EM_ANALISE: "BACKLOG",
  APROVADO: "BACKLOG",
  EXECUCAO: "EM_EXECUCAO",
  TESTE: "EM_EXECUCAO",
  ENCERRADO: "FINALIZADAS",
};

const DEFAULT_COLUMN_IDS = new Set(["BACKLOG", "EM_EXECUCAO", "FINALIZADAS"]);

export function statusToKanbanColumnId(status: string): string {
  const s = String(status ?? "").trim();
  if (DEFAULT_COLUMN_IDS.has(s)) return s;
  return STATUS_TO_KANBAN_COLUMN[s] ?? s;
}

export function buildKanbanOrderStorageBaseKey(params: {
  userId: string | null | undefined;
  kanbanAggregateMode: boolean;
  aggregateProjectIds: string[];
  projectId: string;
}): string {
  const uid = (params.userId && String(params.userId).trim()) || "anon";
  if (params.kanbanAggregateMode) {
    const agg = [...params.aggregateProjectIds].filter(Boolean).sort().join("|");
    return `wps_kanban_card_order:v1:agg:${uid}:${agg}`;
  }
  return `wps_kanban_card_order:v1:proj:${uid}:${String(params.projectId || "").trim()}`;
}

/** columnId → lista ordenada de ticket ids (priorização individual no browser). */
export type KanbanColumnOrderMap = Record<string, string[]>;

export function loadKanbanOrderMap(baseKey: string): KanbanColumnOrderMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(baseKey);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: KanbanColumnOrderMap = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map(String).filter(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveKanbanOrderMap(baseKey: string, map: KanbanColumnOrderMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(baseKey, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/** Aplica ordem gravada; tickets sem entrada na lista mantêm a ordem relativa original (ex.: vindos da API). */
export function applyOrderToTickets(columnId: string, tickets: PackageTicket[], map: KanbanColumnOrderMap): PackageTicket[] {
  const orderRaw = map[columnId] ?? [];
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const order = orderRaw.filter((id) => byId.has(id));
  const seen = new Set(order);
  const out: PackageTicket[] = [];
  for (const id of order) {
    const t = byId.get(id);
    if (t) out.push(t);
  }
  const rest = tickets.filter((t) => !seen.has(t.id));
  return [...out, ...rest];
}

export function removeTicketFromAllColumns(map: KanbanColumnOrderMap, ticketId: string): KanbanColumnOrderMap {
  const next: KanbanColumnOrderMap = { ...map };
  for (const [c, ids] of Object.entries(next)) {
    next[c] = ids.filter((id) => id !== ticketId);
  }
  return next;
}

/**
 * Reordena dentro da coluna: `draggedId` fica imediatamente antes de `insertBeforeId`.
 * `insertBeforeId` null → fim da lista.
 */
export function reorderWithinColumnMap(
  map: KanbanColumnOrderMap,
  columnId: string,
  draggedId: string,
  insertBeforeId: string | null,
  columnTicketIdsOrdered: string[],
): KanbanColumnOrderMap {
  const without = columnTicketIdsOrdered.filter((id) => id !== draggedId);
  let insertIdx = without.length;
  if (insertBeforeId && insertBeforeId !== draggedId) {
    const i = without.indexOf(insertBeforeId);
    if (i >= 0) insertIdx = i;
  }
  const next = { ...map, [columnId]: [...without.slice(0, insertIdx), draggedId, ...without.slice(insertIdx)] };
  return next;
}

/**
 * Após mudar de coluna (status): remove o id de todas as listas e insere na coluna destino na posição desejada.
 * `orderedDestTicketIds` = ordem visual atual na coluna destino **já com** o cartão contado nessa coluna (ex.: pending).
 */
export function insertTicketIntoColumnOrder(
  map: KanbanColumnOrderMap,
  toColumnId: string,
  ticketId: string,
  insertBeforeId: string | null,
  orderedDestTicketIds: string[],
): KanbanColumnOrderMap {
  const cleaned = removeTicketFromAllColumns(map, ticketId);
  const without = orderedDestTicketIds.filter((id) => id !== ticketId);
  let insertIdx = without.length;
  if (insertBeforeId && insertBeforeId !== ticketId) {
    const i = without.indexOf(insertBeforeId);
    if (i >= 0) insertIdx = i;
  }
  return { ...cleaned, [toColumnId]: [...without.slice(0, insertIdx), ticketId, ...without.slice(insertIdx)] };
}
