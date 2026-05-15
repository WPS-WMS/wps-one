"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import {
  applyWeekPlannedEdit,
  buildPlannedSavePayload,
  distributePlannedToWeekStrings,
  parsePlannedIntInput,
  sumPlannedWeekStrings,
} from "@/lib/tmPlanningEdit";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart2, ChevronDown, Pencil, X, Save, Loader2 } from "lucide-react";
import { reportsSelectClass } from "@/components/reports/ReportsPrimitives";

type TmProjectOption = {
  id: string;
  name: string;
  tipoProjeto: string | null;
  client?: { id: string; name: string } | null;
};

type TmClientOption = { id: string; name: string };

type WeekMeta = { index: number; label: string; clipStart: string; clipEndExclusive: string };

type ProjectRow = {
  projectId: string;
  name: string;
  tipoProjeto: string | null;
  client: { id: string; name: string } | null;
  mesPlanejado: number | null;
  weekPlanHoras: (number | null)[];
  mensalExecutado: number;
  weekExecutado: number[];
};

type TotalsPayload = {
  /** Plano do tenant (aba Total); não é soma dos projetos. */
  mesPlanejadoSum: number | null;
  weekPlanSum: (number | null)[];
  /** Soma do «mensal executado» de todos os projetos T&M+AMS visíveis. */
  mensalExecutadoSum: number;
  weekExecutadoSum: number[];
};

type ApiPorProjetos = {
  year: number;
  month: number;
  tab: "projetos";
  weeks: WeekMeta[];
  projects: ProjectRow[];
};

type ApiTotal = {
  year: number;
  month: number;
  tab: "total";
  weeks: WeekMeta[];
  totals: TotalsPayload;
};

function fmtHoras(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function fmtPlannedHoras(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}

/** % do mensal executado em relação ao mês planejado. */
function fmtPctExecutadoVsPlanejado(executado: number, planejado: number | null | undefined): string {
  if (planejado == null || !Number.isFinite(planejado) || planejado <= 0) return "—";
  const exec = executado ?? 0;
  if (!Number.isFinite(exec)) return "—";
  const pct = (exec / planejado) * 100;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function planejadoForPct(editing: boolean, draftMes: string, saved: number | null): number | null {
  if (!editing) return saved;
  const t = draftMes.trim().replace(",", ".");
  if (!t) return saved;
  const n = Number(t);
  return Number.isFinite(n) ? n : saved;
}

function tipoLabel(t: string | null | undefined): string {
  if (t === "AMS") return "AMS";
  if (t === "TIME_MATERIAL") return "T&M";
  return t ?? "—";
}

function monthYearLabelPt(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

const tmFilterSelectClass =
  reportsSelectClass + " min-h-[40px] w-full border-[color:var(--border)] shadow-none pr-9";

function TmFilterSelect({
  label,
  value,
  onValueChange,
  children,
  className = "",
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onValueChange(e.target.value)} className={tmFilterSelectClass}>
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted-foreground)]"
          aria-hidden
        />
      </div>
    </div>
  );
}

function saoPauloNowYm(): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "2026");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return { y, m };
}

type ChartTarget =
  | { kind: "total"; rows: { label: string; plan: number; exec: number }[] }
  | { kind: "project"; projectId: string; name: string; rows: { label: string; plan: number; exec: number }[] };

