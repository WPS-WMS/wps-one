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
import {
  defaultReportEnd,
  defaultReportStart,
  FinancialKpiCard,
  FinancialReportPeriodFilter,
} from "@/components/finance/FinancialReportShared";

type Summary = {
  formatted?: Record<string, string>;
  inadimplenciaCount?: number;
  comparativoMesAnterior?: { resultadoCents: number };
  notas?: string[];
};

export function FinanceDashboardPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroDashboard"), [can]);
  const [start, setStart] = useState(defaultReportStart);
  const [end, setEnd] = useState(defaultReportEnd);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ start, end });
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
  }, [permissionsReady, canAccess, start, end]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  const f = data?.formatted ?? {};

  return (
    <ReportsPageShell
      title="Dashboard financeiro executivo"
      subtitle="Indicadores gerenciais consolidados do período."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <FinancialReportPeriodFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <FinancialKpiCard label="Receita mensal" value={f.receitaMensal ?? "—"} tone="positive" />
              <FinancialKpiCard label="Despesa mensal" value={f.despesaMensal ?? "—"} tone="negative" />
              <FinancialKpiCard label="Resultado líquido" value={f.resultadoLiquido ?? "—"} />
              <FinancialKpiCard label="EBITDA estimado" value={f.ebitdaEstimado ?? "—"} />
              <FinancialKpiCard label="Receita recorrente" value={f.receitaRecorrente ?? "—"} />
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
