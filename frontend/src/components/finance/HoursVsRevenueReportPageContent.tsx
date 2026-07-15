"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
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
  const [clientQ, setClientQ] = useState("");
  const [projectQ, setProjectQ] = useState("");

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    setError(null);
    apiFetch("/api/reports/finance/hours-vs-revenue")
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(
            typeof body?.error === "string" ? body.error : "Erro ao carregar relatório.",
          );
        }
        setRows(Array.isArray(body?.projects) ? body.projects : []);
      })
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Erro ao carregar relatório.");
      })
      .finally(() => setLoading(false));
  }, [permissionsReady, canAccess]);

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
      subtitle="Compara esforço realizado com a receita contratada: horas, custos operacionais, despesas e margem do projeto."
    >
      <ReportsCard className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border-b" style={{ borderColor: "var(--border)" }}>
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

        {error && (
          <p className="px-4 text-sm text-red-600">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-[color:var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <ReportsEmpty>Nenhum projeto encontrado.</ReportsEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Projeto</th>
                  <th className="px-3 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Cliente</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Horas previstas</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Horas realizadas</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Receita prevista</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Receita consumida</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Custo operacional</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Despesa operacional</th>
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Margem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const margemTone =
                    row.margemReais > 0
                      ? "text-emerald-700"
                      : row.margemReais < 0
                        ? "text-red-600"
                        : "";
                  return (
                    <tr key={row.projectId} className="border-b border-[color:var(--border)] last:border-0">
                      <td className="px-3 py-3 font-medium">{row.projectName}</td>
                      <td className="px-3 py-3">{row.clientName}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatHoras(row.horasPrevistas)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatHoras(row.horasRealizadas)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(row.receitaPrevista)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatPercent(row.receitaConsumidaPercentual)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.custoOperacional == null ? "—" : formatarMoeda(row.custoOperacional)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatarMoeda(row.despesaOperacional)}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums font-medium ${margemTone}`}>
                        <div>{formatarMoeda(row.margemReais)}</div>
                        <div className="text-[11px] font-normal text-[color:var(--muted-foreground)]">
                          {formatPercent(row.margemPercentual)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="px-4 pb-4 text-[11px] text-[color:var(--muted-foreground)]">
          Horas previstas: composição de custos no financeiro do projeto. Horas realizadas: apontamentos.
          Custo operacional: apontamentos × taxa hora. Despesa operacional: lançamentos e reembolsos do projeto.
          Receita consumida: % de (custo + despesa) sobre a receita prevista. Margem: receita − custos − despesas − impostos.
        </p>
      </ReportsCard>
    </ReportsPageShell>
  );
}
