"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type TicketRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  createdAt: string;
  project?: { id: string; name: string; client?: { id: string; name: string } };
};

function formatStatusLabel(status: string): string {
  const upper = status.toUpperCase();
  if (upper === "ABERTO") return "ABERTO";
  if (upper === "EXECUCAO") return "EM EXECUÇÃO";
  if (upper === "ENCERRADO") return "ENCERRADO";
  return status;
}

function formatDateOnly(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function RelatorioChamadosPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<{ byStatus: Record<string, number>; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const [detailsByStatus, setDetailsByStatus] = useState<Record<string, TicketRow[]>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/tickets?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [start, end]);

  const byStatus = data?.byStatus ?? {};
  const total = data?.total ?? 0;
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);

  async function toggleStatus(status: string) {
    if (openStatus === status) {
      setOpenStatus(null);
      return;
    }
    setOpenStatus(status);
    if (detailsByStatus[status]) return;
    setDetailsLoading((prev) => ({ ...prev, [status]: true }));
    try {
      const params = new URLSearchParams({ start, end, status });
      const res = await apiFetch(`/api/reports/tickets?${params.toString()}`);
      const body = (await res.json()) as { tickets?: TicketRow[] };
      setDetailsByStatus((prev) => ({
        ...prev,
        [status]: Array.isArray(body.tickets) ? body.tickets : [],
      }));
    } catch {
      setDetailsByStatus((prev) => ({ ...prev, [status]: [] }));
    } finally {
      setDetailsLoading((prev) => ({ ...prev, [status]: false }));
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Chamados / tickets</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Quantidade de chamados por status no período.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
            <label className="flex items-center gap-2">
              <span className="text-sm text-slate-600">De</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Até</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>

          {loading ? (
            <p className="text-slate-500">Carregando...</p>
          ) : (
            <>
              <div className="text-sm font-medium text-slate-700">Total no período: <span className="text-blue-600">{total}</span> chamados</div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map(([status, count]) => {
                      const isOpen = openStatus === status;
                      const tickets = detailsByStatus[status] ?? [];
                      const isRowLoading = detailsLoading[status];
                      return (
                        <tr
                          key={status}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleStatus(status)}
                        >
                          <td className="px-6 py-3 text-sm text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{formatStatusLabel(status)}</span>
                              <span className="text-xs text-slate-400">
                                {isRowLoading ? "Carregando..." : isOpen ? "Ocultar" : "Ver lista"}
                              </span>
                            </div>
                            {isOpen && (
                              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
                                {tickets.length === 0 && !isRowLoading && (
                                  <p className="px-4 py-3 text-xs text-slate-500">
                                    Nenhum chamado encontrado para este status no período.
                                  </p>
                                )}
                                {tickets.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Data</th>
                                          <th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
                                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Tarefa</th>
                                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Projeto</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                        {tickets.map((t) => (
                                          <tr key={t.id}>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                                              {formatDateOnly(t.createdAt)}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-slate-700">{t.code}</td>
                                            <td className="px-3 py-2 text-slate-800 max-w-[260px] truncate" title={t.title}>
                                              {t.title}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">
                                              {t.project?.name ?? "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-slate-700 text-right align-top">
                            {count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {entries.length === 0 && <p className="p-6 text-center text-slate-500 text-sm">Nenhum chamado no período.</p>}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
