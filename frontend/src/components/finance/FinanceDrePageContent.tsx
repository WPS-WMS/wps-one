"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
} from "@/components/reports/ReportsPrimitives";

type DreTone = "revenue" | "expense" | "total" | "result";

type DreMonth = { key: string; label: string };

type DreRow = {
  key: string;
  label: string;
  tone: DreTone;
  bold?: boolean;
  valuesFormatted: string[];
};

function currentYear(): number {
  return new Date().getFullYear();
}

function yearBounds(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function toneClass(tone: DreTone, bold?: boolean): string {
  if (tone === "revenue") return "text-emerald-600 font-medium";
  if (tone === "result") return bold ? "font-semibold" : "";
  if (tone === "total") return bold ? "font-semibold" : "";
  return "";
}

export function FinanceDrePageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroDre"), [can]);
  const [year, setYear] = useState(currentYear);
  const [months, setMonths] = useState<DreMonth[]>([]);
  const [rows, setRows] = useState<DreRow[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const { start, end } = yearBounds(year);
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/finance/dre?${params}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        setMonths(Array.isArray(body?.months) ? body.months : []);
        setRows(Array.isArray(body?.rows) ? body.rows : []);
        setNotas(Array.isArray(body?.notas) ? body.notas : []);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMonths([]);
        setRows([]);
        setNotas([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, year]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear() - 3 + i);

  return (
    <ReportsPageShell
      title="DRE — Demonstração de resultado"
      subtitle="Resultado consolidado da empresa (faturamento, despesas e reembolsos), sem recorte por cliente."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                Ano
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={reportsInputClass}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <ReportsCard>
            {rows.length === 0 || months.length === 0 ? (
              <ReportsEmpty>Sem dados no período.</ReportsEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[960px]">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] bg-[color:var(--background)]/60">
                      <th className="sticky left-0 z-10 bg-[color:var(--surface)] px-3 py-2.5 text-left font-semibold text-[color:var(--foreground)] min-w-[11rem]">
                        &nbsp;
                      </th>
                      {months.map((m) => (
                        <th
                          key={m.key}
                          className="px-3 py-2.5 text-right font-semibold text-[color:var(--foreground)] whitespace-nowrap"
                        >
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => {
                      const isSeparatorAfter = row.key === "outrasReceitas";
                      const isResultBlock = row.key === "custoTotal" || row.key === "lucroMensal";
                      return (
                        <tr
                          key={row.key}
                          className={`border-b border-[color:var(--border)] ${
                            isResultBlock ? "bg-black/[0.03]" : ""
                          } ${isSeparatorAfter ? "border-b-2" : ""}`}
                        >
                          <td
                            className={`sticky left-0 z-10 bg-[color:var(--surface)] px-3 py-2.5 whitespace-nowrap ${
                              row.bold ? "font-semibold" : "font-medium"
                            } ${rowIdx >= 10 ? "bg-[color:var(--surface)]" : ""}`}
                          >
                            {row.label}
                          </td>
                          {row.valuesFormatted.map((value, i) => (
                            <td
                              key={`${row.key}-${months[i]?.key ?? i}`}
                              className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${toneClass(
                                row.tone,
                                row.bold,
                              )}`}
                            >
                              {value}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
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
