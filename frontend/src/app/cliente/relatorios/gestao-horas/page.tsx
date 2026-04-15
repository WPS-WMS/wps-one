"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  ReportsCard,
  ReportsCardHeader,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsPrimaryBtnClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";

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
      .then((data: ProjectOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        // Cliente terá apenas 1 projeto vinculado: pré-seleciona para filtrar automaticamente.
        if (list.length === 1) setProjectId(list[0]?.id ?? "");
      })
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
    const effectiveProjectId = projectId || (projects.length === 1 ? projects[0]?.id ?? "" : "");
    if (effectiveProjectId) params.set("projectId", effectiveProjectId);

    apiFetch(`/api/client-reports/gestao-horas?${params}`)
      .then((r) => r.json())
      .then((data: EntryRow[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }

  const totalHoras = useMemo(() => entries.reduce((s, e) => s + (e.totalHoras || 0), 0), [entries]);

  return (
    <ReportsPageShell title="Gestão de horas" subtitle="Lista de apontamentos com filtro por período.">
      <div className="space-y-4">
        <ReportsCard>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Período</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                    <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass + " pl-9 pr-3"} />
                  </div>
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                    <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass + " pl-9 pr-3"} />
                  </div>
                </div>
              </div>

              {projects.length <= 1 ? (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Projeto</label>
                  <input
                    value={projects[0]?.name ?? "—"}
                    readOnly
                    className={reportsInputClass}
                    style={{ opacity: 0.9 }}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Projeto</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={reportsSelectClass}>
                    <option value="">Todos os projetos</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={handleFilter}
                className={reportsPrimaryBtnClass}
                style={{ background: "var(--primary)" }}
              >
                Filtrar
              </button>
            </div>
          </div>
        </ReportsCard>

        <ReportsCard className="overflow-hidden">
          <ReportsCardHeader
            title="Apontamentos"
            right={
              <>
                Total apontado:{" "}
                <span className="font-semibold text-[color:var(--foreground)] tabular-nums">{fmtHours(totalHoras)}</span>
              </>
            }
          />

          {loading ? (
            <ReportsEmpty>Carregando...</ReportsEmpty>
          ) : !hasFiltered ? (
            <ReportsEmpty>Aplique os filtros para visualizar os dados.</ReportsEmpty>
          ) : entries.length === 0 ? (
            <ReportsEmpty>Nenhum apontamento encontrado para o período.</ReportsEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
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
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t hover:opacity-95" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 text-[color:var(--foreground)] whitespace-nowrap">{formatDateOnly(e.date)}</td>
                      <td className="px-4 py-3 text-[color:var(--foreground)]">{e.user?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[color:var(--foreground)]">{e.project?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)] font-mono">{e.ticket?.code ?? "—"}</td>
                      <td className="px-4 py-3 text-[color:var(--foreground)]">{e.ticket?.title ?? "—"}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{e.horaInicio}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{e.horaFim}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[color:var(--foreground)]">{fmtHours(e.totalHoras)}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{e.description ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportsCard>
      </div>
    </ReportsPageShell>
  );
}

