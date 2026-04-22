"use client";

import { Trash2 } from "lucide-react";

/** Utilizador referenciado em tickets (lista/detalhe API). */
export type TicketUserSummary = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

export type PackageTicket = {
  id: string;
  code: string;
  title: string;
  /** Presente nas listagens light da API (Kanban multi-projeto). */
  projectId?: string;
  project?: { id: string; name: string; client?: { name: string } };
  description?: string | null;
  type: string;
  criticidade?: string | null;
  status: string;
  finalizacaoMotivo?: string | null;
  finalizacaoObservacao?: string | null;
  parentTicketId?: string | null; // ID do tópico pai (se esta tarefa pertence a um tópico)
  dataInicio?: string | null; // Data de início da tarefa
  dataFimPrevista?: string | null; // Data de entrega prevista
  estimativaHoras?: number | null; // Estimativa de horas
  progresso?: number | null; // Progresso em porcentagem (0-100)
  createdAt: string;
  assignedTo?: TicketUserSummary | null;
  createdBy?: TicketUserSummary | null;
  responsibles?: Array<{ user: TicketUserSummary }>;
  budget?: {
    status: string;
    horas: number;
    observacao: string;
    rejectionReason?: string | null;
    sentBy?: { id: string; name: string } | null;
    sentAt?: string | null;
    decidedBy?: { id: string; name: string } | null;
    decidedAt?: string | null;
  } | null;
  _count?: { timeEntries: number };
  totalHorasApontadas?: number;
};

type PackageCardProps = {
  ticket: PackageTicket;
  onClick: (ticket: PackageTicket) => void;
  onDelete?: (ticket: PackageTicket) => void;
};

export function PackageCard({ ticket, onClick, onDelete }: PackageCardProps) {
  const getStatusColor = (status: string) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const st = String(status || "").toUpperCase();
    const closed = st === "ENCERRADO" || st === "FINALIZADAS";
    if (!closed && ticket.dataFimPrevista && String(ticket.dataFimPrevista).slice(0, 10) < todayStr) {
      return "bg-rose-500";
    }
    switch (st) {
      case "ENCERRADO":
        return "bg-emerald-500";
      case "EM_ESPERA":
        return "bg-amber-500";
      case "EXECUCAO":
        return "bg-blue-500";
      case "TESTE":
        return "bg-purple-500";
      case "APROVADO":
        return "bg-cyan-500";
      case "EM_ANALISE":
        return "bg-amber-500";
      default:
        return "bg-slate-400";
    }
  };

  return (
    <div className="relative flex-shrink-0 w-64 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all p-4">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(ticket);
          }}
          className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
          title="Excluir tópico"
          aria-label="Excluir tópico"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onClick(ticket)}
        className="w-full text-left focus:outline-none focus:ring-0"
      >
        <div className="flex items-start justify-between gap-2 mb-2 pr-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${getStatusColor(ticket.status)}`}
                aria-hidden
              />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 line-clamp-2" title={ticket.title}>
              {ticket.title}
            </h4>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 mt-3">
          <span className="truncate">{ticket.type}</span>
          {ticket.assignedTo && (
            <span className="truncate" title={ticket.assignedTo.name}>
              {ticket.assignedTo.name}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
