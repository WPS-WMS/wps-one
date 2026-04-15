"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
} from "@/components/reports/ReportsPrimitives";

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
  // Evitar shift de fuso: `createdAt` vem como ISO e pode renderizar "dia anterior" em timezone local.
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
    <ReportsPageShell title="Chamados / tickets" subtitle="Quantidade de chamados por status no período.">
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
          <>
            <div className="text-sm font-semibold text-[color:var(--foreground)]">
              Total no período:{" "}
              <span className="tabular-nums" style={{ color: "var(--primary)" }}>
                {total}
              </span>{" "}
              chamados
            </div>
            <ReportsCard className="overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                    <th className="px-6 py-3 text-right font-semibold">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                    {entries.map(([status, count]) => {
                      const isOpen = openStatus === status;
                      const tickets = detailsByStatus[status] ?? [];
                      const isRowLoading = detailsLoading[status];
                      return (
                        <tr
                          key={status}
                          className="cursor-pointer border-t hover:opacity-95"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => toggleStatus(status)}
                        >
                          <td className="px-6 py-3 text-[color:var(--foreground)] align-top">
                            <div className="flex items-center gap-2">
                              <span>{formatStatusLabel(status)}</span>
                              <span className="text-xs text-[color:var(--muted-foreground)]">
                                {isRowLoading ? "Carregando..." : isOpen ? "Ocultar" : "Ver lista"}
                              </span>
                            </div>
                            {isOpen && (
                              <div
                                className="mt-3 rounded-xl border"
                                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}
                              >
                                {tickets.length === 0 && !isRowLoading && (
                                  <p className="px-4 py-3 text-xs text-[color:var(--muted-foreground)]">
                                    Nenhum chamado encontrado para este status no período.
                                  </p>
                                )}
                                {tickets.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                                        <tr>
                                          <th className="px-3 py-2 text-left font-semibold text-[color:var(--muted-foreground)]">Data</th>
                                          <th className="px-3 py-2 text-left font-semibold text-[color:var(--muted-foreground)]">ID</th>
                                          <th className="px-3 py-2 text-left font-semibold text-[color:var(--muted-foreground)]">Tarefa</th>
                                          <th className="px-3 py-2 text-left font-semibold text-[color:var(--muted-foreground)]">Projeto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tickets.map((t) => (
                                          <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                                            <td className="px-3 py-2 whitespace-nowrap text-[color:var(--muted-foreground)]">
                                              {formatDateOnly(t.createdAt)}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-[color:var(--muted-foreground)]">{t.code}</td>
                                            <td className="px-3 py-2 text-[color:var(--foreground)] max-w-[260px] truncate" title={t.title}>
                                              {t.title}
                                            </td>
                                            <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
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
                          <td className="px-6 py-3 text-right align-top tabular-nums text-[color:var(--muted-foreground)]">
                            {count}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {entries.length === 0 ? <ReportsEmpty>Nenhum chamado no período.</ReportsEmpty> : null}
            </ReportsCard>
          </>
        )}
      </div>
    </ReportsPageShell>
  );
}
