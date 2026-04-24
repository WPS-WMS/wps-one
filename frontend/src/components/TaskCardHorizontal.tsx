"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { ConfirmModal } from "./ConfirmModal";
import { isTopicTicket } from "@/lib/ticketCodeDisplay";
import { collectTicketMemberNames, formatMemberNamesChip } from "@/lib/ticketMemberNames";
import { useAuth } from "@/contexts/AuthContext";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";

type TaskCardHorizontalProps = {
  ticket: PackageTicket;
  projectId: string;
  projectName?: string;
  onClick?: (ticket: PackageTicket) => void;
  onDelete?: (ticket: PackageTicket) => void;
};

function formatHorasDecimalToHm(value: number | null | undefined): string {
  const v = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const totalMinutes = Math.round(v * 60);
  const horas = Math.floor(totalMinutes / 60);
  const minutos = totalMinutes % 60;
  return `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}h`;
}

function normalizePriority(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function getPriorityDotClass(priorityRaw: unknown): string {
  const p = normalizePriority(priorityRaw);
  if (p === "URGENTE" || p === "CRITICA") return "bg-red-500";
  if (p === "ALTA") return "bg-orange-500";
  if (p === "MEDIA") return "bg-amber-500";
  if (p === "BAIXA") return "bg-[color:var(--primary)]";
  return "bg-slate-400";
}

function formatPtBrDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

export function TaskCardHorizontal({ ticket, projectId, onClick, onDelete }: TaskCardHorizontalProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { user } = useAuth();
  const hideMembers = user?.role === "CLIENTE";

  const statusDisplay = getTicketStatusDisplay({
    status: ticket.status,
    statusLabel: (ticket as any).statusLabel,
    statusColor: (ticket as any).statusColor,
    projectId,
    dataFimPrevista: ticket.dataFimPrevista,
    allowOverdue: true,
  });
  const memberChip = formatMemberNamesChip(collectTicketMemberNames(ticket));

  return (
    <div className="w-full">
      <div className="flex rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden hover:shadow-md transition-all">
        <div className={`w-2 flex-shrink-0 ${statusDisplay.color}`} aria-hidden />
        <button
          type="button"
          onClick={() => onClick?.(ticket)}
          className={`flex-1 min-w-0 grid gap-x-4 items-start py-3 px-4 text-left focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:ring-offset-1 focus:ring-offset-[color:var(--background)] ${hideMembers ? "grid-cols-[1fr_14rem_7rem_6rem]" : "grid-cols-[1fr_14rem_7rem_8rem_6rem]"}`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {!isTopicTicket(ticket.type) && (
                <span className="text-xs font-mono font-semibold text-[color:var(--muted-foreground)] shrink-0">#{ticket.code}</span>
              )}
              <span className="text-sm font-semibold text-[color:var(--foreground)] truncate" title={ticket.title}>
                {ticket.title}
              </span>
            </div>
            <div className="mt-1">
              <p className="text-[color:var(--foreground)] font-medium text-sm truncate">{statusDisplay.label}</p>
            </div>
            {(ticket.finalizacaoMotivo || ticket.finalizacaoObservacao) && (
              <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-[11px] leading-snug text-emerald-200 max-w-full">
                {ticket.finalizacaoMotivo && (
                  <p className="font-medium line-clamp-2">
                    Motivo: <span className="font-normal">{ticket.finalizacaoMotivo}</span>
                  </p>
                )}
                {ticket.finalizacaoObservacao && (
                  <p className="mt-0.5 text-emerald-200/90 line-clamp-2">Obs.: {ticket.finalizacaoObservacao}</p>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 flex gap-4">
            <div>
              <p className="text-[color:var(--muted-foreground)] text-xs">Orçado</p>
              <p className="text-[color:var(--foreground)] font-medium text-sm">
                {formatHorasDecimalToHm(ticket.estimativaHoras ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[color:var(--muted-foreground)] text-xs">Executado</p>
              <p className="text-[color:var(--foreground)] font-medium text-sm">
                {formatHorasDecimalToHm(ticket.totalHorasApontadas ?? 0)}
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[color:var(--muted-foreground)] text-xs">Prioridade</p>
            <p className="inline-flex items-center gap-1.5 font-medium text-[color:var(--foreground)] text-sm">
              {ticket.criticidade != null && ticket.criticidade !== "" ? (
                <>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${getPriorityDotClass(ticket.criticidade)}`} aria-hidden />
                  <span className="truncate">{ticket.criticidade}</span>
                </>
              ) : (
                <span className="text-[color:var(--muted-foreground)]">—</span>
              )}
            </p>
          </div>
          {!hideMembers && (
            <div className="min-w-0">
              <p className="text-[color:var(--muted-foreground)] text-xs">Membros</p>
              <p
                className="text-[color:var(--foreground)] font-medium text-sm truncate"
                title={memberChip.title ?? memberChip.display ?? undefined}
              >
                {memberChip.display ?? "—"}
              </p>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[color:var(--muted-foreground)] text-xs">Entrega</p>
            <p className="text-[color:var(--foreground)] font-medium text-sm">
              {formatPtBrDate(ticket.dataFimPrevista)}
            </p>
          </div>
        </button>
        {onDelete && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteModal(true);
              }}
              className="shrink-0 px-3 text-[color:var(--muted-foreground)] hover:text-red-300 hover:bg-red-500/10 flex items-center transition-colors"
              title="Excluir tarefa"
              aria-label="Excluir tarefa"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {showDeleteModal && (
              <ConfirmModal
                title="Excluir tarefa"
                message={`Tem certeza que deseja excluir a tarefa "${ticket.title}"? Esta ação não pode ser desfeita.`}
                confirmLabel="Excluir"
                cancelLabel="Cancelar"
                variant="danger"
                onConfirm={() => {
                  onDelete(ticket);
                  setShowDeleteModal(false);
                }}
                onCancel={() => setShowDeleteModal(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
