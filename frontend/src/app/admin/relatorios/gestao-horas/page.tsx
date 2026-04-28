"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Download, FileText, Calendar as CalendarIcon } from "lucide-react";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsPrimaryBtnClass,
  reportsSecondaryBtnClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";

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

type PaginatedEntries = { items: EntryRow[]; nextCursor: string | null };

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

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mes = meses[d.getMonth()];
  const ano2 = String(d.getFullYear()).slice(-2);
  return `${mes}/${ano2}`;
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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasFiltered, setHasFiltered] = useState(false);

  async function fetchAllEntriesForExport(): Promise<EntryRow[]> {
    const all: EntryRow[] = [];
    let cursor: string | null = null;
    // Guard rail: evita loop infinito por bug/instabilidade.
    const MAX_PAGES = 50; // 50 * 500 = 25k linhas
    for (let i = 0; i < MAX_PAGES; i++) {
      const params = buildTimeEntriesParams(cursor ? { cursorId: cursor } : undefined);
      const res = await apiFetch(`/api/time-entries?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as PaginatedEntries | EntryRow[] | null;
      if (Array.isArray(data)) {
        all.push(...data);
        break;
      }
      if (!data || !Array.isArray(data.items)) break;
      all.push(...data.items);
      cursor = data.nextCursor ?? null;
      if (!cursor) break;
    }
    return all;
  }

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => r.json())
      .then((data: UserOption[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    apiFetch("/api/projects?light=true")
      .then((r) => r.json())
      .then((data: ProjectOption[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));
  }, []);

  function buildTimeEntriesParams(extra?: Record<string, string>) {
    const params = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end + "T23:59:59.999Z").toISOString(),
      light: "true",
      limit: "500",
      ...(extra ?? {}),
    });
    if (userId) params.set("userId", userId);
    if (projectId) params.set("projectId", projectId);
    return params;
  }

  function handleFilter() {
    if (!start || !end) {
      alert("Selecione o período (de e até).");
      return;
    }
    setHasFiltered(true);
    setLoading(true);
    const params = buildTimeEntriesParams();
    apiFetch(`/api/time-entries?${params.toString()}`)
      .then((r) => r.json())
      .then((data: PaginatedEntries | EntryRow[]) => {
        if (Array.isArray(data)) {
          setEntries(data);
          setNextCursor(null);
          return;
        }
        setEntries(Array.isArray(data.items) ? data.items : []);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => {
        setEntries([]);
        setNextCursor(null);
      })
      .finally(() => setLoading(false));
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoading(true);
    const params = buildTimeEntriesParams({ cursorId: nextCursor });
    apiFetch(`/api/time-entries?${params.toString()}`)
      .then((r) => r.json())
      .then((data: PaginatedEntries | EntryRow[]) => {
        if (Array.isArray(data)) {
          setEntries(data);
          setNextCursor(null);
          return;
        }
        setEntries((prev) => prev.concat(Array.isArray(data.items) ? data.items : []));
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const totalHoras = entries.reduce((s, e) => s + e.totalHoras, 0);

  async function handleDownloadXlsx() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    setLoading(true);
    const exportEntries = await fetchAllEntriesForExport().finally(() => setLoading(false));
    if (exportEntries.length === 0) {
      alert("Não há dados para exportar para este filtro.");
      return;
    }
    const [{ default: ExcelJS }] = await Promise.all([import("exceljs")]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Gestão de horas");

    const mesLabel = start ? formatMonthLabel(start) : "";

    // Cabeçalho superior (começando na linha 2)
    sheet.getCell("A2").value = "Mês:";
    sheet.getCell("B2").value = mesLabel;
    sheet.getCell("A3").value = "Horas contratadas:";
    sheet.getCell("B3").value = ""; // pode ser preenchido manualmente
    sheet.getCell("A4").value = "Horas utilizadas:";
    const totalExportHoras = exportEntries.reduce((s, e) => s + (e.totalHoras ?? 0), 0);
    sheet.getCell("B4").value = fmtHours(totalExportHoras);

    // Estilo das linhas de informação (fundo azul escuro e cinza, com bordas)
    const infoRows = [2, 3, 4];
    for (const rowIdx of infoRows) {
      const labelCell = sheet.getCell(`A${rowIdx}`);
      const valueCell = sheet.getCell(`B${rowIdx}`);
      labelCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" }, // azul mais escuro
      };
      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5E7EB" }, // cinza claro
      };
      [labelCell, valueCell].forEach((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
    }

    // Tentar adicionar logo na planilha (canto superior direito)
    try {
      const logoResp = await fetch(`${window.location.origin}/logo-wps-2.png`);
      const logoBuffer = await logoResp.arrayBuffer();
      const imageId = workbook.addImage({
        buffer: logoBuffer,
        extension: "png",
      });
      sheet.addImage(imageId, {
        tl: { col: 4, row: 1 }, // coluna E, linha 2 (ao lado das infos)
        // Tamanho mais proporcional à nova arte (aprox. 2,5:1)
        ext: { width: 160, height: 64 },
      });
    } catch {
      // Se der erro na logo, seguimos sem imagem
    }

    // Duas linhas em branco após as informações e antes do cabeçalho da tabela
    const headerRowIndex = 7;
    const header = ["Cliente", "Consultor", "Qtde Horas", "Data", "ID", "Descrição Atividade"];
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = header;
    headerRow.height = 18;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" }, // azul WPS aproximado
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    // Largura das colunas
    const widths = [20, 20, 12, 14, 10, 40];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    // Linhas de dados
    let currentRow = headerRowIndex + 1;
    for (const e of exportEntries) {
      const row = sheet.getRow(currentRow++);
      const cliente = e.project?.client?.name ?? "";
      const consultor = e.user?.name ?? "";
      const horas = fmtHours(e.totalHoras);
      const data = formatDateOnly(e.date);
      const id = e.ticket?.code ?? "";
      const descricaoAtividade = e.ticket?.title ?? "";
      row.values = [cliente, consultor, horas, data, id, descricaoAtividade];
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gestao-horas-${start}-a-${end}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    setLoading(true);
    fetchAllEntriesForExport()
      .then((exportEntries) => {
        if (exportEntries.length === 0) {
          alert("Não há dados para exportar para este filtro.");
          return;
        }
        const totalExportHoras = exportEntries.reduce((s, e) => s + (e.totalHoras ?? 0), 0);
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          alert("Permita pop-ups para gerar o PDF.");
          return;
        }
        // Logo do relatório (arquivo em public/logo-wps.png no frontend)
        const logoUrl = `${window.location.origin}/logo-wps.png`;

        const clienteNames = Array.from(
          new Set(
            exportEntries
              .map((e) => e.project?.client?.name)
              .filter((n): n is string => !!n && n.trim().length > 0),
          ),
        );
        const clienteLabel =
          clienteNames.length === 1 ? clienteNames[0] : clienteNames.length > 1 ? "Vários clientes" : "—";

        const mesLabel = start ? formatMonthLabel(start) : "";

        const rows = exportEntries
          .map((row) => {
            const tarefa = `${row.ticket?.code ?? ""} ${row.ticket?.title ?? ""}`.trim();
            return `<tr>
          <td>${(tarefa || "").replace(/</g, "&lt;")}</td>
          <td>${formatDateOnly(row.date)}</td>
          <td>${(row.user?.name ?? "").replace(/</g, "&lt;")}</td>
          <td>${fmtHours(row.totalHoras)}</td>
          <td>${(row.description ?? "").replace(/</g, "&lt;")}</td>
        </tr>`;
          })
          .join("");
        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Gestão de horas - ${start} a ${end}</title>
          <style>
            @page { size: A4; margin: 18mm; }
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
              height: 50px;
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

          <table style="margin-bottom: 10px; border:none;">
            <tr>
              <td style="border:none; font-size:12px;">
                <strong>Cliente:</strong> ${clienteLabel}<br/>
                <strong>Mês:</strong> ${mesLabel}<br/>
                <strong>Horas contratadas:</strong> _______<br/>
                <strong>Horas utilizadas:</strong> ${fmtHours(totalExportHoras)}
              </td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Data</th>
                <th>Usuário</th>
                <th>Horas</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="total">Total apontado no período: ${fmtHours(totalExportHoras)}</p>
          <div class="footer">WPS One - WPS Warehouse Process Solutions</div>

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
      })
      .finally(() => setLoading(false));
  }

  return (
    <ReportsPageShell
      title="Gestão de horas"
      subtitle="Lista de apontamentos com filtros por usuário, período e projeto. Exportar CSV ou PDF."
    >
      <div className="space-y-4">
          {/* Filtros */}
          <ReportsCard>
            <div className="p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Usuário</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={reportsSelectClass + " min-w-[180px]"}
              >
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)]">Período</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center" style={{ color: "var(--muted-foreground)" }}>
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className={reportsInputClass + " pl-9 pr-3"}
                  />
                </div>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>até</span>
                <div className="relative flex-1 min-w-[160px]">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center" style={{ color: "var(--muted-foreground)" }}>
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className={reportsInputClass + " pl-9 pr-3"}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Projeto</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={reportsSelectClass + " min-w-[200px]"}
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
              className={reportsPrimaryBtnClass}
              style={{ background: "var(--primary)" }}
            >
              {loading ? "Carregando..." : "Filtrar"}
            </button>
            </div>
          </ReportsCard>

          {/* Botões de download */}
          {hasFiltered && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={entries.length === 0}
                className={reportsSecondaryBtnClass + " gap-2"}
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadXlsx}
                disabled={entries.length === 0}
                className={reportsSecondaryBtnClass + " gap-2"}
                style={{
                  borderColor: "rgba(16,185,129,0.35)",
                  background: "rgba(16,185,129,0.10)",
                  color: "rgb(16 185 129)",
                }}
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
            </div>
          )}

          {hasFiltered && nextCursor && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className={reportsSecondaryBtnClass}
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
              >
                {loading ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}

          {/* Grid */}
          <ReportsCard className="overflow-hidden">
            {!hasFiltered ? (
              <ReportsEmpty>Defina os filtros e clique em Filtrar para carregar os apontamentos.</ReportsEmpty>
            ) : loading ? (
              <ReportsEmpty>Carregando...</ReportsEmpty>
            ) : entries.length === 0 ? (
              <ReportsEmpty>Nenhum apontamento no período.</ReportsEmpty>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Data</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Colaborador</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Projeto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Tarefa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Início</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Fim</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Hora total</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row) => (
                        <tr key={row.id} className="border-t hover:opacity-95" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-[color:var(--foreground)]">{formatDateOnly(row.date)}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">{row.user?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">{row.project?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm font-mono text-[color:var(--muted-foreground)]">{row.ticket?.code ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)] max-w-[200px] truncate" title={row.ticket?.title}>{row.ticket?.title ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)]">{row.horaInicio}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)]">{row.horaFim}</td>
                          <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-[color:var(--foreground)]">{fmtHours(row.totalHoras)}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)] max-w-[240px] truncate" title={row.description ?? ""}>
                            {row.description ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t text-sm font-semibold" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)", color: "var(--foreground)" }}>
                  Total apontado: {fmtHours(totalHoras)}
                </div>
              </>
            )}
          </ReportsCard>
      </div>
    </ReportsPageShell>
  );
}
