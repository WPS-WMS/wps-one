"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart2, ChevronDown, Pencil, X, Save, Loader2 } from "lucide-react";

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

function tipoLabel(t: string | null | undefined): string {
  if (t === "AMS") return "AMS";
  if (t === "TIME_MATERIAL") return "T&M";
  return t ?? "—";
}

function monthYearLabelPt(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

type TmFilterMenuOption = { value: string; label: string };

/** Lista estilizada (portal + botões), alinhada ao padrão do Dashboard Daily — evita o menu nativo do `<select>`. */
function TmFilterMenu({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: TmFilterMenuOption[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const menuElementId = useRef(`tm-gestao-filter-${Math.random().toString(36).slice(2, 11)}`).current;

  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? value, [options, value]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuRect({ left: r.left, top: r.bottom + 6, width: r.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const anchor = anchorRef.current;
      const menu = document.getElementById(menuElementId);
      const inside = (anchor && target && anchor.contains(target)) || (menu && target && menu.contains(target));
      if (!inside) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, menuElementId]);

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          ref={anchorRef}
          onClick={() => setOpen((v) => !v)}
          className="w-full min-h-[40px] px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 flex items-center gap-2 text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate flex-1 min-w-0">{selectedLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[color:var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {typeof document !== "undefined" &&
          open &&
          menuRect &&
          createPortal(
            <div
              id={menuElementId}
              role="listbox"
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl overflow-hidden"
              style={{
                position: "fixed",
                left: menuRect.left,
                top: menuRect.top,
                width: Math.max(menuRect.width, 200),
                zIndex: 80,
                maxHeight: "min(320px, calc(100vh - 24px))",
              }}
            >
              <div className="max-h-[280px] overflow-y-auto overflow-x-hidden py-1">
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm text-[color:var(--foreground)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] ${
                        active ? "bg-black/[0.08] dark:bg-white/[0.12] font-semibold" : ""
                      }`}
                    >
                      <span className="truncate block">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )}
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
  const [mainTab, setMainTab] = useState<"total" | "projetos">("projetos");
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
      if (mainTab === "projetos" && clientId !== "all") q.set("clientId", clientId);
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

  const monthMenuOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          value: String(m),
          label: new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1))),
        };
      }),
    [],
  );

  const yearMenuOptions = useMemo(() => yearOptions.map((y) => ({ value: String(y), label: String(y) })), [yearOptions]);

  const clientMenuOptions = useMemo(
    () => [{ value: "all", label: "TODOS" }, ...clientOptions.map((c) => ({ value: c.id, label: c.name }))],
    [clientOptions],
  );

  const projectMenuOptions = useMemo(
    () => [
      { value: "all", label: "TODOS" },
      ...projectOptions.map((p) => ({ value: p.id, label: `${p.name} (${tipoLabel(p.tipoProjeto)})` })),
    ],
    [projectOptions],
  );

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

  async function saveTenantEdit() {
    if (!dataTotal?.weeks.length) return;
    setSaving(true);
    setError(null);
    try {
      const weekPlanHoras = draftTenantWeeks.map((s) => {
        const t = s.trim();
        if (!t) return null;
        const n = Number(t.replace(",", "."));
        return Number.isFinite(n) ? n : null;
      });
      if (weekPlanHoras.length !== dataTotal.weeks.length) {
        setError("Inconsistência no número de semanas.");
        return;
      }
      let mesBody: number | null = null;
      const mesTrim = draftTenantMes.trim();
      if (mesTrim) {
        const n = Number(mesTrim.replace(",", "."));
        mesBody = Number.isFinite(n) ? n : null;
      } else mesBody = null;

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
      if (!res.ok) throw new Error((j as { error?: string })?.error ?? "Erro ao guardar");
      cancelTenantEdit();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao guardar");
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
      const weekPlanHoras = draftWeeks.map((s) => {
        const t = s.trim();
        if (!t) return null;
        const n = Number(t.replace(",", "."));
        return Number.isFinite(n) ? n : null;
      });
      if (weekPlanHoras.length !== weeks.length) {
        setError("Inconsistência no número de semanas.");
        return;
      }
      let mesBody: number | null = null;
      const mesTrim = draftMes.trim();
      if (mesTrim) {
        const n = Number(mesTrim.replace(",", "."));
        mesBody = Number.isFinite(n) ? n : null;
      } else mesBody = null;

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
      if (!res.ok) throw new Error((j as { error?: string })?.error ?? "Erro ao guardar");
      cancelEdit();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao guardar");
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
          Na aba <strong>Por projetos</strong>, o <strong>mês planejado</strong> é por projeto e não altera o total do tenant.
          Pode filtrar por <strong>cliente</strong> e <strong>projeto</strong>. Na aba <strong>Total</strong>, o{" "}
          <strong>mês planejado</strong> é só do cartão agregado (editável aí) e as <strong>horas executadas (mês)</strong>{" "}
          somam todos os projetos T&amp;M e AMS visíveis (filtros: mês e ano).
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
            <TmFilterMenu
              label="Mês"
              value={String(month)}
              options={monthMenuOptions}
              onChange={(v) => setMonth(Number(v))}
              className="min-w-[140px]"
            />
            <TmFilterMenu label="Ano" value={String(year)} options={yearMenuOptions} onChange={(v) => setYear(Number(v))} className="min-w-[100px]" />
            {mainTab === "projetos" && (
              <TmFilterMenu
                label="Cliente"
                value={clientId}
                options={clientMenuOptions}
                onChange={(v) => {
                  setClientId(v);
                  setProjectId("all");
                }}
                className="min-w-[200px] flex-1"
              />
            )}
            {mainTab === "projetos" && (
              <TmFilterMenu label="Projeto" value={projectId} options={projectMenuOptions} onChange={setProjectId} className="min-w-[220px] flex-1" />
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
              onDraftMes={setDraftTenantMes}
              onDraftWeeks={setDraftTenantWeeks}
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
                    onDraftMes={setDraftMes}
                    onDraftWeeks={setDraftWeeks}
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
  onDraftMes,
  onDraftWeeks,
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
  onDraftMes: (v: string) => void;
  onDraftWeeks: (v: string[]) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}) {
  const t = data.totals;
  const monthLabel = monthYearLabelPt(data.year, data.month);
  return (
    <div
      className="max-w-3xl mx-auto w-full rounded-xl border shadow-sm overflow-hidden"
      style={{
        borderColor: "rgba(92, 0, 225, 0.2)",
        background: "linear-gradient(145deg, rgba(92, 0, 225, 0.06), var(--surface))",
      }}
    >
      <div
        className="px-4 py-3 md:px-5 md:py-3.5 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <p className="text-[10px] md:text-xs font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Agregado (tenant)
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <h2 className="text-base md:text-lg font-bold text-[color:var(--foreground)] truncate">
              Total T&amp;M + AMS · {monthLabel}
            </h2>
            {isCurrentMonth && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[color:var(--foreground)] shrink-0">
                Mês atual
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={editing ? onCancel : onEdit}
              title={editing ? "Cancelar" : "Editar"}
              aria-label={editing ? "Cancelar edição" : "Editar plano do tenant"}
              className="inline-flex items-center justify-center rounded-full border p-2 hover:opacity-90"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenChart}
            title="Visualizar gráfico"
            aria-label="Visualizar gráfico"
            className="inline-flex items-center justify-center rounded-full border p-2 hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3 md:p-4 grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
          <p className="text-xs text-[color:var(--muted-foreground)] leading-snug">Mês planejado (total do tenant)</p>
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draftMes}
              onChange={(e) => onDraftMes(e.target.value)}
              className="mt-2 w-full rounded-lg border px-3 py-2 text-xl font-bold tabular-nums bg-[color:var(--background)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="Horas"
            />
          ) : (
            <p className="mt-1.5 text-2xl md:text-3xl font-bold tabular-nums tracking-tight leading-none" style={{ color: "var(--primary)" }}>
              {fmtHoras(t.mesPlanejadoSum)}
            </p>
          )}
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
          <p className="text-xs text-[color:var(--muted-foreground)] leading-snug">Horas executadas (mês) — soma dos projetos</p>
          <p className="mt-1.5 text-2xl md:text-3xl font-bold tabular-nums tracking-tight leading-none text-emerald-600 dark:text-emerald-400">
            {fmtHoras(t.mensalExecutadoSum)}
          </p>
        </div>
      </div>
      <div className="px-3 md:px-4 pb-3 md:pb-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[color:var(--muted-foreground)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pr-3">Semana</th>
              <th className="py-2 pr-3">Plan (total)</th>
              <th className="py-2">Exec (soma)</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w, i) => (
              <tr key={w.index} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3 font-medium text-[color:var(--foreground)]">{w.label}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {editing ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draftWeeks[i] ?? ""}
                      onChange={(e) => {
                        const next = [...draftWeeks];
                        next[i] = e.target.value;
                        onDraftWeeks(next);
                      }}
                      className="w-24 rounded-md border px-2 py-1 text-sm tabular-nums bg-[color:var(--background)]"
                      style={{ borderColor: "var(--border)" }}
                    />
                  ) : (
                    <span className="text-sm font-semibold">{fmtHoras(t.weekPlanSum[i] ?? null)}</span>
                  )}
                </td>
                <td className="py-2 tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {fmtHoras(t.weekExecutadoSum[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && canEdit && (
        <div
          className="px-3 md:px-4 py-3 flex justify-end gap-2 border-t bg-[color:var(--surface)]/50"
          style={{ borderColor: "var(--border)" }}
        >
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
            disabled={saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
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
  onDraftMes,
  onDraftWeeks,
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
  onDraftMes: (v: string) => void;
  onDraftWeeks: (v: string[]) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  onChart: () => void;
}) {
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
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[color:var(--foreground)] shrink-0">
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

      <div className="p-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] leading-tight text-[color:var(--muted-foreground)]">Mês planejado</p>
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draftMes}
              onChange={(e) => onDraftMes(e.target.value)}
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-base font-semibold tabular-nums bg-[color:var(--background)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="h"
            />
          ) : (
            <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--primary)" }}>
              {row.mesPlanejado != null ? fmtHoras(row.mesPlanejado) : "—"}
            </p>
          )}
        </div>
        <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] leading-tight text-[color:var(--muted-foreground)]">Mensal executado</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight text-emerald-600 dark:text-emerald-400">{fmtHoras(row.mensalExecutado)}</p>
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
                      inputMode="decimal"
                      value={draftWeeks[i] ?? ""}
                      onChange={(e) => {
                        const next = [...draftWeeks];
                        next[i] = e.target.value;
                        onDraftWeeks(next);
                      }}
                      className="w-16 rounded border px-1.5 py-0.5 tabular-nums bg-[color:var(--background)] text-xs"
                      style={{ borderColor: "var(--border)" }}
                    />
                  ) : (
                    <span className="tabular-nums">{row.weekPlanHoras[i] != null ? fmtHoras(Number(row.weekPlanHoras[i])) : "—"}</span>
                  )}
                </td>
                <td className="py-1.5 tabular-nums text-emerald-600 dark:text-emerald-400">{fmtHoras(row.weekExecutado[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            disabled={saving}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}
