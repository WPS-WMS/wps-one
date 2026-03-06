"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Plus,
  Search,
  LayoutList,
  LayoutGrid,
  Filter,
  TrendingUp,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";
import { ProjectCard, type ProjectForCard } from "@/components/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";

export default function AdminProjetosPage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor") ? "/gestor" : "/admin";
  const arquivadosHref = `${basePath}/projetos/arquivados`;
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [arquivadosCount, setArquivadosCount] = useState(0);

  async function refreshProjects() {
    setApiError(null);
    try {
      const [projetosRes, arquivadosRes] = await Promise.all([
        apiFetch("/api/projects"),
        apiFetch("/api/projects?arquivado=true"),
      ]);
      if (!projetosRes.ok) throw new Error("Erro ao carregar projetos");
      const projetos = await projetosRes.json();
      const arquivados = arquivadosRes.ok ? await arquivadosRes.json() : [];
      setProjects(projetos);
      setArquivadosCount(Array.isArray(arquivados) ? arquivados.length : 0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar projetos";
      setApiError(message);
    }
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.client?.name?.toLowerCase().includes(term) ||
        p.createdBy?.name?.toLowerCase().includes(term)
    );
  }, [projects, searchTerm]);

  // Métricas simples para os cards de resumo
  const metrics = useMemo(() => {
    const totalProjetos = projects.length;
    
    // Projetos arquivados (vem de uma chamada separada)
    const projetosArquivados = arquivadosCount;
    
    // Projetos concluídos: todos os tópicos/tarefas estão ENCERRADOS
    const projetosConcluidos = projects.filter((p) => {
      const tarefas = p.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
      // Se não tem tarefas, não está concluído
      if (tarefas.length === 0) return false;
      // Se todas as tarefas estão ENCERRADAS, está concluído
      return tarefas.every((t) => t.status === "ENCERRADO");
    }).length;
    
    const hoje = new Date();
    const projetosAtrasados = projects.filter((p) => {
      if (!p.dataFimPrevista) return false;
      const fim = new Date(p.dataFimPrevista);
      const tarefas = p.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
      const todasConcluidas =
        tarefas.length > 0 &&
        tarefas.every((t) => t.status === "ENCERRADO");
      return fim < hoje && !todasConcluidas;
    }).length;

    return {
      totalProjetos,
      projetosArquivados,
      projetosConcluidos,
      projetosAtrasados,
    };
  }, [projects, arquivadosCount]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Projetos</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie todos os projetos e acompanhe o progresso.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar projetos..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={arquivadosHref}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Archive className="h-4 w-4" />
                Projetos Arquivados
              </Link>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Novo Projeto
              </button>
            </div>
          </div>
          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {apiError}
            </div>
          )}

          {/* Cards de métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Projetos ativos
                  </p>
                  <p className="text-lg font-semibold text-slate-900">{metrics.totalProjetos}</p>
                </div>
              </div>

              <Link
                href={arquivadosHref}
                className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3 hover:border-slate-300 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Archive className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Projetos Arquivados
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {metrics.projetosArquivados}
                  </p>
                </div>
              </Link>

              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Projetos Concluídos
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {metrics.projetosConcluidos}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Projetos atrasados
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {metrics.projetosAtrasados}
                  </p>
                </div>
              </div>
            </div>
          {/* Lista de projetos */}
            <div className="flex flex-col gap-3">
              {filteredProjects.length === 0 && !apiError ? (
                <p className="text-slate-500 text-sm py-8">Nenhum projeto encontrado.</p>
              ) : (
                filteredProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onDelete={async (proj) => {
                      const res = await apiFetch(`/api/projects/${proj.id}`, { method: "DELETE" });
                      if (res.ok) await refreshProjects();
                    }}
                    onDeleteSubproject={async (ticket) => {
                      try {
                        const res = await apiFetch(`/api/tickets/${ticket.id}`, {
                          method: "DELETE",
                        });
                        if (res.ok || res.status === 204) {
                          await refreshProjects();
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
                    }}
                    onSubprojectCreated={async () => {
                      await refreshProjects();
                    }}
                  />
                ))
              )}
            </div>
        </div>

        {showNewModal && (
          <NewProjectModal
            onClose={() => setShowNewModal(false)}
            onSaved={() => {
              setShowNewModal(false);
              refreshProjects();
            }}
          />
        )}
      </main>
    </div>
  );
}
