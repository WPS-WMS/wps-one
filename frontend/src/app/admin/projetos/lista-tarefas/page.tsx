"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search, Filter, ChevronDown, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { EditTaskModalFull } from "@/components/EditTaskModalFull";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";
import { loadAllMergedKanbanCustomColumns } from "@/lib/kanbanMergedStorage";

type UserOption = { id: string; name: string; role?: string };
type ClientOption = { id: string; name: string };

type TicketRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  statusLabel?: string | null;
  statusColor?: string | null;
  type: string;
  createdAt: string;
  dataFimPrevista?: string | null;
  queuePriority?: number | null;
  projectId: string;
  project?: { id: string; name: string; client?: { id?: string; name: string } };
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  responsibles?: Array<{ user: { id: string; name: string } }>;
};

type FullTicket = any;

const FIXED_KANBAN_COLUMNS = [
  { id: "BACKLOG", label: "Em aberto" },
  { id: "EM_EXECUCAO", label: "Em execução" },
  { id: "FINALIZADAS", label: "Finalizadas" },
] as const;

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ymd = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function collectMemberNames(t: TicketRow): string {
  const names = new Set<string>();
  if (t.assignedTo?.name) names.add(t.assignedTo.name);
  if (t.responsibles) {
    for (const r of t.responsibles) {
      if (r?.user?.name) names.add(r.user.name);
    }
  }
  return Array.from(names.values()).join(", ");
}

