"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";

type GroupItem = { id: string; name: string; hours: number; count: number; totalHours: number };

export default function RelatorioHorasPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<"user" | "project" | "client">("project");
  const [data, setData] = useState<{ groups?: GroupItem[]; totalHours?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start, end, groupBy });
    apiFetch(`/api/reports/hours?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [start, end, groupBy]);

  const groups = data?.groups ?? [];
  const totalHours = data?.totalHours ?? 0;
  const label = groupBy === "user" ? "Consultor" : groupBy === "project" ? "Projeto" : "Cliente";

  return (
    <ReportsPageShell
      title="Horas por período / projeto / cliente"
      subtitle="Total de horas apontadas com filtro de datas e agrupamento."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Agrupar por</label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as "user" | "project" | "client")}
                  className={reportsSelectClass}
                >
                  <option value="user">Consultor</option>
                  <option value="project">Projeto</option>
                  <option value="client">Cliente</option>
                </select>
              </div>
            </div>
          </div>
        </ReportsCard>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <>
            <div className="text-sm font-semibold text-[color:var(--foreground)]">
              Total no período:{" "}
              <span className="tabular-nums" style={{ color: "var(--primary)" }}>
                {totalHours.toFixed(1)} h
              </span>
            </div>

            <ReportsCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                    <tr
                      className="text-xs uppercase tracking-wide"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <th className="px-6 py-3 text-left font-semibold">{label}</th>
                      <th className="px-6 py-3 text-right font-semibold">Horas</th>
                      <th className="px-6 py-3 text-right font-semibold">Apontamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr
                        key={g.id}
                        className="border-t hover:opacity-95"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="px-6 py-3 text-[color:var(--foreground)]">{g.name}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[color:var(--foreground)]">{g.totalHours.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[color:var(--muted-foreground)]">{g.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {groups.length === 0 ? <ReportsEmpty>Nenhum dado no período.</ReportsEmpty> : null}
            </ReportsCard>
          </>
        )}
      </div>
    </ReportsPageShell>
  );
}
