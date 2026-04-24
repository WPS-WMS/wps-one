"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search, Filter, ChevronDown, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";
import { loadAllMergedKanbanCustomColumns } from "@/lib/kanbanMergedStorage";

type UserOption = { id: string; name: string };

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
  projectId: string;
  project?: { id: string; name: string; client?: { name: string } };
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  responsibles?: Array<{ user: { id: string; name: string } }>;
};

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
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [memberId, setMemberId] = useState("");
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const statusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const memberAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [statusMenuRect, setStatusMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [memberMenuRect, setMemberMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("projeto.listaTarefas")) {
      router.replace(`${basePath}/projetos`);
    }
  }, [loading, user, can, router, basePath]);

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UserOption[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  async function load() {
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (dueFrom) params.set("dueFrom", dueFrom);
      if (dueTo) params.set("dueTo", dueTo);
      if (memberId) params.set("memberId", memberId);
      if (statusIds.length > 0) params.set("status", statusIds.join(","));
      const res = await apiFetch(`/api/tickets/tasks-list?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Erro ao carregar tarefas");
      }
      const data = (await res.json().catch(() => [])) as TicketRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar tarefas");
      setRows([]);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (loading || !user) return;
    if (!can("projeto.listaTarefas")) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, can]);

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
  const hasAnyFilters = Boolean(q.trim() || statusIds.length > 0 || memberId || hasAdvancedFilters);

  const projectIdsInRows = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      const pid = String(r.projectId || "").trim();
      if (pid) ids.add(pid);
    }
    return Array.from(ids);
  }, [rows]);

  const statusOptions = useMemo(() => {
    const base = [
      { id: "", label: "Todos" },
      // "Atrasados" é um filtro especial (independente do status no Kanban)
      { id: "__OVERDUE__", label: "Atrasados" },
      ...FIXED_KANBAN_COLUMNS,
    ];

    const custom = loadAllMergedKanbanCustomColumns()
      .filter((c) => c && typeof c.id === "string")
      .map((c) => ({ id: c.id, label: c.label }));
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
      return { id, label: st.label || id };
    });

    // Dedup por id (base tem prioridade) e mantém "Todos" no topo
    const byId = new Map<string, { id: string; label: string }>();
    for (const o of [...base, ...custom, ...inferredFromRows]) {
      if (!o.id) continue;
      if (!byId.has(o.id)) byId.set(o.id, o);
    }
    return [{ id: "", label: "Todos" }, ...Array.from(byId.values()).filter((o) => o.id !== "")];
  }, [projectIdsInRows, rows]);

  const selectedStatusLabels = useMemo(() => {
    if (statusIds.length === 0) return "Todos";
    const map = new Map(statusOptions.map((o) => [o.id, o.label] as const));
    const labels = statusIds.map((id) => map.get(id) ?? id).filter(Boolean);
    if (labels.length === 0) return "Todos";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }, [statusIds, statusOptions]);

  const selectedMemberLabel = useMemo(() => {
    if (!memberId) return "Todos";
    return users.find((u) => u.id === memberId)?.name ?? "Todos";
  }, [memberId, users]);

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
    if (!statusOpen && !memberOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStatusOpen(false);
        setMemberOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const statusAnchor = statusAnchorRef.current;
      const memberAnchor = memberAnchorRef.current;
      const statusMenu = document.getElementById("status-menu-portal");
      const memberMenu = document.getElementById("member-menu-portal");
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
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [statusOpen, memberOpen]);

  function clearFilters() {
    setQ("");
    setStatusIds([]);
    setMemberId("");
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
                  <button
                    type="button"
                    onClick={() => {
                      setStatusIds([]);
                      setStatusOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                  >
                    Todos
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                  {statusOptions
                    .filter((o) => o.id !== "")
                    .map((o) => {
                      const checked = statusIds.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setStatusIds((prev) => {
                              const has = prev.includes(o.id);
                              return has ? prev.filter((x) => x !== o.id) : [...prev, o.id];
                            });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition"
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-[280px]">
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

                  <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-3">
                    <div className="min-w-[180px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Status
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          ref={statusAnchorRef}
                          onClick={() => {
                            setMemberOpen(false);
                            setStatusOpen((v) => !v);
                          }}
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                          aria-expanded={statusOpen}
                        >
                          <span className="truncate">{selectedStatusLabels}</span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${statusOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="min-w-[220px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Membro
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          ref={memberAnchorRef}
                          onClick={() => {
                            setStatusOpen(false);
                            setMemberOpen((v) => !v);
                          }}
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                          aria-expanded={memberOpen}
                        >
                          <span className="truncate">{selectedMemberLabel}</span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${memberOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
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
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Criada em</th>
                    <th className="px-4 py-3 text-left font-semibold">Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {fetching ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                        Carregando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                        Nenhuma tarefa encontrada.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => {
                      const st = getTicketStatusDisplay({
                        status: t.status,
                        statusLabel: t.statusLabel,
                        statusColor: t.statusColor,
                        projectId: t.projectId,
                        dataFimPrevista: t.dataFimPrevista ?? null,
                        allowOverdue: true,
                      });
                      return (
                        <tr
                          key={t.id}
                          className="border-t hover:opacity-95 cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() =>
                            router.push(
                              `${basePath}/projetos/_/tarefas/_?projectId=${encodeURIComponent(
                                t.projectId,
                              )}&ticketId=${encodeURIComponent(t.id)}&from=lista-tarefas`,
                            )
                          }
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
    </div>
  );
}

