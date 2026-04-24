"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Calendar,
  ListTodo,
  Target,
  ChevronDown,
} from "lucide-react";
import { EditTaskModalFull } from "@/components/EditTaskModalFull";
import type { PackageTicket } from "@/components/PackageCard";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";

type TicketForClient = {
  id: string;
  code: string;
  title: string;
  status: string;
  criticidade?: string | null;
  finalizacaoMotivo?: string | null;
  dataFimPrevista?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  project: { id: string; client: { name: string }; name: string };
  type: string;
  createdBy?: { id: string; name: string } | null;
  budget?: { status: string } | null;
};

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function getWeekOfMonth(d: Date): number {
  return Math.ceil(d.getDate() / 7);
}

function parseTicketDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fora do prazo (SLA): não finalizada e já passou de dataFimPrevista */
function isTicketAtrasada(t: TicketForClient, now: Date): boolean {
  if (String(t.status ?? "").toUpperCase() === "ENCERRADO") return false;
  const due = parseTicketDate(t.dataFimPrevista);
  if (!due) return false;
  return now.getTime() > due.getTime();
}

function getTicketDisplayBadge(t: TicketForClient, now: Date): { label: string; className: string } {
  if (isTicketAtrasada(t, now)) {
    return {
      label: "Atrasada",
      className: "text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded",
    };
  }
  const st = getTicketStatusDisplay({
    status: t.status,
    statusLabel: (t as any).statusLabel,
    statusColor: (t as any).statusColor,
    projectId: t.project?.id,
    dataFimPrevista: t.dataFimPrevista,
    allowOverdue: false,
  });
  const className =
    st.sortBucket === 2
      ? "text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded"
      : st.sortBucket === 1
        ? "text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded"
        : "text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded";
  return { label: st.label, className };
}

type ProjectForClient = {
  id: string;
  name?: string;
  tipoProjeto?: string | null;
  horasMensaisAMS?: number | null;
  bancoHorasInicial?: number | null;
  estimativaInicialTM?: number | null;
  dataInicio?: string | null;
  createdAt?: string | null;
};

type TimeEntryForClient = {
  projectId: string;
  totalHoras: number;
  date: string;
};

type AmsProjectSummary = {
  projectId: string;
  projectName: string;
  contratadasMes: number;
  usadasMes: number;
  saldoMes: number;
  excedenteMes: number;
  disponivelMes: number;
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENTE: 4,
  ALTA: 3,
  MEDIA: 2,
  BAIXA: 1,
};

