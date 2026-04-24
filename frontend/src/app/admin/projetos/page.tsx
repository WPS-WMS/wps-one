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
import { useAuth } from "@/contexts/AuthContext";

export default function AdminProjetosPage() {
  const { can } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const arquivadosHref = `${basePath}/projetos/arquivados`;
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [listRevision, setListRevision] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [arquivadosCount, setArquivadosCount] = useState(0);
  const canArchiveProjects = can("projeto.arquivar");

  async function refreshProjects() {
    setApiError(null);
    try {
      const [projetosRes, arquivadosRes] = await Promise.all([
        apiFetch("/api/projects?light=true"),
        canArchiveProjects ? apiFetch("/api/projects?arquivado=true&light=true") : Promise.resolve(null as any),
      ]);
      if (!projetosRes.ok) throw new Error("Erro ao carregar projetos");
      const projetos = await projetosRes.json();
      const arquivados =
        arquivadosRes && (arquivadosRes as Response).ok ? await (arquivadosRes as Response).json() : [];
      setProjects(projetos);
      setListRevision((n) => n + 1);
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
      // Comparação por data (YYYY-MM-DD) para não marcar como atrasado "no meio do dia" por timezone/horário.
      const todayStr = hoje.toISOString().slice(0, 10);
      const fimStr = String(p.dataFimPrevista).slice(0, 10);
      const tarefas = p.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
      const todasConcluidas =
        tarefas.length > 0 &&
        tarefas.every((t) => t.status === "ENCERRADO");
      return fimStr < todayStr && !todasConcluidas;
    }).length;

    return {
      totalProjetos,
      projetosArquivados,
      projetosConcluidos,
      projetosAtrasados,
    };
  }, [projects, arquivadosCount]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 bg-[color:var(--surface)]/60 backdrop-blur border-b border-[color:var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Projetos</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Gerencie todos os projetos e acompanhe o progresso.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--muted-foreground)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar projetos..."
                className="w-full rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              />
            </div>
            <div className="flex items-center gap-3">
              {canArchiveProjects && (
                <Link
                  href={arquivadosHref}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-sm hover:opacity-90"
                >
                  <Archive className="h-4 w-4" />
                  Projetos Arquivados
                </Link>
              )}
              {can("projeto.novo") && (
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] shadow-sm hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Novo Projeto
                </button>
              )}
            </div>
          </div>
          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {apiError}
            </div>
          )}

          {/* Cards de métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface)] text-[color:var(--primary)] border border-[color:var(--border)]">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Projetos ativos
                  </p>
                  <p className="text-lg font-semibold text-[color:var(--foreground)]">{metrics.totalProjetos}</p>
                </div>
              </div>

              {canArchiveProjects && (
                <Link
                  href={arquivadosHref}
                  className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-4 py-3 shadow-sm flex items-center gap-3 hover:opacity-90 transition"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface)] text-emerald-400 border border-[color:var(--border)]">
                    <Archive className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">Projetos Arquivados</p>
                    <p className="text-lg font-semibold text-[color:var(--foreground)]">{metrics.projetosArquivados}</p>
                  </div>
                </Link>
              )}

              <div className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface)] text-[color:var(--primary)] border border-[color:var(--border)]">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Projetos Concluídos
                  </p>
                  <p className="text-lg font-semibold text-[color:var(--foreground)]">
                    {metrics.projetosConcluidos}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface)] text-rose-400 border border-[color:var(--border)]">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Projetos atrasados
                  </p>
                  <p className="text-lg font-semibold text-[color:var(--foreground)]">
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
                    listRevision={listRevision}
                    canViewDetails={can("projeto.verDetalhes")}
                    canEditProject={can("projeto.editar")}
                    canDeleteProject={can("projeto.excluir")}
                    canArchiveProject={canArchiveProjects}
                    onDelete={
                      can("projeto.excluir")
                        ? async (proj) => {
                            const res = await apiFetch(`/api/projects/${proj.id}`, { method: "DELETE" });
                            if (res.ok) await refreshProjects();
                          }
                        : undefined
                    }
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

        {showNewModal && can("projeto.novo") && (
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
