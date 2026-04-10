"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ticketCodeTitleLine } from "@/lib/ticketCodeDisplay";

function fmt(n: number) {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function ConsumoPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [entries, setEntries] = useState<
    Array<{
      date: string;
      totalHoras: number;
      project?: { name: string; client?: { name: string } };
      ticket?: { code: string; title: string; type?: string };
      description?: string;
    }>
  >([]);

  useEffect(() => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    apiFetch(`/api/time-entries?start=${start.toISOString()}&end=${end.toISOString()}&view=client`)
      .then((r) => r.json())
      .then(setEntries);
  }, [year, month]);

  const total = entries.reduce((a, e) => a + e.totalHoras, 0);

  return (
    <div className="flex-1">
      <header className="bg-white border-b border-blue-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Consumo em {MESES[month - 1]}/{year}: {fmt(total)}
        </h2>
      </header>
      <main className="p-6">
        <div className="flex gap-4 mb-4">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className="px-4 py-2 bg-gray-50 border border-blue-200 rounded-lg text-gray-900">
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="px-4 py-2 bg-gray-50 border border-blue-200 rounded-lg text-gray-900">
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-blue-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-50 text-gray-600 text-sm">
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Projeto</th>
                <th className="px-4 py-3 text-left">Chamado</th>
                <th className="px-4 py-3 text-right">Horas</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t border-blue-100">
                  <td className="px-4 py-3 text-gray-700">
                    {(() => {
                      const ymd = String(e.date || "").slice(0, 10);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
                        const [y, m, d] = ymd.split("-");
                        return `${d}/${m}/${y}`;
                      }
                      const dt = new Date(e.date);
                      return dt.toLocaleDateString("pt-BR");
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.project?.client?.name} - {e.project?.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {e.ticket ? ticketCodeTitleLine(e.ticket.type, e.ticket.code, e.ticket.title) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-blue-600">{fmt(e.totalHoras)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