export default function ClienteHomePage() {
  const { user, can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState({ hoje: 0, semana: 0, mes: 0 });
  const [tickets, setTickets] = useState<TicketForClient[]>([]);
  const [projects, setProjects] = useState<ProjectForClient[]>([]);
  const [entriesClient, setEntriesClient] = useState<TimeEntryForClient[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<PackageTicket | null>(null);
  const [expandedAmsProjectId, setExpandedAmsProjectId] = useState<string | null>(null);
  const [slaSummary, setSlaSummary] = useState<{
    percent: number | null;
    dentroPrazo: number;
    total: number;
    aplicavel: boolean;
  } | null>(null);
  /** Atualiza a cada minuto para SLA / “Atrasada” refletirem o relógio sem recarregar a página */
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const openTaskModal = (t: TicketForClient) => {
    setSelectedTicket(t as unknown as PackageTicket);
  };

  const refetchTickets = () => {
    if (!user?.id) return;
    void (async () => {
      try {
        const r = await apiFetch("/api/tickets?light=true");
        if (!r.ok) return;
        const raw = await r.json().catch(() => []);
        const ticketsData = Array.isArray(raw) ? raw : [];
        const tasksOnly = ticketsData.filter(
          (t: TicketForClient) => t.project && t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA",
        );
        setTickets(tasksOnly);
        const sr = await apiFetch("/api/tickets/sla-compliance-summary");
        if (!sr.ok) return;
        const data = await sr.json().catch(() => null);
        if (!data || typeof data !== "object") return;
        setSlaSummary({
          percent: (data as { percent?: number | null }).percent ?? null,
          dentroPrazo: Number((data as { dentroPrazo?: number }).dentroPrazo ?? 0),
          total: Number((data as { total?: number }).total ?? 0),
          aplicavel: Boolean((data as { aplicavel?: boolean }).aplicavel),
        });
      } catch {
        /* mantém estado anterior */
      }
    })();
  };


  // Dados base da Home do cliente (não depende de permissão de telas de projeto/apontamento)
  useEffect(() => {
    if (!user?.id) return;
    apiFetch("/api/auth/client-home-summary")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json().catch(() => null);
      })
      .then((data: { projects?: ProjectForClient[]; entries?: TimeEntryForClient[]; hours?: { hoje: number; semana: number; mes: number } } | null) => {
        setProjects(Array.isArray(data?.projects) ? data!.projects : []);
        setEntriesClient(Array.isArray(data?.entries) ? data!.entries : []);
        setHours(data?.hours ?? { hoje: 0, semana: 0, mes: 0 });
      })
      .catch(() => {
        setProjects([]);
        setEntriesClient([]);
        setHours({ hoje: 0, semana: 0, mes: 0 });
      });
  }, [user?.id, can]);

  useEffect(() => {
    if (!user?.id) return;
    const isCliente = user.role === "CLIENTE";
    // Cliente é vinculado a uma empresa: deve ver todas as tarefas dos projetos da empresa.
    // Outros perfis seguem respeitando a permissão de "projeto".
    if (!isCliente && !can("projeto")) {
      setTickets([]);
      setLoading(false);
      return;
    }
    apiFetch("/api/tickets?light=true")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json().catch(() => []);
        return Array.isArray(data) ? data : [];
      })
      .then((ticketsData: TicketForClient[]) => {
        const tasksOnly = (ticketsData || []).filter(
          (t) =>
            t.project &&
            t.type !== "SUBPROJETO" &&
            t.type !== "SUBTAREFA"
        );
        setTickets(tasksOnly);
        return apiFetch("/api/tickets/sla-compliance-summary");
      })
      .then((r) => (r && r.ok ? r.json().catch(() => null) : null))
      .then(
        (data: { percent?: number | null; dentroPrazo?: number; total?: number; aplicavel?: boolean } | null) => {
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
        },
      )
      .catch(() => {
        setTickets([]);
        setSlaSummary(null);
      })
      .finally(() => setLoading(false));
  }, [user?.id, can]);

  const tarefasQueAbri = useMemo(
    () => tickets.filter((t) => t.createdBy?.id === user?.id),
    [tickets, user?.id]
  );

  const tarefasQueAbriOrdenadasPorPrioridade = useMemo(() => {
    return [...tarefasQueAbri].sort((a, b) => {
      const sa = String(a.status ?? "").trim().toUpperCase();
      const sb = String(b.status ?? "").trim().toUpperCase();
      const bucketA = sa === "ENCERRADO" ? 2 : sa === "ABERTO" ? 1 : 0;
      const bucketB = sb === "ENCERRADO" ? 2 : sb === "ABERTO" ? 1 : 0;
      if (bucketA !== bucketB) return bucketA - bucketB;

      const pa =
        PRIORITY_ORDER[String((a as { criticidade?: string | null }).criticidade ?? "").toUpperCase()] ?? 0;
      const pb =
        PRIORITY_ORDER[String((b as { criticidade?: string | null }).criticidade ?? "").toUpperCase()] ?? 0;
      if (pb !== pa) return pb - pa;
      return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
    });
  }, [tarefasQueAbri]);

  function getPriorityDotClass(raw: unknown): string {
    const v = String(raw ?? "").toUpperCase();
    if (v === "URGENTE") return "bg-red-700";
    if (v === "ALTA") return "bg-red-500";
    if (v === "MEDIA") return "bg-amber-500";
    if (v === "BAIXA") return "bg-emerald-500";
    return "bg-slate-300";
  }

  const ticketsOrdenadosPorPrioridade = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const sa = String(a.status ?? "").trim().toUpperCase();
      const sb = String(b.status ?? "").trim().toUpperCase();
      const bucketA = sa === "ENCERRADO" ? 2 : sa === "ABERTO" ? 1 : 0;
      const bucketB = sb === "ENCERRADO" ? 2 : sb === "ABERTO" ? 1 : 0;
      if (bucketA !== bucketB) return bucketA - bucketB;

      const pa = PRIORITY_ORDER[String((a as { criticidade?: string | null }).criticidade ?? "").toUpperCase()] ?? 0;
      const pb = PRIORITY_ORDER[String((b as { criticidade?: string | null }).criticidade ?? "").toUpperCase()] ?? 0;
      if (pb !== pa) return pb - pa;
      return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
    });
  }, [tickets]);

  const EXECUTION_STATUSES = useMemo(() => new Set(["EM_ANDAMENTO", "EXECUCAO", "EM_EXECUCAO"]), []);

  const { emExecucao, finalizadas, slaLabel, horasContratadas } = useMemo(() => {
    const emExecucao = tickets.filter((t) => EXECUTION_STATUSES.has(String(t.status).toUpperCase())).length;
    const finalizadas = tickets.filter((t) => t.status === "ENCERRADO").length;
    let slaLabel = "—";
    if (slaSummary?.aplicavel && slaSummary.total > 0 && slaSummary.percent != null) {
      slaLabel = `${slaSummary.percent}%`;
    }
    // Horas contratadas: projetos T&M (estimativaInicialTM) e AMS (horasMensaisAMS ou bancoHorasInicial)
    let totalContratadas = 0;
    for (const p of projects) {
      if (p.tipoProjeto === "TIME_MATERIAL" && p.estimativaInicialTM != null) {
        totalContratadas += p.estimativaInicialTM;
      }
      if (p.tipoProjeto === "AMS") {
        if (p.horasMensaisAMS != null) totalContratadas += p.horasMensaisAMS;
        else if (p.bancoHorasInicial != null) totalContratadas += p.bancoHorasInicial;
      }
    }
    return { emExecucao, finalizadas, slaLabel, horasContratadas: totalContratadas };
  }, [tickets, projects, EXECUTION_STATUSES, slaSummary]);

  const amsSummaries = useMemo<AmsProjectSummary[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    const usageByProjectMonth = new Map<string, number>();
    for (const e of entriesClient) {
      if (!e?.projectId) continue;
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${e.projectId}:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      usageByProjectMonth.set(key, (usageByProjectMonth.get(key) ?? 0) + (e.totalHoras ?? 0));
    }

    const summaries: AmsProjectSummary[] = [];
    for (const p of projects) {
      if (p.tipoProjeto !== "AMS") continue;
      const contracted = p.horasMensaisAMS ?? 0;
      const startRef = p.dataInicio || p.createdAt;
      const startDate = startRef ? new Date(startRef) : now;
      const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const prevMonth = new Date(currentYear, currentMonth - 1, 1);
      let saldoAcumulado = p.bancoHorasInicial ?? 0;
      if (contracted > 0 && startMonth <= prevMonth) {
        const cursor = new Date(startMonth);
        while (cursor <= prevMonth) {
          const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          const used = usageByProjectMonth.get(`${p.id}:${k}`) ?? 0;
          saldoAcumulado += contracted - used;
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      const usedCurrent = usageByProjectMonth.get(`${p.id}:${monthKey}`) ?? 0;
      const disponivelMes = saldoAcumulado + contracted;
      const saldoMes = Math.max(0, disponivelMes - usedCurrent);
      const excedenteMes = Math.max(0, usedCurrent - disponivelMes);

      summaries.push({
        projectId: p.id,
        projectName: p.name || "Projeto AMS",
        contratadasMes: contracted,
        usadasMes: usedCurrent,
        saldoMes,
        excedenteMes,
        disponivelMes,
      });
    }
    return summaries.sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [projects, entriesClient]);

  const amsSummaryByProjectId = useMemo(() => {
    const map = new Map<string, AmsProjectSummary>();
    for (const s of amsSummaries) map.set(s.projectId, s);
    return map;
  }, [amsSummaries]);

  const now = new Date();
  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const semanaAtual = getWeekOfMonth(now);
  const hojeFormatado = now.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const semanaAtualLabel = String(semanaAtual).padStart(2, "0");

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
                    Olá, {user?.name ?? "Cliente"}!
                  </h1>
                  <p className="mt-1 text-[color:var(--primary-foreground)]/70">
                    Acompanhe as horas apontadas pela equipe e o status dos seus projetos.
                  </p>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-[color:var(--primary-foreground)]/60 uppercase tracking-wider mb-3">
                      Horas apontadas nos seus projetos
                    </h2>
                    <p className="text-[color:var(--primary-foreground)]/60 text-xs mb-2">
                      Apontamentos realizados por consultores e gestores nas tarefas
                    </p>
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
                      Tarefas dos seus projetos
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 text-amber-400" />
                        <div>
                          <p className="text-[color:var(--primary-foreground)]/70 text-sm">Em execução</p>
                          <p className="text-xl font-bold">{emExecucao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="text-[color:var(--primary-foreground)]/70 text-sm">Finalizadas</p>
                          <p className="text-xl font-bold">{finalizadas}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-blue-400" />
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
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="text-[color:var(--primary-foreground)]/70 text-sm">Horas contratadas</p>
                          <p className="text-xl font-bold tabular-nums">
                            {horasContratadas > 0 ? formatHours(horasContratadas) : "—"}
                          </p>
                          <p className="text-[color:var(--primary-foreground)]/60 text-xs">T&M e AMS</p>
                        </div>
                      </div>
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

          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800">Projetos vinculados</h2>
              <p className="text-sm text-slate-500 mt-0.5">Clique em um projeto AMS para ver o resumo do mês</p>
            </div>
            <div className="divide-y divide-slate-100">
              {projects.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500">
                  Nenhum projeto vinculado encontrado.
                </div>
              ) : (
                projects.map((p) => (
                  <div key={p.id} className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (p.tipoProjeto !== "AMS") return;
                        setExpandedAmsProjectId((prev) => (prev === p.id ? null : p.id));
                      }}
                      className={`w-full py-1 flex items-center justify-between gap-3 text-left ${
                        p.tipoProjeto === "AMS" ? "hover:bg-slate-50 rounded-lg px-2 -mx-2" : ""
                      }`}
                    >
                      <div>
                        <p className="font-medium text-slate-800">{p.name || "Projeto sem nome"}</p>
                        <p className="text-xs text-slate-500">Tipo: {p.tipoProjeto || "INTERNO"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.tipoProjeto === "AMS" && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            AMS
                          </span>
                        )}
                        {p.tipoProjeto === "AMS" && (
                          <ChevronDown
                            className={`h-4 w-4 text-slate-400 transition-transform ${
                              expandedAmsProjectId === p.id ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </div>
                    </button>
                    {p.tipoProjeto === "AMS" && expandedAmsProjectId === p.id && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        {(() => {
                          const s = amsSummaryByProjectId.get(p.id);
                          if (!s) {
                            return (
                              <div className="md:col-span-4 text-slate-500 text-sm">
                                Sem dados de resumo para este projeto no mês atual.
                              </div>
                            );
                          }
                          return (
                            <>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-slate-500">Contratadas (mês)</p>
                                <p className="font-semibold tabular-nums">{formatHours(s.contratadasMes)}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-slate-500">Utilizadas (mês)</p>
                                <p className="font-semibold tabular-nums">{formatHours(s.usadasMes)}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-slate-500">Saldo disponível</p>
                                <p className="font-semibold tabular-nums">{formatHours(s.saldoMes)}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-slate-500">Excedente</p>
                                <p className={`font-semibold tabular-nums ${s.excedenteMes > 0 ? "text-red-600" : "text-slate-800"}`}>
                                  {s.excedenteMes > 0 ? formatHours(s.excedenteMes) : "00:00"}
                                </p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-slate-600" />
                Tarefas que eu abri
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Tarefas abertas por você</p>
            </div>
            <div className="divide-y divide-slate-100">
              {tarefasQueAbriOrdenadasPorPrioridade.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500">
                  Você ainda não abriu nenhuma tarefa.
                </div>
              ) : (
                tarefasQueAbriOrdenadasPorPrioridade.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTaskModal(t)}
                    className="px-6 py-4 flex items-center gap-4 text-left"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getPriorityDotClass(
                        (t as { criticidade?: string | null }).criticidade,
                      )}`}
                      aria-hidden
                      title={String((t as { criticidade?: string | null }).criticidade ?? "Sem prioridade")}
                    />
                    <span className="font-mono font-semibold text-blue-600">{t.code}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    {String((t as any)?.budget?.status ?? "").toUpperCase() === "AGUARDANDO_APROVACAO" && (
                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                        Aguardando aprovação
                      </span>
                    )}
                    {String(t.status ?? "").toUpperCase() === "ENCERRADO" &&
                      (String((t as any)?.budget?.status ?? "").toUpperCase() === "REPROVADO" ||
                        String((t as any)?.finalizacaoMotivo ?? "")
                          .toLowerCase()
                          .includes("orçamento reprovado") ||
                        String((t as any)?.finalizacaoMotivo ?? "")
                          .toLowerCase()
                          .includes("orcamento reprovado")) && (
                      <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200">
                        Orçamento reprovado
                      </span>
                    )}
                    {(() => {
                      const badge = getTicketDisplayBadge(t, clockNow);
                      return <span className={badge.className}>{badge.label}</span>;
                    })()}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-slate-600" />
                Tarefas de todos os projetos
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Visão geral de todas as tarefas dos projetos da sua empresa</p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {tickets.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-500">
                  Nenhuma tarefa nos projetos da sua empresa no momento.
                </div>
              ) : (
                ticketsOrdenadosPorPrioridade.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTaskModal(t)}
                    className="px-6 py-4 flex items-center gap-4 text-left"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getPriorityDotClass(
                        (t as { criticidade?: string | null }).criticidade,
                      )}`}
                      aria-hidden
                      title={String((t as { criticidade?: string | null }).criticidade ?? "Sem prioridade")}
                    />
                    <span className="font-mono font-semibold text-blue-600">{t.code}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    {String((t as any)?.budget?.status ?? "").toUpperCase() === "AGUARDANDO_APROVACAO" && (
                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                        Aguardando aprovação
                      </span>
                    )}
                    {String(t.status ?? "").toUpperCase() === "ENCERRADO" &&
                      (String((t as any)?.budget?.status ?? "").toUpperCase() === "REPROVADO" ||
                        String((t as any)?.finalizacaoMotivo ?? "")
                          .toLowerCase()
                          .includes("orçamento reprovado") ||
                        String((t as any)?.finalizacaoMotivo ?? "")
                          .toLowerCase()
                          .includes("orcamento reprovado")) && (
                      <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200">
                        Orçamento reprovado
                      </span>
                    )}
                    {(() => {
                      const badge = getTicketDisplayBadge(t, clockNow);
                      return <span className={badge.className}>{badge.label}</span>;
                    })()}
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
          projectId={(selectedTicket as unknown as TicketForClient).project?.id}
          projectName={(selectedTicket as unknown as TicketForClient).project?.name}
          // Cliente só edita tarefa se a permissão estiver liberada na Gestão de perfis.
          // Mesmo assim, não expomos nenhum item no menu lateral: a edição acontece apenas ao abrir pela Home > tarefas.
          readOnly={!can("tarefa.editar")}
          onClose={() => {
            setSelectedTicket(null);
            refetchTickets();
          }}
          onSaved={() => {
            setSelectedTicket(null);
            refetchTickets();
          }}
        />
      )}
    </div>
  );
}
