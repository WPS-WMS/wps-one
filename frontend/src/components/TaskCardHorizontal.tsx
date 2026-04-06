"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { ConfirmModal } from "./ConfirmModal";

type TaskCardHorizontalProps = {
  ticket: PackageTicket;
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

// Mapeamento de status da tarefa para coluna do Kanban
const STATUS_TO_COLUMN: Record<string, string> = {
  ABERTO: "BACKLOG",
  EM_ANALISE: "BACKLOG",
  APROVADO: "BACKLOG",
  EXECUCAO: "EM_EXECUCAO",
  TESTE: "EM_EXECUCAO",
  ENCERRADO: "FINALIZADAS",
};

function getKanbanStatus(
  ticketStatus: string,
  dataFimPrevista?: string | null,
): { column: string; label: string; color: string } {
  // Atrasado: dataFimPrevista passada (comparação só por data) e não encerrado
  if (dataFimPrevista && ticketStatus !== "ENCERRADO") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const fimStr = String(dataFimPrevista).slice(0, 10);
    if (fimStr < todayStr) {
      return { column: "EM_EXECUCAO", label: "Atrasado", color: "bg-rose-500" };
    }
  }

  const column = STATUS_TO_COLUMN[ticketStatus] || "BACKLOG";

  switch (column) {
    case "BACKLOG":
      return { column: "BACKLOG", label: "Backlog", color: "bg-slate-500" };
    case "EM_EXECUCAO":
      return { column: "EM_EXECUCAO", label: "Em execução", color: "bg-blue-500" };
    case "FINALIZADAS":
      return { column: "FINALIZADAS", label: "Finalizada", color: "bg-emerald-500" };
    default:
      return { column: "BACKLOG", label: "Backlog", color: "bg-slate-400" };
  }
}

export function TaskCardHorizontal({ ticket, onClick, onDelete }: TaskCardHorizontalProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const kanbanStatus = getKanbanStatus(ticket.status, ticket.dataFimPrevista);

  return (
    <div className="w-full">
      <div className="flex rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 transition-all">
        <div className={`w-2 flex-shrink-0 ${kanbanStatus.color}`} aria-hidden />
        <button
          type="button"
          onClick={() => onClick?.(ticket)}
          className="flex-1 min-w-0 grid grid-cols-[1fr_14rem_7rem_8rem_6rem] gap-x-4 items-start py-3 px-4 text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-slate-600 shrink-0">#{ticket.code}</span>
              <span className="text-sm font-semibold text-slate-800 truncate" title={ticket.title}>
                {ticket.title}
              </span>
            </div>
            <div className="mt-1">
              <p className="text-slate-800 font-medium text-sm truncate">{kanbanStatus.label}</p>
            </div>
            {(ticket.finalizacaoMotivo || ticket.finalizacaoObservacao) && (
              <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-[11px] leading-snug text-emerald-900 max-w-full">
                {ticket.finalizacaoMotivo && (
                  <p className="font-medium line-clamp-2">
                    Motivo: <span className="font-normal">{ticket.finalizacaoMotivo}</span>
                  </p>
                )}
                {ticket.finalizacaoObservacao && (
                  <p className="mt-0.5 text-emerald-800/95 line-clamp-2">Obs.: {ticket.finalizacaoObservacao}</p>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 flex gap-4">
            <div>
              <p className="text-slate-500 text-xs">Orçado</p>
              <p className="text-slate-800 font-medium text-sm">
                {formatHorasDecimalToHm(ticket.estimativaHoras ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Executado</p>
              <p className="text-slate-800 font-medium text-sm">
                {formatHorasDecimalToHm(ticket.totalHorasApontadas ?? 0)}
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Prioridade</p>
            <p className="inline-flex items-center gap-1.5 font-medium text-slate-800 text-sm">
              {ticket.criticidade != null && ticket.criticidade !== "" ? (
                <>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${ticket.criticidade === "Urgente" || ticket.criticidade === "URGENTE" ? "bg-red-500" : ticket.criticidade === "Alta" || ticket.criticidade === "ALTA" ? "bg-orange-500" : ticket.criticidade === "Média" || ticket.criticidade === "MEDIA" ? "bg-amber-500" : ticket.criticidade === "Baixa" || ticket.criticidade === "BAIXA" ? "bg-blue-500" : "bg-slate-400"}`} aria-hidden />
                  <span className="truncate">{ticket.criticidade}</span>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Membros</p>
            <p className="text-slate-800 font-medium text-sm truncate" title={ticket.assignedTo?.name ?? undefined}>
              {ticket.assignedTo?.name ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Criação</p>
            <p className="text-slate-800 font-medium text-sm">
              {new Date(ticket.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
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
              className="shrink-0 px-3 text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center transition-colors"
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
