/** Filtros da Lista de Tarefas lembrados no navegador (por usuário). */

export type ListaTarefasSavedFilters = {
  q: string;
  statusIds: string[];
  memberIds: string[];
  clientIds: string[];
  createdFrom: string;
  createdTo: string;
  dueFrom: string;
  dueTo: string;
  showAdvanced?: boolean;
};

const STORAGE_PREFIX = "wps:lista-tarefas:filters:v1:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function loadListaTarefasSavedFilters(userId: string): ListaTarefasSavedFilters | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ListaTarefasSavedFilters>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      statusIds: isStringArray(parsed.statusIds) ? parsed.statusIds : [],
      memberIds: isStringArray(parsed.memberIds) ? parsed.memberIds : [],
      clientIds: isStringArray(parsed.clientIds) ? parsed.clientIds : [],
      createdFrom: typeof parsed.createdFrom === "string" ? parsed.createdFrom : "",
      createdTo: typeof parsed.createdTo === "string" ? parsed.createdTo : "",
      dueFrom: typeof parsed.dueFrom === "string" ? parsed.dueFrom : "",
      dueTo: typeof parsed.dueTo === "string" ? parsed.dueTo : "",
      showAdvanced: Boolean(parsed.showAdvanced),
    };
  } catch {
    return null;
  }
}

export function saveListaTarefasSavedFilters(userId: string, filters: ListaTarefasSavedFilters): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(filters));
  } catch {
    // ignore quota / private mode
  }
}

export function clearListaTarefasSavedFilters(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

export function hasListaTarefasSavedFilters(userId: string): boolean {
  return loadListaTarefasSavedFilters(userId) != null;
}
