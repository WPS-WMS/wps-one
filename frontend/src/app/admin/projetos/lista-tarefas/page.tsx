"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search, Filter, ChevronDown, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";
import { loadMergedKanbanCustomColumns } from "@/lib/kanbanMergedStorage";

type UserOption = { id: string; name: string };

type TicketRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  type: string;
  createdAt: string;
  dataFimPrevista?: string | null;
  projectId: string;
  project?: { id: string; name: string; client?: { name: string } };
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  responsibles?: Array<{ user: { id: string; name: string } }>;
};

const BASE_STATUS_FILTERS = [
  { id: "", label: "Todos" },
  { id: "__OPEN__", label: "Em aberto" },
  { id: "__EXEC__", label: "Em execução" },
  { id: "__DONE__", label: "Finalizados" },
  { id: "__OVERDUE__", label: "Atrasados" },
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
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      if (status) params.set("status", status);
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
  const hasAnyFilters = Boolean(q.trim() || status || memberId || hasAdvancedFilters);

  const projectIdsInRows = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      const pid = String(r.projectId || "").trim();
      if (pid) ids.add(pid);
    }
    return Array.from(ids);
  }, [rows]);

  const statusOptions = useMemo(() => {
    const custom = projectIdsInRows.length > 0 ? loadMergedKanbanCustomColumns(projectIdsInRows) : [];
    const customOptions = custom
      .filter((c) => c && typeof c.id === "string" && c.id.startsWith("CUSTOM_"))
      .map((c) => ({ id: c.id, label: c.label }));
    return [...BASE_STATUS_FILTERS, ...customOptions];
  }, [projectIdsInRows]);

  function clearFilters() {
    setQ("");
    setStatus("");
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
        <div className="max-w-7xl mx-auto space-y-4">
          <div
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden"
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
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      >
                        {statusOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-[220px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                        Membro
                      </label>
                      <select
                        value={memberId}
                        onChange={(e) => setMemberId(e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      >
                        <option value="">Todos</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
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
                      const st = getTicketStatusDisplay({ status: t.status, projectId: t.projectId, dataFimPrevista: t.dataFimPrevista ?? null, allowOverdue: true });
                      return (
                        <tr
                          key={t.id}
                          className="border-t hover:opacity-95 cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => router.push(`${basePath}/projetos/${t.projectId}`)}
                          title="Abrir projeto"
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

