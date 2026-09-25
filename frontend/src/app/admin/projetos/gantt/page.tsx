"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  ProjectGanttChart,
  classifyGanttLane,
  type GanttRow,
} from "@/components/gantt/ProjectGanttChart";

const EditTaskModalFull = dynamic(
  () =>
    import("@/components/EditTaskModalFull").then((m) => ({ default: m.EditTaskModalFull })),
  { ssr: false },
);

type TicketApiRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  statusLabel?: string | null;
  progresso?: number | null;
  dataInicio?: string | null;
  dataFimPrevista?: string | null;
  projectId: string;
  project?: { id: string; name: string; client?: { id?: string; name: string } };
  assignedTo?: { id: string; name: string } | null;
  responsibles?: Array<{ user: { id: string; name: string } }>;
  parentTicket?: { id: string; code: string; title: string; type?: string } | null;
  predecessor?: { id: string; code: string; title: string } | null;
};

type FullTicket = any;

function collectResource(t: TicketApiRow): string {
  const names = new Set<string>();
  if (t.assignedTo?.name) names.add(t.assignedTo.name);
  for (const r of t.responsibles ?? []) {
    if (r?.user?.name) names.add(r.user.name);
  }
  return Array.from(names.values()).join(", ");
}

function toYmd(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ymd = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export default function GanttPage() {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const roleUpper = String(user?.role ?? "").toUpperCase();
  const canAccess =
    roleUpper === "SUPER_ADMIN" || (permissionsReady && can("projeto.listaTarefas"));
  const canEditTarefa = can("tarefa.editar");

  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketApiRow[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<FullTicket | null>(null);
  const [selectedTicketProjectName, setSelectedTicketProjectName] = useState("");

  useEffect(() => {
    if (loading || !permissionsReady) return;
    if (!canAccess) {
      router.replace(basePath);
    }
  }, [loading, permissionsReady, canAccess, router, basePath]);

  useEffect(() => {
    if (loading || !user?.id || !permissionsReady || !canAccess) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "500", arquivado: "false" });
        const res = await apiFetch(`/api/tickets/tasks-list?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Erro ao carregar tarefas");
        }
        const data = (await res.json().catch(() => [])) as TicketApiRow[];
        if (!cancelled) setTickets(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar tarefas");
          setTickets([]);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, permissionsReady, canAccess]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) {
      const id = t.project?.id ?? t.projectId;
      const name = t.project?.name ?? id;
      if (id) map.set(id, name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [tickets]);

  const ganttRows: GanttRow[] = useMemo(() => {
    const qNorm = q.trim().toLowerCase();
    const filtered = tickets.filter((t) => {
      if (projectId && (t.project?.id ?? t.projectId) !== projectId) return false;
      if (!qNorm) return true;
      const hay = [
        t.code,
        t.title,
        t.project?.name,
        t.parentTicket?.title,
        t.parentTicket?.code,
        t.predecessor?.code,
        collectResource(t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qNorm);
    });

    const mapped = filtered.map((t): GanttRow => {
      const start = toYmd(t.dataInicio ?? null);
      const end = toYmd(t.dataFimPrevista ?? null);
      const kind = classifyGanttLane({ start, end, status: t.status });
      return {
        id: t.id,
        projectName: t.project?.name ?? "—",
        topicName: t.parentTicket?.title ?? "—",
        code: t.code ?? "",
        title: t.title ?? "",
        resource: collectResource(t),
        predecessor: t.predecessor?.code ?? "—",
        start,
        end,
        status: t.status,
        statusLabel: t.statusLabel,
        kind,
        progress: typeof t.progresso === "number" ? t.progresso : 0,
      };
    });

    mapped.sort((a, b) => {
      const as = a.start ?? a.end ?? "9999";
      const bs = b.start ?? b.end ?? "9999";
      if (as !== bs) return as.localeCompare(bs);
      return a.code.localeCompare(b.code, "pt-BR");
    });
    return mapped;
  }, [tickets, q, projectId]);

  async function openTask(ticketId: string) {
    const row = tickets.find((t) => t.id === ticketId);
    setSelectedTicketProjectName(row?.project?.name ?? "");
    setSelectedTicket({
      id: ticketId,
      projectId: row?.projectId,
      code: row?.code,
      title: row?.title,
      status: row?.status,
    } as any);
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}`);
      if (!res.ok) return;
      const full = await res.json().catch(() => null);
      if (!full) return;
      setSelectedTicket((prev: FullTicket | null) => {
        if (!prev || (prev as any)?.id !== ticketId) return prev;
        return full;
      });
      if (full?.project?.name) setSelectedTicketProjectName(full.project.name);
    } catch {
      // modal carrega sozinha se precisar
    }
  }

  if (loading || !permissionsReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[color:var(--muted-foreground)]">
        Carregando…
      </div>
    );
  }

  if (!canAccess) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-3 py-4 md:px-6 md:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(`${basePath}/projetos/lista-tarefas`)}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Lista de Tarefas
          </button>
          <h1 className="text-xl font-semibold text-[color:var(--foreground)] md:text-2xl">Gantt</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted-foreground)]">
            Cronograma das tarefas por início e fim previstos. Barras em andamento, futuras, atrasadas e
            concluídas usam cores diferentes — veja a legenda acima da timeline.
          </p>
        </div>
        <div className="text-right text-xs text-[color:var(--muted-foreground)]">
          {fetching ? "Atualizando…" : `${ganttRows.length} tarefa${ganttRows.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-sm">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--muted-foreground)]">
          Buscar
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código, tarefa, projeto, recurso…"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] py-2 pl-8 pr-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
            />
          </span>
        </label>
        <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-[color:var(--muted-foreground)]">
          Projeto
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      <ProjectGanttChart rows={ganttRows} onOpenTask={openTask} />

      {selectedTicket && (
        <EditTaskModalFull
          ticket={selectedTicket}
          projectId={selectedTicket.projectId ?? undefined}
          projectName={selectedTicketProjectName}
          readOnly={!canEditTarefa}
          allowTimeEntryInReadOnly
          onClose={() => setSelectedTicket(null)}
          onSaved={() => {
            setSelectedTicket(null);
            void (async () => {
              try {
                const params = new URLSearchParams({ limit: "500", arquivado: "false" });
                const res = await apiFetch(`/api/tickets/tasks-list?${params.toString()}`);
                if (!res.ok) return;
                const data = (await res.json().catch(() => [])) as TicketApiRow[];
                setTickets(Array.isArray(data) ? data : []);
              } catch {
                /* ignore */
              }
            })();
          }}
        />
      )}
    </div>
  );
}
