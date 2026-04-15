"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
} from "@/components/reports/ReportsPrimitives";

type Row = { id: string; name: string; cargaHorariaSemanal: number; workedHours: number; expectedHours: number; utilization: number };

export default function RelatorioUtilizacaoPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<{ list: Row[]; workingDays: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/utilization?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [start, end]);

  const list = data?.list ?? [];
  const workingDays = data?.workingDays ?? 0;

  return (
    <ReportsPageShell
      title="Utilização"
      subtitle={`Horas trabalhadas vs. capacidade no período (dias úteis: ${workingDays}).`}
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass} />
            </div>
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <ReportsCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-6 py-3 text-left font-semibold">Consultor</th>
                    <th className="px-6 py-3 text-right font-semibold">Carga semanal (h)</th>
                    <th className="px-6 py-3 text-right font-semibold">Horas trabalhadas</th>
                    <th className="px-6 py-3 text-right font-semibold">Horas esperadas</th>
                    <th className="px-6 py-3 text-right font-semibold">Utilização</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const color =
                      r.utilization > 100
                        ? "rgb(245 158 11)"
                        : r.utilization >= 80
                          ? "rgb(16 185 129)"
                          : "var(--muted-foreground)";
                    return (
                      <tr key={r.id} className="border-t hover:opacity-95" style={{ borderColor: "var(--border)" }}>
                        <td className="px-6 py-3 text-[color:var(--foreground)]">{r.name}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[color:var(--muted-foreground)]">{r.cargaHorariaSemanal}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[color:var(--foreground)]">{r.workedHours.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[color:var(--muted-foreground)]">{r.expectedHours.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums" style={{ color }}>
                          {r.utilization}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length === 0 ? <ReportsEmpty>Nenhum dado.</ReportsEmpty> : null}
          </ReportsCard>
        )}
      </div>
    </ReportsPageShell>
  );
}
