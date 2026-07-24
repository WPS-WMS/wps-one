"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
} from "@/components/reports/ReportsPrimitives";
import { FinancialKpiCard } from "@/components/finance/FinancialReportShared";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

type Summary = {
  formatted?: Record<string, string>;
  inadimplenciaCount?: number;
  notas?: string[];
};

type PeriodMode = "ano" | "mes" | "trimestre" | "semestre";

const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

const QUARTER_OPTIONS = [
  { value: "1", label: "1º trimestre (jan–mar)" },
  { value: "2", label: "2º trimestre (abr–jun)" },
  { value: "3", label: "3º trimestre (jul–set)" },
  { value: "4", label: "4º trimestre (out–dez)" },
] as const;

const SEMESTER_OPTIONS = [
  { value: "1", label: "1º semestre (jan–jun)" },
  { value: "2", label: "2º semestre (jul–dez)" },
] as const;

const MODE_OPTIONS = [
  { value: "ano", label: "Ano" },
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "semestre", label: "Semestre" },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function isoDate(year: number, month1to12: number, day: number): string {
  return `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

function resolvePeriodBounds(params: {
  year: number;
  mode: PeriodMode;
  month: number;
  quarter: number;
  semester: number;
}): { start: string; end: string; label: string } {
  const { year, mode, month, quarter, semester } = params;

  if (mode === "mes") {
    const endDay = lastDayOfMonth(year, month);
    const monthLabel = MONTH_OPTIONS.find((m) => m.value === String(month))?.label ?? `Mês ${month}`;
    return {
      start: isoDate(year, month, 1),
      end: isoDate(year, month, endDay),
      label: `${monthLabel} de ${year}`,
    };
  }

  if (mode === "trimestre") {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = lastDayOfMonth(year, endMonth);
    const qLabel = QUARTER_OPTIONS.find((q) => q.value === String(quarter))?.label ?? `${quarter}º trimestre`;
    return {
      start: isoDate(year, startMonth, 1),
      end: isoDate(year, endMonth, endDay),
      label: `${qLabel} de ${year}`,
    };
  }

  if (mode === "semestre") {
    const startMonth = semester === 1 ? 1 : 7;
    const endMonth = semester === 1 ? 6 : 12;
    const endDay = lastDayOfMonth(year, endMonth);
    const sLabel = SEMESTER_OPTIONS.find((s) => s.value === String(semester))?.label ?? `${semester}º semestre`;
    return {
      start: isoDate(year, startMonth, 1),
      end: isoDate(year, endMonth, endDay),
      label: `${sLabel} de ${year}`,
    };
  }

  return {
    start: isoDate(year, 1, 1),
    end: isoDate(year, 12, 31),
    label: `Ano ${year}`,
  };
}

function currentPeriodDefaults() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    mode: "mes" as PeriodMode,
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
    semester: now.getMonth() < 6 ? 1 : 2,
  };
}

export function FinanceDashboardPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroDashboard"), [can]);
  const defaults = useMemo(() => currentPeriodDefaults(), []);

  const [year, setYear] = useState(String(defaults.year));
  const [mode, setMode] = useState<PeriodMode>(defaults.mode);
  const [month, setMonth] = useState(String(defaults.month));
  const [quarter, setQuarter] = useState(String(defaults.quarter));
  const [semester, setSemester] = useState(String(defaults.semester));

  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => {
      const y = current - 5 + i;
      return { value: String(y), label: String(y) };
    }).reverse();
  }, []);

  const period = useMemo(
    () =>
      resolvePeriodBounds({
        year: Number(year) || defaults.year,
        mode,
        month: Number(month) || defaults.month,
        quarter: Number(quarter) || defaults.quarter,
        semester: Number(semester) || defaults.semester,
      }),
    [year, mode, month, quarter, semester, defaults],
  );

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ start: period.start, end: period.end });
    apiFetch(`/api/reports/finance/executive-summary?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!controller.signal.aborted) setData(body);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, period.start, period.end]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  const f = data?.formatted ?? {};

  return (
    <ReportsPageShell
      eyebrow="Financeiro"
      title="Dashboard financeiro executivo"
      subtitle="Indicadores gerenciais consolidados do período."
    >
      <div className="space-y-4">
        <ReportsCard tone="filter">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                  Ano
                </label>
                <PopoverSelect
                  id="dashboard-filter-year"
                  value={year}
                  onChange={setYear}
                  placeholder="Ano"
                  checklist={false}
                  options={yearOptions}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                  Período
                </label>
                <PopoverSelect
                  id="dashboard-filter-mode"
                  value={mode}
                  onChange={(v) => setMode(v as PeriodMode)}
                  placeholder="Período"
                  checklist={false}
                  options={[...MODE_OPTIONS]}
                />
              </div>
              {mode === "mes" && (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                    Mês
                  </label>
                  <PopoverSelect
                    id="dashboard-filter-month"
                    value={month}
                    onChange={setMonth}
                    placeholder="Mês"
                    checklist={false}
                    options={[...MONTH_OPTIONS]}
                  />
                </div>
              )}
              {mode === "trimestre" && (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                    Trimestre
                  </label>
                  <PopoverSelect
                    id="dashboard-filter-quarter"
                    value={quarter}
                    onChange={setQuarter}
                    placeholder="Trimestre"
                    checklist={false}
                    options={[...QUARTER_OPTIONS]}
                  />
                </div>
              )}
              {mode === "semestre" && (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                    Semestre
                  </label>
                  <PopoverSelect
                    id="dashboard-filter-semester"
                    value={semester}
                    onChange={setSemester}
                    placeholder="Semestre"
                    checklist={false}
                    options={[...SEMESTER_OPTIONS]}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Exibindo: <span className="font-medium text-[color:var(--foreground)]">{period.label}</span>
              <span className="mx-1.5">·</span>
              {period.start.split("-").reverse().join("/")} até {period.end.split("-").reverse().join("/")}
            </p>
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FinancialKpiCard label="Receita bruta" value={f.receitaBruta ?? "—"} tone="positive" />
              <FinancialKpiCard label="Impostos" value={f.impostos ?? "—"} tone="negative" />
              <FinancialKpiCard label="Custo operacional" value={f.custoOperacional ?? "—"} tone="negative" />
              <FinancialKpiCard label="Receita líquida" value={f.receitaLiquida ?? "—"} />
              <FinancialKpiCard label="EBITDA R$" value={f.ebitda ?? "—"} />
              <FinancialKpiCard label="EBITDA %" value={f.ebitdaPercent ?? "—"} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FinancialKpiCard
                label="Inadimplência"
                value={f.inadimplencia ?? "—"}
                hint={data?.inadimplenciaCount != null ? `${data.inadimplenciaCount} parcela(s)` : undefined}
                tone="warning"
              />
              <FinancialKpiCard label="Fluxo previsto (90d)" value={f.fluxoPrevisto ?? "—"} />
            </div>
            {data?.notas?.length ? (
              <ReportsCard>
                <div className="p-4 text-xs text-[color:var(--muted-foreground)] space-y-1">
                  {data.notas.map((n) => (
                    <p key={n}>• {n}</p>
                  ))}
                </div>
              </ReportsCard>
            ) : null}
          </>
        )}
      </div>
    </ReportsPageShell>
  );
}
