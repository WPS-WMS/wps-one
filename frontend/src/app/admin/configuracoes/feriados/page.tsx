"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Link } from "@/components/Link";
import { Trash2, Plus, ArrowLeft } from "lucide-react";

type HolidayRow = { id: string; date: string; name: string; isActive: boolean };

function fmtDatePtBR(ymd: string): string {
  // ymd vem como YYYY-MM-DD. Formatamos em pt-BR sem risco de offset de fuso usando UTC.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(dt);
}

export default function AdminFeriadosPage() {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [formDate, setFormDate] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAccess = useMemo(() => can("configuracoes.feriados"), [can]);

  async function load() {
    const r = await apiFetch(`/api/holidays?year=${year}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Não foi possível carregar os feriados.");
      return;
    }
    setError(null);
    setRows(Array.isArray(body) ? body : []);
  }

  useEffect(() => {
    if (!canAccess) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canAccess]);

  async function addHoliday() {
    setError(null);
    const date = formDate.trim();
    const name = formName.trim();
    if (!date) return setError("Informe a data do feriado.");
    if (!name) return setError("Informe o nome do feriado.");
    setSaving(true);
    try {
      const r = await apiFetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, name, isActive: true }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setFormDate("");
      setFormName("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(id: string) {
    setError(null);
    setSaving(true);
    try {
      const r = await apiFetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Não foi possível remover.");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 tracking-wider">403</div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Acesso negado</h1>
          <p className="mt-2 text-sm text-slate-600">Você não tem permissão para gerenciar feriados.</p>
          <div className="mt-5">
            <Link
              href="/admin/configuracoes"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <button
        type="button"
        onClick={() => router.push(`${basePath}/configuracoes`)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Feriados</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Cadastre feriados para que não contem como horas previstas (e não gerem horas negativas).
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Ano</label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="w-full md:w-[10rem] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {Array.from({ length: 2036 - 2024 + 1 }, (_, i) => 2024 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="flex-[2]">
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex.: Tiradentes"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <button
                type="button"
                onClick={() => void addHoliday()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-auto border-collapse">
                <thead>
                  <tr className="text-slate-500 text-xs bg-white/60">
                    <th className="px-4 py-3 text-left whitespace-nowrap uppercase tracking-wide font-semibold">Data</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap uppercase tracking-wide font-semibold">Nome</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap uppercase tracking-wide font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-500">
                        Nenhum feriado cadastrado para {year}.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-200/60 hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900 font-mono tabular-nums">{fmtDatePtBR(r.date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{r.name}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void removeHoliday(r.id)}
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            title="Remover feriado"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

