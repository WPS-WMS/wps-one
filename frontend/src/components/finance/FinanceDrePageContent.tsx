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
      eyebrow="Financeiro"
      title="DRE"
      subtitle="Resultado consolidado da empresa: faturamento, outras receitas, custos (imposto, custo e reembolsos) e lucro mensal."
      chip="Resultado"
      wide
    >
      <div className="space-y-4">
        <ReportsCard tone="filter">
          <div className="p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                Ano
              </label>
              <PopoverSelect
                id="dre-filter-year"
                value={String(year)}
                onChange={(v) => setYear(Number(v))}
                checklist={false}
                options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
              />
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
              <div className="w-full overflow-hidden p-2 sm:p-3">
                <table className="w-full table-fixed border-collapse text-[10px] leading-tight sm:text-[11px]">
                  <colgroup>
                    <col className="w-[6.75rem] sm:w-[7.5rem]" />
                    {months.map((m) => (
                      <col key={m.key} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-[color:var(--border)] bg-[color:var(--background)]/60">
                      <th className="px-1 py-2 text-left font-semibold leading-snug text-[color:var(--foreground)]">
                        Categoria financeira
                      </th>
                      {months.map((m) => (
                        <th
                          key={m.key}
                          className="px-0.5 py-2 text-right font-semibold whitespace-nowrap text-[color:var(--foreground)]"
                          title={m.label}
                        >
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
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
                            className={`px-1 py-2 ${
                              row.bold ? "font-semibold" : "font-medium"
                            }`}
                            title={row.label}
                          >
                            {row.label}
                          </td>
                          {row.valuesFormatted.map((value, i) => (
                            <td
                              key={`${row.key}-${months[i]?.key ?? i}`}
                              className={`px-0.5 py-2 text-right tabular-nums tracking-tight whitespace-nowrap ${toneClass(
                                row.tone,
                                row.bold,
                              )}`}
                              title={value}
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
