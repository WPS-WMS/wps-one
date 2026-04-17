"use client";

import { useState, useEffect, useMemo } from "react";
import { Trash2, Plus, LayoutGrid, FileText, Clock, Calendar, User, Check, GripVertical } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { CreateTaskModalFull } from "./CreateTaskModalFull";
import { CreateColumnModal } from "./CreateColumnModal";
import { ConfirmModal } from "./ConfirmModal";
import { EditTaskModalFull } from "./EditTaskModalFull";
import { FinalizeTaskModal } from "./FinalizeTaskModal";
import { apiFetch } from "@/lib/api";
import { isTopicTicket } from "@/lib/ticketCodeDisplay";
import { collectTicketMemberNames, formatMemberNamesChip } from "@/lib/ticketMemberNames";
import { useAuth } from "@/contexts/AuthContext";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";

// Mapeamento de status para as 3 colunas do Kanban
const STATUS_TO_COLUMN: Record<string, string> = {
  ABERTO: "BACKLOG",
  EM_ANALISE: "BACKLOG",
  APROVADO: "BACKLOG",
  EXECUCAO: "EM_EXECUCAO",
  TESTE: "EM_EXECUCAO",
  ENCERRADO: "FINALIZADAS",
};

const DEFAULT_COLUMNS = [
  { id: "BACKLOG", label: "Backlog", color: "bg-slate-500" },
  { id: "EM_EXECUCAO", label: "Em execução", color: "bg-blue-500" },
  { id: "FINALIZADAS", label: "Finalizadas", color: "bg-emerald-500" },
];

// Estilo do badge de criticidade nos cards
const CRITICIDADE_BADGE: Record<string, string> = {
  Baixa: "bg-blue-100 text-blue-700 border-blue-200",
  BAIXA: "bg-blue-100 text-blue-700 border-blue-200",
  Média: "bg-amber-100 text-amber-700 border-amber-200",
  MEDIA: "bg-amber-100 text-amber-700 border-amber-200",
  Alta: "bg-orange-100 text-orange-700 border-orange-200",
  ALTA: "bg-orange-100 text-orange-700 border-orange-200",
  Urgente: "bg-red-100 text-red-700 border-red-200",
  URGENTE: "bg-red-100 text-red-700 border-red-200",
};
// Cor da barra lateral do card (borda esquerda)
const CRITICIDADE_BORDER: Record<string, string> = {
  Baixa: "border-l-blue-500",
  BAIXA: "border-l-blue-500",
  Média: "border-l-amber-500",
  MEDIA: "border-l-amber-500",
  Alta: "border-l-orange-500",
  ALTA: "border-l-orange-500",
  Urgente: "border-l-red-500",
  URGENTE: "border-l-red-500",
};
function getCriticidadeBadgeClass(criticidade: string | null | undefined): string {
  if (!criticidade) return "bg-slate-100 text-slate-600 border-slate-200";
  return CRITICIDADE_BADGE[criticidade] ?? "bg-slate-100 text-slate-600 border-slate-200";
}
function getCriticidadeBorderClass(criticidade: string | null | undefined): string {
  if (!criticidade) return "border-l-slate-300";
  return CRITICIDADE_BORDER[criticidade] ?? "border-l-slate-300";
}

// Cor do círculo de prioridade no card (estilo referência)
function getPriorityDotClass(criticidade: string | null | undefined): string {
  if (!criticidade) return "bg-slate-400";
  const map: Record<string, string> = {
    Urgente: "bg-red-500", URGENTE: "bg-red-500",
    Alta: "bg-orange-500", ALTA: "bg-orange-500",
    Média: "bg-amber-500", MEDIA: "bg-amber-500",
    Baixa: "bg-blue-500", BAIXA: "bg-blue-500",
  };
  return map[criticidade] ?? "bg-slate-400";
}

function getColumnThemeByColor(colorClass: string): {
  container: string;
  headerBg: string;
  bodyBg: string;
} {
  // Tema atual: usamos tokens (dark fica "glass" e evita cinza desbotado).
  // Mantemos colorClass para o dot de status (coluna.color).
  return {
    container: "bg-[color:var(--surface)]/55 border-[color:var(--border)] backdrop-blur",
    headerBg: "bg-[color:var(--surface)]/45",
    bodyBg: "bg-[color:var(--surface)]/30",
  };
}

