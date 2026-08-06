"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Archive } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";
import { SubprojectCardHorizontal } from "@/components/SubprojectCardHorizontal";
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

function taskOrderAsc(a: PackageTicket, b: PackageTicket): number {
  const aCode = String(a.code ?? "");
  const bCode = String(b.code ?? "");
  return aCode.localeCompare(bCode, "pt-BR", { numeric: true, sensitivity: "base" });
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
  const [archivedAll, setArchivedAll] = useState<PackageTicket[]>([]);
  const [topicsById, setTopicsById] = useState<Map<string, string>>(new Map());
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
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
      const archived = (Array.isArray(archivedBody) ? archivedBody : []) as PackageTicket[];
      const topics = new Map<string, string>();
      if (Array.isArray(allTickets)) {
        for (const t of allTickets as PackageTicket[]) {
          if (t.type === "SUBPROJETO") topics.set(t.id, t.title);
        }
      }
      for (const t of archived) {
        if (t.type === "SUBPROJETO") topics.set(t.id, t.title);
      }
      setProject(projectData);
      setTopicsById(topics);
      setArchivedAll(archived);
      setSelectedTopicId((prev) => {
        if (!prev) return prev;
        return archived.some((t) => t.id === prev && t.type === "SUBPROJETO") ? prev : null;
      });
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
    const isTopic = ticket.type === "SUBPROJETO";
    const res = await apiFetch(`/api/tickets/${ticket.id}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(
        typeof data?.error === "string"
          ? data.error
          : isTopic
            ? "Erro ao restaurar tópico."
            : "Erro ao restaurar tarefa.",
      );
      return;
    }
    await load();
  }

  const archivedTopics = useMemo(
    () => archivedAll.filter((t) => t.type === "SUBPROJETO"),
    [archivedAll],
  );

  const archivedTasks = useMemo(
    () => archivedAll.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA"),
    [archivedAll],
  );

  const archivedTopicIds = useMemo(
    () => new Set(archivedTopics.map((t) => t.id)),
    [archivedTopics],
  );

  /** Tarefas arquivadas cujo tópico pai não está arquivado (arquivadas isoladamente). */
  const orphanTasks = useMemo(
    () =>
      archivedTasks.filter(
        (t) => !t.parentTicketId || !archivedTopicIds.has(t.parentTicketId),
      ),
    [archivedTasks, archivedTopicIds],
  );

  const filterRows = useMemo((): TaskFilterRow[] => {
    if (!project) return [];
    return archivedTasks.map((t) => ({
      ...t,
      projectId: project.id,
      project: {
        id: project.id,
        name: project.name,
        client: project.client ? { name: project.client.name } : undefined,
      },
    }));
  }, [archivedTasks, project]);

  const statusOptions = useMemo(() => buildStatusOptions(filterRows), [filterRows]);
  const selectableStatusIds = useMemo(
    () => statusOptions.filter((o) => o.id !== "").map((o) => o.id),
    [statusOptions],
  );
  const isStatusTodosChecked = useMemo(
    () => selectableStatusIds.length > 0 && selectableStatusIds.every((id) => statusIds.includes(id)),
    [selectableStatusIds, statusIds],
  );

  const filteredTasks = useMemo(() => {
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

  const filteredTaskIds = useMemo(
    () => new Set(filteredTasks.map((t) => t.id)),
    [filteredTasks],
  );

  const visibleTopics = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hasTaskFilters = statusIds.length > 0 || createdFrom || createdTo || dueFrom || dueTo;
    return archivedTopics.filter((topic) => {
      const childTasks = archivedTasks.filter((t) => t.parentTicketId === topic.id);
      const visibleChildren = childTasks.filter((t) => filteredTaskIds.has(t.id));
      if (!term && !hasTaskFilters) return true;
      if (term && topic.title.toLowerCase().includes(term)) return true;
      if (term && String(topic.code ?? "").toLowerCase().includes(term)) return true;
      return visibleChildren.length > 0;
    });
  }, [archivedTopics, archivedTasks, filteredTaskIds, q, statusIds, createdFrom, createdTo, dueFrom, dueTo]);

  const visibleOrphanTasks = useMemo(
    () => orphanTasks.filter((t) => filteredTaskIds.has(t.id)).slice().sort(taskOrderAsc),
    [orphanTasks, filteredTaskIds],
  );

  const hasAdvancedFilters = Boolean(createdFrom || createdTo || dueFrom || dueTo);
  const hasAnyFilters = Boolean(q.trim() || statusIds.length > 0 || hasAdvancedFilters);
  const isEmpty = archivedTopics.length === 0 && archivedTasks.length === 0;
  const nothingVisible = visibleTopics.length === 0 && visibleOrphanTasks.length === 0;

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

  function handleTopicClick(ticket: PackageTicket) {
    setSelectedTopicId((prev) => (prev === ticket.id ? null : ticket.id));
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando itens arquivados...</p>
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
              Tópicos e tarefas arquivados deste projeto. Clique no tópico para ver as tarefas.
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--muted-foreground)]">
            <span className="inline-flex items-center gap-2">
              <Archive className="h-4 w-4" />
              {archivedTopics.length} tópico{archivedTopics.length === 1 ? "" : "s"} · {archivedTasks.length}{" "}
              tarefa{archivedTasks.length === 1 ? "" : "s"}
            </span>
          </div>

          {!isEmpty && (
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
              shownCount={filteredTasks.length}
              totalCount={archivedTasks.length}
              searchPlaceholder="Código, título, tópico, membro..."
            />
          )}

          {isEmpty ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Nenhum tópico ou tarefa arquivada neste projeto.
              </p>
            </div>
          ) : nothingVisible ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Nenhum item arquivado encontrado com os filtros aplicados.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTopics.map((topic) => {
                const tarefasDoTopico = archivedTasks
                  .filter((t) => t.parentTicketId === topic.id && filteredTaskIds.has(t.id))
                  .slice()
                  .sort(taskOrderAsc);
                const isSelected = selectedTopicId === topic.id;
                return (
                  <div key={topic.id}>
                    <SubprojectCardHorizontal
                      ticket={topic}
                      allTickets={archivedAll}
                      onClick={handleTopicClick}
                      onRestore={canEditTarefa ? (t) => void handleRestore(t) : undefined}
                      isSelected={isSelected}
                    />
                    {isSelected && (
                      <div className="mt-3 ml-4 pl-4 border-l-2 border-[color:var(--border)]">
                        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]/55 backdrop-blur p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-semibold text-[color:var(--foreground)]">
                              Tarefas arquivadas — {topic.title}
                            </h5>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                              Restaurar o tópico desarquiva todas as tarefas abaixo.
                            </p>
                          </div>
                          <div className="space-y-2">
                            {tarefasDoTopico.length > 0 ? (
                              tarefasDoTopico.map((task) => (
                                <TaskCardHorizontal
                                  key={task.id}
                                  ticket={task}
                                  projectId={project.id}
                                  projectName={project.name}
                                  topicTitle={topic.title}
                                  onRestore={canEditTarefa ? (t) => void handleRestore(t) : undefined}
                                />
                              ))
                            ) : (
                              <div className="text-center py-6">
                                <p className="text-sm text-[color:var(--muted-foreground)]">
                                  Nenhuma tarefa arquivada neste tópico
                                  {hasAnyFilters ? " com os filtros aplicados" : ""}.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleOrphanTasks.length > 0 && (
                <section className="space-y-2 pt-4">
                  <h2 className="text-sm font-semibold text-[color:var(--foreground)]">
                    Tarefas arquivadas (sem tópico arquivado)
                  </h2>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Tarefas arquivadas individualmente, cujo tópico ainda está ativo.
                  </p>
                  {visibleOrphanTasks.map((task) => (
                    <TaskCardHorizontal
                      key={task.id}
                      ticket={task}
                      projectId={project.id}
                      projectName={project.name}
                      topicTitle={task.parentTicketId ? topicsById.get(task.parentTicketId) : undefined}
                      onRestore={canEditTarefa ? (t) => void handleRestore(t) : undefined}
                    />
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
