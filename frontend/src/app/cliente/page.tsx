"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Calendar,
  ListTodo,
  Target,
} from "lucide-react";

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function getWeekOfMonth(d: Date): number {
  return Math.ceil(d.getDate() / 7);
}

type TicketForClient = {
  id: string;
  code: string;
  title: string;
  status: string;
  dataFimPrevista?: string | null;
  project: { id: string; client: { name: string }; name: string };
  type: string;
  createdBy?: { id: string; name: string } | null;
};

type ProjectForClient = {
  id: string;
  tipoProjeto?: string | null;
  horasMensaisAMS?: number | null;
  bancoHorasInicial?: number | null;
  estimativaInicialTM?: number | null;
};

export default function ClienteHomePage() {
  const { user, can, permissionsReady, loading: authLoading, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState({ hoje: 0, semana: 0, mes: 0 });
  const [tickets, setTickets] = useState<TicketForClient[]>([]);
  const [projects, setProjects] = useState<ProjectForClient[]>([]);
  const [homePermChecked, setHomePermChecked] = useState(false);
  const didRefreshHomePermRef = useRef(false);

  useEffect(() => {
    if (authLoading || !permissionsReady) return;
    if (!user?.id) return;
    if (didRefreshHomePermRef.current) {
      setHomePermChecked(true);
      return;
    }
    didRefreshHomePermRef.current = true;

    // Garantir permissões atualizadas mesmo com sessão "stale".
    apiFetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setUser(data);
      })
      .catch(() => {})
      .finally(() => setHomePermChecked(true));
  }, [authLoading, permissionsReady, user?.id, setUser]);

  if (authLoading || !permissionsReady || !homePermChecked) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 rounded-full border-4 border-slate-300 border-t-transparent animate-spin" />
          <p>Carregando seu painel...</p>
        </div>
      </div>
    );
  }

  if (!can("home")) notFound();

  // Horas apontadas pela equipe (consultores, gestores etc.) nos projetos do cliente
  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    apiFetch(
      `/api/time-entries?view=client&start=${firstDayOfMonth.toISOString()}&end=${endOfToday.toISOString()}`
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
        let hojeH = 0,
          semH = 0,
          mesH = 0;
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
    Promise.all([
      apiFetch("/api/tickets").then((r) => r.json()),
      apiFetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([ticketsData, projectsData]: [TicketForClient[], ProjectForClient[]]) => {
        const tasksOnly = (ticketsData || []).filter(
          (t) =>
            t.project &&
            t.type !== "SUBPROJETO" &&
            t.type !== "SUBTAREFA"
        );
        setTickets(tasksOnly);
        setProjects(projectsData || []);
      })
      .catch(() => {
        setTickets([]);
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  const chamadosQueAbri = useMemo(
    () => tickets.filter((t) => t.createdBy?.id === user?.id),
    [tickets, user?.id]
  );

  const { emExecucao, finalizadas, slaLabel, horasContratadas } = useMemo(() => {
    const emExecucao = tickets.filter((t) => t.status !== "ENCERRADO").length;
    const finalizadas = tickets.filter((t) => t.status === "ENCERRADO").length;
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
  }, [tickets, projects]);

  const now = new Date();
  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const semanaAtual = getWeekOfMonth(now);
  const hojeFormatado = now.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
          <section className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl overflow-hidden">
            <div className="p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    Olá, {user?.name ?? "Cliente"}!
                  </h1>
                  <p className="text-slate-300 mt-1">
                    Acompanhe as horas apontadas pela equipe e o status dos seus projetos.
                  </p>

                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Horas apontadas nos seus projetos
                    </h2>
                    <p className="text-slate-400 text-xs mb-2">
                      Apontamentos realizados por consultores e gestores nas tarefas
                    </p>
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
                      Tarefas dos seus projetos
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
                          <p className="text-xl font-bold tabular-nums">
                            {horasContratadas > 0 ? formatHours(horasContratadas) : "—"}
                          </p>
                          <p className="text-slate-500 text-xs">T&M e AMS</p>
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

          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-slate-600" />
                Chamados que eu abri
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Chamados abertos por você</p>
            </div>
            <div className="divide-y divide-slate-100">
              {chamadosQueAbri.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500">
                  Você ainda não abriu nenhum chamado.
                </div>
              ) : (
                chamadosQueAbri.map((t) => (
                  <div
                    key={t.id}
                    className="px-6 py-4 flex items-center gap-4 text-left"
                  >
                    <span className="font-mono font-semibold text-blue-600">{t.code}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    {t.status !== "ENCERRADO" ? (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Em execução
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        Finalizado
                      </span>
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
                Chamados dos seus projetos
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Visão geral de todas as tarefas dos seus projetos</p>
            </div>
            <div className="divide-y divide-slate-100">
              {tickets.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-500">
                  Nenhum chamado nos seus projetos no momento.
                </div>
              ) : (
                tickets.slice(0, 20).map((t) => (
                  <div
                    key={t.id}
                    className="px-6 py-4 flex items-center gap-4 text-left"
                  >
                    <span className="font-mono font-semibold text-blue-600">{t.code}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      {t.project?.client?.name} - {t.project?.name} - {t.title}
                    </span>
                    {t.status !== "ENCERRADO" ? (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Em execução
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        Finalizado
                      </span>
                    )}
                  </div>
                ))
              )}
              {tickets.length > 20 && (
                <div className="px-6 py-3 text-center text-slate-500 text-sm">
                  e mais {tickets.length - 20} chamados
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
