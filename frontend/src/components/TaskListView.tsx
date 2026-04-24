"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { ConfirmModal } from "./ConfirmModal";
import { isTopicTicket } from "@/lib/ticketCodeDisplay";
import { collectTicketMemberNames } from "@/lib/ticketMemberNames";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { getTicketStatusDisplay, setKanbanCustomColumnsCache } from "@/lib/ticketStatusDisplay";

type TaskListViewProps = {
  tickets: PackageTicket[];
  projectId: string;
  onTicketClick?: (ticket: PackageTicket) => void;
  onTicketDelete?: (ticket: PackageTicket) => void;
};

export function TaskListView({ tickets, projectId, onTicketClick, onTicketDelete }: TaskListViewProps) {
  const [deleteTarget, setDeleteTarget] = useState<PackageTicket | null>(null);
  const { user } = useAuth();
  const hideMembers = user?.role === "CLIENTE";

  useEffect(() => {
    if (!projectId) return;
    const hasCustom = tickets.some((t) => String(t.status || "").startsWith("CUSTOM_"));
    if (!hasCustom) return;
    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/kanban-columns`, { signal: ac.signal });
        if (!r.ok) return;
        const data = (await r.json().catch(() => [])) as unknown;
        const cols = Array.isArray(data) ? (data as Array<{ id: string; label: string; color: string }>) : [];
        if (!cancelled) setKanbanCustomColumnsCache(projectId, cols);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [projectId, tickets]);
  
  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma tarefa encontrada.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="relative rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:shadow-md transition-all"
        >
          <button
            type="button"
            onClick={() => onTicketClick?.(ticket)}
            className="w-full text-left focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:ring-offset-1 focus:ring-offset-[color:var(--background)] rounded-lg"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  {!isTopicTicket(ticket.type) && (
                    <span className="text-xs font-mono font-semibold text-[color:var(--muted-foreground)]">#{ticket.code}</span>
                  )}
                  {(() => {
                    const st = getTicketStatusDisplay({ status: ticket.status, projectId });
                    return (
                  <span
                        className={`px-2 py-0.5 rounded text-xs font-medium text-white ${st.color}`}
                  >
                        {st.label}
                  </span>
                    );
                  })()}
                </div>
                <h4 className="text-sm font-medium text-[color:var(--foreground)] mb-1 line-clamp-1" title={ticket.title}>
                  {ticket.title}
                </h4>
                {ticket.description && (
                  <p className="text-xs text-[color:var(--muted-foreground)] line-clamp-2 mt-1" title={ticket.description}>
                    {ticket.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-[color:var(--muted-foreground)]">
                  <span>{ticket.type}</span>
                  {!hideMembers &&
                    (() => {
                      const names = collectTicketMemberNames(ticket);
                      if (names.length === 0) return null;
                      const label = names.join(", ");
                      return (
                        <span className="truncate max-w-[220px]" title={label}>
                          {label}
                        </span>
                      );
                    })()}
                  {ticket.criticidade && (
                    <span className="px-2 py-0.5 rounded border border-[color:var(--border)] bg-[color:var(--surface)]/60 text-[color:var(--foreground)]">
                      {ticket.criticidade}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
          {onTicketDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(ticket);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-md text-[color:var(--muted-foreground)] hover:text-red-300 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              title="Excluir tarefa"
              aria-label="Excluir tarefa"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      </div>
      
      {deleteTarget && (
        <ConfirmModal
          title="Excluir tarefa"
          message={`Tem certeza que deseja excluir a tarefa "${deleteTarget.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            onTicketDelete?.(deleteTarget);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
