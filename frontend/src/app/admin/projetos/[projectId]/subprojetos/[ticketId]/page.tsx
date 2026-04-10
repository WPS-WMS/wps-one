"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TaskListView } from "@/components/TaskListView";
import { CreateTaskModalFull } from "@/components/CreateTaskModalFull";
import { type PackageTicket } from "@/components/PackageCard";

type PageProps = {
  params: Promise<{ projectId: string; ticketId: string }>;
};

export default function TopicoKanbanAdminPage({ params }: PageProps) {
  const { projectId, ticketId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ticket, setTicket] = useState<PackageTicket | null>(null);
  const [tickets, setTickets] = useState<PackageTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const fromTab = searchParams.get("from") ?? "op2";

  const refetchTickets = async () => {
    const res = await apiFetch(`/api/tickets?projectId=${projectId}&light=true`);
    if (res.ok) {
      const projectTickets: PackageTicket[] = await res.json();
      setTickets(projectTickets);
      const foundTicket = projectTickets.find((t) => t.id === ticketId);
      if (foundTicket) setTicket(foundTicket);
    }
  };

  const handleDeleteTicket = async (ticketToDelete: PackageTicket) => {
    try {
      const res = await apiFetch(`/api/tickets/${ticketToDelete.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        await refetchTickets();
      } else {
        // Tenta ler o erro apenas se houver conteúdo
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json().catch(() => ({}));
          alert(data?.error ?? "Erro ao excluir tarefa.");
        } else {
          alert("Erro ao excluir tarefa.");
        }
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
      alert("Erro ao excluir tarefa. Verifique se o backend está rodando.");
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    // Buscar todos os tickets do projeto
    apiFetch(`/api/tickets?projectId=${projectId}&light=true`)
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar tickets");
        return r.json();
      })
      .then((projectTickets: PackageTicket[]) => {
        const foundTicket = projectTickets.find((t) => t.id === ticketId);
        if (!foundTicket) {
          setError("Tópico não encontrado");
          setLoading(false);
          return;
        }
        setTicket(foundTicket);
        setTickets(projectTickets);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? "Erro ao carregar tópico");
        setLoading(false);
      });
  }, [projectId, ticketId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando kanban...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => {
            if (fromTab === "op2") {
              router.push(`/admin/projetos?tab=op2`);
            } else {
              router.push(`/admin/projetos/${projectId}?from=${fromTab}`);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          ← Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Tópico não encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            {ticket.type === "SUBPROJETO" ? ticket.title : `${ticket.code}: ${ticket.title}`}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {ticket.type} · {ticket.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botões de toggle Kanban/Lista */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              title="Visualização Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              title="Visualização Lista"
            >
              <List className="h-4 w-4" />
              Lista
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (fromTab === "op2") {
                router.push(`/admin/projetos?tab=op2`);
              } else {
                router.push(`/admin/projetos/${projectId}?from=${fromTab}`);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            ← Voltar
          </button>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 min-h-0 overflow-auto">
        <div className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Tarefas do Tópico</h2>
            <button
              type="button"
              onClick={() => setShowCreateTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nova tarefa
            </button>
          </div>
          {viewMode === "kanban" ? (
            <KanbanBoard
              tickets={tickets.filter((t) => t.parentTicketId === ticketId)}
              projectId={projectId}
              parentTicketId={ticketId}
              onTicketClick={(ticket) => {
                // TODO: abrir detalhes da tarefa se necessário
                console.log("Tarefa clicada:", ticket);
              }}
              onTicketDelete={handleDeleteTicket}
              onTicketCreated={refetchTickets}
            />
          ) : (
            <TaskListView
              tickets={tickets.filter((t) => t.parentTicketId === ticketId)}
              onTicketClick={(ticket) => {
                console.log("Tarefa clicada:", ticket);
              }}
              onTicketDelete={handleDeleteTicket}
            />
          )}
        </div>
        
        {showCreateTaskModal && (
          <CreateTaskModalFull
            projectId={projectId}
            projectName={ticket?.title}
            parentTicketId={ticketId}
            onClose={() => setShowCreateTaskModal(false)}
            onSaved={() => {
              setShowCreateTaskModal(false);
              refetchTickets();
            }}
          />
        )}
      </main>
    </div>
  );
}
