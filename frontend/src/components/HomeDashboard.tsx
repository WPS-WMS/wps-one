"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Calendar,
  ListTodo,
  Target,
} from "lucide-react";
import { EditTaskModalFull } from "./EditTaskModalFull";
import type { PackageTicket } from "./PackageCard";

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
  [key: string]: unknown; // API retorna mais campos (description, createdAt, etc.) usados pelo modal
};

const PRIORITY_ORDER: Record<string, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function getWeekOfMonth(d: Date): number {
  const dayOfMonth = d.getDate();
  return Math.ceil(dayOfMonth / 7);
}

type HomeDashboardProps = {
  /** Base path para links de projetos: /consultor ou /admin */
  basePath: HomeDashboardBasePath;
};

export function HomeDashboard({ basePath }: HomeDashboardProps) {
  const router = useRouter();
  const { user, can, permissionsReady, loading: authLoading, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState({ hoje: 0, semana: 0, mes: 0 });
  const [tickets, setTickets] = useState<TicketForHome[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<PackageTicket | null>(null);
  const [homePermChecked, setHomePermChecked] = useState(false);
  const didRefreshHomePermRef = useRef(false);

  useEffect(() => {
    if (authLoading || !permissionsReady) return;
    if (didRefreshHomePermRef.current) {
      setHomePermChecked(true);
      return;
    }
    didRefreshHomePermRef.current = true;

    // Importante: as permissões podem ficar "stale" na sessão (usuário já logado).
    // Faz um refresh rápido para garantir que "Sem acesso" em home seja aplicado na prática.
    apiFetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setUser(data);
      })
      .catch(() => {})
      .finally(() => setHomePermChecked(true));
  }, [authLoading, permissionsReady, setUser]);

  if (authLoading || !permissionsReady || !homePermChecked) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Carregando seu painel...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (authLoading || !permissionsReady || !homePermChecked) return;
    if (can("home")) return;

    const fallbackRoutesByBasePath: Record<HomeDashboardBasePath, string[]> = {
      "/admin": [
        ...(can("projeto.lista") ? ["/admin/projetos"] : []),
        ...(can("apontamentos") ? ["/admin/apontamento"] : []),
        ...(can("hora-banco") ? ["/admin/banco-horas"] : []),
        ...(can("relatorios") ? ["/admin/relatorios"] : []),
        ...(can("configuracoes") ? ["/admin/configuracoes"] : []),
      ],
      "/gestor": [
        ...(can("projeto.lista") ? ["/gestor/projetos"] : []),
        ...(can("apontamentos") ? ["/gestor/apontamento"] : []),
        ...(can("hora-banco") ? ["/gestor/banco-horas"] : []),
        ...(can("configuracoes") ? ["/gestor/configuracoes"] : []),
      ],
      "/consultor": [
        ...(can("projeto.lista") ? ["/consultor/projetos"] : []),
        ...(can("apontamentos") ? ["/consultor/apontamento"] : []),
        ...(can("hora-banco") ? ["/consultor/banco-horas"] : []),
        ...(can("configuracoes") ? ["/consultor/configuracoes"] : []),
      ],
    };

    const fallback = fallbackRoutesByBasePath[basePath][0] ?? "/perfil";
    router.replace(fallback);
  }, [authLoading, permissionsReady, homePermChecked, can, basePath, router]);

  if (!can("home")) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Redirecionando...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    apiFetch(`/api/time-entries?start=${firstDayOfMonth.toISOString()}&end=${endOfToday.toISOString()}`)
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

  useEffect(() => {
    if (!user?.id) return;
    apiFetch("/api/tickets")
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
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const { emExecucao, finalizadas, horasContratadas, slaLabel } = useMemo(() => {
    const emExecucao = tickets.filter((t) => t.status !== "ENCERRADO").length;
    const finalizadas = tickets.filter((t) => t.status === "ENCERRADO").length;
    const horasContratadas = tickets.reduce((acc, t) => acc + (t.estimativaHoras ?? 0), 0);
    const emAndamento = tickets.filter((t) => t.status !== "ENCERRADO" && t.dataFimPrevista);
    const now = new Date();
    let slaLabel = "—";
    if (emAndamento.length > 0) {
      const nearest = emAndamento.reduce((best, t) => {
        const due = new Date(t.dataFimPrevista!);
        return !best || due.getTime() < best.getTime() ? due : best;
      }, null as Date | null);
      if (nearest) {
        const diffDays = Math.ceil((nearest.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays < 0) slaLabel = "Atrasado";
        else if (diffDays === 0) slaLabel = "Hoje";
        else if (diffDays === 1) slaLabel = "1 dia";
        else slaLabel = `${diffDays} dias`;
      }
    }
    return { emExecucao, finalizadas, horasContratadas, slaLabel };
  }, [tickets]);

  const chamadosPorPrioridade = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.criticidade ?? ""] ?? 0;
      const pb = PRIORITY_ORDER[b.criticidade ?? ""] ?? 0;
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

  const openTaskModal = (t: TicketForHome) => {
    setSelectedTicket(t as unknown as PackageTicket);
  };

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
          <section className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl overflow-hidden">
            <div className="p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    Olá, {user?.name ?? "Usuário"}!
                  </h1>
                  <p className="text-slate-300 mt-1">Acompanhe suas horas e chamados em um só lugar.</p>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Seu consumo de horas
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      <div>
                        <p className="text-slate-400 text-sm">Hoje</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.hoje)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Semana</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.semana)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Mês</p>
                        <p className="text-2xl font-bold tabular-nums">{formatHours(hours.mes)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Suas tarefas
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 text-amber-400" />
                        <div>
                          <p className="text-slate-400 text-sm">Em execução</p>
                          <p className="text-xl font-bold">{emExecucao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="text-slate-400 text-sm">Finalizadas</p>
                          <p className="text-xl font-bold">{finalizadas}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-blue-400" />
                        <div>
                          <p className="text-slate-400 text-sm">SLA</p>
                          <p className="text-xl font-bold">{slaLabel}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="text-slate-400 text-sm">Horas contratadas</p>
                          <p className="text-xl font-bold tabular-nums">{formatHours(horasContratadas)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-right text-slate-300 shrink-0">
                  <div className="flex items-center justify-end gap-2">
                    <Calendar className="h-5 w-5 text-slate-500" />
                    <span className="font-medium capitalize">Mês atual: {mesAtual}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <ListTodo className="h-5 w-5 text-slate-500" />
                    <span>Semana atual: {semanaAtual}ª do mês</span>
                  </div>
                  <p className="text-slate-400 text-sm">Hoje é {hojeFormatado}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Lista de chamados por prioridade */}
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-slate-600" />
                Lista de chamados
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Ordenados por prioridade (Alta → Média → Baixa)</p>
            </div>
            <div className="divide-y divide-slate-100">
              {chamadosPorPrioridade.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-500">
                  Nenhum chamado atribuído a você no momento.
                </div>
              ) : (
                chamadosPorPrioridade.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTaskModal(t)}
                    className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  >
                    <span
                      className={`shrink-0 w-2 h-2 rounded-full ${
                        t.criticidade === "ALTA"
                          ? "bg-red-500"
                          : t.criticidade === "MEDIA"
                            ? "bg-amber-500"
                            : t.criticidade === "BAIXA"
                              ? "bg-emerald-500"
                              : "bg-slate-300"
                      }`}
                      aria-hidden
                    />
                    <span className="font-mono font-semibold text-blue-600">{t.code}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    {t.status !== "ENCERRADO" && (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Em execução
                      </span>
                    )}
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
          onClose={() => setSelectedTicket(null)}
          onSaved={() => {
            setSelectedTicket(null);
            // Atualizar lista após salvar (refetch)
            if (user?.id) {
              apiFetch("/api/tickets")
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
                })
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
