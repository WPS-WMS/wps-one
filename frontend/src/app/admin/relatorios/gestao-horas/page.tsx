"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Download, FileText, Calendar as CalendarIcon } from "lucide-react";

type UserOption = { id: string; name: string };
type ProjectOption = { id: string; name: string; clientId?: string; client?: { id: string; name: string } };
type EntryRow = {
  id: string;
  date: string;
  horaInicio: string;
  horaFim: string;
  totalHoras: number;
  description?: string | null;
  user?: { id: string; name: string };
  project?: { id: string; name: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string } | null;
};

function fmtHours(n: number): string {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDateOnly(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function downloadCsv(rows: EntryRow[], start: string, end: string) {
  const headerBlock = [
    "WPS Flowa - Gestão de horas",
    `Período:;${formatDateOnly(start)};até;${formatDateOnly(end)}`,
    "",
  ];

  const headers = [
    "Data",
    "Colaborador",
    "Projeto",
    "ID Tarefa",
    "Tarefa",
    "Início",
    "Fim",
    "Hora total",
  ];
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const line = (row: EntryRow) =>
    [
      formatDateOnly(row.date),
      row.user?.name ?? "",
      row.project?.name ?? "",
      row.ticket?.code ?? "",
      row.ticket?.title ?? "",
      row.horaInicio,
      row.horaFim,
      fmtHours(row.totalHoras),
    ].map(escape).join(",");
  const csv = [...headerBlock, headers.join(","), ...rows.map(line)].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gestao-horas-${rows[0]?.date ?? "inicio"}-${rows[rows.length - 1]?.date ?? "fim"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatorioGestaoHorasPage() {
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFiltered, setHasFiltered] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => r.json())
      .then((data: UserOption[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    apiFetch("/api/projects")
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
      start: new Date(start).toISOString(),
      end: new Date(end + "T23:59:59.999Z").toISOString(),
    });
    if (userId) params.set("userId", userId);
    if (projectId) params.set("projectId", projectId);
    apiFetch(`/api/time-entries?${params}`)
      .then((r) => r.json())
      .then((data: EntryRow[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }

  const totalHoras = entries.reduce((s, e) => s + e.totalHoras, 0);

  function handleDownloadCsv() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    downloadCsv(entries, start, end);
  }

  function handleDownloadPdf() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Permita pop-ups para gerar o PDF.");
      return;
    }
    // Logo do relatório (arquivo em public/logo-wps.png no frontend)
    const logoUrl = `${window.location.origin}/logo-wps.png`;

    const rows = entries.map(
      (row) =>
        `<tr>
          <td>${formatDateOnly(row.date)}</td>
          <td>${(row.user?.name ?? "").replace(/</g, "&lt;")}</td>
          <td>${(row.project?.name ?? "").replace(/</g, "&lt;")}</td>
          <td>${(row.ticket?.code ?? "").replace(/</g, "&lt;")}</td>
          <td>${(row.ticket?.title ?? "").replace(/</g, "&lt;")}</td>
          <td>${row.horaInicio}</td>
          <td>${row.horaFim}</td>
          <td>${fmtHours(row.totalHoras)}</td>
        </tr>`
    ).join("");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Gestão de horas - ${start} a ${end}</title>
          <style>
            @page { size: A4 landscape; margin: 18mm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111827; }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
            }
            .header-left {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .header-logo {
              height: 32px;
            }
            h1 { font-size: 20px; margin: 0; color: #111827; }
            .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
            .meta { font-size: 11px; color: #374151; margin: 4px 0 12px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
            th {
              background: #111827;
              color: #f9fafb;
              font-weight: 600;
              font-size: 10px;
              text-transform: uppercase;
            }
            tr:nth-child(even) td { background: #f9fafb; }
            .total {
              margin-top: 8px;
              font-weight: 600;
            }
            .footer {
              margin-top: 8px;
              font-size: 10px;
              color: #9ca3af;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <img src="${logoUrl}" alt="WPS" class="header-logo" />
              <div>
                <h1>Gestão de horas</h1>
                <div class="subtitle">Relatório detalhado de apontamentos por usuário / projeto</div>
              </div>
            </div>
            <div style="font-size:10px;color:#6b7280;">
              Gerado em ${new Date().toLocaleString("pt-BR")}
            </div>
          </div>

          <p class="meta">
            Período: <strong>${formatDateOnly(start)}</strong> a <strong>${formatDateOnly(end)}</strong>
            &nbsp;|&nbsp; Total apontado: <strong>${fmtHours(totalHoras)}</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Colaborador</th>
                <th>Projeto</th>
                <th>ID Tarefa</th>
                <th>Tarefa</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Hora total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="total">Total apontado no período: ${fmtHours(totalHoras)}</p>
          <div class="footer">FLOWA - WPS Warehouse Process Solutions</div>

          <script>
            window.addEventListener('load', function () {
              // Aguarda logo e tabela carregarem antes de imprimir
              setTimeout(function () {
                window.print();
                window.close();
              }, 400);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Gestão de horas</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Lista de apontamentos com filtros por usuário, período e projeto. Exportar CSV ou PDF.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-white rounded-xl border border-slate-200">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Usuário</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="block text-sm font-medium text-slate-600">Período</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  />
                </div>
                <span className="text-slate-400 text-xs">até</span>
                <div className="relative flex-1 min-w-[160px]">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Projeto</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm min-w-[200px]"
              >
                <option value="">Todos os projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.client?.name ? `${p.client.name} – ` : ""}{p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleFilter}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Carregando..." : "Filtrar"}
            </button>
          </div>

          {/* Botões de download */}
          {hasFiltered && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={entries.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={entries.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </button>
            </div>
          )}

          {/* Grid */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {!hasFiltered ? (
              <p className="p-6 text-center text-slate-500 text-sm">Defina os filtros e clique em Filtrar para carregar os apontamentos.</p>
            ) : loading ? (
              <p className="p-6 text-center text-slate-500 text-sm">Carregando...</p>
            ) : entries.length === 0 ? (
              <p className="p-6 text-center text-slate-500 text-sm">Nenhum apontamento no período.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Colaborador</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Projeto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Tarefa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Início</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Fim</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Hora total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">{formatDateOnly(row.date)}</td>
                          <td className="px-4 py-3 text-sm text-slate-800">{row.user?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-800">{row.project?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 font-mono">{row.ticket?.code ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-800 max-w-[200px] truncate" title={row.ticket?.title}>{row.ticket?.title ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{row.horaInicio}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{row.horaFim}</td>
                          <td className="px-4 py-3 text-sm text-slate-800 text-right font-mono">{fmtHours(row.totalHoras)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm font-medium text-slate-700">
                  Total apontado: {fmtHours(totalHoras)}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
