"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { PackageTicket } from "./PackageCard";
import { ConfirmModal } from "./ConfirmModal";
import { collectTicketMemberNames } from "@/lib/ticketMemberNames";
import { useAuth } from "@/contexts/AuthContext";

type TaskListViewProps = {
  tickets: PackageTicket[];
  onTicketClick?: (ticket: PackageTicket) => void;
  onTicketDelete?: (ticket: PackageTicket) => void;
};

const STATUS_LABELS: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANALISE: "Em Análise",
  APROVADO: "Aprovado",
  EXECUCAO: "Em Execução",
  TESTE: "Teste",
  ENCERRADO: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  ABERTO: "bg-slate-400",
  EM_ANALISE: "bg-amber-500",
  APROVADO: "bg-cyan-500",
  EXECUCAO: "bg-blue-500",
  TESTE: "bg-purple-500",
  ENCERRADO: "bg-emerald-500",
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || "bg-slate-400";
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function TaskListView({ tickets, onTicketClick, onTicketDelete }: TaskListViewProps) {
  const [deleteTarget, setDeleteTarget] = useState<PackageTicket | null>(null);
  const { user } = useAuth();
  const hideMembers = user?.role === "CLIENTE";
  
  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">Nenhuma tarefa encontrada.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="relative rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all"
        >
          <button
            type="button"
            onClick={() => onTicketClick?.(ticket)}
            className="w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 rounded-lg"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono font-semibold text-slate-600">
                    #{ticket.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getStatusColor(ticket.status)}`}
                  >
                    {getStatusLabel(ticket.status)}
                  </span>
                </div>
                <h4 className="text-sm font-medium text-slate-800 mb-1 line-clamp-1" title={ticket.title}>
                  {ticket.title}
                </h4>
                {ticket.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1" title={ticket.description}>
                    {ticket.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
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
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
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
              className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
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