function formatDateShort(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return null;
  }
}

function formatHorasDecimalToHm(value: number | null | undefined): string {
  const v = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const totalMinutes = Math.round(v * 60);
  const horas = Math.floor(totalMinutes / 60);
  const minutos = totalMinutes % 60;
  return `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}h`;
}

type Column = {
  id: string;
  label: string;
  color: string;
};

type KanbanBoardProps = {
  tickets: PackageTicket[];
  projectId: string;
  /** `parent`: nomes vêm de `topicTitlesById` (KanbanWithFilters). `self`: busca /api/tickets (ProjectCard, tópico). */
  topicNamesMode?: "parent" | "self";
  topicTitlesById?: Record<string, string>;
  parentTicketId?: string;
  initialCreateStatus?: string | null;
  onCreateModalClose?: () => void;
  onTicketClick?: (ticket: PackageTicket) => void;
  onTicketDelete?: (ticket: PackageTicket) => void;
  onTicketCreated?: () => void;
};

export function KanbanBoard({
  tickets,
  projectId,
  topicNamesMode = "self",
  topicTitlesById,
  parentTicketId,
  initialCreateStatus,
  onCreateModalClose,
  onTicketClick,
  onTicketDelete,
  onTicketCreated,
}: KanbanBoardProps) {
  const { user } = useAuth();
  const hideMembers = user?.role === "CLIENTE";
  const [createModalStatus, setCreateModalStatus] = useState<string | null>(null);
  const [showCreateColumnModal, setShowCreateColumnModal] = useState(false);
  const [customColumns, setCustomColumns] = useState<Column[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [deleteTicketTarget, setDeleteTicketTarget] = useState<PackageTicket | null>(null);
  const [deleteColumnTarget, setDeleteColumnTarget] = useState<string | null>(null);
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverCustomColumnId, setDragOverCustomColumnId] = useState<string | null>(null);
  const [pendingStatusByTicket, setPendingStatusByTicket] = useState<Record<string, string>>({});
  const [editingTicket, setEditingTicket] = useState<PackageTicket | null>(null);
  const [hoursByTicket, setHoursByTicket] = useState<Record<string, number>>({});
  const [topicsMap, setTopicsMap] = useState<Record<string, string>>({});
  const [projectTipo, setProjectTipo] = useState<string>("");
  const [finalizeTarget, setFinalizeTarget] = useState<{ ticketId: string; newStatus: string } | null>(null);

  // Abrir modal de nova tarefa quando o header "+ Novo Card" for clicado
  useEffect(() => {
    if (initialCreateStatus) setCreateModalStatus(initialCreateStatus);
  }, [initialCreateStatus]);

  // Carrega colunas customizadas do localStorage
  useEffect(() => {
    const storageKey = `kanban_columns_${projectId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCustomColumns(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCustomColumns([]);
      }
    }
  }, [projectId]);

  // Carrega ordem das colunas (padrão + custom) do localStorage
  useEffect(() => {
    const orderKey = `kanban_column_order_${projectId}`;
    const saved = localStorage.getItem(orderKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setColumnOrder(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
      } catch {
        setColumnOrder([]);
      }
    } else {
      setColumnOrder([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProjectTipo("");
      return;
    }
    apiFetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProjectTipo(p ? String(p.tipoProjeto || "") : ""))
      .catch(() => setProjectTipo(""));
  }, [projectId]);

  useEffect(() => {
    if (topicNamesMode === "parent") {
      setTopicsMap(topicTitlesById ?? {});
      return;
    }
    if (!projectId) {
      setTopicsMap({});
      return;
    }

    apiFetch(`/api/tickets?projectId=${projectId}&light=true`)
      .then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((allTickets: PackageTicket[]) => {
        const topics: Record<string, string> = {};
        allTickets
          .filter((t) => t.type === "SUBPROJETO")
          .forEach((topic) => {
            topics[topic.id] = topic.title;
          });
        setTopicsMap(topics);
      })
      .catch((err) => {
        console.error("Erro ao buscar tópicos:", err);
        setTopicsMap({});
      });
  }, [projectId, topicNamesMode, topicTitlesById]);

  // Buscar horas apontadas em lote por ticket (evita N+1 requests)
  useEffect(() => {
    if (tickets.length === 0) {
      setHoursByTicket({});
      return;
    }

    const fetchHours = async () => {
      try {
        const res = await apiFetch(`/api/time-entries?projectId=${projectId}&aggregateBy=ticket`);
        if (!res.ok) {
          setHoursByTicket({});
          return;
        }
        const grouped = (await res.json()) as Array<{ ticketId: string; totalHoras: number }>;
        const visibleTicketIds = new Set(tickets.map((ticket) => ticket.id));
        const hoursMap = grouped.reduce<Record<string, number>>((acc, row) => {
          if (visibleTicketIds.has(row.ticketId)) acc[row.ticketId] = row.totalHoras ?? 0;
          return acc;
        }, {});
        setHoursByTicket(hoursMap);
      } catch (err) {
        console.error("Erro ao buscar horas agregadas por ticket:", err);
        setHoursByTicket({});
      }
    };

    void fetchHours();
  }, [tickets, projectId]);

  function saveColumnOrder(nextOrder: string[]) {
    const orderKey = `kanban_column_order_${projectId}`;
    localStorage.setItem(orderKey, JSON.stringify(nextOrder));
    setColumnOrder(nextOrder);
  }

  function reorderColumnsById(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const knownIds = [...DEFAULT_COLUMNS.map((c) => c.id), ...customColumns.map((c) => c.id)];
    const baseOrder = columnOrder.length > 0 ? columnOrder : knownIds;
    const normalized = Array.from(new Set([...baseOrder, ...knownIds])).filter((id) => knownIds.includes(id));
    const from = normalized.indexOf(sourceId);
    const to = normalized.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...normalized];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveColumnOrder(next);
  }

  const inferredCustomColumns: Column[] = useMemo(() => {
    const inferred = new Map<string, Column>();
    const known = new Set(customColumns.map((c) => c.id));
    for (const t of tickets) {
      const rawStatus = String((t as unknown as { status?: unknown })?.status ?? "");
      if (!rawStatus.startsWith("CUSTOM_")) continue;
      if (known.has(rawStatus)) continue;
      const st = getTicketStatusDisplay({ status: rawStatus, projectId, allowOverdue: false });
      inferred.set(rawStatus, { id: rawStatus, label: st.label, color: "bg-slate-400" });
    }
    return Array.from(inferred.values());
  }, [tickets, customColumns, projectId]);

  // Combina colunas padrão com customizadas (incluindo inferidas) e aplica a ordem salva
  const allColumns: Column[] = useMemo(() => {
    const cols = [...DEFAULT_COLUMNS, ...customColumns, ...inferredCustomColumns];
    if (columnOrder.length === 0) return cols;
    const byId = new Map(cols.map((c) => [c.id, c] as const));
    const ordered: Column[] = [];
    for (const id of columnOrder) {
      const col = byId.get(id);
      if (col) ordered.push(col);
    }
    for (const col of cols) {
      if (!ordered.some((x) => x.id === col.id)) ordered.push(col);
    }
    return ordered;
  }, [customColumns, inferredCustomColumns, columnOrder]);

  // Quando os tickets são recarregados pelo componente pai (após um PATCH bem-sucedido),
  // limpamos os statuses pendentes que já estão refletidos no dado "oficial".
  useEffect(() => {
    setPendingStatusByTicket((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const ticket of tickets) {
        const pending = next[ticket.id];
        if (pending && ticket.status === pending) {
          delete next[ticket.id];
        }
      }
      return next;
    });
  }, [tickets]);

  // Salva colunas customizadas no localStorage
  const saveCustomColumns = (columns: Column[]) => {
    const storageKey = `kanban_columns_${projectId}`;
    localStorage.setItem(storageKey, JSON.stringify(columns));
    setCustomColumns(columns);
    window.dispatchEvent(new CustomEvent("wps_kanban_columns_changed", { detail: { projectId } }));
  };

  // Adiciona uma nova coluna customizada
  const handleColumnCreated = (newColumn: Column) => {
    const updated = [...customColumns, newColumn];
    saveCustomColumns(updated);
  };

  // Remove uma coluna customizada
  const handleDeleteColumn = (columnId: string) => {
    setDeleteColumnTarget(columnId);
  };
  
  const confirmDeleteColumn = async () => {
    if (!deleteColumnTarget) return;
    
    const updated = customColumns.filter((c) => c.id !== deleteColumnTarget);
    saveCustomColumns(updated);
    
    // Move tarefas desta coluna para BACKLOG (ABERTO)
    const ticketsToMove = tickets.filter((t) => t.status === deleteColumnTarget);
    for (const ticket of ticketsToMove) {
      try {
        await apiFetch(`/api/tickets/${ticket.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ABERTO" }),
        });
      } catch (err) {
        console.error(`Erro ao mover ticket ${ticket.id}:`, err);
      }
    }
    
    setDeleteColumnTarget(null);
    onTicketCreated?.();
  };
  
  // Status efetivo: pendente de movimento (otimista) ou status real
  const effectiveStatus = (t: PackageTicket) => pendingStatusByTicket[t.id] ?? t.status;

  // Agrupa tickets por coluna baseado no mapeamento de status (com movimentos otimistas)
  const ticketsByColumn = useMemo(() => {
    const grouped: Record<string, PackageTicket[]> = {};
    for (const col of allColumns) grouped[col.id] = [];
    for (const ticket of tickets) {
      const status = effectiveStatus(ticket);
      const columnId = DEFAULT_COLUMNS.some((dc) => dc.id === status)
        ? status
        : STATUS_TO_COLUMN[status] ?? status;
      if (!grouped[columnId]) grouped[columnId] = [];
      grouped[columnId].push(ticket);
    }
    return grouped;
  }, [allColumns, tickets, pendingStatusByTicket]);

  const getStatusForColumn = (columnId: string, currentStatus: string = "ABERTO"): string => {
    // Colunas customizadas usam o próprio ID como status
    if (!DEFAULT_COLUMNS.some((dc) => dc.id === columnId)) {
      return columnId;
    }

    if (columnId === "BACKLOG") {
      return "ABERTO";
    }
    if (columnId === "EM_EXECUCAO") {
      return "EXECUCAO";
    }
    if (columnId === "FINALIZADAS") {
      return "ENCERRADO";
    }

    // Fallback para não quebrar caso futuramente existam outras colunas padrão
    return currentStatus;
  };

  const handleDropTicket = async (columnId: string) => {
    if (!draggingTicketId) return;
    const ticket = tickets.find((t) => t.id === draggingTicketId);
    if (!ticket) {
      setDraggingTicketId(null);
      setDragOverColumnId(null);
      return;
    }

    const newStatus = getStatusForColumn(columnId, ticket.status);
    const currentEffective = effectiveStatus(ticket);

    // Se o status não mudou, não faz nada
    if (!newStatus || newStatus === currentEffective) {
      setDraggingTicketId(null);
      setDragOverColumnId(null);
      return;
    }

    const requiresFinalizeReason =
      newStatus === "ENCERRADO" &&
      ticket.status !== "ENCERRADO" &&
      (projectTipo === "AMS" || projectTipo === "TIME_MATERIAL");
    if (requiresFinalizeReason) {
      setFinalizeTarget({ ticketId: ticket.id, newStatus });
      setDraggingTicketId(null);
      return;
    }

    setDragOverColumnId(null);
    // Atualização otimista: card muda de coluna na hora
    setPendingStatusByTicket((prev) => ({ ...prev, [ticket.id]: newStatus }));

    try {
      const customCol =
        !DEFAULT_COLUMNS.some((dc) => dc.id === columnId) ? allColumns.find((c) => c.id === columnId) : null;
      const res = await apiFetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(customCol?.label ? { statusLabel: customCol.label } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error("Falha ao atualizar status do ticket");
      }
      onTicketCreated?.();
    } catch (err) {
      console.error("Erro ao mover tarefa no kanban:", err);
      setPendingStatusByTicket((prev) => {
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
      alert("Não foi possível mover a tarefa. Tente novamente.");
    } finally {
      setDraggingTicketId(null);
    }
  };

  return (
    <div className="flex gap-5 overflow-x-auto pb-6 pt-1" style={{ scrollbarGutter: "stable" }}>
      {allColumns.map((column) => {
        const isCustomColumn = !DEFAULT_COLUMNS.some((dc) => dc.id === column.id);
        const columnTickets = ticketsByColumn[column.id] || [];
        const isDropTarget = draggingTicketId && columnTickets.every((t) => t.id !== draggingTicketId);
        const isFinalizadas = column.id === "FINALIZADAS";
        const theme =
          column.id === "BACKLOG"
            ? getColumnThemeByColor("bg-slate-500")
            : column.id === "EM_EXECUCAO"
            ? getColumnThemeByColor("bg-blue-500")
            : column.id === "FINALIZADAS"
            ? getColumnThemeByColor("bg-emerald-500")
            : getColumnThemeByColor(column.color);

        return (
          <div
            key={column.id}
            className={`flex-shrink-0 w-[280px] rounded-xl border overflow-hidden shadow-sm transition-shadow ${theme.container} ${
              draggingTicketId ? "shadow-md" : ""
            }`}
          >
            {/* Cabeçalho da coluna - estilo referência */}
            <div
              className={`${theme.headerBg} border-b border-[color:var(--border)] px-4 py-3 ${
                "cursor-default"
              } ${dragOverCustomColumnId === column.id ? "ring-2 ring-[color:var(--primary)] ring-inset" : ""}`}
              onDragOver={(e) => {
                // Edge: getData pode vir vazio durante dragover; usamos o estado.
                if (!draggingColumnId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={() => {
                if (draggingColumnId) setDragOverCustomColumnId(column.id);
              }}
              onDragLeave={() => {
                if (draggingColumnId) setDragOverCustomColumnId(null);
              }}
              onDrop={(e) => {
                const movingId = draggingColumnId || e.dataTransfer.getData("application/x-kanban-column");
                if (!movingId) return;
                e.preventDefault();
                reorderColumnsById(movingId, column.id);
                setDraggingColumnId(null);
                setDragOverCustomColumnId(null);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isFinalizadas && (
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" aria-hidden />
                  )}
                  <span
                    className="inline-flex shrink-0 cursor-grab active:cursor-grabbing"
                    title="Arraste para reordenar"
                    draggable
                    onDragStart={(e) => {
                      // Edge: drag fica mais confiável quando o draggable está no "handle"
                      e.dataTransfer.setData("application/x-kanban-column", column.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingColumnId(column.id);
                    }}
                    onDragEnd={() => {
                      setDraggingColumnId(null);
                      setDragOverCustomColumnId(null);
                    }}
                  >
                    <GripVertical className="h-4 w-4 text-[color:var(--muted-foreground)]" aria-hidden />
                  </span>
                  {isCustomColumn && (
                    <span className={`h-2 w-2 rounded-full ${column.color}`} aria-hidden />
                  )}
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)] truncate">
                    {column.label}
                  </h3>
                  <span className="flex-shrink-0 text-xs font-medium text-[color:var(--muted-foreground)]">
                    ({columnTickets.length})
                  </span>
                  {isCustomColumn && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteColumn(column.id);
                      }}
                      className="p-1 rounded-md text-[color:var(--muted-foreground)] hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0"
                      title="Excluir coluna"
                      aria-label="Excluir coluna"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const statusToCreate = getStatusForColumn(column.id);
                    setCreateModalStatus(statusToCreate);
                  }}
                  className="p-2 rounded-lg text-[color:var(--muted-foreground)] hover:text-[color:var(--primary)] hover:bg-[color:var(--surface)] transition-colors"
                  title="Nova tarefa"
                  aria-label="Nova tarefa"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col flex-1">
              <div
                className={`p-3 space-y-3 min-h-[180px] max-h-[calc(100vh-320px)] overflow-y-auto transition-all duration-200 rounded-b-xl ${
                  isDropTarget && dragOverColumnId === column.id
                    ? "bg-[color:var(--surface)] ring-2 ring-[color:var(--primary)] ring-inset"
                    : isDropTarget
                    ? "ring-2 ring-[color:var(--primary)]/60 ring-inset ring-dashed"
                    : theme.bodyBg
                }`}
                onDragEnter={() => setDragOverColumnId(column.id)}
                onDragLeave={() => setDragOverColumnId(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDropTicket(column.id);
                }}
              >
                {columnTickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma tarefa</p>
                    <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">Arraste cards aqui ou crie uma nova</p>
                  </div>
                ) : (
                  columnTickets.map((ticket) => {
                    const isDragging = draggingTicketId === ticket.id;
                    const dateStr = formatDateShort(ticket.dataFimPrevista);
                    const estimativaHoras = ticket.estimativaHoras != null ? ticket.estimativaHoras : null;
                    const horasApontadas = hoursByTicket[ticket.id] ?? 0;
                    return (
                      <div
                        key={ticket.id}
                        className={`relative rounded-xl bg-[color:var(--surface)]/85 border border-[color:var(--border)] p-3 shadow-sm transition-all duration-200 cursor-grab active:cursor-grabbing ${
                          isDragging
                            ? "opacity-90 scale-[1.02] shadow-xl ring-2 ring-[color:var(--primary)] z-10"
                            : "hover:shadow-md hover:border-[color:var(--border)]"
                        }`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", ticket.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingTicketId(ticket.id);
                        }}
                        onDragEnd={() => {
                          setDraggingTicketId(null);
                          setDragOverColumnId(null);
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onTicketClick?.(ticket);
                            setEditingTicket(ticket);
                          }}
                          className="w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset rounded-lg pr-8"
                        >
                          {/* Primeira linha: ID + nome da tarefa */}
                          <div className="flex items-center gap-2 mb-1">
                            {!isTopicTicket(ticket.type) && (
                              <span className="text-xs font-mono font-semibold text-[color:var(--muted-foreground)] shrink-0">
                                #{ticket.code}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-[color:var(--foreground)] line-clamp-2 truncate" title={ticket.title}>
                              {ticket.title}
                            </span>
                          </div>
                          {/* Segunda linha: prioridade (bolinha + nome) — só se tiver prioridade */}
                          {ticket.criticidade != null && ticket.criticidade !== "" && (
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${getPriorityDotClass(ticket.criticidade)}`}
                                aria-hidden
                              />
                              <span className="text-xs font-medium text-[color:var(--muted-foreground)]">{ticket.criticidade}</span>
                            </div>
                          )}
                          {/* Linha: tópico/tipo, Orçado/Executado, data, responsável */}
                          <div className="flex items-center flex-wrap gap-3 text-xs text-[color:var(--muted-foreground)]">
                            {ticket.parentTicketId && topicsMap[ticket.parentTicketId] ? (
                              <span className="inline-flex items-center gap-1" title={topicsMap[ticket.parentTicketId]}>
                                <FileText className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
                                <span className="truncate max-w-[150px]">{topicsMap[ticket.parentTicketId]}</span>
                              </span>
                            ) : ticket.type ? (
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
                                {ticket.type}
                              </span>
                            ) : null}
                            {(estimativaHoras != null || horasApontadas > 0) && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
                                {estimativaHoras != null && horasApontadas > 0 ? (
                                  <span>
                                    Orçado {formatHorasDecimalToHm(estimativaHoras)} · Executado{" "}
                                    {formatHorasDecimalToHm(horasApontadas)}
                                  </span>
                                ) : estimativaHoras != null ? (
                                  <span>Orçado {formatHorasDecimalToHm(estimativaHoras)}</span>
                                ) : (
                                  <span>Executado {formatHorasDecimalToHm(horasApontadas)}</span>
                                )}
                              </span>
                            )}
                            {dateStr && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
                                {dateStr}
                              </span>
                            )}
                            {!hideMembers &&
                              (() => {
                                const chip = formatMemberNamesChip(collectTicketMemberNames(ticket));
                                if (!chip.display) return null;
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 truncate max-w-[100px]"
                                    title={chip.title ?? chip.display}
                                  >
                                    <User className="h-3.5 w-3.5 text-[color:var(--muted-foreground)] flex-shrink-0" />
                                    <span className="truncate">{chip.display}</span>
                                  </span>
                                );
                              })()}
                          </div>
                          {(ticket.finalizacaoMotivo || ticket.finalizacaoObservacao) && (
                            <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-[11px] leading-snug text-emerald-900">
                              {ticket.finalizacaoMotivo && (
                                <p className="font-medium line-clamp-2">
                                  Motivo: <span className="font-normal">{ticket.finalizacaoMotivo}</span>
                                </p>
                              )}
                              {ticket.finalizacaoObservacao && (
                                <p className="mt-0.5 text-emerald-800/95 line-clamp-2">
                                  Obs.: {ticket.finalizacaoObservacao}
                                </p>
                              )}
                            </div>
                          )}
                        </button>
                        {onTicketDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTicketTarget(ticket);
                            }}
                            className="absolute top-3 right-3 p-1.5 rounded-lg text-[color:var(--muted-foreground)] hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            title="Excluir tarefa"
                            aria-label="Excluir tarefa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Botão para adicionar nova coluna */}
      <div className="flex-shrink-0 w-[280px]">
        <button
          type="button"
          onClick={() => setShowCreateColumnModal(true)}
          className="w-full h-full min-h-[220px] rounded-xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/35 hover:border-[color:var(--primary)]/60 hover:bg-[color:var(--surface)] transition-all flex flex-col items-center justify-center gap-3 text-[color:var(--muted-foreground)] hover:text-[color:var(--primary)] group"
        >
          <div className="rounded-full bg-[color:var(--surface)] p-3 group-hover:bg-[color:var(--surface)] transition-colors border border-[color:var(--border)]">
            <LayoutGrid className="h-6 w-6 text-[color:var(--muted-foreground)] group-hover:text-[color:var(--primary)]" />
          </div>
          <span className="text-sm font-semibold">Nova coluna</span>
          <span className="text-xs text-[color:var(--muted-foreground)] group-hover:text-[color:var(--primary)]/80">Adicione um status personalizado</span>
        </button>
      </div>
      
      {createModalStatus && (
        <CreateTaskModalFull
          projectId={projectId}
          initialStatus={createModalStatus}
          parentTicketId={parentTicketId}
          onClose={() => {
            setCreateModalStatus(null);
            onCreateModalClose?.();
          }}
          onSaved={() => {
            setCreateModalStatus(null);
            onCreateModalClose?.();
            onTicketCreated?.();
          }}
        />
      )}
      
      {showCreateColumnModal && (
        <CreateColumnModal
          projectId={projectId}
          onClose={() => setShowCreateColumnModal(false)}
          onSaved={(newColumn) => {
            handleColumnCreated(newColumn);
            setShowCreateColumnModal(false);
          }}
        />
      )}
      
      {deleteTicketTarget && (
        <ConfirmModal
          title="Excluir tarefa"
          message={`Tem certeza que deseja excluir a tarefa "${deleteTicketTarget.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            onTicketDelete?.(deleteTicketTarget);
            setDeleteTicketTarget(null);
          }}
          onCancel={() => setDeleteTicketTarget(null)}
        />
      )}
      
      {deleteColumnTarget && (
        <ConfirmModal
          title="Excluir coluna"
          message="Tem certeza que deseja excluir esta coluna? As tarefas nesta coluna serão movidas para Backlog."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmDeleteColumn}
          onCancel={() => setDeleteColumnTarget(null)}
        />
      )}

      {editingTicket && (
        <EditTaskModalFull
          ticket={editingTicket}
          projectId={projectId}
          onClose={() => setEditingTicket(null)}
          onSaved={() => {
            setEditingTicket(null);
            onTicketCreated?.();
          }}
        />
      )}

      <FinalizeTaskModal
        open={!!finalizeTarget}
        onClose={() => setFinalizeTarget(null)}
        onConfirm={async ({ motivo }) => {
          const target = finalizeTarget;
          if (!target) return;
          setFinalizeTarget(null);
          // Atualização otimista só após confirmação
          setPendingStatusByTicket((prev) => ({ ...prev, [target.ticketId]: target.newStatus }));
          try {
            const res = await apiFetch(`/api/tickets/${target.ticketId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: target.newStatus,
                finalizacaoMotivo: motivo,
              }),
            });
            if (!res.ok) throw new Error("Falha ao finalizar a tarefa");
            onTicketCreated?.();
          } catch (err) {
            console.error("Erro ao finalizar tarefa:", err);
            setPendingStatusByTicket((prev) => {
              const next = { ...prev };
              delete next[target.ticketId];
              return next;
            });
            alert("Não foi possível finalizar a tarefa. Tente novamente.");
          }
        }}
      />
    </div>
  );
}
