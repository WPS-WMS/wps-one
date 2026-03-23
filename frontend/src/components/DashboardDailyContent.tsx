"use client";

import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { KanbanWithFilters } from "@/components/KanbanWithFilters";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";

/**
 * Conteúdo do Dashboard Daily (lista de projetos + Kanban).
 * Usado por admin, consultor e gestor para evitar importar page de outra rota (causa erro no cliente).
 */
export function DashboardDailyContent() {
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [tickets, setTickets] = useState<PackageTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setBackendError(null);
    apiFetch("/api/projects?light=true")
      .then((r) => {
        if (r.status === 502) throw new Error("BACKEND_OFF");
        if (!r.ok) throw new Error("Erro ao carregar projetos");
        return r.json();
      })
      .then((data: ProjectForCard[]) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setProjects([]);
        if (err?.message === "BACKEND_OFF") {
          setBackendError("Não foi possível conectar ao servidor. Inicie o backend: no terminal, execute cd backend && npm run dev");
        } else {
          setBackendError("Erro ao carregar projetos. Verifique se o backend está rodando (cd backend && npm run dev).");
        }
      });
  }, [retryCount]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTickets([]);
      return;
    }
    apiFetch(`/api/tickets?projectId=${selectedProjectId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar tarefas");
        return r.json();
      })
      .then((allTickets: PackageTicket[]) => {
        const tasksOnly = allTickets.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA");
        setTickets(tasksOnly);
      })
      .catch((err) => {
        console.error("Erro ao carregar tarefas:", err);
      });
  }, [selectedProjectId]);

  const filteredBySearch = searchQuery.trim()
    ? tickets.filter(
        (t) =>
          t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.code?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tickets;

  const refetchTickets = async () => {
    if (!selectedProjectId) return;
    const res = await apiFetch(`/api/tickets?projectId=${selectedProjectId}`);
    if (res.ok) {
      const allTickets: PackageTicket[] = await res.json();
      const tasksOnly = allTickets.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA");
      setTickets(tasksOnly);
    }
  };

  const handleDeleteTicket = async (ticket: PackageTicket) => {
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        await refetchTickets();
      } else {
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

  if (loading && !backendError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    );
  }

  if (backendError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-red-600 text-sm font-medium text-center max-w-md mb-2">{backendError}</p>
        <p className="text-slate-500 text-xs text-center mb-4">
          Depois de iniciar o backend, clique em &quot;Tentar novamente&quot;.
        </p>
        <button
          type="button"
          onClick={() => {
            setBackendError(null);
            setLoading(true);
            setRetryCount((c) => c + 1);
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Dashboard Daily</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Visualize e gerencie tarefas do projeto em formato Kanban.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative w-full md:w-64 flex-shrink-0">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarefas..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-full border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Selecione um projeto...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.client?.name ?? "—"} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setRetryCount((c) => c + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar projetos
            </button>
          </div>

          {selectedProjectId ? (
            <div className="w-full">
              <KanbanWithFilters
                tickets={filteredBySearch}
                projectId={selectedProjectId}
                onTicketClick={() => {}}
                onTicketDelete={handleDeleteTicket}
                onTicketCreated={refetchTickets}
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
              <p className="text-slate-500 text-sm">Selecione um projeto para visualizar o Kanban</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
