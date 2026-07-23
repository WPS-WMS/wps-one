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
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  defaultReportEnd,
  defaultReportStart,
  FinancialReportPeriodFilter,
  formatReportCents,
} from "@/components/finance/FinancialReportShared";

type CashFlowRow = {
  label: string;
  realizadoReceitaCents: number;
  realizadoDespesaCents: number;
  previstoReceitaCents: number;
  previstoDespesaCents: number;
  acumuladoRealizadoCents: number;
  acumuladoPrevistoCents: number;
};

export function FinanceCashFlowPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroFluxoCaixa"), [can]);
  const [start, setStart] = useState(defaultReportStart);
  const [end, setEnd] = useState(defaultReportEnd);
  const [granularity, setGranularity] = useState<"DAY" | "WEEK" | "MONTH">("MONTH");
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ start, end, granularity });
    apiFetch(`/api/reports/finance/cash-flow?${params}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        setRows(Array.isArray(body?.rows) ? body.rows : []);
        setNotas(Array.isArray(body?.notas) ? body.notas : []);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRows([]);
        setNotas([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, start, end, granularity]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  return (
    <ReportsPageShell
      title="Fluxo de caixa"
      subtitle="Realizado: CR/CP marcados como pagos. Previsto: títulos ainda em aberto. Acumulados = receita − despesa de cada coluna."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <FinancialReportPeriodFilter
              start={start}
              end={end}
              onStartChange={setStart}
              onEndChange={setEnd}
              extra={
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                    Visão
                  </label>
                  <PopoverSelect
                    id="cash-flow-granularity"
                    value={granularity}
                    onChange={(v) => setGranularity(v as "DAY" | "WEEK" | "MONTH")}
                    options={[
                      { value: "DAY", label: "Diário" },
                      { value: "WEEK", label: "Semanal" },
                      { value: "MONTH", label: "Mensal" },
                    ]}
                  />
                </div>
              }
            />
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <ReportsCard>
            {rows.length === 0 ? (
              <ReportsEmpty>Sem movimentação no período.</ReportsEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Período</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Rec. realizado</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Desp. realizado</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Rec. previsto</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Desp. previsto</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Acum. realizado</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Acum. previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-b border-[color:var(--border)] last:border-0">
                        <td className="px-4 py-3 font-medium">{r.label}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                          {formatReportCents(r.realizadoReceitaCents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">
                          {formatReportCents(r.realizadoDespesaCents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatReportCents(r.previstoReceitaCents)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatReportCents(r.previstoDespesaCents)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatReportCents(r.acumuladoRealizadoCents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatReportCents(r.acumuladoPrevistoCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportsCard>
        )}

        {notas.length > 0 && (
          <ReportsCard>
            <div className="p-4 text-xs text-[color:var(--muted-foreground)] space-y-1">
              {notas.map((n) => (
                <p key={n}>• {n}</p>
              ))}
            </div>
          </ReportsCard>
        )}
      </div>
    </ReportsPageShell>
  );
}
