"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Loader2, Plus, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ProjectFinancialRow = {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  receitaContratada: number;
  receitaPrevista: number;
  receitaRealizada: number;
  custoTotal: number;
  lucroBruto: number;
  margemPercentual: number | null;
  parcelasReceita: number | null;
  quantidadeReceitas: number;
};

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatParcelas(value: number | null): string {
  if (value == null || value <= 0) return "—";
  return `${value}x`;
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "accent";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-600"
        : tone === "accent"
          ? "text-[color:var(--primary)]"
          : "text-[color:var(--foreground)]";

  return (
    <div
      className="rounded-2xl border bg-[color:var(--surface)] px-4 py-3 shadow-[0_1px_0_rgba(41,19,73,0.04)]"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--muted-foreground)]">
        {label}
      </p>
      <p className={`mt-1.5 text-sm font-semibold tabular-nums md:text-base ${valueClass}`}>{value}</p>
    </div>
  );
}

export function FinanceProjectsPageContent() {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () =>
      canFinanceFeature(can, "financeiro.projetos") ||
      canFinanceFeature(can, "financeiro.projetos.receitas") ||
      canFinanceFeature(can, "financeiro.projetos.contratos") ||
      canFinanceFeature(can, "financeiro.projetos.resultado"),
    [can],
  );

  const canCreateRevenue = useMemo(
    () => canFinanceFeature(can, "financeiro.projetos.receitas"),
    [can],
  );

  const [rows, setRows] = useState<ProjectFinancialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [novaReceitaOpen, setNovaReceitaOpen] = useState(false);
  const [novaReceitaProjectId, setNovaReceitaProjectId] = useState("");
  const [novaReceitaSearch, setNovaReceitaSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/project-financial-result/projects");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar projetos.");
      setLoading(false);
      return;
    }
    setRows(Array.isArray(body?.projects) ? body.projects : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.projectName.toLowerCase().includes(q) || row.clientName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const modalProjects = useMemo(() => {
    const q = novaReceitaSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.projectName.toLowerCase().includes(q) || row.clientName.toLowerCase().includes(q),
    );
  }, [rows, novaReceitaSearch]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => ({
        receitaContratada: acc.receitaContratada + row.receitaContratada,
        receitaPrevista: acc.receitaPrevista + row.receitaPrevista,
        receitaRealizada: acc.receitaRealizada + row.receitaRealizada,
        custoTotal: acc.custoTotal + row.custoTotal,
        lucroBruto: acc.lucroBruto + row.lucroBruto,
      }),
      {
        receitaContratada: 0,
        receitaPrevista: 0,
        receitaRealizada: 0,
        custoTotal: 0,
        lucroBruto: 0,
      },
    );
  }, [filtered]);

  const margemTotal =
    totals.receitaRealizada > 0
      ? Math.round((totals.lucroBruto / totals.receitaRealizada) * 10000) / 100
      : null;

  function openNovaReceitaModal() {
    setNovaReceitaProjectId(filtered[0]?.projectId ?? rows[0]?.projectId ?? "");
    setNovaReceitaSearch("");
    setNovaReceitaOpen(true);
  }

  function confirmNovaReceita() {
    if (!novaReceitaProjectId) return;
    setNovaReceitaOpen(false);
    router.push(`${basePath}/financeiro/projetos/${novaReceitaProjectId}?nova=1`);
  }

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <section
        className="relative overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
          style={{ background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.12]"
          style={{ background: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
              Financeiro
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
              Projetos
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[color:var(--muted-foreground)]">
              Visão financeira por projeto: receitas vinculadas, custos, parcelas e margem.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
              <input
                type="search"
                placeholder="Buscar por projeto ou cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20"
              />
            </label>
            {canCreateRevenue && (
              <button
                type="button"
                onClick={openNovaReceitaModal}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--wps-purple-600) 0%, color-mix(in srgb, var(--wps-purple-600) 65%, var(--wps-purple-900)) 100%)",
                }}
              >
                <Plus className="h-4 w-4" />
                Nova receita
              </button>
            )}
          </div>
        </div>
      </section>

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard label="Contratada" value={formatarMoeda(totals.receitaContratada)} tone="accent" />
          <MetricCard label="Prevista" value={formatarMoeda(totals.receitaPrevista)} />
          <MetricCard label="Realizada" value={formatarMoeda(totals.receitaRealizada)} />
          <MetricCard label="Custo total" value={formatarMoeda(totals.custoTotal)} />
          <MetricCard
            label="Lucro bruto"
            value={formatarMoeda(totals.lucroBruto)}
            tone={totals.lucroBruto >= 0 ? "positive" : "negative"}
          />
        </div>
      )}

      {error && (
        <div className="wps-finance-alert-error rounded-xl border px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[color:var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando projetos…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed bg-[color:var(--surface)] px-6 py-14 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm font-medium text-[color:var(--foreground)]">
            {search.trim() ? "Nenhum projeto encontrado para a busca." : "Nenhum projeto disponível."}
          </p>
          {canCreateRevenue && !search.trim() && rows.length > 0 && (
            <button
              type="button"
              onClick={openNovaReceitaModal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Nova receita
            </button>
          )}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-2xl border bg-[color:var(--surface)] shadow-[0_8px_24px_rgba(41,19,73,0.04)]"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]"
                  style={{
                    borderColor: "var(--border)",
                    background:
                      "linear-gradient(180deg, color-mix(in srgb, var(--wps-purple-600) 6%, var(--surface)), var(--surface))",
                  }}
                >
                  <th className="px-4 py-3.5 font-semibold">Projeto</th>
                  <th className="px-4 py-3.5 font-semibold">Cliente</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Receitas</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Receita contratada</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Receita prevista</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Receita realizada</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Custo total</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Lucro bruto</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Margem</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Parcelas</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.projectId}
                    className="border-b last:border-b-0 transition-colors hover:bg-[color:var(--primary)]/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[color:var(--foreground)]">{row.projectName}</div>
                    </td>
                    <td className="px-4 py-3.5 text-[color:var(--muted-foreground)]">{row.clientName}</td>
                    <td className="px-4 py-3.5 text-center">
                      {row.quantidadeReceitas === 0 ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          Sem receitas
                        </span>
                      ) : (
                        <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-[color:var(--primary)]">
                          {row.quantidadeReceitas}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(row.receitaContratada)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(row.receitaPrevista)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(row.receitaRealizada)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(row.custoTotal)}</td>
                    <td
                      className={`px-4 py-3.5 text-right font-medium tabular-nums ${
                        row.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatarMoeda(row.lucroBruto)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatPercent(row.margemPercentual)}</td>
                    <td className="px-4 py-3.5 text-center tabular-nums">
                      {formatParcelas(row.parcelasReceita)}
                      {row.quantidadeReceitas > 1 && row.parcelasReceita != null && (
                        <span className="ml-1 text-[10px] text-[color:var(--muted-foreground)]">(máx.)</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Link
                        href={`${basePath}/financeiro/projetos/${row.projectId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/8 hover:border-[color:var(--primary)]/40"
                        style={{ borderColor: "color-mix(in srgb, var(--primary) 28%, var(--border))" }}
                        title="Editar ou visualizar receitas do projeto"
                        aria-label={`Editar / Visualizar — ${row.projectName}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Editar / Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t font-semibold"
                  style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--wps-purple-600) 4%, var(--surface))",
                  }}
                >
                  <td className="px-4 py-3.5" colSpan={3}>
                    Total ({filtered.length} {filtered.length === 1 ? "projeto" : "projetos"})
                    {margemTotal != null && (
                      <span className="ml-2 text-xs font-medium text-[color:var(--muted-foreground)]">
                        · Margem {formatPercent(margemTotal)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(totals.receitaContratada)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(totals.receitaPrevista)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(totals.receitaRealizada)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatarMoeda(totals.custoTotal)}</td>
                  <td
                    className={`px-4 py-3.5 text-right tabular-nums ${
                      totals.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {formatarMoeda(totals.lucroBruto)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatPercent(margemTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {novaReceitaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border bg-[color:var(--surface)] shadow-2xl"
            style={{ borderColor: "var(--border)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-receita-title"
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h3 id="nova-receita-title" className="text-sm font-semibold text-[color:var(--foreground)]">
                  Nova receita
                </h3>
                <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
                  Selecione o projeto para cadastrar a receita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNovaReceitaOpen(false)}
                className="rounded-lg p-1.5 text-[color:var(--muted-foreground)] transition hover:bg-black/5"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className={formModalLabelClass} htmlFor="nova-receita-search">
                  Buscar projeto
                </label>
                <input
                  id="nova-receita-search"
                  className={formModalInputClass()}
                  value={novaReceitaSearch}
                  onChange={(e) => setNovaReceitaSearch(e.target.value)}
                  placeholder="Nome do projeto ou cliente"
                />
              </div>
              <div>
                <label className={formModalLabelClass} htmlFor="nova-receita-project">
                  Projeto
                </label>
                <select
                  id="nova-receita-project"
                  className={formModalInputClass()}
                  value={novaReceitaProjectId}
                  onChange={(e) => setNovaReceitaProjectId(e.target.value)}
                >
                  {modalProjects.length === 0 ? (
                    <option value="">Nenhum projeto encontrado</option>
                  ) : (
                    modalProjects.map((row) => (
                      <option key={row.projectId} value={row.projectId}>
                        {row.projectName} — {row.clientName}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <div
              className="flex justify-end gap-2 border-t px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setNovaReceitaOpen(false)}
                className="rounded-xl border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!novaReceitaProjectId}
                onClick={confirmNovaReceita}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
