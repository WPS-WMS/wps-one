"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ticketCodeTitleLine } from "@/lib/ticketCodeDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { TimeEntryPermissionModal, type TimeEntryPermissionPayload } from "@/components/TimeEntryPermissionModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

const DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_META = 8;

function getDailyLimitFromUserForDate(
  user: { limiteHorasPorDia?: string; limiteHorasDiarias?: number } | null,
  date: Date,
): number {
  // Para alinhar com os recortes em YYYY-MM-DD (UTC) do backend/banco de horas,
  // usamos o dia da semana no fuso UTC.
  const dow = date.getUTCDay();
  const defaultDaily = dow === 0 || dow === 6 ? 0 : HORAS_META;
  if (!user) return defaultDaily;

  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : HORAS_META;
  const raw = user.limiteHorasPorDia;
  if (!raw) {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    const key = keys[dow] as string;
    const v = map[key];
    if (typeof v === "number" && v >= 0) return v;
    return dow === 0 || dow === 6 ? 0 : fallback;
  } catch {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
}

function getWeekBounds(date: Date) {
  // Recorte semanal consistente em UTC.
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0..6 (Dom..Sáb)
  const diff = d.getUTCDate() - day;
  const dom = new Date(d);
  dom.setUTCDate(diff);
  const sab = new Date(dom);
  sab.setUTCDate(sab.getUTCDate() + 6);
  sab.setUTCHours(23, 59, 59, 999);
  return { dom, sab };
}

function parseYmdAsLocalDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const ymd = String(input).slice(0, 10); // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(input);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Intervalo domingo–sábado em UTC, legível em pt-BR. */
function formatWeekRangeLabel(dom: Date, sab: Date): string {
  const y = dom.getUTCFullYear();
  const ym = dom.getUTCMonth();
  const ymd = dom.getUTCDate();
  const sy = sab.getUTCFullYear();
  const sym = sab.getUTCMonth();
  const syd = sab.getUTCDate();
  const monthLong = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  if (y === sy && ym === sym) {
    return `${ymd}–${syd} de ${monthLong(dom)} de ${y}`;
  }
  const short = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${short(dom)} – ${short(sab)} de ${sy}`;
}

type TimeEntryFull = {
  id: string;
  date: string;
  totalHoras: number;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  description?: string | null;
  project?: { id: string; name: string; statusInicial?: string | null; clientId?: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string; type?: string };
  activity?: { id: string; name: string };
};

type TimeEntryRequest = {
  id: string;
  date: string;
  totalHoras: number;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  description?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  justification?: string;
  rejectionReason?: string | null;
  project?: { id: string; name: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string; type?: string } | null;
};

function normalizeProjectStatus(raw: unknown): "ATIVO" | "ENCERRADO" | "EM_ESPERA" | "" {
  const s = String(raw ?? "").toUpperCase().trim();
  if (!s) return "";
  if (s === "ATIVO" || s === "ENCERRADO" || s === "EM_ESPERA") return s as any;
  if (s === "EM_ANDAMENTO") return "ATIVO";
  if (s === "PLANEJADO") return "EM_ESPERA";
  if (s === "CONCLUIDO") return "ENCERRADO";
  return "";
}

function canLogTimeForProjectStatus(raw: unknown): boolean {
  const st = normalizeProjectStatus(raw);
  // Se não veio do backend (ou projeto não carregou), não bloqueia por UI.
  if (!st) return true;
  return st === "ATIVO";
}

export function ApontamentoClient({ consultorVisualRefresh = false }: { consultorVisualRefresh?: boolean }) {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    // Início da semana em UTC
    const diff = d.getUTCDate() - d.getUTCDay();
    const dom = new Date(d);
    dom.setUTCDate(diff);
    dom.setUTCHours(0, 0, 0, 0);
    return dom;
  });
  const [entries, setEntries] = useState<TimeEntryFull[]>([]);
  const [requests, setRequests] = useState<TimeEntryRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [modal, setModal] = useState<{ date: Date; baseTotal: number } | null>(null);
  const [editEntry, setEditEntry] = useState<TimeEntryFull | null>(null);
  const [requestToFix, setRequestToFix] = useState<TimeEntryRequest | null>(null);
  const { dom, sab } = getWeekBounds(weekStart);
  const { user, loading: authLoading, can, permissionsReady } = useAuth();
  const [holidayYmdSet, setHolidayYmdSet] = useState<Set<string>>(() => new Set());

  // Protege contra "race condition" ao trocar semanas.
  // Requisições antigas podem resolver depois e sobrescrever o estado.
  const entriesRequestIdRef = useRef(0);
  const requestsRequestIdRef = useRef(0);
  const weekLoadsInFlightRef = useRef(0);

  function beginWeekLoad(silent: boolean) {
    if (silent || !consultorVisualRefresh) return;
    weekLoadsInFlightRef.current += 1;
    setWeekLoading(true);
  }

  function endWeekLoad(silent: boolean) {
    if (silent || !consultorVisualRefresh) return;
    weekLoadsInFlightRef.current = Math.max(0, weekLoadsInFlightRef.current - 1);
    if (weekLoadsInFlightRef.current === 0) setWeekLoading(false);
  }

  function notifyTimeEntriesChanged() {
    // Usado para atualizar telas que dependem de TimeEntry (ex.: Banco de Horas)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("wps_time_entries_changed"));
    }
  }

  function loadEntries(silent = false) {
    beginWeekLoad(silent);
    const requestId = ++entriesRequestIdRef.current;
    apiFetch(`/api/time-entries?start=${dom.toISOString()}&end=${sab.toISOString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error || "Erro ao carregar apontamentos.");
        }
        const data = await r.json();
        if (!Array.isArray(data)) return [];
        return data as TimeEntryFull[];
      })
      .then((list) => {
        if (requestId !== entriesRequestIdRef.current) return;
        setEntries(list);
        if (!silent) setLoadError(null);
      })
      .catch((err) => {
        if (requestId !== entriesRequestIdRef.current) return;
        if (silent) return;
        console.error("Erro ao carregar apontamentos:", err);
        setEntries([]);
        setLoadError(String(err?.message || "Erro ao carregar apontamentos."));
      })
      .finally(() => {
        endWeekLoad(silent);
      });
  }

  function loadRequests(silent = false) {
    beginWeekLoad(silent);
    const requestId = ++requestsRequestIdRef.current;
    apiFetch("/api/permission-requests?scope=own")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error || "Erro ao carregar solicitações de apontamento.");
        }
        return r.json();
      })
      .then((data: any[]) => {
        if (!Array.isArray(data)) {
          if (requestId !== requestsRequestIdRef.current) return;
          if (!silent) setRequests([]);
          return;
        }
        const mapped: TimeEntryRequest[] = data.map((req) => ({
          id: req.id,
          date: req.date,
          totalHoras: req.totalHoras,
          horaInicio: req.horaInicio,
          horaFim: req.horaFim,
          intervaloInicio: req.intervaloInicio,
          intervaloFim: req.intervaloFim,
          description: req.description,
          justification: req.justification,
          rejectionReason: req.rejectionReason ?? null,
          status: req.status as "PENDING" | "APPROVED" | "REJECTED",
          project: req.project
            ? {
                id: req.project.id,
                name: req.project.name,
                client: req.project.client ?? undefined,
              }
            : undefined,
          ticket: req.ticket
            ? {
                id: req.ticket.id,
                code: req.ticket.code,
                title: req.ticket.title,
              }
            : undefined,
        }));
        if (requestId !== requestsRequestIdRef.current) return;
        setRequests(mapped);
        if (!silent) setLoadError(null);
      })
      .catch((err) => {
        if (requestId !== requestsRequestIdRef.current) return;
        if (silent) return;
        console.error("Erro ao carregar solicitações de apontamento:", err);
        setRequests([]);
        setLoadError(String(err?.message || "Erro ao carregar solicitações de apontamento."));
      })
      .finally(() => {
        endWeekLoad(silent);
      });
  }

  useEffect(() => {
    if (authLoading || !user) return;
    // Evita disparar carregamentos antes de saber se tem permissão
    if (permissionsReady && !can("apontamentos")) return;
    loadEntries();
    loadRequests();
  }, [dom.toISOString(), sab.toISOString(), authLoading, user, permissionsReady, can]);

  // Carrega feriados do tenant para o ano da semana (para ajustar metas e regras de feriado).
  useEffect(() => {
    if (authLoading || !user) return;
    if (!permissionsReady) return;
    if (!can("apontamentos")) return;
    const year = dom.getUTCFullYear();
    apiFetch(`/api/holidays?year=${year}`)
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        const next = new Set<string>();
        for (const h of arr) {
          if (h && h.isActive !== false && typeof h.date === "string") {
            next.add(h.date.slice(0, 10));
          }
        }
        setHolidayYmdSet(next);
      })
      .catch(() => setHolidayYmdSet(new Set()));
  }, [dom.toISOString(), authLoading, user, permissionsReady, can]);

  // Atualiza periodicamente para garantir que, quando ADMIN/GESTOR aprovarem um pedido,
  // ele não fique "sumido" na tela do consultor.
  // Atualização silenciosa: não limpa o estado nem exibe banners.
  useEffect(() => {
    if (authLoading || !user) return;
    if (!permissionsReady) return;
    if (!can("apontamentos")) return;

    const intervalMs = 15_000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadEntries(true);
      loadRequests(true);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [dom.toISOString(), sab.toISOString(), authLoading, user, permissionsReady, can]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dom);
    d.setUTCDate(d.getUTCDate() + i);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  });

  const entriesByDay = days.reduce<Record<string, TimeEntryFull[]>>((acc, d) => {
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    acc[key] = entries.filter((e) => String(e.date).slice(0, 10) === key);
    return acc;
  }, {});

  const requestsByDay = days.reduce<Record<string, TimeEntryRequest[]>>((acc, d) => {
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    acc[key] = requests.filter(
      (r) => String(r.date).slice(0, 10) === key && (r.status === "PENDING" || r.status === "REJECTED"),
    );
    return acc;
  }, {});

  const dataInicioYmdUtc = useMemo(() => {
    const raw = (user as any)?.dataInicioAtividades;
    if (!raw) return "";
    try {
      const dt = new Date(String(raw));
      if (Number.isNaN(dt.getTime())) return "";
      return dt.toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }, [user]);

  const dailyLimits = days.map((d) => {
    const key = ymdUtc(d);
    // Antes do início das atividades: não deve contar meta/previsto.
    if (dataInicioYmdUtc && key < dataInicioYmdUtc) return 0;
    // Feriados do tenant: não deve contar meta/previsto.
    if (holidayYmdSet.has(key)) return 0;
    return getDailyLimitFromUserForDate(user, d);
  });
  const totalSemana = entries.reduce((s, e) => s + e.totalHoras, 0);
  const metaSemana = dailyLimits.reduce((s, v) => s + v, 0);
  // Se ainda não há apontamentos, o saldo deve iniciar zerado
  const saldoSemana = totalSemana === 0 ? 0 : totalSemana - metaSemana;

  function prevWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setUTCDate(n.getUTCDate() - 7);
      return n;
    });
  }
  function nextWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setUTCDate(n.getUTCDate() + 7);
      return n;
    });
  }
  function goToday() {
    const d = new Date();
    const diff = d.getUTCDate() - d.getUTCDay();
    const dom = new Date(d);
    dom.setUTCDate(diff);
    dom.setUTCHours(0, 0, 0, 0);
    setWeekStart(dom);
  }

  const semanaNum = Math.ceil(dom.getUTCDate() / 7);

  const dayCardClass = consultorVisualRefresh
    ? "wps-apontamento-day flex flex-col min-w-0 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm"
    : "wps-apontamento-day flex flex-col min-w-0 rounded-xl border border-blue-100 bg-white overflow-hidden";

  const dayTitleClass = consultorVisualRefresh
    ? "text-sm font-medium text-[color:var(--foreground)]"
    : "text-sm font-medium text-gray-800";

  const dayMetaClass = consultorVisualRefresh
    ? "text-xs text-[color:var(--muted-foreground)] mt-0.5"
    : "text-xs text-gray-500 mt-0.5";

  const progressTrackClass = consultorVisualRefresh
    ? "wps-apontamento-progress mt-1 h-1.5 rounded-full bg-[color:var(--border)]/55 overflow-hidden"
    : "wps-apontamento-progress mt-1 h-1.5 rounded-full bg-blue-100 overflow-hidden";

  const progressBarClass = consultorVisualRefresh
    ? "wps-apontamento-progress-bar h-full rounded-full bg-[color:var(--primary)] transition-all"
    : "wps-apontamento-progress-bar h-full rounded-full bg-blue-500 transition-all";

  const addBtnClass = consultorVisualRefresh
    ? "wps-apontamento-add-btn flex w-full max-w-[11rem] items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-[color:var(--primary)]/40 text-[color:var(--primary)] hover:border-[color:var(--primary)]/75 hover:bg-[color:var(--primary)]/[0.07] transition-all text-sm font-semibold"
    : "wps-apontamento-add-btn flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-all text-sm font-medium";

  function entryCardClass(e: TimeEntryFull) {
    const blocked = !canLogTimeForProjectStatus(e.project?.statusInicial);
    if (consultorVisualRefresh) {
      return `wps-apontamento-entry group rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/90 p-3 text-sm cursor-pointer hover:bg-[color:var(--surface)] transition-colors ${blocked ? "opacity-60" : ""}`;
    }
    return `wps-apontamento-entry group rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm cursor-pointer hover:bg-blue-100/70 transition-colors ${blocked ? "opacity-60" : ""}`;
  }

  const entryHoursClass = consultorVisualRefresh
    ? "wps-apontamento-entry-hours font-mono text-[color:var(--primary)] font-semibold text-base"
    : "wps-apontamento-entry-hours font-mono text-blue-600 font-semibold text-base";

  const entryTitleClass = consultorVisualRefresh
    ? "wps-apontamento-entry-title text-[color:var(--muted-foreground)] truncate mt-0.5"
    : "wps-apontamento-entry-title text-gray-600 truncate mt-0.5";

  const entrySubClass = consultorVisualRefresh
    ? "wps-apontamento-entry-sub text-[color:var(--muted-foreground)] truncate text-xs mt-0.5"
    : "wps-apontamento-entry-sub text-gray-500 truncate text-xs mt-0.5";

  const entryTimeClass = consultorVisualRefresh
    ? "wps-apontamento-entry-time text-[color:var(--muted-foreground)]/85 text-xs mt-1"
    : "wps-apontamento-entry-time text-gray-400 text-xs mt-1";

  const delBtnClass = consultorVisualRefresh
    ? "shrink-0 p-2 rounded-lg hover:bg-red-100 text-red-600 max-sm:opacity-100 sm:opacity-60 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
    : "shrink-0 p-1.5 rounded-md hover:bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity";

  const gridClass = consultorVisualRefresh
    ? "grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 min-w-0"
    : "grid grid-cols-7 gap-2 min-w-0";

  return (
    <div
      className={
        consultorVisualRefresh ? "wps-apontamento wps-apontamento--consultor space-y-4" : "wps-apontamento space-y-4"
      }
    >
      {permissionsReady && loadError && (
        <div
          className={
            consultorVisualRefresh
              ? "wps-apontamento-consultor-error rounded-xl border px-4 py-3 text-sm"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
        >
          {loadError}
        </div>
      )}
      {/* Header com navegação e resumo */}
      {consultorVisualRefresh ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 md:p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={prevWeek}
                aria-label="Semana anterior"
                className="wps-apontamento-nav-btn flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="wps-apontamento-nav-btn px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-sm font-semibold text-[color:var(--foreground)] shadow-sm"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={nextWeek}
                aria-label="Próxima semana"
                className="wps-apontamento-nav-btn flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-w-0 flex flex-col gap-0.5 lg:items-end lg:text-right">
              <p className="text-base md:text-lg font-semibold text-[color:var(--foreground)] tracking-tight">
                {formatWeekRangeLabel(dom, sab)}
              </p>
              <p className="wps-apontamento-week text-xs md:text-sm text-[color:var(--muted-foreground)]">
                {dom.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })} · referência {semanaNum}ª
                semana · UTC (domingo a sábado)
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm lg:justify-end">
              <span className="wps-apontamento-week-metric wps-apontamento-consultor-metric-pos font-semibold">
                Horas da semana: {fmt(totalSemana)}
              </span>
              <span
                className={`wps-apontamento-week-metric font-semibold ${
                  saldoSemana >= 0 ? "wps-apontamento-consultor-metric-pos" : "wps-apontamento-consultor-metric-neg"
                }`}
              >
                Saldo: {saldoSemana >= 0 ? "+" : ""}
                {fmt(saldoSemana)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={prevWeek}
              className="wps-apontamento-nav-btn flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-gray-700"
            >
              ←
            </button>
            <button
              onClick={goToday}
              className="wps-apontamento-nav-btn px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-sm text-gray-700"
            >
              Hoje
            </button>
            <button
              onClick={nextWeek}
              className="wps-apontamento-nav-btn flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-gray-700"
            >
              →
            </button>
          </div>
          <p className="wps-apontamento-week text-gray-600 text-sm font-medium">
            {dom.toLocaleDateString("pt-BR", { month: "long" })} {dom.getFullYear()} · {semanaNum}ª semana
          </p>
          <div className="flex gap-4 text-sm">
            <span className="wps-apontamento-week-metric text-green-600 font-medium">Horas da Semana: {fmt(totalSemana)}</span>
            <span className={`wps-apontamento-week-metric font-medium ${saldoSemana >= 0 ? "text-green-600" : "text-red-600"}`}>
              Saldo: {saldoSemana >= 0 ? "+" : ""}
              {fmt(saldoSemana)}
            </span>
          </div>
        </div>
      )}

      {consultorVisualRefresh && weekLoading ? (
        <div className={gridClass} aria-busy="true" aria-label="Carregando apontamentos da semana">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 space-y-3 animate-pulse min-h-[220px]"
            >
              <div className="h-4 bg-[color:var(--border)]/60 rounded-md w-2/3 mx-auto" />
              <div className="h-2 bg-[color:var(--border)]/45 rounded-full" />
              <div className="h-10 bg-[color:var(--border)]/35 rounded-xl" />
              <div className="h-20 bg-[color:var(--border)]/30 rounded-xl" />
            </div>
          ))}
        </div>
      ) : null}

      {/* Colunas por dia (responsivo no preview consultor) */}
      {!consultorVisualRefresh || !weekLoading ? (
      <div className={gridClass}>
        {days.map((d, index) => {
          const key = d.toISOString().slice(0, 10);
          const dayEntries = entriesByDay[key] ?? [];
          const dayRequests = requestsByDay[key] ?? [];
          const totalDay = dayEntries.reduce((s, e) => s + e.totalHoras, 0);
          const meta = dailyLimits[index] ?? 0;

          return (
            <div key={key} className={dayCardClass}>
              {/* Cabeçalho do dia */}
              <div className="wps-apontamento-day-header px-2 py-2 text-center">
                <div className={dayTitleClass}>
                  {d.getUTCDate()} {DIAS_ABREV[d.getUTCDay()]}
                </div>
                <div className={dayMetaClass}>
                  {fmt(totalDay)} de {fmt(meta)}
                </div>
                <div className={progressTrackClass}>
                  <div
                    className={progressBarClass}
                    style={{
                      width: `${
                        meta > 0
                          ? Math.min(100, (totalDay / meta) * 100)
                          : totalDay > 0
                            ? 100
                            : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* + logo abaixo do dia */}
              <div className="px-2 pb-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setModal({ date: parseYmdAsLocalDate(d.toISOString().slice(0, 10)), baseTotal: totalDay })}
                  className={addBtnClass}
                  title={`Adicionar apontamento em ${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  Adicionar
                </button>
              </div>

              {/* Cards de apontamentos */}
              <div
                className={
                  consultorVisualRefresh
                    ? "flex-1 overflow-y-auto p-2 space-y-2 min-h-[160px]"
                    : "flex-1 overflow-y-auto p-2 space-y-2 min-h-[140px]"
                }
              >
                {dayEntries.length === 0 && dayRequests.length === 0 ? (
                  <div className="wps-apontamento-empty text-sm text-gray-400 text-center py-6">Sem apontamentos</div>
                ) : (
                  <>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => {
                          if (!canLogTimeForProjectStatus(e.project?.statusInicial)) {
                            setLoadError("O status do projeto não permite apontamento de horas");
                            return;
                          }
                          setEditEntry(e);
                        }}
                        className={entryCardClass(e)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className={entryHoursClass}>{fmt(e.totalHoras)}</div>
                            {e.ticket && (
                              <div className={entryTitleClass} title={e.ticket.title}>
                                {ticketCodeTitleLine(e.ticket.type, e.ticket.code, e.ticket.title)}
                              </div>
                            )}
                            {e.project && (
                              <div className={entrySubClass}>
                                {e.project.client?.name} - {e.project.name}
                              </div>
                            )}
                            <div className={entryTimeClass}>
                              {e.horaInicio} - {e.horaFim}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (!canLogTimeForProjectStatus(e.project?.statusInicial)) {
                                setLoadError("O status do projeto não permite apontamento de horas");
                                return;
                              }
                              if (!confirm("Excluir este apontamento?")) return;
                              apiFetch(`/api/time-entries/${e.id}`, { method: "DELETE" })
                                .then(() => {
                                  loadEntries();
                                  notifyTimeEntriesChanged();
                                })
                                .catch((err) => console.error("Erro ao excluir:", err));
                            }}
                            className={delBtnClass}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {dayRequests.map((r) => (
                      <div
                      key={r.id}
                      onClick={() => {
                        if (r.status === "REJECTED") {
                          // Abrir modal de NOVO apontamento já pré-preenchido com os dados
                          // da solicitação reprovada, permitindo corrigir e reenviar.
                          setRequestToFix(r);
                          setModal({ date: parseYmdAsLocalDate(r.date), baseTotal: totalDay });
                        }
                      }}
                        className={`group rounded-lg border p-3 text-sm transition-colors cursor-pointer ${
                          r.status === "PENDING"
                            ? consultorVisualRefresh
                              ? "wps-apontamento-consultor-req-pending border-amber-300/55 bg-amber-500/[0.07]"
                              : "border-amber-200 bg-amber-50/60"
                            : consultorVisualRefresh
                              ? "wps-apontamento-consultor-req-rejected border-red-300/50 bg-red-500/[0.07]"
                              : "border-red-200 bg-red-50/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-mono font-semibold text-base text-gray-800">
                              {fmt(r.totalHoras)}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold mt-1 ${
                                r.status === "PENDING"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {r.status === "PENDING" ? "Aguardando aprovação" : "Reprovado"}
                            </span>
                            {r.ticket && (
                              <div className="text-gray-700 truncate mt-0.5" title={r.ticket.title}>
                                {ticketCodeTitleLine(r.ticket.type, r.ticket.code, r.ticket.title)}
                              </div>
                            )}
                            {r.project && (
                              <div className="text-gray-500 truncate text-xs mt-0.5">
                                {r.project.client?.name ? `${r.project.client.name} - ` : ""}
                                {r.project.name}
                              </div>
                            )}
                            <div className="text-gray-400 text-xs mt-1">
                              {r.horaInicio} - {r.horaFim}
                            </div>
                            {r.description && (
                              <div className="text-gray-500 text-xs mt-1 line-clamp-2">
                                {r.description}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (!confirm("Excluir esta solicitação? Ela sumirá da lista de permissões.")) return;
                              apiFetch(`/api/permission-requests/${r.id}`, { method: "DELETE" })
                                .then(() => {
                                  loadRequests();
                                  loadEntries();
                                  notifyTimeEntriesChanged();
                                })
                                .catch((err) => console.error("Erro ao excluir solicitação:", err));
                            }}
                            className={delBtnClass}
                            title="Excluir solicitação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      ) : null}

      {modal && (
        <ApontamentoModal
          date={modal.date}
          baseDayTotal={modal.baseTotal}
          holidayYmdSet={holidayYmdSet}
          requestToFix={requestToFix ?? undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setRequestToFix(null);
            loadEntries();
            loadRequests();
            notifyTimeEntriesChanged();
          }}
        />
      )}
      {editEntry && (
        <ApontamentoModal
          date={parseYmdAsLocalDate(editEntry.date)}
          baseDayTotal={entries
            .filter(
              (e) =>
                String(e.date).slice(0, 10) === String(editEntry.date).slice(0, 10),
            )
            .reduce((sum, e) => sum + e.totalHoras, 0)}
          holidayYmdSet={holidayYmdSet}
          entry={editEntry}
          requestToFix={requestToFix && requestToFix.id === editEntry.id ? requestToFix : undefined}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            loadEntries();
            loadRequests();
            notifyTimeEntriesChanged();
          }}
        />
      )}
    </div>
  );
}

function ApontamentoModal({
  date,
  baseDayTotal,
  holidayYmdSet,
  entry,
  requestToFix,
  onClose,
  onSaved,
}: {
  date: Date;
  baseDayTotal: number;
  holidayYmdSet: Set<string>;
  entry?: TimeEntryFull;
  requestToFix?: TimeEntryRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; statusInicial?: string | null; clientId?: string; client?: { id: string } }>
  >([]);
  type TicketForSelect = {
    id: string;
    code: string;
    title: string;
    projectId: string;
    type?: string;
    parentTicketId?: string | null;
  };
  const [tickets, setTickets] = useState<TicketForSelect[]>([]);
  const [activities, setActivities] = useState<Array<{ id: string; name: string }>>([]);
  const [clientId, setClientId] = useState(
    entry?.project?.clientId ??
      entry?.project?.client?.id ??
      requestToFix?.project?.client?.id ??
      "",
  );
  const [projectId, setProjectId] = useState(entry?.project?.id ?? requestToFix?.project?.id ?? "");
  const [topicId, setTopicId] = useState<string>("");
  const [ticketId, setTicketId] = useState(entry?.ticket?.id ?? requestToFix?.ticket?.id ?? "");
  const [activityId, setActivityId] = useState(entry?.activity?.id ?? "");
  const [horaInicio, setHoraInicio] = useState(entry?.horaInicio ?? requestToFix?.horaInicio ?? "09:00");
  const [horaFim, setHoraFim] = useState(entry?.horaFim ?? requestToFix?.horaFim ?? "17:00");
  const [intervaloInicio, setIntervaloInicio] = useState(entry?.intervaloInicio ?? requestToFix?.intervaloInicio ?? "");
  const [intervaloFim, setIntervaloFim] = useState(entry?.intervaloFim ?? requestToFix?.intervaloFim ?? "");
  const [description, setDescription] = useState(entry?.description ?? requestToFix?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [permissionPayload, setPermissionPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const [overLimitPayload, setOverLimitPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    apiFetch("/api/clients/for-select")
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then(setClients);
    apiFetch("/api/activities")
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]));
  }, []);
  useEffect(() => {
    if (!clientId) {
      setProjects([]);
      setProjectId("");
      setTicketId("");
      return;
    }
    const entryClientId = entry?.project?.clientId ?? entry?.project?.client?.id;
    const requestClientId = requestToFix?.project?.client?.id;
    const hasEntry = !!entry;
    const hasRequest = !!requestToFix;
    const isEditSameClient = hasEntry && clientId === entryClientId;

    apiFetch("/api/projects?light=true")
      .then((r) => r.json())
      .then((list: Array<{ id: string; name: string; statusInicial?: string | null; clientId?: string; client?: { id: string } }>) =>
        setProjects(list.filter((p) => (p.clientId || p.client?.id) === clientId))
      );
    // Para edição de apontamento: se o cliente mudou em relação ao registro original,
    // limpamos projeto e tarefa. Para correção de REPROVADO mantemos os campos.
    if (hasEntry && !isEditSameClient) {
      setProjectId("");
      setTicketId("");
    }
  }, [clientId, entry?.project?.clientId, entry?.project?.client?.id, requestToFix?.project?.client?.id]);
  useEffect(() => {
    if (!projectId) {
      setTickets([]);
      setTopicId("");
      setTicketId("");
      return;
    }
    const hasEntry = !!entry;
    const hasRequest = !!requestToFix;
    const isEditSameProject = hasEntry && projectId === entry.project?.id;
    apiFetch(`/api/tickets?projectId=${projectId}&light=true`)
      .then((r) => r.json())
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setTickets(arr);

        // Quando viemos de uma solicitação reprovada ou edição, tenta
        // selecionar automaticamente o tópico (SUBPROJETO) com base na tarefa.
        if ((entry || requestToFix) && !topicId && ticketId) {
          const currentTask = arr.find((t: TicketForSelect) => t.id === ticketId);
          if (currentTask?.parentTicketId) {
            setTopicId(currentTask.parentTicketId);
          }
        }
      });
    // Para edição de apontamento: se o projeto mudou em relação ao registro original,
    // limpamos tópico e tarefa. Para correção de REPROVADO mantemos os campos.
    if (hasEntry && !isEditSameProject) {
      setTopicId("");
      setTicketId("");
    }
  }, [projectId, entry?.project?.id, requestToFix, ticketId, topicId]);

  const topics = tickets.filter((t) => t.type === "SUBPROJETO");
  const taskOptions = tickets.filter(
    (t) =>
      t.type !== "SUBPROJETO" &&
      t.type !== "SUBTAREFA" &&
      (!topicId || t.parentTicketId === topicId),
  );

  function formatHorasInput(value: string): string {
    // Mantém só dígitos e limita a 4 (HHMM)
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      // Enquanto o usuário está digitando as horas, não força os dois pontos
      return digits;
    }
    // A partir de 3 dígitos, formata como HH:MM
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  function parseHours(h: string): number {
    if (!h?.trim()) return 0;
    const parts = h.trim().split(":").map(Number);
    const hh = isNaN(parts[0]) ? 0 : parts[0];
    const mm = isNaN(parts[1]) ? 0 : parts[1];
    return hh + mm / 60;
  }

  function calcTotal() {
    let t = parseHours(horaFim) - parseHours(horaInicio);
    if (intervaloInicio && intervaloFim) t -= parseHours(intervaloFim) - parseHours(intervaloInicio);
    return t > 0 ? fmt(t) : "00:00";
  }

  function calcTotalHorasDecimal(): number {
    let t = parseHours(horaFim) - parseHours(horaInicio);
    if (intervaloInicio && intervaloFim) t -= parseHours(intervaloFim) - parseHours(intervaloInicio);
    return t > 0 ? t : 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    // Validação dos campos obrigatórios
    const errors: Record<string, boolean> = {};
    const missingLabels: string[] = [];

    if (!clientId) {
      errors.clientId = true;
      missingLabels.push("Cliente");
    }
    if (!projectId) {
      errors.projectId = true;
      missingLabels.push("Projeto");
    }
    if (!ticketId) {
      errors.ticketId = true;
      missingLabels.push("Tarefa");
    }
    if (!description.trim()) {
      errors.description = true;
      missingLabels.push("Descrição");
    }

    if (missingLabels.length > 0) {
      setFieldErrors(errors);
      const msgBase = "Preencha o campo obrigatório";
      if (missingLabels.length === 1) {
        setError(`${msgBase}: ${missingLabels[0]}`);
      } else {
        const last = missingLabels[missingLabels.length - 1];
        const initial = missingLabels.slice(0, -1).join(", ");
        setError(`${msgBase}s: ${initial} e ${last}`);
      }
      return;
    }

    // Bloqueio por status do projeto (UX). O backend também valida.
    const selectedProject = projects.find((p) => p.id === projectId);
    if (selectedProject && !canLogTimeForProjectStatus(selectedProject.statusInicial)) {
      setError("O status do projeto não permite apontamento de horas");
      return;
    }

    const totalDecimal = calcTotalHorasDecimal();

    // Bloqueio antecipado: datas futuras não devem abrir modal
    const todayYmd = new Date().toISOString().slice(0, 10);
    const requestedYmd = date.toISOString().slice(0, 10);
    if (requestedYmd > todayYmd) {
      setError("Não é permitido apontar horas em datas futuras.");
      setPermissionPayload(null);
      setOverLimitPayload(null);
      return;
    }

    // Regra de finais de semana / feriados
    const weekday = date.getDay(); // 0 = domingo, 6 = sábado
    const isWeekend = weekday === 0 || weekday === 6;
    const isHoliday = holidayYmdSet.has(requestedYmd);
    if (isWeekend || isHoliday) {
      // Se o usuário não tem permissão, bloqueia com mensagem de erro.
      if (!user?.permitirFimDeSemana) {
        setError("Você não tem permissão para apontar em finais de semana ou feriados.");
        return;
      }

      // Mesmo com permissão, o apontamento em final de semana SEMPRE precisa de aprovação.
      if (!isEdit) {
        const todayYmd = new Date().toISOString().slice(0, 10);
        if (requestedYmd !== todayYmd && !user?.permitirOutroPeriodo) {
          setError(
            "Você não tem permissão para apontar em outras datas fora da data atual."
          );
          return;
        }
        setPermissionPayload({
          date: requestedYmd,
          horaInicio,
          horaFim,
          intervaloInicio: intervaloInicio || undefined,
          intervaloFim: intervaloFim || undefined,
          totalHoras: totalDecimal,
          description: description || undefined,
          projectId,
          ticketId: ticketId || undefined,
          activityId: activityId || undefined,
        });
        return;
      }
    }

    // Caso especial: correção de apontamento REPROVADO.
    // Aqui não criamos um novo registro; reaproveitamos a própria solicitação REJECTED,
    // atualizando os dados e voltando o status para PENDING para nova aprovação.
    if (requestToFix && !isEdit) {
      if (!requestToFix.justification || !requestToFix.justification.trim()) {
        setError("Não foi possível reenviar a solicitação: justificativa anterior ausente.");
        return;
      }

      setSaving(true);
      try {
        const body = {
          justification: requestToFix.justification,
          date: date.toISOString().slice(0, 10),
          horaInicio,
          horaFim,
          intervaloInicio: intervaloInicio || undefined,
          intervaloFim: intervaloFim || undefined,
          totalHoras: totalDecimal,
          description: description || undefined,
          projectId,
          ticketId: ticketId || undefined,
          activityId: activityId || undefined,
        };
        const res = await apiFetch(`/api/permission-requests/${requestToFix.id}/resend`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || "Erro ao reenviar solicitação para aprovação.");
          return;
        }

        onSaved();
        return;
      } catch {
        setError("Erro de conexão ao reenviar solicitação.");
        return;
      } finally {
        setSaving(false);
      }
    }

    // Fluxo normal (sem correção de REPROVADO): aplica regras de limite diário e horário permitido.

    // Regra: usuários sem permissão não podem exceder o limite diário configurado.
    // Considera tanto um único apontamento > limite quanto a soma do dia (novo ou edição).
    const dailyLimit = getDailyLimitFromUserForDate(user ?? null, date);
    // Dia com limite 0 é considerado não apontável (exceto fim de semana: abre solicitação para aprovação)
    if (dailyLimit === 0 && !isWeekend) {
      setError(
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia."
      );
      return;
    }
    const previousHours = isEdit && entry ? entry.totalHoras : 0;
    const effectiveBaseTotal = Math.max(0, baseDayTotal - previousHours);
    const willExceedByEntry = totalDecimal > dailyLimit;
    const willExceedByDay = effectiveBaseTotal + totalDecimal > dailyLimit;

    if (!user?.permitirMaisHoras && (willExceedByEntry || willExceedByDay)) {
      setOverLimitPayload({
        date: date.toISOString().slice(0, 10),
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || undefined,
        intervaloFim: intervaloFim || undefined,
        totalHoras: totalDecimal,
        description: description || undefined,
        projectId,
        ticketId: ticketId || undefined,
        activityId: activityId || undefined,
      });
      return;
    }

    setSaving(true);
    try {
      const body = {
        date: date.toISOString().slice(0, 10),
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || undefined,
        intervaloFim: intervaloFim || undefined,
        description: description || undefined,
        projectId,
        ticketId: ticketId || undefined,
        activityId: activityId || undefined,
      };
      const res = isEdit
        ? await apiFetch(`/api/time-entries/${entry!.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/time-entries", {
            method: "POST",
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao salvar");
        return;
      }
      // Se o usuário estava corrigindo uma solicitação reprovada, remover a solicitação antiga
      if (!isEdit && requestToFix?.id) {
        await apiFetch(`/api/permission-requests/${requestToFix.id}`, { method: "DELETE" }).catch(() => {});
      }
      onSaved();
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-3 text-[17px] rounded-xl border border-blue-100 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-shadow";
  const labelClass = "block text-sm font-medium text-gray-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "var(--font-dm-sans)" }}
      >
        <div className="p-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-1" style={{ fontFamily: "var(--font-dm-sans)" }}>
            {isEdit ? "Editar apontamento" : "Novo apontamento"}
          </h3>
          <p className="text-gray-500 text-[15px] mb-6">
            {date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </p>
          {!isEdit && requestToFix?.status === "REJECTED" && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Apontamento reprovado</p>
              {requestToFix.rejectionReason ? (
                <p className="mt-1">
                  <span className="font-medium">Motivo:</span> {requestToFix.rejectionReason}
                </p>
              ) : (
                <p className="mt-1">Motivo da reprovação não informado.</p>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>
                Cliente <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, clientId: false }));
                }}
                className={`${inputClass} cursor-pointer ${fieldErrors.clientId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`}
              >
                <option value="">Selecione o cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Projeto <span className="text-red-500">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, projectId: false }));
                }}
                className={`${inputClass} cursor-pointer ${
                  fieldErrors.projectId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""
                }`}
              >
                <option value="">Selecione o projeto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tópico</label>
              <select
                value={topicId}
                onChange={(e) => {
                  const next = e.target.value;
                  setTopicId(next);
                  // Se a tarefa atual não pertence mais ao tópico selecionado, limpa
                  if (next && ticketId) {
                    const validTaskIds = new Set(
                      tickets
                        .filter(
                          (t) =>
                            t.type !== "SUBPROJETO" &&
                            t.type !== "SUBTAREFA" &&
                            t.parentTicketId === next,
                        )
                        .map((t) => t.id),
                    );
                    if (!validTaskIds.has(ticketId)) {
                      setTicketId("");
                    }
                  }
                }}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Todos os tópicos</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {ticketCodeTitleLine(t.type, t.code, t.title)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Tarefa <span className="text-red-500">*</span>
              </label>
              <select
                value={ticketId}
                onChange={(e) => {
                  setTicketId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, ticketId: false }));
                }}
                className={`${inputClass} cursor-pointer ${
                  fieldErrors.ticketId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""
                }`}
              >
                <option value="">Selecione a tarefa</option>
                {taskOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}: {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Atividade</label>
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Nenhuma</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="pt-2 pb-1 border-t border-blue-50">
              <p className="text-sm font-medium text-gray-600 mb-3">Horário</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Início</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(formatHorasInput(e.target.value))}
                    placeholder="09:00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fim</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={horaFim}
                    onChange={(e) => setHoraFim(formatHorasInput(e.target.value))}
                    placeholder="17:00"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervalo início</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={intervaloInicio}
                    onChange={(e) => setIntervaloInicio(formatHorasInput(e.target.value))}
                    placeholder="12:00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervalo fim</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={intervaloFim}
                    onChange={(e) => setIntervaloFim(formatHorasInput(e.target.value))}
                    placeholder="13:00"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-3 text-blue-600 text-[17px] font-medium">Total: {calcTotal()}</p>
            </div>

            <div>
              <label className={labelClass}>
                Descrição <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value.slice(0, 800));
                  setFieldErrors((prev) => ({ ...prev, description: false }));
                }}
                rows={3}
                maxLength={800}
                className={`${inputClass} resize-none ${fieldErrors.description ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`}
                placeholder="O que foi feito..."
              />
              <p className="text-xs text-gray-400 mt-1">{description.length}/800</p>
            </div>
            {error && <p className="text-red-500 text-sm py-1 font-medium">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition"
              >
                {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {permissionPayload && (
        <TimeEntryPermissionModal
          payload={permissionPayload}
          onClose={() => setPermissionPayload(null)}
          onSent={() => {
            setPermissionPayload(null);
            setError("");
            onSaved();
          }}
          onSubmitRequest={async (data) => {
            const res = await apiFetch("/api/permission-requests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                justification: data.justification,
                date: data.date,
                horaInicio: data.horaInicio,
                horaFim: data.horaFim,
                intervaloInicio: data.intervaloInicio,
                intervaloFim: data.intervaloFim,
                totalHoras: data.totalHoras,
                description: data.description,
                projectId: data.projectId,
                ticketId: data.ticketId,
                activityId: data.activityId,
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body?.error || "Erro ao enviar solicitação para aprovação.");
            }
            return true;
          }}
        />
      )}
      {overLimitPayload && (
        <ConfirmModal
          title="Apontamento acima do limite diário"
          message="Este apontamento excede o limite permitido e precisa de aprovação do Administrador ou Gestor de Projetos. Confirmar?"
          confirmLabel="Enviar para aprovação"
          cancelLabel="Cancelar"
          onCancel={() => setOverLimitPayload(null)}
          onConfirm={async () => {
            try {
              const res = await apiFetch("/api/permission-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  justification: "Apontamento acima do limite diário de 8 horas.",
                  date: overLimitPayload.date,
                  horaInicio: overLimitPayload.horaInicio,
                  horaFim: overLimitPayload.horaFim,
                  intervaloInicio: overLimitPayload.intervaloInicio,
                  intervaloFim: overLimitPayload.intervaloFim,
                  totalHoras: overLimitPayload.totalHoras,
                  description: overLimitPayload.description,
                  projectId: overLimitPayload.projectId,
                  ticketId: overLimitPayload.ticketId,
                  activityId: overLimitPayload.activityId,
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Erro ao enviar para aprovação.");
                return;
              }
              setOverLimitPayload(null);
              setError("");
              onSaved();
            } catch {
              setError("Erro ao enviar para aprovação.");
            }
          }}
        />
      )}
    </div>
  );
}