export default function ListaTarefasPage() {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
      : "/admin";

  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [memberId, setMemberId] = useState("");
  const [clientId, setClientId] = useState("");
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const statusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const memberAnchorRef = useRef<HTMLButtonElement | null>(null);
  const clientAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [statusMenuRect, setStatusMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [memberMenuRect, setMemberMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [clientMenuRect, setClientMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<FullTicket | null>(null);
  const [selectedTicketProjectName, setSelectedTicketProjectName] = useState<string>("");
  const [queueInputById, setQueueInputById] = useState<Record<string, string>>({});
  const [queueDirtyById, setQueueDirtyById] = useState<Record<string, boolean>>({});
  const [savingQueue, setSavingQueue] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyCount = useMemo(() => Object.values(queueDirtyById).filter(Boolean).length, [queueDirtyById]);

  const roleUpper = String(user?.role ?? "").toUpperCase();
  const isCliente = roleUpper === "CLIENTE";
  const canAccessListaTarefas =
    roleUpper === "SUPER_ADMIN" || (permissionsReady && can("projeto.listaTarefas"));
  const canViewAllUsersTasks =
    roleUpper === "SUPER_ADMIN" ||
    (permissionsReady && canAccessListaTarefas && can("tarefa.verTodos"));
  const restrictToOwnTasks = !isCliente && canAccessListaTarefas && !canViewAllUsersTasks;
  const canEditTarefa = !isCliente && can("tarefa.editar");

  async function openTaskModal(row: TicketRow) {
    // UX: abre a modal imediatamente (sem bloquear no fetch).
    // O componente da modal já faz fetch do ticket completo quando necessário.
    setSelectedTicketProjectName(row.project?.name ?? "");
    setSelectedTicket({
      id: row.id,
      projectId: row.projectId,
      code: row.code,
      title: row.title,
      status: row.status,
    } as any);

    // Prefetch em background para reduzir o "loading" dentro da modal, sem travar o clique.
    try {
      const res = await apiFetch(`/api/tickets/${row.id}`);
      if (!res.ok) return;
      const full = await res.json().catch(() => null);
      if (!full) return;
      setSelectedTicket((prev: FullTicket | null) => {
        if (!prev || (prev as any)?.id !== row.id) return prev;
        return full;
      });
    } catch {
      // Silencioso: a modal ainda pode carregar/mostrar erro próprio.
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (loading || !user?.id || !permissionsReady) return;
    if (!canAccessListaTarefas) {
      router.replace(`${basePath}/projetos`);
    }
  }, [loading, user?.id, permissionsReady, canAccessListaTarefas, router, basePath]);

  useEffect(() => {
    if (loading || !user?.id || !permissionsReady) return;
    if (roleUpper === "CLIENTE") {
      setUsers([]);
      return;
    }
    if (restrictToOwnTasks) {
      setUsers([{ id: user.id, name: user.name }]);
      setMemberId(user.id);
      setMemberOpen(false);
      return;
    }
    apiFetch("/api/users/for-select?scope=lista-tarefas&status=todos")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UserOption[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [
    loading,
    user?.id,
    user?.name,
    roleUpper,
    restrictToOwnTasks,
    permissionsReady,
    canViewAllUsersTasks,
  ]);

  useEffect(() => {
    if (loading || !user || isCliente) {
      if (isCliente) setClients([]);
      return;
    }
    if (restrictToOwnTasks) {
      setClients([]);
      setClientId("");
      return;
    }
    if (!permissionsReady || !canViewAllUsersTasks) return;
    apiFetch("/api/clients/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClientOption[]) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  }, [loading, user, isCliente, restrictToOwnTasks, permissionsReady, canViewAllUsersTasks]);

  useEffect(() => {
    if (!restrictToOwnTasks) return;
    const byId = new Map<string, ClientOption>();
    for (const t of rows) {
      const c = t.project?.client;
      if (c?.id && c?.name) byId.set(c.id, { id: c.id, name: c.name });
    }
    setClients(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }, [rows, restrictToOwnTasks]);

  async function load() {
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (dueFrom) params.set("dueFrom", dueFrom);
      if (dueTo) params.set("dueTo", dueTo);
      if (!isCliente && memberId && canViewAllUsersTasks) params.set("memberId", memberId);
      if (!isCliente && clientId) params.set("clientId", clientId);
      if (statusIds.length > 0) params.set("status", statusIds.map((s) => encodeURIComponent(s)).join(","));
      const res = await apiFetch(`/api/tickets/tasks-list?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Erro ao carregar tarefas");
      }
      const data = (await res.json().catch(() => [])) as TicketRow[];
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      setQueueInputById((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const r of nextRows) {
          if (!r?.id) continue;
          next[r.id] = r.queuePriority != null ? String(r.queuePriority) : "";
        }
        return next;
      });
      setQueueDirtyById({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar tarefas");
      setRows([]);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (loading || !user?.id || !permissionsReady) return;
    if (!canAccessListaTarefas) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, permissionsReady, canAccessListaTarefas, restrictToOwnTasks]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((t) => {
      const members = collectMemberNames(t).toLowerCase();
      return (
        String(t.code ?? "").toLowerCase().includes(term) ||
        String(t.title ?? "").toLowerCase().includes(term) ||
        String(t.project?.name ?? "").toLowerCase().includes(term) ||
        String(t.project?.client?.name ?? "").toLowerCase().includes(term) ||
        members.includes(term)
      );
    });
  }, [rows, q]);

  const hasAdvancedFilters = Boolean(createdFrom || createdTo || dueFrom || dueTo);
  const hasAnyFilters = Boolean(
    q.trim() || statusIds.length > 0 || hasAdvancedFilters || (!isCliente && Boolean(clientId)),
  );

  const statusOptions = useMemo(() => {
    const base = [
      { id: "", label: "Todos" },
      // "Atrasados" é um filtro especial (independente do status no Kanban)
      { id: "__OVERDUE__", label: "Atrasados" },
      ...FIXED_KANBAN_COLUMNS,
    ];

    const toKanbanLabelToken = (label: string) => `__KANBAN_LABEL__:${label}`;
    const normalizeLabelKey = (label: string) => label.trim().toLocaleLowerCase("pt-BR");

    const customColumns = loadAllMergedKanbanCustomColumns()
      .filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
      .map((c) => ({ id: String(c.id), label: String(c.label) }));
    const customByLabelKey = new Map<string, { id: string; label: string }>();
    for (const c of customColumns) {
      const key = normalizeLabelKey(c.label);
      if (!key) continue;
      if (!customByLabelKey.has(key)) {
        customByLabelKey.set(key, { id: toKanbanLabelToken(c.label.trim()), label: c.label.trim() });
      }
    }
    const custom = Array.from(customByLabelKey.values());
    custom.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    // Garante que status existentes nas tarefas apareçam mesmo sem localStorage (ex.: cache limpo)
    const inferredFromRows = Array.from(
      new Set(
        rows
          .map((r) => String(r.status ?? "").trim())
          .filter((s) => s && s.startsWith("CUSTOM_")),
      ),
    ).map((id) => {
      const st = getTicketStatusDisplay({ status: id, projectId: rows.find((x) => x.status === id)?.projectId });
      const label = String(st.label || id).trim();
      return { id: toKanbanLabelToken(label), label };
    });

    // Dedup por id (base tem prioridade) e mantém "Todos" no topo
    const byId = new Map<string, { id: string; label: string }>();
    for (const o of [...base, ...custom, ...inferredFromRows]) {
      if (!o.id) continue;
      if (!byId.has(o.id)) byId.set(o.id, o);
    }
    return [{ id: "", label: "Todos" }, ...Array.from(byId.values()).filter((o) => o.id !== "")];
  }, [rows]);

  const selectableStatusIds = useMemo(
    () => statusOptions.filter((o) => o.id !== "").map((o) => o.id),
    [statusOptions],
  );

  const isTodosChecked = useMemo(
    () => selectableStatusIds.length > 0 && selectableStatusIds.every((id) => statusIds.includes(id)),
    [selectableStatusIds, statusIds],
  );

  const selectedStatusLabels = useMemo(() => {
    if (statusIds.length === 0 || isTodosChecked) return "Todos";
    const map = new Map(statusOptions.map((o) => [o.id, o.label] as const));
    const labels = statusIds.map((id) => map.get(id) ?? id).filter(Boolean);
    if (labels.length === 0) return "Todos";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }, [statusIds, statusOptions, isTodosChecked]);

  function toggleStatusFilter(id: string) {
    if (id === "") {
      setStatusIds(isTodosChecked ? [] : [...selectableStatusIds]);
      return;
    }
    setStatusIds((prev) => {
      const has = prev.includes(id);
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  const selectedMemberLabel = useMemo(() => {
    if (isCliente) return "—";
    if (!permissionsReady) return user?.name ?? "…";
    if (!canViewAllUsersTasks) return user?.name ?? "Eu";
    if (!memberId) return "Todos";
    return users.find((u) => u.id === memberId)?.name ?? "Todos";
  }, [isCliente, memberId, users, permissionsReady, canViewAllUsersTasks, user?.name]);

  const selectedClientLabel = useMemo(() => {
    if (!clientId) return "Todos";
    return clients.find((c) => c.id === clientId)?.name ?? "Todos";
  }, [clientId, clients]);

  // Mantém o dropdown fora de qualquer overflow (com position: fixed)
  useEffect(() => {
    if (!statusOpen) return;
    const update = () => {
      const el = statusAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setStatusMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [statusOpen]);

  useEffect(() => {
    if (!memberOpen) return;
    const update = () => {
      const el = memberAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMemberMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [memberOpen]);

  useEffect(() => {
    if (!clientOpen) return;
    const update = () => {
      const el = clientAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setClientMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [clientOpen]);

  useEffect(() => {
    if (!statusOpen && !memberOpen && !clientOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStatusOpen(false);
        setMemberOpen(false);
        setClientOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const statusAnchor = statusAnchorRef.current;
      const memberAnchor = memberAnchorRef.current;
      const clientAnchor = clientAnchorRef.current;
      const statusMenu = document.getElementById("status-menu-portal");
      const memberMenu = document.getElementById("member-menu-portal");
      const clientMenu = document.getElementById("client-menu-portal");
      if (statusOpen) {
        const inside =
          (statusAnchor && target && statusAnchor.contains(target)) ||
          (statusMenu && target && statusMenu.contains(target));
        if (!inside) setStatusOpen(false);
      }
      if (memberOpen) {
        const inside =
          (memberAnchor && target && memberAnchor.contains(target)) ||
          (memberMenu && target && memberMenu.contains(target));
        if (!inside) setMemberOpen(false);
      }
      if (clientOpen) {
        const inside =
          (clientAnchor && target && clientAnchor.contains(target)) ||
          (clientMenu && target && clientMenu.contains(target));
        if (!inside) setClientOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [statusOpen, memberOpen, clientOpen]);

  function clearFilters() {
    setQ("");
    setStatusIds([]);
    setMemberId(restrictToOwnTasks && user?.id ? user.id : "");
    setClientId("");
    setCreatedFrom("");
    setCreatedTo("");
    setDueFrom("");
    setDueTo("");
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 bg-[color:var(--surface)]/60 backdrop-blur border-b border-[color:var(--border)] px-6 py-4">
        <button
          type="button"
          onClick={() => router.push(`${basePath}/projetos`)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Lista de Tarefas</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Visão consolidada de tarefas para acompanhamento, cobranças e planejamento.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        {typeof document !== "undefined" && statusOpen && statusMenuRect
          ? createPortal(
              <div
                id="status-menu-portal"
                style={{
                  position: "fixed",
                  left: statusMenuRect.left,
                  top: statusMenuRect.top,
                  width: statusMenuRect.width,
                  zIndex: 10000,
                }}
              >
                <div
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto"
                  role="listbox"
                >
                  {statusOptions.map((o) => {
                    const checked = o.id === "" ? isTodosChecked : statusIds.includes(o.id);
                    return (
                      <button
                        key={o.id === "" ? "__todos__" : o.id}
                        type="button"
                        onClick={() => toggleStatusFilter(o.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                          o.id === "" ? "font-semibold" : ""
                        }`}
                      >
                        <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                        <span className="truncate">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}

        {typeof document !== "undefined" && clientOpen && clientMenuRect
          ? createPortal(
              <div
                id="client-menu-portal"
                style={{
                  position: "fixed",
                  left: clientMenuRect.left,
                  top: clientMenuRect.top,
                  width: clientMenuRect.width,
                  zIndex: 10000,
                }}
              >
                <div
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto"
                  role="listbox"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setClientId("");
                      setClientOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                  >
                    Todos
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                  {clients.map((c) => {
                    const active = clientId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                          active ? "font-semibold" : ""
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}

        {typeof document !== "undefined" && memberOpen && memberMenuRect
          ? createPortal(
              <div
                id="member-menu-portal"
                style={{
                  position: "fixed",
                  left: memberMenuRect.left,
                  top: memberMenuRect.top,
                  width: memberMenuRect.width,
                  zIndex: 10000,
                }}
              >
                <div
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto"
                  role="listbox"
                >
                  {canViewAllUsersTasks ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberId("");
                          setMemberOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                      >
                        Todos
                      </button>
                      <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                    </>
                  ) : null}
                  {users.map((u) => {
                    const active = memberId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setMemberId(u.id);
                          setMemberOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                          active ? "font-semibold" : ""
                        }`}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}

        <div className="max-w-7xl mx-auto space-y-4">
          <div
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-visible"
            style={{
              background:
                "linear-gradient(135deg, rgba(92,0,225,0.08), rgba(0,0,0,0.02))",
            }}
          >
            <div className="p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-end gap-3 flex-1">
                  <div className="w-full sm:flex-[2] sm:min-w-[360px] lg:min-w-[420px]">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                      Buscar
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--muted-foreground)]" />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Código, título, projeto, cliente, membro..."
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      />
                    </div>
                  </div>

                  <div className="w-full sm:flex-1 sm:min-w-[190px] lg:w-auto">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                      Status
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        ref={statusAnchorRef}
                        onClick={() => {
                          setMemberOpen(false);
                          setClientOpen(false);
                          setStatusOpen((v) => !v);
                        }}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                        aria-expanded={statusOpen}
                      >
                        <span className="truncate">{selectedStatusLabels}</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${statusOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {!isCliente && (
                    <div className="w-full sm:flex-1 sm:min-w-[220px] lg:w-auto">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Cliente
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          ref={clientAnchorRef}
                          onClick={() => {
                            if (restrictToOwnTasks && clients.length === 0) return;
                            setStatusOpen(false);
                            setMemberOpen(false);
                            setClientOpen((v) => !v);
                          }}
                          disabled={restrictToOwnTasks && clients.length === 0}
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                          aria-expanded={clientOpen}
                        >
                          <span className="truncate">{selectedClientLabel}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${clientOpen ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="w-full sm:flex-1 sm:min-w-[220px] lg:w-auto">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                      Membro
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        ref={memberAnchorRef}
                        onClick={() => {
                          if (isCliente || restrictToOwnTasks) return;
                          setStatusOpen(false);
                          setClientOpen(false);
                          setMemberOpen((v) => !v);
                        }}
                        disabled={isCliente || restrictToOwnTasks}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                        aria-expanded={memberOpen}
                      >
                        <span className="truncate">{isCliente ? "—" : selectedMemberLabel}</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${memberOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90 ${
                      showAdvanced || hasAdvancedFilters
                        ? "bg-[color:var(--primary)]/[0.10] text-[color:var(--foreground)]"
                        : "bg-[color:var(--surface)] text-[color:var(--foreground)]"
                    }`}
                    style={{ borderColor: "var(--border)" }}
                    aria-expanded={showAdvanced}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    Filtros avançados
                    {hasAdvancedFilters && (
                      <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "rgba(92,0,225,0.12)", color: "var(--primary)" }}
                      >
                        ativo
                      </span>
                    )}
                  </button>

                  {hasAnyFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90"
                      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
                      title="Limpar filtros"
                    >
                      <X className="h-4 w-4" />
                      Limpar
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={fetching}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] transition hover:opacity-95 disabled:opacity-50"
                  >
                    <Filter className="h-4 w-4" />
                    Filtrar
                  </button>

                  {(() => {
                    const role = String(user?.role ?? "").toUpperCase();
                    const canEditQueue = role === "GESTOR_PROJETOS" || role === "SUPER_ADMIN";
                    if (!canEditQueue) return null;
                    if (dirtyCount === 0) return null;
                    return (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            // Restaura valores do backend (descarta mudanças locais)
                            setQueueInputById((prev) => {
                              const next: Record<string, string> = { ...prev };
                              for (const r of rows) {
                                if (!r?.id) continue;
                                next[r.id] = r.queuePriority != null ? String(r.queuePriority) : "";
                              }
                              return next;
                            });
                            setQueueDirtyById({});
                          }}
                          disabled={savingQueue}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90 disabled:opacity-50"
                          style={{
                            borderColor: "var(--border)",
                            background: "rgba(0,0,0,0.02)",
                            color: "var(--foreground)",
                          }}
                          title="Descartar alterações de prioridade"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          disabled={savingQueue}
                          onClick={async () => {
                            setSavingQueue(true);
                            try {
                              const changes = Object.entries(queueDirtyById)
                                .filter(([, v]) => Boolean(v))
                                .map(([id]) => {
                                  const raw = String(queueInputById[id] ?? "").trim();
                                  const qp = raw === "" ? null : Number.parseInt(raw, 10);
                                  return { ticketId: id, queuePriority: Number.isNaN(qp as any) ? null : qp };
                                });
                              const r = await apiFetch(`/api/tickets/tasks-list/queue-priorities`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ changes }),
                              });
                              if (!r.ok) {
                                const body = await r.json().catch(() => null);
                                throw new Error(body?.error ?? "Erro ao salvar prioridades");
                              }
                              const body = await r.json().catch(() => null);
                              const updated = Array.isArray(body?.updated) ? (body.updated as Array<{ id: string; queuePriority: number | null }>) : [];
                              const map = new Map(updated.map((u) => [u.id, u.queuePriority] as const));
                              setRows((prev) =>
                                prev.map((row) => (map.has(row.id) ? { ...row, queuePriority: map.get(row.id) ?? null } : row)),
                              );
                              setQueueInputById((prev) => {
                                const next = { ...prev };
                                for (const [id, qp] of map.entries()) {
                                  next[id] = qp != null ? String(qp) : "";
                                }
                                return next;
                              });
                              setQueueDirtyById({});
                              // Recarrega só se o usuário estiver filtrando por membro/status/datas e precisar reordenar globalmente
                              // (a resposta já traz a normalização, então na prática não é necessário recarregar).
                            } catch (e: any) {
                              setError(e?.message ?? "Erro ao salvar prioridades");
                            } finally {
                              setSavingQueue(false);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] transition hover:opacity-95 disabled:opacity-50"
                          title={`Salvar ${dirtyCount} alteração(ões)`}
                        >
                          {savingQueue ? "Salvando..." : `Salvar (${dirtyCount})`}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {showAdvanced && (
                <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/70 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Criação (de)
                      </label>
                      <input
                        type="date"
                        value={createdFrom}
                        onChange={(e) => setCreatedFrom(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Criação (até)
                      </label>
                      <input
                        type="date"
                        value={createdTo}
                        onChange={(e) => setCreatedTo(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Entrega (de)
                      </label>
                      <input
                        type="date"
                        value={dueFrom}
                        onChange={(e) => setDueFrom(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Entrega (até)
                      </label>
                      <input
                        type="date"
                        value={dueTo}
                        onChange={(e) => setDueTo(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-[color:var(--muted-foreground)]">
                    Dica: use as datas para isolar atrasos e períodos de demanda.
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs text-[color:var(--muted-foreground)]">
                Mostrando <strong>{filtered.length}</strong> de <strong>{rows.length}</strong> tarefa(s) carregadas.
              </div>

              {error && (
                <div
                  className="mt-3 rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-4 py-3 text-left font-semibold">Código</th>
                    <th className="px-4 py-3 text-left font-semibold">Tarefa</th>
                    <th className="px-4 py-3 text-left font-semibold">Projeto</th>
                    <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                    <th className="px-4 py-3 text-left font-semibold">Responsáveis</th>
                    <th className="px-4 py-3 text-left font-semibold">Prioridade</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Criada em</th>
                    <th className="px-4 py-3 text-left font-semibold">Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {fetching ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                        Carregando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                        Nenhuma tarefa encontrada.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => {
                      const allowOverdue =
                        statusIds.length === 0 ||
                        statusIds.includes("__OVERDUE__") ||
                        isTodosChecked;
                      const st = getTicketStatusDisplay({
                        status: t.status,
                        statusLabel: t.statusLabel,
                        statusColor: t.statusColor,
                        projectId: t.projectId,
                        dataFimPrevista: t.dataFimPrevista ?? null,
                        allowOverdue,
                      });
                      const role = String(user?.role ?? "").toUpperCase();
                      const canEditQueue = role === "GESTOR_PROJETOS" || role === "SUPER_ADMIN";
                      const stUpper = String(t.status ?? "").toUpperCase();
                      const isClosed = stUpper === "ENCERRADO" || stUpper === "FINALIZADAS";
                      const disabled = !canEditQueue || isClosed;
                      const value = queueInputById[t.id] ?? (t.queuePriority != null ? String(t.queuePriority) : "");
                      return (
                        <tr
                          key={t.id}
                          className="border-t hover:opacity-95 cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => void openTaskModal(t)}
                          title="Abrir tarefa"
                        >
                          <td className="px-4 py-3 font-mono text-[color:var(--foreground)] whitespace-nowrap">
                            #{t.code}
                          </td>
                          <td className="px-4 py-3 text-[color:var(--foreground)] max-w-[420px]">
                            <div className="font-medium line-clamp-1" title={t.title}>{t.title}</div>
                          </td>
                          <td className="px-4 py-3 text-[color:var(--foreground)]">
                            {t.project?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-[color:var(--muted-foreground)]">
                            {t.project?.client?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-[color:var(--muted-foreground)] max-w-[260px]">
                            <span className="line-clamp-1" title={collectMemberNames(t) || "—"}>
                              {collectMemberNames(t) || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              disabled={disabled}
                              value={value}
                              placeholder="—"
                              className="w-24 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-60"
                              onChange={(e) => {
                                const v = e.currentTarget.value;
                                setQueueInputById((prev) => ({ ...prev, [t.id]: v }));
                                setQueueDirtyById((prev) => ({ ...prev, [t.id]: true }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              title={
                                !canEditQueue
                                  ? "Apenas Gestor de Projetos e Super Admin podem editar."
                                  : isClosed
                                    ? "Tarefa finalizada não entra na fila."
                                    : "1 = mais prioritária"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold text-white ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[color:var(--muted-foreground)] whitespace-nowrap">
                            {fmtDateOnly(t.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-[color:var(--muted-foreground)] whitespace-nowrap">
                            {fmtDateOnly(t.dataFimPrevista ?? null)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {selectedTicket && (
        <EditTaskModalFull
          ticket={selectedTicket}
          projectId={selectedTicket.projectId ?? undefined}
          projectName={selectedTicketProjectName}
          readOnly={!canEditTarefa}
          allowTimeEntryInReadOnly={!isCliente}
          onClose={() => setSelectedTicket(null)}
          onSaved={() => {
            setSelectedTicket(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

