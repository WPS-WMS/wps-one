"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Archive, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";
import { TaskCardHorizontal } from "@/components/TaskCardHorizontal";
import { useAuth } from "@/contexts/AuthContext";

type ProjectArchivedTasksContentProps = {
  basePath: "/admin" | "/gestor" | "/consultor";
};

export function ProjectArchivedTasksContent({ basePath }: ProjectArchivedTasksContentProps) {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const router = useRouter();
  const { can } = useAuth();
  const canEditTarefa = useMemo(() => can("tarefa.editar"), [can]);

  const [project, setProject] = useState<ProjectForCard | null>(null);
  const [tickets, setTickets] = useState<PackageTicket[]>([]);
  const [topicsById, setTopicsById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fromTab = searchParams.get("from") ?? "op1";

  const projectsListHref = `${basePath}/projetos?tab=${fromTab}`;

  const load = useCallback(async () => {
    if (!projectId) {
      setError("Projeto inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [projectRes, allTicketsRes, archivedRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}?light=true`),
        apiFetch(`/api/tickets?projectId=${encodeURIComponent(projectId)}&light=true&noAvatar=true&limit=500`),
        apiFetch(`/api/tickets?projectId=${encodeURIComponent(projectId)}&arquivado=true&light=true&noAvatar=true&limit=500`),
      ]);
      if (!projectRes.ok) {
        const data = await projectRes.json().catch(() => ({}));
        throw new Error(data?.error ?? "Projeto não encontrado");
      }
      const projectData = (await projectRes.json()) as ProjectForCard;
      const allTickets = allTicketsRes.ok ? await allTicketsRes.json().catch(() => []) : [];
      const archivedBody = archivedRes.ok ? await archivedRes.json().catch(() => []) : [];
      const archived = Array.isArray(archivedBody) ? archivedBody : [];
      const topics = new Map<string, string>();
      if (Array.isArray(allTickets)) {
        for (const t of allTickets as PackageTicket[]) {
          if (t.type === "SUBPROJETO") topics.set(t.id, t.title);
        }
      }
      setProject(projectData);
      setTopicsById(topics);
      setTickets(archived.filter((t: PackageTicket) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tarefas arquivadas.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(ticket: PackageTicket) {
    if (!canEditTarefa) return;
    const res = await apiFetch(`/api/tickets/${ticket.id}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(typeof data?.error === "string" ? data.error : "Erro ao restaurar tarefa.");
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando tarefas arquivadas...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => router.push(projectsListHref)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Lista de Projetos
        </button>
        <p className="text-sm text-red-600">{error ?? "Projeto não encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/60 backdrop-blur" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">{project.name}</h1>
            <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
              Tarefas arquivadas deste projeto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(projectsListHref)}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Lista de Projetos
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            <Archive className="h-4 w-4" />
            {tickets.length} tarefa{tickets.length === 1 ? "" : "s"} arquivada{tickets.length === 1 ? "" : "s"}
          </div>
          {tickets.length === 0 ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma tarefa arquivada neste projeto.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="relative">
                  <TaskCardHorizontal
                    ticket={ticket}
                    projectId={project.id}
                    projectName={project.name}
                    topicTitle={ticket.parentTicketId ? topicsById.get(ticket.parentTicketId) : undefined}
                  />
                  {canEditTarefa && (
                    <button
                      type="button"
                      onClick={() => void handleRestore(ticket)}
                      className="absolute right-14 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-90"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                      title="Restaurar tarefa"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
