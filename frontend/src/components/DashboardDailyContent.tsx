"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isConsultantLikeRole } from "@/lib/staffRoles";
import { useAuth } from "@/contexts/AuthContext";
import { KanbanWithFilters } from "@/components/KanbanWithFilters";
import { type PackageTicket } from "@/components/PackageCard";
import { type ProjectForCard } from "@/components/ProjectCard";

/** Valor do select para ver tarefas de todos os projetos no mesmo Kanban. */
export const DASHBOARD_DAILY_ALL_PROJECTS = "__ALL__";

export const DASHBOARD_DAILY_GROUP_PREFIX = "__GROUP__:";

function groupKey(groupId: string) {
  return `${DASHBOARD_DAILY_GROUP_PREFIX}${groupId}`;
}

function selectedGroupIdFromKey(selectedProjectId: string): string | null {
  if (!selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)) return null;
  return selectedProjectId.slice(DASHBOARD_DAILY_GROUP_PREFIX.length) || null;
}

function projectsForSelection(projects: ProjectForCard[], selectedProjectId: string): ProjectForCard[] {
  const gid = selectedGroupIdFromKey(selectedProjectId);
  if (gid) return projects.filter((p) => String(p.projectGroupId || "") === gid);
  return projects;
}

/**
 * Consultor: GET sem projectId não aplica `filterTicketsForConsultant` (membro só do tópico).
 * Para "Todos", buscamos por projeto e unimos — mesma visibilidade do Kanban por projeto.
 */
async function fetchDashboardDailyTickets(params: {
  selectedProjectId: string;
  projects: ProjectForCard[];
  userRole: string | undefined;
  userId: string | undefined;
}): Promise<PackageTicket[]> {
  const { selectedProjectId, projects, userRole, userId } = params;
  const memberQ = isConsultantLikeRole(userRole) && userId ? `&memberId=${encodeURIComponent(userId)}` : "";

  const isGroupSelection =
    selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX);
  if (isGroupSelection) {
    const groupProjects = projectsForSelection(projects, selectedProjectId);
    if (groupProjects.length === 0) return [];
    if (isConsultantLikeRole(userRole)) {
      const results = await Promise.all(
        groupProjects.map((p) =>
          apiFetch(`/api/tickets?projectId=${encodeURIComponent(p.id)}&light=true&noAvatar=true${memberQ}`),
        ),
      );
      const byId = new Map<string, PackageTicket>();
      for (const r of results) {
        if (!r.ok) continue;
        const data = (await r.json()) as unknown;
        const arr = Array.isArray(data) ? data : [];
        for (const t of arr as PackageTicket[]) {
          byId.set(t.id, t);
        }
      }
      return [...byId.values()];
    }
    const r = await apiFetch(`/api/tickets?light=true&noAvatar=true${memberQ}`);
    if (!r.ok) throw new Error("Erro ao carregar tarefas");
    const data = (await r.json()) as unknown;
    const arr = Array.isArray(data) ? (data as PackageTicket[]) : [];
    const ids = new Set(groupProjects.map((p) => p.id));
    return arr.filter((t) => {
      const pid = t.projectId ? String(t.projectId) : "";
      return pid && ids.has(pid);
    });
  }

  if (selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS) {
    if (isConsultantLikeRole(userRole)) {
      if (projects.length === 0) return [];
      const results = await Promise.all(
        projects.map((p) =>
          apiFetch(`/api/tickets?projectId=${encodeURIComponent(p.id)}&light=true&noAvatar=true${memberQ}`),
        ),
      );
      const byId = new Map<string, PackageTicket>();
      for (const r of results) {
        if (!r.ok) continue;
        const data = (await r.json()) as unknown;
        const arr = Array.isArray(data) ? data : [];
        for (const t of arr as PackageTicket[]) {
          byId.set(t.id, t);
        }
      }
      return [...byId.values()];
    }
    // Em "Todos", perfis não-consultor devem ver todas as tarefas visíveis (multi-projeto).
    // Mantemos `noAvatar=true` para evitar payload gigante (avatarUrl pode vir como base64).
    const r = await apiFetch(`/api/tickets?light=true&noAvatar=true${memberQ}`);
    if (!r.ok) throw new Error("Erro ao carregar tarefas");
    const data = (await r.json()) as unknown;
    return Array.isArray(data) ? (data as PackageTicket[]) : [];
  }
  const r = await apiFetch(
    `/api/tickets?projectId=${encodeURIComponent(selectedProjectId)}&light=true&noAvatar=true${memberQ}`,
  );
  if (!r.ok) throw new Error("Erro ao carregar tarefas");
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? (data as PackageTicket[]) : [];
}

