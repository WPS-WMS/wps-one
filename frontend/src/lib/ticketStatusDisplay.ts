export type KanbanColumn = {
  id: string;
  label: string;
  color: string; // ex: "bg-blue-500"
};

const BASE_STATUS_LABEL: Record<string, string> = {
  ABERTO: "Em aberto",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  EXECUCAO: "Em execução",
  TESTE: "Teste",
  ENCERRADO: "Finalizado",
};

const BASE_STATUS_COLOR: Record<string, string> = {
  ABERTO: "bg-slate-500",
  EM_ANALISE: "bg-amber-500",
  APROVADO: "bg-cyan-500",
  EXECUCAO: "bg-blue-500",
  TESTE: "bg-purple-500",
  ENCERRADO: "bg-emerald-500",
};

const DEFAULT_COLUMN_LABEL: Record<string, string> = {
  BACKLOG: "Em aberto",
  EM_EXECUCAO: "Em execução",
  FINALIZADAS: "Finalizadas",
};

const DEFAULT_COLUMN_COLOR: Record<string, string> = {
  BACKLOG: "bg-slate-500",
  EM_EXECUCAO: "bg-blue-500",
  FINALIZADAS: "bg-emerald-500",
};

export function loadKanbanCustomColumns(projectId: string): KanbanColumn[] {
  if (!projectId) return [];
  if (typeof window === "undefined") return [];
  // Cache global preenchido pelo Kanban (colunas vindas do backend).
  const w = window as any;
  const cache: Record<string, KanbanColumn[]> | undefined = w.__WPS_KANBAN_COLUMNS_CACHE__;
  if (cache && Array.isArray(cache[projectId]) && cache[projectId].length > 0) {
    return cache[projectId];
  }
  return [];
}

export function setKanbanCustomColumnsCache(projectId: string, cols: KanbanColumn[]) {
  if (!projectId) return;
  if (typeof window === "undefined") return;
  const w = window as any;
  w.__WPS_KANBAN_COLUMNS_CACHE__ = w.__WPS_KANBAN_COLUMNS_CACHE__ || {};
  w.__WPS_KANBAN_COLUMNS_CACHE__[projectId] = Array.isArray(cols) ? cols : [];
}

function decodeCustomColumnLabelFromId(statusRaw: string): string | null {
  const raw = String(statusRaw ?? "").trim();
  const m = /^CUSTOM_(.+)_(\d{10,})$/i.exec(raw);
  if (!m) return null;
  const core = String(m[1] || "").trim();
  if (!core) return null;
  const words = core
    .split("_")
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const label = words.join(" ").trim();
  return label || null;
}

function isPastDue(dateIso: string): boolean {
  const todayStr = new Date().toISOString().slice(0, 10);
  const fimStr = String(dateIso).slice(0, 10);
  return fimStr < todayStr;
}

export function getTicketStatusDisplay(input: {
  status: unknown;
  statusLabel?: unknown;
  statusColor?: unknown;
  projectId?: string;
  dataFimPrevista?: string | null;
  /**
   * Quando true e a tarefa não está encerrada, sobrescreve para "Atrasado"
   * (mantém o comportamento do Kanban, mas usando o status real no resto).
   */
  allowOverdue?: boolean;
}): { label: string; color: string; sortBucket: number } {
  const statusRaw = String(input.status ?? "").trim();
  const s = statusRaw.toUpperCase();
  if (statusRaw.startsWith("CUSTOM_")) {
    const labelFromApi = typeof input.statusLabel === "string" ? input.statusLabel.trim() : "";
    const colorFromApi = typeof input.statusColor === "string" ? input.statusColor.trim() : "";
    if (labelFromApi || colorFromApi) {
      return {
        label: labelFromApi || decodeCustomColumnLabelFromId(statusRaw) || statusRaw,
        color: colorFromApi || "bg-slate-400",
        sortBucket: 0,
      };
    }
  }

  const isClosed = s === "ENCERRADO" || s === "FINALIZADAS";
  if (input.allowOverdue && input.dataFimPrevista && !isClosed && isPastDue(input.dataFimPrevista)) {
    return { label: "Atrasado", color: "bg-rose-500", sortBucket: 0 };
  }

  // Status padrão (enum legado)
  if (BASE_STATUS_LABEL[s]) {
    const bucket = s === "ENCERRADO" ? 2 : s === "ABERTO" ? 1 : 0;
    return { label: BASE_STATUS_LABEL[s], color: BASE_STATUS_COLOR[s] ?? "bg-slate-400", sortBucket: bucket };
  }

  // Colunas padrão do Kanban (quando o status foi salvo como id de coluna)
  if (DEFAULT_COLUMN_LABEL[s]) {
    const bucket = s === "FINALIZADAS" ? 2 : s === "BACKLOG" ? 1 : 0;
    return { label: DEFAULT_COLUMN_LABEL[s], color: DEFAULT_COLUMN_COLOR[s] ?? "bg-slate-400", sortBucket: bucket };
  }

  // Coluna customizada do Kanban (status = id da coluna, ex: CUSTOM_MINHA_COLUNA_1712345678901)
  // Primeiro tenta ler do localStorage (label exata); se não existir (outro usuário/perfil),
  // decodifica o label a partir do próprio ID para evitar expor o identificador técnico ao cliente.
  const decoded = decodeCustomColumnLabelFromId(statusRaw);

  // Coluna customizada do Kanban (status = id da coluna)
  const pid = input.projectId ? String(input.projectId) : "";
  if (pid) {
    const custom = loadKanbanCustomColumns(pid).find((c) => c.id === statusRaw);
    if (custom) {
      return { label: custom.label, color: custom.color || "bg-slate-400", sortBucket: 0 };
    }
  }

  if (decoded) {
    return { label: decoded, color: "bg-slate-400", sortBucket: 0 };
  }

  // Fallback: exibe o próprio status (sem forçar backlog/em execução)
  return { label: statusRaw || "—", color: "bg-slate-400", sortBucket: 0 };
}

