"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  defaultReportEnd,
  defaultReportStart,
  FinancialReportPeriodFilter,
} from "@/components/finance/FinancialReportShared";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
} from "@/components/reports/ReportsPrimitives";

type HoursVsRevenueRow = {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  horasPrevistas: number | null;
  horasRealizadas: number;
  receitaPrevista: number;
  receitaConsumidaPercentual: number | null;
  custoOperacional: number | null;
  despesaOperacional: number;
  despesasProjeto: number;
  impostos: number;
  margemReais: number;
  margemPercentual: number | null;
};

function formatHoras(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function HoursVsRevenueReportPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(
    () => canFinanceFeature(can, "relatorios.financeiroMedicaoHoras"),
    [can],
  );
  const [rows, setRows] = useState<HoursVsRevenueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(defaultReportStart);
  const [end, setEnd] = useState(defaultReportEnd);
  const [clientQ, setClientQ] = useState("");
  const [projectQ, setProjectQ] = useState("");

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/finance/hours-vs-revenue?${params}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(
            typeof body?.error === "string" ? body.error : "Erro ao carregar relatório.",
          );
        }
        if (!controller.signal.aborted) {
          setRows(Array.isArray(body?.projects) ? body.projects : []);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Erro ao carregar relatório.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, start, end]);

  const filtered = useMemo(() => {
    const cq = clientQ.trim().toLowerCase();
    const pq = projectQ.trim().toLowerCase();
    return rows.filter((row) => {
      if (cq && !row.clientName.toLowerCase().includes(cq)) return false;
      if (pq && !row.projectName.toLowerCase().includes(pq)) return false;
      return true;
    });
  }, [rows, clientQ, projectQ]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  return (
    <ReportsPageShell
      title="Medição de horas vs receita"
      subtitle="Compara esforço realizado com a receita: custo operacional (apontamentos), despesa operacional (reembolsável) e despesas de projeto (não reembolsáveis)."
      wide
    >
      <ReportsCard className="space-y-4">
        <div className="space-y-3 p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <FinancialReportPeriodFilter
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Cliente</label>
              <input
                type="search"
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                value={clientQ}
                onChange={(e) => setClientQ(e.target.value)}
                placeholder="Filtrar cliente..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Projeto</label>
              <input
                type="search"
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                value={projectQ}
                onChange={(e) => setProjectQ(e.target.value)}
                placeholder="Filtrar projeto..."
              />
            </div>
          </div>
        </div>

        {error && <p className="px-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-[color:var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <ReportsEmpty>Nenhum projeto encontrado.</ReportsEmpty>
        ) : (
          <div className="p-2 sm:p-3">
            <table className="w-full table-fixed text-[11px] sm:text-xs">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-[color:var(--muted-foreground)]">Projeto</th>
                  <th className="px-2 py-2 text-left font-medium text-[color:var(--muted-foreground)]">Cliente</th>
                  <th className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]">
                    Horas prev.
                  </th>
                  <th className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]">
                    Horas real.
                  </th>
                  <th className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]">
                    Receita prev.
                  </th>
                  <th
                    className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]"
                    title="(Custo operacional + Despesa operacional + Despesas de projeto) ÷ Receita prevista"
                  >
                    Receita cons.
                  </th>
                  <th
                    className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]"
                    title="Apontamentos de horas × taxa hora"
                  >
                    Custo oper.
                  </th>
                  <th
                    className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]"
                    title="Despesas reembolsáveis pelo cliente (reembolsos pagos)"
                  >
                    Desp. oper.
                  </th>
                  <th
                    className="px-1.5 py-2 text-right font-medium text-[color:var(--muted-foreground)]"
                    title="Despesas do projeto que não serão reembolsadas"
                  >
                    Desp. projeto
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-[color:var(--muted-foreground)]">Margem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const margemTone =
                    row.margemReais > 0
                      ? "text-emerald-600"
                      : row.margemReais < 0
                        ? "text-red-600"
                        : "";
                  return (
                    <tr key={row.projectId} className="border-b border-[color:var(--border)]/60">
                      <td className="px-2 py-2 truncate" title={row.projectName}>
                        {row.projectName}
                      </td>
                      <td className="px-2 py-2 truncate text-[color:var(--muted-foreground)]" title={row.clientName}>
                        {row.clientName}
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{formatHoras(row.horasPrevistas)}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{formatHoras(row.horasRealizadas)}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{formatarMoeda(row.receitaPrevista)}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">
                        {formatPercent(row.receitaConsumidaPercentual)}
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums">
                        {row.custoOperacional == null ? "—" : formatarMoeda(row.custoOperacional)}
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums">
                        {formatarMoeda(row.despesaOperacional)}
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{formatarMoeda(row.despesasProjeto)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${margemTone}`}>
                        {formatarMoeda(row.margemReais)}
                        <span className="ml-1 text-[color:var(--muted-foreground)]">
                          ({formatPercent(row.margemPercentual)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReportsCard>
    </ReportsPageShell>
  );
}
