"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ProjectCard, type ProjectForCard } from "@/components/ProjectCard";

type ProjetosArquivadosContentProps = {
  /** Prefixo da rota: "/admin" ou "/gestor" (para o botão Voltar) */
  basePath: string;
};

export function ProjetosArquivadosContent({ basePath }: ProjetosArquivadosContentProps) {
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function refreshArchived() {
    setApiError(null);
    setLoading(true);
    try {
      const r = await apiFetch("/api/projects?arquivado=true");
      if (!r.ok) throw new Error("Erro ao carregar projetos arquivados");
      const data = await r.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar projetos arquivados";
      setApiError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshArchived();
  }, []);

  const filteredProjects = projects.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.client?.name?.toLowerCase().includes(term) ||
      p.createdBy?.name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Projetos Arquivados</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Visualize e gerencie projetos arquivados.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar projetos arquivados..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => router.push(`${basePath}/projetos`)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Voltar para Projetos
            </button>
          </div>

          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {apiError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500 text-sm">Carregando projetos arquivados...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
              {searchTerm.trim() ? (
                <p className="text-slate-500 text-sm">Nenhum projeto arquivado encontrado para &quot;{searchTerm}&quot;.</p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Archive className="h-12 w-12 text-slate-300" />
                  <p className="text-slate-500 text-sm font-medium">Nenhum projeto arquivado</p>
                  <p className="text-xs text-slate-400">Os projetos arquivados aparecerão aqui.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onDelete={async (proj) => {
                    const res = await apiFetch(`/api/projects/${proj.id}`, { method: "DELETE" });
                    if (res.ok) await refreshArchived();
                  }}
                  onDeleteSubproject={async (ticket) => {
                    try {
                      const res = await apiFetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
                      if (res.ok || res.status === 204) await refreshArchived();
                    } catch (err) {
                      console.error("Erro ao excluir:", err);
                    }
                  }}
                  onSubprojectCreated={async () => {
                    await refreshArchived();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
