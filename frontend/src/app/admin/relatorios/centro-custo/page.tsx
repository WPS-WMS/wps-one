"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";

type GroupRow = {
  id: string;
  name: string;
  code: string | null;
  receitaCents: number;
  despesaCents: number;
  saldoCents: number;
  receitaFormatted: string;
  despesaFormatted: string;
  saldoFormatted: string;
  count: number;
};

type ReportData = {
  groups?: GroupRow[];
  totalReceitaCents?: number;
  totalDespesaCents?: number;
  saldoCents?: number;
};

type CostCenterOption = { id: string; name: string };

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RelatorioCentroCustoPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [costCenterId, setCostCenterId] = useState("");
  const [type, setType] = useState<"" | "RECEITA" | "DESPESA">("");
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/cost-centers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCostCenters(Array.isArray(rows) ? rows : []))
      .catch(() => setCostCenters([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start, end });
    if (costCenterId) params.set("costCenterId", costCenterId);
    if (type) params.set("type", type);
    apiFetch(`/api/reports/finance/cost-centers?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [start, end, costCenterId, type]);

  const groups = data?.groups ?? [];

  return (
    <ReportsPageShell
      title="Relatório por centro de custo"
      subtitle="Receitas e despesas agrupadas por centro de custo no período."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Centro de custo</label>
                <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={reportsSelectClass}>
                  <option value="">Todos</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value as "" | "RECEITA" | "DESPESA")} className={reportsSelectClass}>
                  <option value="">Receita e despesa</option>
                  <option value="RECEITA">Receita</option>
                  <option value="DESPESA">Despesa</option>
                </select>
              </div>
            </div>
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
                <p className="text-[color:var(--muted-foreground)]">Total receitas</p>
                <p className="text-lg font-semibold text-emerald-600 tabular-nums">
                  {formatCents(data?.totalReceitaCents ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
                <p className="text-[color:var(--muted-foreground)]">Total despesas</p>
                <p className="text-lg font-semibold text-red-600 tabular-nums">
                  {formatCents(data?.totalDespesaCents ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
                <p className="text-[color:var(--muted-foreground)]">Saldo</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--primary)" }}>
                  {formatCents(data?.saldoCents ?? 0)}
                </p>
              </div>
            </div>

            <ReportsCard>
              {groups.length === 0 ? (
                <ReportsEmpty>Nenhum lançamento no período.</ReportsEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Centro de custo</th>
                        <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Receitas</th>
                        <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Despesas</th>
                        <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Saldo</th>
                        <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Lançamentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g.id} className="border-b border-[color:var(--border)] last:border-0">
                          <td className="px-4 py-3 font-medium">{g.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{g.receitaFormatted}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600">{g.despesaFormatted}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{g.saldoFormatted}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[color:var(--muted-foreground)]">{g.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportsCard>
          </>
        )}
      </div>
    </ReportsPageShell>
  );
}
