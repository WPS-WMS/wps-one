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
  FinancialReportPeriodFilter,
} from "@/components/finance/FinancialReportShared";

type DreLine = { label: string; signedFormatted: string; highlight?: boolean };

export function FinanceDrePageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroDre"), [can]);
  const [start, setStart] = useState(defaultReportStart);
  const [end, setEnd] = useState(defaultReportEnd);
  const [lines, setLines] = useState<DreLine[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/finance/dre?${params}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        setLines(Array.isArray(body?.lines) ? body.lines : []);
        setNotas(Array.isArray(body?.notas) ? body.notas : []);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLines([]);
        setNotas([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, start, end]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  return (
    <ReportsPageShell title="DRE gerencial" subtitle="Demonstrativo de resultado consolidado.">
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <FinancialReportPeriodFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <ReportsCard>
            {lines.length === 0 ? (
              <ReportsEmpty>Sem dados no período.</ReportsEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {lines.map((line) => (
                      <tr
                        key={line.label}
                        className={`border-b border-[color:var(--border)] last:border-0 ${line.highlight ? "bg-black/5 font-semibold" : ""}`}
                      >
                        <td className="px-4 py-3">{line.label}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{line.signedFormatted}</td>
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
