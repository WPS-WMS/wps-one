"use client";

import { useEffect, useState } from "react";
import { Plus, Archive } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";
import { ProjectCard, type ProjectForCard } from "@/components/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import { useAuth } from "@/contexts/AuthContext";

export default function ProjetosPage() {
  const { can } = useAuth();
  const canArchiveProjects = can("projeto.arquivar");
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [listRevision, setListRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  function applyProjectsFromApi(data: unknown) {
    setProjects(Array.isArray(data) ? data : []);
    setListRevision((n) => n + 1);
  }

  useEffect(() => {
    setError(null);
    apiFetch("/api/projects?light=true")
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar projetos");
        return r.json();
      })
      .then((data: ProjectForCard[]) => applyProjectsFromApi(data))
      .catch((err) => setError(err?.message ?? "Erro ao carregar projetos"));
  }, []);

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
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          )}
          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1"></div>
            <div className="flex items-center gap-3">
              {canArchiveProjects && (
                <Link
                  href="/consultor/projetos/arquivados"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Archive className="h-4 w-4" />
                  Projetos Arquivados
                </Link>
              )}
              {can("projeto.novo") && (
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Novo Projeto
                </button>
              )}
            </div>
          </div>
          {projects.length === 0 && !error && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
              Nenhum projeto encontrado.
            </div>
          )}
          <div className="space-y-4">
            {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              listRevision={listRevision}
              canEditProject={can("projeto.editar")}
              canDeleteProject={can("projeto.excluir")}
              canArchiveProject={canArchiveProjects}
              onDelete={
                can("projeto.excluir")
                  ? async (proj) => {
                      const res = await apiFetch(`/api/projects/${proj.id}`, { method: "DELETE" });
                      if (res.ok) setProjects((prev) => prev.filter((x) => x.id !== proj.id));
                    }
                  : undefined
              }
              onDeleteSubproject={async (ticket) => {
                try {
                  const res = await apiFetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
                  if (res.ok || res.status === 204) {
                    // Atualiza a lista de projetos para refletir a exclusão
                    const updatedProjects = await apiFetch("/api/projects?light=true")
                      .then((r) => (r.ok ? r.json() : []))
                      .catch(() => projects);
                    applyProjectsFromApi(updatedProjects);
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
                // Atualiza a lista de projetos após criar subprojeto
                const updatedProjects = await apiFetch("/api/projects?light=true")
                  .then((r) => (r.ok ? r.json() : []))
                  .catch(() => projects);
                applyProjectsFromApi(updatedProjects);
              }}
            />
            ))}
          </div>
        </div>
        {showNewModal && can("projeto.novo") && (
          <NewProjectModal
            onClose={() => setShowNewModal(false)}
            onSaved={() => {
              setShowNewModal(false);
              apiFetch("/api/projects?light=true")
                .then((r) => (r.ok ? r.json() : []))
                .then(applyProjectsFromApi);
            }}
          />
        )}

      </main>
    </div>
  );
}
