"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Archive } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";
import { TaskCardHorizontal } from "@/components/TaskCardHorizontal";
import { TasksListFilterBar } from "@/components/TasksListFilterBar";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyTasksClientFilters,
  buildStatusOptions,
  ticketMatchesSearch,
  type TaskFilterRow,
} from "@/lib/tasksClientFilters";

import { isInternalStaffLayoutRole } from "@/lib/roles";

type StaffProjectsBasePath = "/consultor" | "/admin" | "/gestor";

function resolveProjectsBasePath(
  pathname: string,
  role?: string | null,
  basePathProp?: StaffProjectsBasePath,
): StaffProjectsBasePath {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  if (isInternalStaffLayoutRole(role)) return "/consultor";
  if (basePathProp) return basePathProp;
  if (pathname.startsWith("/gestor")) return "/gestor";
  if (pathname.startsWith("/consultor")) return "/consultor";
  return "/admin";
}

type ProjectArchivedTasksContentProps = {
  basePath?: StaffProjectsBasePath;
};

export function ProjectArchivedTasksContent({ basePath: basePathProp }: ProjectArchivedTasksContentProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = searchParams.get("projectId") ?? "";
  const router = useRouter();
  const { can, user } = useAuth();
  const canEditTarefa = useMemo(() => can("tarefa.editar"), [can]);

  const [project, setProject] = useState<ProjectForCard | null>(null);
  const [tickets, setTickets] = useState<PackageTicket[]>([]);
  const [topicsById, setTopicsById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fromTab = searchParams.get("from") ?? "op1";

  function goToProjectsList() {
    const path = typeof window !== "undefined" ? window.location.pathname : pathname;
    const resolved = resolveProjectsBasePath(path, user?.role, basePathProp);
    const href = `${resolved}/projetos?tab=${fromTab}`;
    if (typeof window !== "undefined") {
      window.location.href = href;
      return;
    }
    router.push(href);
  }

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

  const filterRows = useMemo((): TaskFilterRow[] => {
    if (!project) return [];
    return tickets.map((t) => ({
      ...t,
      projectId: project.id,
      project: {
        id: project.id,
        name: project.name,
        client: project.client ? { name: project.client.name } : undefined,
      },
    }));
  }, [tickets, project]);

  const statusOptions = useMemo(() => buildStatusOptions(filterRows), [filterRows]);
  const selectableStatusIds = useMemo(
    () => statusOptions.filter((o) => o.id !== "").map((o) => o.id),
    [statusOptions],
  );
  const isStatusTodosChecked = useMemo(
    () => selectableStatusIds.length > 0 && selectableStatusIds.every((id) => statusIds.includes(id)),
    [selectableStatusIds, statusIds],
  );

  const filteredTickets = useMemo(() => {
    const base = applyTasksClientFilters(
      filterRows,
      { q: "", statusIds, clientIds: [], createdFrom, createdTo, dueFrom, dueTo },
      [],
    );
    const term = q.trim().toLowerCase();
    if (!term) return base;
    return base.filter((t) => {
      if (ticketMatchesSearch(t, q)) return true;
      const ticket = t as PackageTicket;
      const topic = ticket.parentTicketId ? topicsById.get(ticket.parentTicketId) : "";
      return String(topic ?? "").toLowerCase().includes(term);
    });
  }, [filterRows, q, statusIds, createdFrom, createdTo, dueFrom, dueTo, topicsById]);

  const hasAdvancedFilters = Boolean(createdFrom || createdTo || dueFrom || dueTo);
  const hasAnyFilters = Boolean(q.trim() || statusIds.length > 0 || hasAdvancedFilters);

  function toggleStatusFilter(id: string) {
    if (id === "") {
      setStatusIds(isStatusTodosChecked ? [] : [...selectableStatusIds]);
      return;
    }
    setStatusIds((prev) => {
      const has = prev.includes(id);
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  function clearFilters() {
    setQ("");
    setStatusIds([]);
    setCreatedFrom("");
    setCreatedTo("");
    setDueFrom("");
    setDueTo("");
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
          onClick={goToProjectsList}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          title="Voltar para Lista de Projetos"
          aria-label="Voltar para Lista de Projetos"
        >
          <ArrowLeft className="h-4 w-4" />
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
            onClick={goToProjectsList}
            className="inline-flex items-center justify-center rounded-lg border p-2 hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            title="Voltar para Lista de Projetos"
            aria-label="Voltar para Lista de Projetos"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            <Archive className="h-4 w-4" />
            {tickets.length} tarefa{tickets.length === 1 ? "" : "s"} arquivada{tickets.length === 1 ? "" : "s"}
          </div>

          {tickets.length > 0 && (
            <TasksListFilterBar
              q={q}
              onQChange={setQ}
              statusIds={statusIds}
              onToggleStatus={toggleStatusFilter}
              statusOptions={statusOptions}
              clientOptions={[]}
              clientIds={[]}
              onToggleClient={() => {}}
              showClientFilter={false}
              createdFrom={createdFrom}
              onCreatedFromChange={setCreatedFrom}
              createdTo={createdTo}
              onCreatedToChange={setCreatedTo}
              dueFrom={dueFrom}
              onDueFromChange={setDueFrom}
              dueTo={dueTo}
              onDueToChange={setDueTo}
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced((v) => !v)}
              hasAdvancedFilters={hasAdvancedFilters}
              hasAnyFilters={hasAnyFilters}
              onClear={clearFilters}
              shownCount={filteredTickets.length}
              totalCount={tickets.length}
              searchPlaceholder="Código, título, tópico, membro..."
            />
          )}

          {tickets.length === 0 ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma tarefa arquivada neste projeto.</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Nenhuma tarefa arquivada encontrada com os filtros aplicados.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((row) => {
                const ticket = row as PackageTicket;
                return (
                <TaskCardHorizontal
                  key={ticket.id}
                  ticket={ticket}
                  projectId={project.id}
                  projectName={project.name}
                  topicTitle={ticket.parentTicketId ? topicsById.get(ticket.parentTicketId) : undefined}
                  onRestore={canEditTarefa ? (t) => void handleRestore(t) : undefined}
                />
              );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
