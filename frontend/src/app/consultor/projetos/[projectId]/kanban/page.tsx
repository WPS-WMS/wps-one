"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { KanbanWithFilters } from "@/components/KanbanWithFilters";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function ProjetoKanbanConsultorPage({ params }: PageProps) {
  const routeParams = use(params);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? routeParams.projectId;
  const router = useRouter();
  const [project, setProject] = useState<ProjectForCard | null>(null);
  const [allTickets, setAllTickets] = useState<PackageTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const fromTab = searchParams.get("from") ?? "op1";

  useEffect(() => {
    // Segurança: se algum overlay global deixou pointer-events desabilitado,
    // isso reabilita cliques dentro do Kanban.
    try {
      document.body.style.pointerEvents = "auto";
      (document.documentElement as HTMLElement).style.pointerEvents = "auto";
    } catch {
      // ignore
    }

    setLoading(true);
    setError(null);

    // Buscar projeto específico (inclusive arquivado) e suas tarefas
    Promise.all([
      apiFetch(`/api/projects/${projectId}?light=true`).then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error || "Projeto não encontrado");
        }
        return r.json();
      }),
      apiFetch(`/api/tickets?projectId=${projectId}&light=true`).then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar tarefas");
        return r.json();
      }),
    ])
      .then(([projectData, projectTickets]: [ProjectForCard, PackageTicket[]]) => {
        setProject(projectData);
        setAllTickets(Array.isArray(projectTickets) ? projectTickets : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? "Erro ao carregar dados");
        setLoading(false);
      });
  }, [projectId]);

  const refetchTickets = async () => {
    const res = await apiFetch(`/api/tickets?projectId=${projectId}&light=true`);
    if (res.ok) {
      const projectTickets: PackageTicket[] = await res.json();
      setAllTickets(Array.isArray(projectTickets) ? projectTickets : []);
    }
  };

  const tickets = useMemo(
    () => allTickets.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA"),
    [allTickets],
  );

  const kanbanSubprojectsFromParent = useMemo(
    () =>
      allTickets
        .filter((t) => t.type === "SUBPROJETO")
        .map((t) => ({ id: t.id, code: t.code, title: t.title })),
    [allTickets],
  );

  const handleDeleteTicket = async (ticket: PackageTicket) => {
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando kanban...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => router.push(`/consultor/projetos?tab=${fromTab}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          ← Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Projeto não encontrado"}</p>
      </div>
    );
  }

  const filteredBySearch = searchQuery.trim()
    ? tickets.filter(
        (t) =>
          t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.code?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tickets;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="relative z-10 flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Visualize e gerencie tarefas do projeto em formato Kanban.
          </p>
        </div>
      </header>
      <main className="relative z-0 flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Barra de busca e botão voltar */}
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarefas..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => router.push(`/consultor/projetos?tab=${fromTab}`)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              ← Voltar
            </button>
          </div>
          <KanbanWithFilters
            tickets={filteredBySearch}
            projectId={project.id}
            kanbanSubprojectsFromParent={kanbanSubprojectsFromParent}
            onTicketClick={() => {}}
            onTicketDelete={handleDeleteTicket}
            onTicketCreated={refetchTickets}
          />
        </div>
      </main>
    </div>
  );
}