function ticketsCacheKey(
  selectedProjectId: string,
  projects: ProjectForCard[],
  userRole: string | undefined,
): string {
  if (selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)) {
    const ids = projectsForSelection(projects, selectedProjectId)
      .map((p) => p.id)
      .sort()
      .join("|");
    return `${selectedProjectId}:${ids}`;
  }
  if (selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS && isConsultantLikeRole(userRole)) {
    return `${DASHBOARD_DAILY_ALL_PROJECTS}:${projects.map((p) => p.id).sort().join("|")}`;
  }
  return selectedProjectId;
}

/**
 * Conteúdo do Dashboard Daily (lista de projetos + Kanban).
 * Usado por admin, consultor e gestor para evitar importar page de outra rota (causa erro no cliente).
 */
export function DashboardDailyContent() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectForCard[]>([]);
  const [projectGroups, setProjectGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [projectMenuRect, setProjectMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [allTickets, setAllTickets] = useState<PackageTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  /** Tarefas por projeto: reabrir o mesmo projeto mostra na hora e revalida em background. */
  const ticketsByProjectRef = useRef<Map<string, PackageTicket[]>>(new Map());

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
    apiFetch("/api/project-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProjectGroups(Array.isArray(list) ? list : []))
      .catch(() => setProjectGroups([]));
  }, []);

  // Mantém o dropdown fora de qualquer overflow (position: fixed via portal)
  useEffect(() => {
    if (!projectMenuOpen) return;
    const update = () => {
      const el = projectAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setProjectMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectMenuOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const anchor = projectAnchorRef.current;
      const menu = document.getElementById("project-menu-portal");
      const inside = (anchor && target && anchor.contains(target)) || (menu && target && menu.contains(target));
      if (!inside) setProjectMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!selectedProjectId) {
      setAllTickets([]);
      setTicketsLoading(false);
      return;
    }

    const cacheKey = ticketsCacheKey(selectedProjectId, projects, user?.role);
    const isAllProjects = selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS;
    const isGroupSelection = selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX);
    if (isGroupSelection && projectsForSelection(projects, selectedProjectId).length === 0) {
      setAllTickets([]);
      setTicketsLoading(false);
      return;
    }
    if (isAllProjects && authLoading) {
      setTicketsLoading(true);
      return;
    }

    const hadCache = ticketsByProjectRef.current.has(cacheKey);
    const snapshot = hadCache ? ticketsByProjectRef.current.get(cacheKey)! : undefined;
    if (hadCache) {
      setAllTickets(snapshot!);
      setTicketsLoading(false);
    } else {
      setTicketsLoading(true);
    }

    let cancelled = false;
    (async () => {
      try {
        const arr = await fetchDashboardDailyTickets({
          selectedProjectId,
          projects,
          userRole: user?.role,
          userId: user?.id,
        });
        if (cancelled) return;
        ticketsByProjectRef.current.set(cacheKey, arr);
        setAllTickets(arr);
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar tarefas:", err);
        if (!hadCache) setAllTickets([]);
      } finally {
        if (!cancelled) setTicketsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, projects, user?.role, authLoading]);

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

  const filteredBySearch = searchQuery.trim()
    ? tickets.filter(
        (t) =>
          t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.code?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tickets;

  const refetchTickets = async () => {
    if (!selectedProjectId) return;
    const isGroupSelection = selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX);
    if (isGroupSelection && projectsForSelection(projects, selectedProjectId).length === 0) {
      setAllTickets([]);
      return;
    }
    if (selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS && authLoading) return;
    const cacheKey = ticketsCacheKey(selectedProjectId, projects, user?.role);
    if (!ticketsByProjectRef.current.has(cacheKey)) setTicketsLoading(true);
    try {
      const arr = await fetchDashboardDailyTickets({
        selectedProjectId,
        projects,
        userRole: user?.role,
        userId: user?.id,
      });
      ticketsByProjectRef.current.set(cacheKey, arr);
      setAllTickets(arr);
    } catch (err) {
      console.error("Erro ao recarregar tarefas:", err);
    } finally {
      setTicketsLoading(false);
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
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 bg-[color:var(--surface)]/60 backdrop-blur border-b border-[color:var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Dashboard Daily</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Visualize e gerencie tarefas em formato Kanban. Em &quot;Todos&quot;, aparecem todas as tarefas visíveis para o seu perfil. Você também pode filtrar por grupo de projetos.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative w-full md:w-64 flex-shrink-0">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--muted-foreground)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarefas..."
                className="w-full rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  ref={projectAnchorRef}
                  className="w-full px-4 py-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] flex items-center gap-2 text-left"
                  aria-haspopup="listbox"
                  aria-expanded={projectMenuOpen}
                >
                  <span className="truncate">
                    {(() => {
                      if (!selectedProjectId) return "Selecione um projeto...";
                      if (selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS) return "Todos";
                      if (selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)) {
                        const gid = selectedGroupIdFromKey(selectedProjectId);
                        const g = gid ? projectGroups.find((x) => x.id === gid) : null;
                        return g?.name ? `Grupo: ${g.name}` : "Grupo de projetos";
                      }
                      const p = projects.find((x) => x.id === selectedProjectId);
                      return p ? `${p.client?.name ?? "—"} · ${p.name}` : "Projeto";
                    })()}
                  </span>
                  <span className="ml-auto text-[color:var(--muted-foreground)]">▾</span>
                </button>
                {typeof document !== "undefined" && projectMenuOpen && projectMenuRect
                  ? createPortal(
                      <div
                        id="project-menu-portal"
                        role="listbox"
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl overflow-hidden"
                        style={{
                          position: "fixed",
                          left: projectMenuRect.left,
                          top: projectMenuRect.top,
                          width: projectMenuRect.width,
                          zIndex: 80,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId("");
                            setProjectMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm hover:bg-black/5 text-[color:var(--muted-foreground)]"
                        >
                          Selecione um projeto...
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(DASHBOARD_DAILY_ALL_PROJECTS);
                            setProjectMenuOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm hover:bg-black/5 ${
                            selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS ? "bg-black/5 font-semibold" : ""
                          }`}
                        >
                          Todos
                        </button>

                        {projectGroups.length > 0 && (
                          <div className="py-2">
                            <div className="px-4 py-2 text-xs font-semibold tracking-wide uppercase text-[color:var(--muted-foreground)]">
                              Grupos de projetos
                            </div>
                            {projectGroups.map((g) => {
                              const val = groupKey(g.id);
                              const active = selectedProjectId === val;
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectId(val);
                                    setProjectMenuOpen(false);
                                  }}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-black/5 ${
                                    active ? "bg-black/5 font-semibold" : ""
                                  }`}
                                >
                                  {g.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="py-2 border-t border-[color:var(--border)]">
                          <div className="px-4 py-2 text-xs font-semibold tracking-wide uppercase text-[color:var(--muted-foreground)]">
                            Projetos
                          </div>
                          <div className="max-h-[320px] overflow-auto">
                            {projects.map((p) => {
                              const active = selectedProjectId === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectId(p.id);
                                    setProjectMenuOpen(false);
                                  }}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-black/5 ${
                                    active ? "bg-black/5 font-semibold" : ""
                                  }`}
                                >
                                  <span className="truncate block">
                                    {p.client?.name ?? "—"} · {p.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setRetryCount((c) => c + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-xs font-medium text-[color:var(--foreground)] hover:opacity-90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar projetos
            </button>
          </div>

          {selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX) &&
          projectsForSelection(projects, selectedProjectId).length === 0 ? (
            <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--border)] p-8 text-center text-[color:var(--muted-foreground)] text-sm">
              Nenhum projeto encontrado neste grupo.
              Ajuste em <span className="font-semibold">Novo projeto</span> ou <span className="font-semibold">Editar projeto</span>.
            </div>
          ) : selectedProjectId && ticketsLoading ? (
            <div className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-[color:var(--muted-foreground)] text-sm">
              {selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS
                ? "Carregando tarefas de todos os projetos…"
                : selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)
                  ? "Carregando tarefas do grupo…"
                  : "Carregando tarefas do projeto…"}
            </div>
          ) : selectedProjectId ? (
            <div className="w-full">
              <KanbanWithFilters
                tickets={filteredBySearch}
                projectId={selectedProjectId}
                kanbanAggregateMode={
                  selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS ||
                  selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)
                }
                aggregateProjectIds={
                  selectedProjectId === DASHBOARD_DAILY_ALL_PROJECTS
                    ? projects.map((p) => p.id)
                    : selectedProjectId.startsWith(DASHBOARD_DAILY_GROUP_PREFIX)
                      ? projectsForSelection(projects, selectedProjectId).map((p) => p.id)
                      : selectedProjectId
                        ? [selectedProjectId]
                        : []
                }
                kanbanSubprojectsFromParent={kanbanSubprojectsFromParent}
                onTicketClick={() => {}}
                onTicketDelete={handleDeleteTicket}
                onTicketCreated={refetchTickets}
              />
            </div>
          ) : (
            <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--border)] p-8 text-center text-[color:var(--muted-foreground)]">
              <p className="text-[color:var(--muted-foreground)] text-sm">Selecione um projeto para visualizar o Kanban</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
