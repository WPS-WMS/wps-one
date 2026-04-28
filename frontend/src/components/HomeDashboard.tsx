"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  Loader2,
  Calendar,
  ListTodo,
  Target,
} from "lucide-react";
import { EditTaskModalFull } from "./EditTaskModalFull";
import type { PackageTicket } from "./PackageCard";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";

export type HomeDashboardBasePath = "/consultor" | "/admin" | "/gestor";

type TicketForHome = {
  id: string;
  code: string;
  title: string;
  status: string;
  criticidade?: string | null;
  estimativaHoras?: number | null;
  dataFimPrevista?: string | null;
  project: { id: string; client: { name: string }; name: string };
  assignedTo?: { id: string; name: string } | null;
  responsibles?: { user: { id: string; name: string } }[];
  type: string;
  finalizacaoMotivo?: string | null;
  budget?: { status?: string | null } | null;
  [key: string]: unknown; // API retorna mais campos (description, createdAt, etc.) usados pelo modal
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENTE: 4,
  CRITICA: 4,
  ALTA: 3,
  MEDIA: 2,
  BAIXA: 1,
};

function normalizePriority(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function getPriorityDotClass(priorityRaw: unknown): string {
  const p = normalizePriority(priorityRaw);
  if (p === "URGENTE" || p === "CRITICA") return "bg-red-500";
  if (p === "ALTA") return "bg-orange-500";
  if (p === "MEDIA") return "bg-amber-500";
  if (p === "BAIXA") return "bg-[color:var(--primary)]";
  return "bg-slate-300";
}

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function getWeekOfMonth(d: Date): number {
  const dayOfMonth = d.getDate();
  return Math.ceil(dayOfMonth / 7);
}

function getStatusBadge(params: {
  status: unknown;
  statusLabel?: unknown;
  statusColor?: unknown;
  projectId?: string;
  dataFimPrevista?: string | null;
}): { label: string; className: string; dotClass: string } {
  const st = getTicketStatusDisplay({
    status: params.status,
    statusLabel: params.statusLabel,
    statusColor: params.statusColor,
    projectId: params.projectId,
    dataFimPrevista: params.dataFimPrevista,
    allowOverdue: true,
  });
  const className =
    st.sortBucket === 2
      ? "text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200"
      : st.sortBucket === 1
        ? "text-xs font-medium text-[color:var(--muted-foreground)] bg-[color:var(--surface)] px-2 py-1 rounded border border-[color:var(--border)]"
        : "text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200";
  return { label: st.label, className, dotClass: st.color };
}

type HomeDashboardProps = {
  /** Base path para links de projetos: /consultor ou /admin */
  basePath: HomeDashboardBasePath;
};

export function HomeDashboard({ basePath }: HomeDashboardProps) {
  const { user, can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState({ hoje: 0, semana: 0, mes: 0 });
  const [tickets, setTickets] = useState<TicketForHome[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<PackageTicket | null>(null);
  const [slaSummary, setSlaSummary] = useState<{
    percent: number | null;
    dentroPrazo: number;
    total: number;
    aplicavel: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    // Segurança/performance: sempre filtra por userId para evitar SUPER_ADMIN/gestor puxar o tenant inteiro.
    apiFetch(
      `/api/time-entries?start=${firstDayOfMonth.toISOString()}&end=${endOfToday.toISOString()}&userId=${encodeURIComponent(
        user.id,
      )}&light=true`,
    )
      .then((r) => r.json())
      .then((entries: Array<{ totalHoras: number; date: string }>) => {
        const todayStr = now.toISOString().slice(0, 10);
        const seg = new Date(now);
        seg.setDate(seg.getDate() - seg.getDay() + 1);
        const dom = new Date(seg);
        dom.setDate(dom.getDate() + 6);
        const weekStartStr = seg.toISOString().slice(0, 10);
        const weekEndStr = dom.toISOString().slice(0, 10);
        let hojeH = 0, semH = 0, mesH = 0;
        for (const e of entries) {
          const d = String(e.date).slice(0, 10);
          mesH += e.totalHoras;
          if (d === todayStr) hojeH += e.totalHoras;
          if (d >= weekStartStr && d <= weekEndStr) semH += e.totalHoras;
        }
        setHours({ hoje: hojeH, semana: semH, mes: mesH });
      })
      .catch(() => setHours({ hoje: 0, semana: 0, mes: 0 }));
  }, [user?.id]);

  function applySlaPayload(data: { percent?: number | null; dentroPrazo?: number; total?: number; aplicavel?: boolean } | null) {
    if (!data || typeof data !== "object") {
      setSlaSummary(null);
      return;
    }
    setSlaSummary({
      percent: data.percent ?? null,
      dentroPrazo: Number(data.dentroPrazo ?? 0),
      total: Number(data.total ?? 0),
      aplicavel: Boolean(data.aplicavel),
    });
  }

  useEffect(() => {
    if (!user?.id) return;
    const role = String(user.role ?? "").toUpperCase();
    const hideSlaForRoles = new Set(["SUPER_ADMIN", "ADMIN_PORTAL", "GESTOR_PROJETOS", "CONSULTOR"]);
    const shouldShowSlaAmsFinalizadas = !hideSlaForRoles.has(role);
    apiFetch("/api/tickets?light=true")
      .then((r) => r.json())
      .then((data: TicketForHome[]) => {
        const userId = user.id;
        const isResponsible = (t: TicketForHome) =>
          t.assignedTo?.id === userId ||
          (Array.isArray(t.responsibles) && t.responsibles.some((r) => r.user?.id === userId));
        const myTickets = data.filter(
          (t) =>
            t.project &&
            t.type !== "SUBPROJETO" &&
            t.type !== "SUBTAREFA" &&
            isResponsible(t)
        );
        setTickets(myTickets);
        if (!shouldShowSlaAmsFinalizadas) return null as unknown as Response;
        return apiFetch("/api/tickets/sla-compliance-summary");
      })
      .then((r) => (r && r.ok ? r.json().catch(() => null) : null))
      .then((slaData: { percent?: number | null; dentroPrazo?: number; total?: number; aplicavel?: boolean } | null) =>
        applySlaPayload(slaData),
      )
      .catch(() => {
        setTickets([]);
        setSlaSummary(null);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  const EXECUTION_STATUSES = useMemo(() => new Set(["EM_ANDAMENTO", "EXECUCAO", "EM_EXECUCAO"]), []);

  const { emExecucao, finalizadas, horasContratadas, slaLabel } = useMemo(() => {
    const emExecucao = tickets.filter((t) => EXECUTION_STATUSES.has(String(t.status).toUpperCase())).length;
    const finalizadas = tickets.filter((t) => t.status === "ENCERRADO").length;
    const horasContratadas = tickets.reduce((acc, t) => acc + (t.estimativaHoras ?? 0), 0);
    let slaLabel = "—";
    if (slaSummary?.aplicavel && slaSummary.total > 0 && slaSummary.percent != null) {
      slaLabel = `${slaSummary.percent}%`;
    }
    return { emExecucao, finalizadas, horasContratadas, slaLabel };
  }, [tickets, slaSummary, EXECUTION_STATUSES]);

  const tarefasTotal = tickets.length;

  const tarefasOrdenadas = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const sa = getTicketStatusDisplay({ status: a.status, projectId: a.project?.id, dataFimPrevista: a.dataFimPrevista, allowOverdue: true }).sortBucket;
      const sb = getTicketStatusDisplay({ status: b.status, projectId: b.project?.id, dataFimPrevista: b.dataFimPrevista, allowOverdue: true }).sortBucket;
      if (sa !== sb) return sa - sb;

      const pa = PRIORITY_ORDER[normalizePriority(a.criticidade)] ?? 0;
      const pb = PRIORITY_ORDER[normalizePriority(b.criticidade)] ?? 0;
      if (pb !== pa) return pb - pa;

      return (a.code?.localeCompare?.(b.code, undefined, { numeric: true }) ?? 0);
    });
  }, [tickets]);

  const now = new Date();
  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const semanaAtual = getWeekOfMonth(now);
  const hojeFormatado = now.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const semanaAtualLabel = String(semanaAtual).padStart(2, "0");

  const openTaskModal = (t: TicketForHome) => {
    setSelectedTicket(t as unknown as PackageTicket);
  };
  // Edição da tarefa na Home deve seguir a permissão de editar tarefas (ou, por compat, "projeto.editar").
  const canEditFromHome = can("tarefa.editar") || can("projeto.editar");
  const role = String(user?.role ?? "").toUpperCase();
  const shouldShowSlaAmsFinalizadas = !new Set(["SUPER_ADMIN", "ADMIN_PORTAL", "GESTOR_PROJETOS", "CONSULTOR"]).has(role);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Carregando seu painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <main className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Card principal: boas-vindas + consumo + métricas + data */}
          <section className="relative rounded-2xl overflow-hidden border border-[color:var(--border)] shadow-xl">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(900px 420px at 78% 30%, rgba(92,0,225,0.35), transparent 55%), radial-gradient(700px 380px at 30% 60%, rgba(87,66,118,0.28), transparent 60%), linear-gradient(135deg, rgba(7,5,12,0.95), rgba(18,12,28,0.85))",
              }}
              aria-hidden
            />
            <div className="relative p-6 lg:p-8 text-[color:var(--primary-foreground)]">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    Olá, {user?.name ?? "Usuário"}!
                  </h1>
                  <p className="mt-1 text-[color:var(--primary-foreground)]/70">Acompanhe suas horas e tarefas em um só lugar.</p>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-[color:var(--primary-foreground)]/60 uppercase tracking-wider mb-3">
                      Seu resumo
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      <div>
                        <p className="text-[color:var(--primary-foreground)]/70 text-sm">Hoje</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.hoje)}</p>
                      </div>
                      <div>
                        <p className="text-[color:var(--primary-foreground)]/70 text-sm">Semana</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.semana)}</p>
                      </div>
                      <div>
                        <p className="text-[color:var(--primary-foreground)]/70 text-sm">Mês</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.mes)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-[color:var(--primary-foreground)]/60 uppercase tracking-wider mb-3">
                      Suas tarefas
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      <div className="flex items-center gap-2">
                        <ListTodo className="h-5 w-5 text-amber-300" />
                        <div>
                          <p className="text-[color:var(--primary-foreground)]/70 text-sm">Tarefas</p>
                          <p className="text-xl font-bold">{tarefasTotal}</p>
                        </div>
                      </div>
                      {shouldShowSlaAmsFinalizadas && (
                        <div className="flex items-center gap-2">
                          <Target className="h-5 w-5 text-sky-300" />
                          <div>
                            <p className="text-[color:var(--primary-foreground)]/70 text-sm">SLA AMS (finalizadas)</p>
                            <p className="text-xl font-bold tabular-nums">{slaLabel}</p>
                            {slaSummary?.aplicavel && slaSummary.total > 0 && (
                              <p className="text-[color:var(--primary-foreground)]/60 text-xs">
                                {slaSummary.dentroPrazo}/{slaSummary.total} no prazo
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-right text-[color:var(--primary-foreground)]/80 shrink-0">
                  <div className="flex items-center justify-end gap-2">
                    <Calendar className="h-5 w-5 text-[color:var(--primary-foreground)]/55" />
                    <span className="font-medium capitalize">Mês atual: {mesAtual}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <ListTodo className="h-5 w-5 text-[color:var(--primary-foreground)]/55" />
                    <span>Semana atual: {semanaAtualLabel}</span>
                  </div>
                  <p className="text-[color:var(--primary-foreground)]/60 text-sm">Hoje é {hojeFormatado}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Lista de tarefas por prioridade */}
          <section className="rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border)] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[color:var(--border)] bg-[color:var(--surface)]/55 backdrop-blur">
              <h2 className="text-lg font-semibold text-[color:var(--foreground)] flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-[color:var(--muted-foreground)]" />
                Lista de tarefas
              </h2>
              <p className="text-sm text-[color:var(--muted-foreground)] mt-0.5">
                Em execução/outros acima, Backlog no meio, Finalizados no fim (mantendo prioridade).
              </p>
            </div>
            <div className="divide-y divide-[color:var(--border)] max-h-[520px] overflow-y-auto">
              {tarefasOrdenadas.length === 0 ? (
                <div className="px-6 py-12 text-center text-[color:var(--muted-foreground)]">
                  Nenhuma tarefa atribuída a você no momento.
                </div>
              ) : (
                tarefasOrdenadas.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTaskModal(t)}
                    className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-[color:var(--surface)] transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--primary)]"
                  >
                    <span
                      className={`shrink-0 w-2 h-2 rounded-full ${
                        getPriorityDotClass(t.criticidade)
                      }`}
                      aria-hidden
                    />
                    <span className="font-mono font-semibold text-[color:var(--primary)]">{t.code}</span>
                    <span className="flex-1 text-[color:var(--foreground)] truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    <span className="flex items-center gap-2">
                      {(() => {
                        const badge = getStatusBadge({
                          status: t.status,
                          statusLabel: (t as any).statusLabel,
                          statusColor: (t as any).statusColor,
                          projectId: t.project?.id,
                          dataFimPrevista: t.dataFimPrevista,
                        });
                        return (
                          <span className={`inline-flex items-center gap-1.5 ${badge.className}`}>
                            <span className={`h-2 w-2 rounded-full ${badge.dotClass}`} aria-hidden />
                            {badge.label}
                          </span>
                        );
                      })()}
                      {(() => {
                        const isEncerrado = String(t.status ?? "").toUpperCase() === "ENCERRADO";
                        if (!isEncerrado) return null;
                        const budgetStatus = String(t.budget?.status ?? "").toUpperCase();
                        const motivo = String(t.finalizacaoMotivo ?? "").toLowerCase();
                        const rejected =
                          budgetStatus === "REPROVADO" || motivo.includes("orçamento reprovado") || motivo.includes("orcamento reprovado");
                        if (!rejected) return null;
                        return (
                          <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200">
                            Orçamento reprovado
                          </span>
                        );
                      })()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {selectedTicket && (
        <EditTaskModalFull
          ticket={selectedTicket}
          projectId={(selectedTicket as unknown as TicketForHome).project?.id}
          projectName={(selectedTicket as unknown as TicketForHome).project?.name}
          readOnly={!canEditFromHome}
          allowTimeEntryInReadOnly
          onClose={() => setSelectedTicket(null)}
          onSaved={() => {
            setSelectedTicket(null);
            // Atualizar lista após salvar (refetch)
            if (user?.id) {
              apiFetch("/api/tickets?light=true")
                .then((r) => r.json())
                .then((data: TicketForHome[]) => {
                  const userId = user.id;
                  const isResponsible = (t: TicketForHome) =>
                    t.assignedTo?.id === userId ||
                    (Array.isArray(t.responsibles) && t.responsibles.some((r) => r.user?.id === userId));
                  setTickets(
                    data.filter(
                      (t) =>
                        t.project &&
                        t.type !== "SUBPROJETO" &&
                        t.type !== "SUBTAREFA" &&
                        isResponsible(t)
                    )
                  );
                  return apiFetch("/api/tickets/sla-compliance-summary");
                })
                .then((r) => (r.ok ? r.json().catch(() => null) : null))
                .then((slaData) => applySlaPayload(slaData))
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
