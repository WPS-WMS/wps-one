"use client";

import { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { ConfirmModal } from "./ConfirmModal";
import { collectTicketMemberNames, formatMemberNamesChip } from "@/lib/ticketMemberNames";
import { useAuth } from "@/contexts/AuthContext";

type SubprojectCardHorizontalProps = {
  ticket: PackageTicket;
  allTickets?: PackageTicket[]; // Todas as tarefas do projeto para calcular o status do tópico
  onClick: (ticket: PackageTicket) => void;
  onEdit?: (ticket: PackageTicket) => void;
  onDelete?: (ticket: PackageTicket) => void;
  isSelected?: boolean;
};

function formatHorasDecimalToHm(value: number | null | undefined): string {
  const v = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const totalMinutes = Math.round(v * 60);
  const horas = Math.floor(totalMinutes / 60);
  const minutos = totalMinutes % 60;
  return `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}h`;
}

// Calcula o status do tópico baseado nas tarefas filhas e na data prevista
function getTopicStatus(
  topic: PackageTicket,
  allTickets: PackageTicket[],
): "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" | "ATRASADO" {
  const tarefasDoTopico = allTickets.filter(
    (t) => t.parentTicketId === topic.id && t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA",
  );

  if (tarefasDoTopico.length === 0) {
    return "ABERTO";
  }

  const finalizadas = tarefasDoTopico.filter((t) => t.status === "ENCERRADO").length;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Atraso do tópico: por data do próprio tópico OU por alguma tarefa filha atrasada
  const isPastDue = (d: string | null | undefined) => !!d && String(d).slice(0, 10) < todayStr;
  const anyChildOverdue = tarefasDoTopico.some((t) => {
    const st = String(t.status || "").toUpperCase();
    const closed = st === "ENCERRADO" || st === "FINALIZADAS";
    return !closed && isPastDue(t.dataFimPrevista);
  });
  if ((topic.dataFimPrevista && isPastDue(topic.dataFimPrevista) && finalizadas < tarefasDoTopico.length) || anyChildOverdue) {
    return "ATRASADO";
  }
  // Se todas as tarefas estão finalizadas
  if (finalizadas === tarefasDoTopico.length) {
    return "CONCLUIDO";
  }

  // Se todas as tarefas estão em Backlog (ABERTO)
  const emBacklog = tarefasDoTopico.filter((t) => t.status === "ABERTO").length;
  if (emBacklog === tarefasDoTopico.length) {
    return "ABERTO";
  }

  // Caso contrário: tem pelo menos uma tarefa em execução ou finalizada, mas nem todas finalizadas
  return "EM_ANDAMENTO";
}

function getStatusColor(
  status: "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" | "ATRASADO",
): string {
  switch (status) {
    case "CONCLUIDO":
      return "bg-emerald-500";
    case "EM_ANDAMENTO":
      return "bg-blue-500";
    case "ATRASADO":
      return "bg-rose-500";
    case "ABERTO":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
  }
}

function getStatusLabel(
  status: "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" | "ATRASADO",
): string {
  switch (status) {
    case "CONCLUIDO":
      return "Concluído";
    case "EM_ANDAMENTO":
      return "Em andamento";
    case "ATRASADO":
      return "Atrasado";
    case "ABERTO":
      return "Aberto";
    default:
      return "Aberto";
  }
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

export function SubprojectCardHorizontal({ ticket, allTickets = [], onClick, onEdit, onDelete, isSelected }: SubprojectCardHorizontalProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { user } = useAuth();
  const hideMembers = user?.role === "CLIENTE";
  // Calcula o status do tópico baseado nas tarefas filhas
  const topicStatus = getTopicStatus(ticket, allTickets);
  const statusColor = getStatusColor(topicStatus);
  const statusLabel = getStatusLabel(topicStatus);
  
  // Tarefas do tópico (para status e horas; exclui subtarefas)
  const tarefasDoTopico = allTickets.filter(
    (t) => t.parentTicketId === ticket.id && t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA",
  );
  const totalTarefas = tarefasDoTopico.length;
  // Orçado do tópico: se o próprio tópico tiver estimativaHoras, usa esse valor;
  // caso contrário, soma as estimativas das tarefas filhas (comportamento antigo).
  const horasEstimadasDiretas = ticket.estimativaHoras ?? null;
  const horasEstimadasTarefas = tarefasDoTopico.reduce(
    (acc, t) => acc + (t.estimativaHoras ?? 0),
    0,
  );
  const horasEstimadas = horasEstimadasDiretas ?? horasEstimadasTarefas;
  // Executado = soma das horas apontadas de todas as tarefas do tópico
  const horasExecutadas = tarefasDoTopico.reduce((acc, t) => acc + (t.totalHorasApontadas ?? 0), 0);

  const memberNamesResult = formatMemberNamesChip(collectTicketMemberNames(ticket));

  return (
    <div className="w-full">
      <div
        className={`flex rounded-lg border ${
          isSelected ? "border-blue-500 shadow-md" : "border-slate-200"
        } bg-white shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 transition-all`}
      >
        <div className={`w-2 flex-shrink-0 ${statusColor}`} aria-hidden />
        <button
          type="button"
          onClick={() => onClick(ticket)}
          className={`flex-1 min-w-0 grid gap-x-4 items-center py-3 px-4 text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${hideMembers ? "grid-cols-[1fr_14rem_7rem_6rem]" : "grid-cols-[1fr_14rem_7rem_8rem_6rem]"}`}
        >
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-800 truncate mb-1" title={ticket.title}>
              {ticket.title}
            </h4>
            <p className="text-xs text-slate-500">
              {totalTarefas} {totalTarefas === 1 ? "tarefa" : "tarefas"}
            </p>
          </div>
          <div className="min-w-0 flex gap-4">
            <div>
              <p className="text-slate-500 text-xs">Orçado</p>
              <p className="text-slate-800 font-medium text-sm">
                {formatHorasDecimalToHm(horasEstimadas ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Executado</p>
              <p className="text-slate-800 font-medium text-sm">
                {formatHorasDecimalToHm(horasExecutadas ?? 0)}
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Status</p>
            <p className="inline-flex items-center gap-1.5 font-medium text-slate-800 text-sm">
              <span className={`h-2 w-2 rounded-full shrink-0 ${statusColor}`} aria-hidden />
              <span className="truncate">{statusLabel}</span>
            </p>
          </div>
          {!hideMembers && (
            <div className="min-w-0">
              <p className="text-slate-500 text-xs">Membros</p>
              <p className="text-slate-800 font-medium text-sm truncate" title={memberNamesResult.title ?? memberNamesResult.display ?? undefined}>
                {memberNamesResult.display ?? "—"}
              </p>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-slate-500 text-xs">Entrega</p>
            <p className="text-slate-800 font-medium text-sm">
              {formatPtBrDate(ticket.dataFimPrevista)}
            </p>
          </div>
        </button>
        <div className="flex items-center">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(ticket);
              }}
              className="shrink-0 px-3 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface)]/70 flex items-center transition-colors"
              title="Editar tópico"
              aria-label="Editar tópico"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteModal(true);
                }}
                className="shrink-0 px-3 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface)]/70 flex items-center transition-colors"
                title="Excluir tópico"
                aria-label="Excluir tópico"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            {showDeleteModal && (
              <ConfirmModal
                title="Excluir tópico"
                message={`Tem certeza que deseja excluir o tópico "${ticket.title}"? Esta ação não pode ser desfeita e todas as tarefas deste tópico serão excluídas.`}
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
    </div>
  );
}
