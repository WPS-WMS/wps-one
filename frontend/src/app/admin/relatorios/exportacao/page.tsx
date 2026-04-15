"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsPrimaryBtnClass,
} from "@/components/reports/ReportsPrimitives";

type ExportRow = { data: string; consultor: string; cliente: string; projeto: string; atividade: string; horas: number; descricao: string };

function downloadCsv(rows: ExportRow[]) {
  const headers = ["Data", "Consultor", "Cliente", "Projeto", "Atividade", "Horas", "Descrição"];
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const line = (row: ExportRow) => [row.data, row.consultor, row.cliente, row.projeto, row.atividade, row.horas, row.descricao].map(escape).join(",");
  const csv = [headers.join(","), ...rows.map(line)].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `horas-faturamento-${rows[0]?.data ?? "inicio"}-${rows[rows.length - 1]?.data ?? "fim"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatorioExportacaoPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function handleExport() {
    setLoading(true);
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/export/hours?${params}`)
      .then((r) => r.json())
      .then((body: { rows?: ExportRow[] }) => {
        const rows = body.rows ?? [];
        if (rows.length === 0) {
          alert("Nenhum apontamento no período para exportar.");
          return;
        }
        downloadCsv(rows);
      })
      .catch(() => alert("Erro ao exportar. Tente novamente."))
      .finally(() => setLoading(false));
  }

  return (
    <ReportsPageShell
      title="Exportar faturamento"
      subtitle="Baixe as horas apontadas no período em CSV (UTF-8) para cobrança ou integração."
    >
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass} />
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading}
              className={reportsPrimaryBtnClass}
              style={{ background: "var(--primary)" }}
            >
              {loading ? "Gerando..." : "Baixar CSV"}
            </button>
          </div>
        </ReportsCard>
        <ReportsEmpty>
          O arquivo inclui: data, consultor, cliente, projeto, atividade, horas e descrição. Pode ser aberto no Excel ou importado em sistemas de faturamento.
        </ReportsEmpty>
      </div>
    </ReportsPageShell>
  );
}
