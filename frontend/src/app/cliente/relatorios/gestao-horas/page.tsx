"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Calendar as CalendarIcon } from "lucide-react";

type ProjectOption = { id: string; name: string; client?: { id: string; name: string } };
type EntryRow = {
  id: string;
  date: string;
  horaInicio: string;
  horaFim: string;
  totalHoras: number;
  description?: string | null;
  user?: { id: string; name: string; avatarUrl?: string | null };
  project?: { id: string; name: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string } | null;
};

function fmtHours(n: number): string {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDateOnly(dateStr: string): string {
  // Evitar shift de fuso: `date` vem como ISO e pode renderizar "dia anterior" em timezone local.
  // Preferimos usar a parte YYYY-MM-DD da string.
  const ymd = (dateStr || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export default function ClienteRelatorioGestaoHorasPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFiltered, setHasFiltered] = useState(false);

  useEffect(() => {
    apiFetch("/api/client-reports/projects")
      .then((r) => r.json())
      .then((data: ProjectOption[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));
  }, []);

  function handleFilter() {
    if (!start || !end) {
      alert("Selecione o período (de e até).");
      return;
    }
    setHasFiltered(true);
    setLoading(true);
    const params = new URLSearchParams({
      start,
      end,
    });
    if (projectId) params.set("projectId", projectId);

    apiFetch(`/api/client-reports/gestao-horas?${params}`)
      .then((r) => r.json())
      .then((data: EntryRow[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }

  const totalHoras = useMemo(() => entries.reduce((s, e) => s + (e.totalHoras || 0), 0), [entries]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Gestão de horas</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Lista de apontamentos com filtros por período e projeto.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Período</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Projeto</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Todos os projetos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleFilter}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                Filtrar
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Apontamentos</p>
              <p className="text-xs text-slate-500">
                Total apontado: <span className="font-semibold text-slate-800">{fmtHours(totalHoras)}</span>
              </p>
            </div>

            {loading ? (
              <div className="p-6 text-sm text-slate-500">Carregando...</div>
            ) : !hasFiltered ? (
              <div className="p-6 text-sm text-slate-500">Aplique os filtros para visualizar os dados.</div>
            ) : entries.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Nenhum apontamento encontrado para o período.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs text-slate-600 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-4 py-3 text-left">Projeto</th>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Tarefa</th>
                      <th className="px-4 py-3 text-left">Início</th>
                      <th className="px-4 py-3 text-left">Fim</th>
                      <th className="px-4 py-3 text-right">Hora total</th>
                      <th className="px-4 py-3 text-left">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">{formatDateOnly(e.date)}</td>
                        <td className="px-4 py-3">{e.user?.name ?? "—"}</td>
                        <td className="px-4 py-3">{e.project?.name ?? "—"}</td>
                        <td className="px-4 py-3">{e.ticket?.code ?? "—"}</td>
                        <td className="px-4 py-3">{e.ticket?.title ?? "—"}</td>
                        <td className="px-4 py-3">{e.horaInicio}</td>
                        <td className="px-4 py-3">{e.horaFim}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtHours(e.totalHoras)}</td>
                        <td className="px-4 py-3">{e.description ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