function ChartModal({ open, onClose, title, rows }: { open: boolean; onClose: () => void; title: string; rows: { label: string; plan: number; exec: number }[] }) {
  if (!open) return null;
  const maxVal = Math.max(1, ...rows.flatMap((r) => [r.plan, r.exec]));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tm-chart-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="tm-chart-title" className="text-lg font-semibold text-[color:var(--foreground)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border hover:opacity-90"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)] mb-4">
          Barras: planejado (roxo) vs executado (verde), escala comum por semana.
        </p>
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="text-xs font-medium text-[color:var(--muted-foreground)] mb-1.5">{r.label}</p>
              <div className="flex gap-2 items-end h-24">
                <div className="flex-1 flex flex-col justify-end gap-1">
                  <div
                    className="rounded-md w-full transition-all"
                    style={{
                      height: `${(r.plan / maxVal) * 100}%`,
                      minHeight: r.plan > 0 ? 4 : 0,
                      background: "linear-gradient(180deg, rgba(92, 0, 225, 0.85), rgba(92, 0, 225, 0.45))",
                    }}
                    title={`Plan: ${fmtHoras(r.plan)}`}
                  />
                  <span className="text-[10px] text-center text-[color:var(--muted-foreground)]">Plan</span>
                </div>
                <div className="flex-1 flex flex-col justify-end gap-1">
                  <div
                    className="rounded-md w-full transition-all"
                    style={{
                      height: `${(r.exec / maxVal) * 100}%`,
                      minHeight: r.exec > 0 ? 4 : 0,
                      background: "linear-gradient(180deg, rgba(16, 185, 129, 0.9), rgba(16, 185, 129, 0.45))",
                    }}
                    title={`Exec: ${fmtHoras(r.exec)}`}
                  />
                  <span className="text-[10px] text-center text-[color:var(--muted-foreground)]">Exec</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GestaoTmContent() {
  const { can } = useAuth();
  const canEdit = can("projeto.editar");
  const sp = saoPauloNowYm();
  const [mainTab, setMainTab] = useState<"total" | "projetos">("total");
  const [year, setYear] = useState(sp.y);
  const [month, setMonth] = useState(sp.m);
  const [clientId, setClientId] = useState<string>("all");
  const [projectId, setProjectId] = useState<string>("all");
  const [projectOptions, setProjectOptions] = useState<TmProjectOption[]>([]);
  const [clientOptions, setClientOptions] = useState<TmClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataPor, setDataPor] = useState<ApiPorProjetos | null>(null);
  const [dataTotal, setDataTotal] = useState<ApiTotal | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftMes, setDraftMes] = useState("");
  const [draftWeeks, setDraftWeeks] = useState<string[]>([]);
  const [editingTotal, setEditingTotal] = useState(false);
  const [draftTenantMes, setDraftTenantMes] = useState("");
  const [draftTenantWeeks, setDraftTenantWeeks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [chart, setChart] = useState<ChartTarget | null>(null);

  const loadClients = useCallback(() => {
    apiFetch("/api/tm-gestao/clients")
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao listar clientes");
        return r.json() as Promise<TmClientOption[]>;
      })
      .then(setClientOptions)
      .catch(() => setClientOptions([]));
  }, []);

  const loadProjects = useCallback(() => {
    const qs = clientId !== "all" ? `?clientId=${encodeURIComponent(clientId)}` : "";
    apiFetch(`/api/tm-gestao/projects${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao listar projetos");
        return r.json() as Promise<TmProjectOption[]>;
      })
      .then(setProjectOptions)
      .catch(() => setProjectOptions([]));
  }, [clientId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
        tab: mainTab,
      });
      if (mainTab === "projetos" && projectId !== "all") q.set("projectId", projectId);
      if (clientId !== "all") q.set("clientId", clientId);
      const r = await apiFetch(`/api/tm-gestao?${q.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string })?.error ?? "Erro ao carregar");
      if (mainTab === "total") setDataTotal(j as ApiTotal);
      else setDataPor(j as ApiPorProjetos);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      if (mainTab === "total") setDataTotal(null);
      else setDataPor(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, mainTab, projectId, clientId]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    cancelEdit();
    setEditingTotal(false);
    setDraftTenantMes("");
    setDraftTenantWeeks([]);
  }, [mainTab, year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weeks = useMemo(() => {
    if (mainTab === "total") return dataTotal?.weeks ?? [];
    return dataPor?.weeks ?? [];
  }, [mainTab, dataTotal, dataPor]);

  const yearOptions = useMemo(() => {
    const cur = sp.y;
    return Array.from({ length: 7 }, (_, i) => cur - 3 + i);
  }, [sp.y]);

  function startEdit(row: ProjectRow) {
    setEditingTotal(false);
    setDraftTenantMes("");
    setDraftTenantWeeks([]);
    setEditingId(row.projectId);
    setDraftMes(row.mesPlanejado != null ? String(row.mesPlanejado) : "");
    setDraftWeeks(row.weekPlanHoras.map((v) => (v != null && Number.isFinite(v) ? String(v) : "")));
  }

  function startEditTotal() {
    if (!dataTotal) return;
    cancelEdit();
    const t = dataTotal.totals;
    setEditingTotal(true);
    setDraftTenantMes(t.mesPlanejadoSum != null ? String(t.mesPlanejadoSum) : "");
    setDraftTenantWeeks(t.weekPlanSum.map((v) => (v != null && Number.isFinite(v as number) ? String(v) : "")));
  }

  function cancelTenantEdit() {
    setEditingTotal(false);
    setDraftTenantMes("");
    setDraftTenantWeeks([]);
  }

  const handleTenantMonthChange = useCallback(
    (raw: string) => {
      setDraftTenantMes(raw);
      const wc = dataTotal?.weeks.length ?? 0;
      if (wc <= 0) return;
      if (!raw.trim()) {
        setDraftTenantWeeks(Array.from({ length: wc }, () => ""));
        return;
      }
      const n = parsePlannedIntInput(raw);
      if (n != null) setDraftTenantWeeks(distributePlannedToWeekStrings(n, wc));
    },
    [dataTotal?.weeks.length]
  );

  const handleTenantWeekChange = useCallback(
    (index: number, raw: string) => {
      const cap = parsePlannedIntInput(draftTenantMes);
      setDraftTenantWeeks((prev) => applyWeekPlannedEdit(prev, index, raw, cap));
    },
    [draftTenantMes]
  );

  const handleProjectMonthChange = useCallback(
    (raw: string) => {
      setDraftMes(raw);
      const wc = weeks.length;
      if (wc <= 0) return;
      if (!raw.trim()) {
        setDraftWeeks(Array.from({ length: wc }, () => ""));
        return;
      }
      const n = parsePlannedIntInput(raw);
      if (n != null) setDraftWeeks(distributePlannedToWeekStrings(n, wc));
    },
    [weeks.length]
  );

  const handleProjectWeekChange = useCallback(
    (index: number, raw: string) => {
      const cap = parsePlannedIntInput(draftMes);
      setDraftWeeks((prev) => applyWeekPlannedEdit(prev, index, raw, cap));
    },
    [draftMes]
  );

  async function saveTenantEdit() {
    if (!dataTotal?.weeks.length) return;
    setSaving(true);
    setError(null);
    try {
      const { mesPlanejado: mesBody, weekPlanHoras } = buildPlannedSavePayload(
        draftTenantMes,
        draftTenantWeeks,
        dataTotal.weeks.length
      );

      const res = await apiFetch("/api/tm-gestao/tenant-planning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          mesPlanejado: mesBody,
          weekPlanHoras,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string })?.error ?? "Erro ao salvar");
      cancelTenantEdit();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftMes("");
    setDraftWeeks([]);
  }

  async function saveEdit(projectIdSave: string) {
    if (!weeks.length) return;
    setSaving(true);
    setError(null);
    try {
      const { mesPlanejado: mesBody, weekPlanHoras } = buildPlannedSavePayload(draftMes, draftWeeks, weeks.length);

      const res = await apiFetch("/api/tm-gestao/planning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectIdSave,
          year,
          month,
          mesPlanejado: mesBody,
          weekPlanHoras,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string })?.error ?? "Erro ao salvar");
      cancelEdit();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function openChartTotal() {
    const t = dataTotal?.totals;
    if (!t || !dataTotal?.weeks.length) return;
    const rows = dataTotal.weeks.map((w, i) => ({
      label: w.label,
      plan: Number(t.weekPlanSum[i] ?? 0),
      exec: t.weekExecutadoSum[i] ?? 0,
    }));
    setChart({ kind: "total", rows });
  }

  function openChartProject(row: ProjectRow) {
    const rows = weeks.map((w, i) => ({
      label: w.label,
      plan: row.weekPlanHoras[i] != null ? Number(row.weekPlanHoras[i]) : 0,
      exec: row.weekExecutado[i] ?? 0,
    }));
    setChart({ kind: "project", projectId: row.projectId, name: row.name, rows });
  }

  const isCurrentMonth = year === sp.y && month === sp.m;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header
        className="flex-shrink-0 border-b px-4 py-4 md:px-6 md:py-5 bg-[color:var(--surface)]/80 backdrop-blur-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <h1 className="text-xl md:text-2xl font-bold text-[color:var(--foreground)]">Gestão T&amp;M</h1>
        <p className="text-sm text-[color:var(--muted-foreground)] mt-1 max-w-3xl">
          Acompanhe as horas utilizadas nos projetos Time &amp; Material e AMS: na aba{" "}
          <strong>Total T&amp;M + AMS</strong>, o consolidado do mês; na aba <strong>Por projetos</strong>, o detalhe de
          cada projeto no mês e em cada semana.
        </p>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-wrap gap-2 p-1 rounded-xl border bg-[color:var(--surface)]/60" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={() => setMainTab("total")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                mainTab === "total"
                  ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow"
                  : "text-[color:var(--muted-foreground)] hover:bg-black/5"
              }`}
            >
              Total T&amp;M + AMS
            </button>
            <button
              type="button"
              onClick={() => setMainTab("projetos")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                mainTab === "projetos"
                  ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow"
                  : "text-[color:var(--muted-foreground)] hover:bg-black/5"
              }`}
            >
              Por projetos
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border bg-[color:var(--surface)]" style={{ borderColor: "var(--border)" }}>
            <TmFilterSelect label="Mês" value={String(month)} onValueChange={(v) => setMonth(Number(v))} className="min-w-[140px]">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)))}
                </option>
              ))}
            </TmFilterSelect>
            <TmFilterSelect label="Ano" value={String(year)} onValueChange={(v) => setYear(Number(v))} className="min-w-[100px]">
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </TmFilterSelect>
            <TmFilterSelect
              label="Cliente"
              value={clientId}
              onValueChange={(v) => {
                setClientId(v);
                setProjectId("all");
              }}
              className="min-w-[200px] flex-1"
            >
              <option value="all">TODOS</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </TmFilterSelect>
            {mainTab === "projetos" && (
              <TmFilterSelect label="Projeto" value={projectId} onValueChange={setProjectId} className="min-w-[220px] flex-1">
                <option value="all">TODOS</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({tipoLabel(p.tipoProjeto)})
                  </option>
                ))}
              </TmFilterSelect>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-[color:var(--muted-foreground)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>A carregar…</span>
            </div>
          ) : mainTab === "total" && dataTotal ? (
            <TotalCardBlock
              data={dataTotal}
              isCurrentMonth={isCurrentMonth}
              onOpenChart={() => openChartTotal()}
              canEdit={canEdit}
              editing={editingTotal}
              draftMes={draftTenantMes}
              draftWeeks={draftTenantWeeks}
              onMonthPlannedChange={handleTenantMonthChange}
              onWeekPlannedChange={handleTenantWeekChange}
              onEdit={startEditTotal}
              onCancel={cancelTenantEdit}
              onSave={saveTenantEdit}
              saving={saving}
            />
          ) : mainTab === "projetos" && dataPor ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {dataPor.projects.length === 0 ? (
                <p className="col-span-full text-sm text-[color:var(--muted-foreground)]">Nenhum projeto T&amp;M ou AMS neste filtro.</p>
              ) : (
                dataPor.projects.map((row) => (
                  <ProjectTmCard
                    key={row.projectId}
                    row={row}
                    weeks={weeks}
                    isCurrentMonth={isCurrentMonth}
                    monthLabel={monthYearLabelPt(year, month)}
                    editing={editingId === row.projectId}
                    canEdit={canEdit}
                    draftMes={draftMes}
                    draftWeeks={draftWeeks}
                    onMonthPlannedChange={handleProjectMonthChange}
                    onWeekPlannedChange={handleProjectWeekChange}
                    onEdit={() => startEdit(row)}
                    onCancel={cancelEdit}
                    onSave={() => saveEdit(row.projectId)}
                    saving={saving}
                    onChart={() => openChartProject(row)}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      </main>

      {chart && (
        <ChartModal
          open
          onClose={() => setChart(null)}
          title={
            chart.kind === "total"
              ? `Total — ${monthYearLabelPt(year, month)}`
              : `${chart.name} — ${monthYearLabelPt(year, month)}`
          }
          rows={chart.rows}
        />
      )}
    </div>
  );
}

function TotalCardBlock({
  data,
  isCurrentMonth,
  onOpenChart,
  canEdit,
  editing,
  draftMes,
  draftWeeks,
  onMonthPlannedChange,
  onWeekPlannedChange,
  onEdit,
  onCancel,
  onSave,
  saving,
}: {
  data: ApiTotal;
  isCurrentMonth: boolean;
  onOpenChart: () => void;
  canEdit: boolean;
  editing: boolean;
  draftMes: string;
  draftWeeks: string[];
  onMonthPlannedChange: (v: string) => void;
  onWeekPlannedChange: (index: number, v: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}) {
  const t = data.totals;
  const monthLabel = monthYearLabelPt(data.year, data.month);
  const monthCap = parsePlannedIntInput(draftMes);
  const weeksSum = sumPlannedWeekStrings(draftWeeks);
  return (
    <div
      className="max-w-5xl mx-auto w-full rounded-3xl border-2 shadow-2xl overflow-hidden"
      style={{
        borderColor: "rgba(92, 0, 225, 0.28)",
        background: "linear-gradient(145deg, rgba(92, 0, 225, 0.1), var(--surface))",
      }}
    >
      <div
        className="px-6 py-5 md:px-8 md:py-6 border-b flex flex-wrap items-center justify-between gap-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p className="text-xs md:text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Agregado
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h2 className="text-xl md:text-2xl font-bold text-[color:var(--foreground)]">
              Total T&amp;M + AMS · {monthLabel}
            </h2>
            {isCurrentMonth && (
              <span className="wps-gestao-tm-mes-atual-badge text-[10px] md:text-xs px-2.5 py-1">
                Mês atual
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canEdit && (
            <button
              type="button"
              onClick={editing ? onCancel : onEdit}
              title={editing ? "Cancelar" : "Editar"}
              aria-label={editing ? "Cancelar edição" : "Editar plano agregado"}
              className="inline-flex items-center justify-center rounded-full border p-2.5 hover:opacity-90"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenChart}
            title="Visualizar gráfico"
            aria-label="Visualizar gráfico"
            className="inline-flex items-center justify-center rounded-full border p-2.5 hover:opacity-90 shadow-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <BarChart2 className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="p-6 md:p-8 grid grid-cols-3 gap-3 md:gap-4">
        <div className="rounded-2xl border p-3 md:p-4 min-w-0" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)]">Mês planejado</p>
          {editing ? (
            <input
              type="text"
              inputMode="numeric"
              value={draftMes}
              onChange={(e) => onMonthPlannedChange(e.target.value)}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xl md:text-2xl font-bold tabular-nums bg-[color:var(--background)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="Horas"
            />
          ) : (
            <p className="mt-1.5 text-2xl md:text-3xl font-bold tabular-nums tracking-tight" style={{ color: "var(--primary)" }}>
              {fmtPlannedHoras(t.mesPlanejadoSum)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border p-3 md:p-4 min-w-0" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)]">Mensal Executado</p>
          <p className="mt-1.5 text-2xl md:text-3xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
            {fmtHoras(t.mensalExecutadoSum)}
          </p>
        </div>
        <div className="rounded-2xl border p-3 md:p-4 min-w-0" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)]">%</p>
          <p className="mt-1.5 text-2xl md:text-3xl font-bold tabular-nums tracking-tight text-[color:var(--foreground)]">
            {fmtPctExecutadoVsPlanejado(
              t.mensalExecutadoSum,
              planejadoForPct(editing, draftMes, t.mesPlanejadoSum)
            )}
          </p>
        </div>
      </div>
      <div className="px-6 md:px-8 pb-6 md:pb-8 overflow-x-auto">
        <table className="w-full text-base border-collapse">
          <thead>
            <tr className="text-left text-sm text-[color:var(--muted-foreground)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-3 pr-4">Semana</th>
              <th className="py-3 pr-4">Planejado</th>
              <th className="py-3">Executado</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w, i) => (
              <tr key={w.index} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 pr-4 font-medium text-[color:var(--foreground)]">{w.label}</td>
                <td className="py-3 pr-4 tabular-nums">
                  {editing ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draftWeeks[i] ?? ""}
                      onChange={(e) => onWeekPlannedChange(i, e.target.value)}
                      className="w-28 rounded-lg border px-3 py-2 text-base tabular-nums bg-[color:var(--background)]"
                      style={{ borderColor: "var(--border)" }}
                    />
                  ) : (
                    <span className="text-lg font-semibold">{fmtPlannedHoras(t.weekPlanSum[i] ?? null)}</span>
                  )}
                </td>
                <td className="py-3 tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {fmtHoras(t.weekExecutadoSum[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && monthCap != null && (
          <p
            className={`mt-2 text-xs ${weeksSum > monthCap ? "text-red-600" : "text-[color:var(--muted-foreground)]"}`}
          >
            Soma semanal: {weeksSum} / {monthCap} h
          </p>
        )}
      </div>
      {editing && canEdit && (
        <div
          className="px-6 md:px-8 py-5 flex justify-end gap-3 border-t bg-[color:var(--surface)]/50"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border px-5 py-2.5 text-sm font-medium"
            style={{ borderColor: "var(--border)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || (monthCap != null && weeksSum > monthCap)}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-6 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50 shadow-md"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectTmCard({
  row,
  weeks,
  monthLabel,
  isCurrentMonth,
  editing,
  canEdit,
  draftMes,
  draftWeeks,
  onMonthPlannedChange,
  onWeekPlannedChange,
  onEdit,
  onCancel,
  onSave,
  saving,
  onChart,
}: {
  row: ProjectRow;
  weeks: WeekMeta[];
  monthLabel: string;
  isCurrentMonth: boolean;
  editing: boolean;
  canEdit: boolean;
  draftMes: string;
  draftWeeks: string[];
  onMonthPlannedChange: (v: string) => void;
  onWeekPlannedChange: (index: number, v: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  onChart: () => void;
}) {
  const monthCap = parsePlannedIntInput(draftMes);
  const weeksSum = sumPlannedWeekStrings(draftWeeks);
  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden min-w-0 flex flex-col"
      style={{
        borderColor: "rgba(92, 0, 225, 0.2)",
        background: "linear-gradient(160deg, rgba(92, 0, 225, 0.06), var(--surface))",
      }}
    >
      <div className="px-3 py-3 flex flex-wrap items-start justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[color:var(--foreground)] truncate">{row.client?.name ?? "—"}</span>
            <span
              className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md border shrink-0"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
            >
              {tipoLabel(row.tipoProjeto)}
            </span>
            {isCurrentMonth && (
              <span className="wps-gestao-tm-mes-atual-badge text-[10px] px-2 py-0.5 shrink-0">
                Mês atual
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-[color:var(--foreground)] mt-1 truncate">{row.name}</p>
          <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5 capitalize truncate">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={editing ? onCancel : onEdit}
              title={editing ? "Cancelar" : "Editar"}
              aria-label={editing ? "Cancelar edição" : "Editar planeamento deste projeto"}
              className="inline-flex items-center justify-center rounded-full border p-2 hover:opacity-90"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onChart}
            title="Visualizar gráfico"
            aria-label="Visualizar gráfico"
            className="inline-flex items-center justify-center rounded-full border p-2 hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border p-2 min-w-0" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] leading-tight text-[color:var(--muted-foreground)]">Mês planejado</p>
          {editing ? (
            <input
              type="text"
              inputMode="numeric"
              value={draftMes}
              onChange={(e) => onMonthPlannedChange(e.target.value)}
              className="mt-1 w-full rounded-md border px-1.5 py-1 text-sm font-semibold tabular-nums bg-[color:var(--background)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="h"
            />
          ) : (
            <p className="mt-0.5 text-base font-bold tabular-nums leading-tight" style={{ color: "var(--primary)" }}>
              {row.mesPlanejado != null ? fmtPlannedHoras(row.mesPlanejado) : "—"}
            </p>
          )}
        </div>
        <div className="rounded-lg border p-2 min-w-0" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] leading-tight text-[color:var(--muted-foreground)]">Mensal executado</p>
          <p className="mt-0.5 text-base font-bold tabular-nums leading-tight text-emerald-600 dark:text-emerald-400">
            {fmtHoras(row.mensalExecutado)}
          </p>
        </div>
        <div className="rounded-lg border p-2 min-w-0" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] leading-tight text-[color:var(--muted-foreground)]">%</p>
          <p className="mt-0.5 text-base font-bold tabular-nums leading-tight text-[color:var(--foreground)]">
            {fmtPctExecutadoVsPlanejado(
              row.mensalExecutado,
              planejadoForPct(editing, draftMes, row.mesPlanejado)
            )}
          </p>
        </div>
      </div>

      <div className="px-3 pb-3 overflow-x-auto flex-1 min-h-0">
        <table className="w-full text-xs border-collapse min-w-[260px]">
          <thead>
            <tr className="text-left text-[10px] text-[color:var(--muted-foreground)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-1.5 pr-2">Semana</th>
              <th className="py-1.5 pr-2">Plan</th>
              <th className="py-1.5">Exec</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.index} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-2 font-medium max-w-[100px] truncate">{w.label}</td>
                <td className="py-1.5 pr-2">
                  {editing ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draftWeeks[i] ?? ""}
                      onChange={(e) => onWeekPlannedChange(i, e.target.value)}
                      className="w-16 rounded border px-1.5 py-0.5 tabular-nums bg-[color:var(--background)] text-xs"
                      style={{ borderColor: "var(--border)" }}
                    />
                  ) : (
                    <span className="tabular-nums">
                      {row.weekPlanHoras[i] != null ? fmtPlannedHoras(Number(row.weekPlanHoras[i])) : "—"}
                    </span>
                  )}
                </td>
                <td className="py-1.5 tabular-nums text-emerald-600 dark:text-emerald-400">{fmtHoras(row.weekExecutado[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && monthCap != null && (
          <p
            className={`mt-1.5 text-[10px] ${weeksSum > monthCap ? "text-red-600" : "text-[color:var(--muted-foreground)]"}`}
          >
            Soma semanal: {weeksSum} / {monthCap} h
          </p>
        )}
      </div>

      {editing && canEdit && (
        <div className="px-3 pb-3 flex justify-end gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || (monthCap != null && weeksSum > monthCap)}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}
