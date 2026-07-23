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
import {
  FinancePageHeader,
  financePrimaryBtnClass,
  financePrimaryBtnStyle,
} from "@/components/finance/FinancePageHeader";

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
      className="rounded-xl border bg-[color:var(--surface)] px-3.5 py-2.5"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-[color:var(--muted-foreground)]">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold leading-snug tabular-nums ${valueClass}`}>{value}</p>
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
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <FinancePageHeader
        title="Projetos"
        subtitle="Visão financeira por projeto: receitas vinculadas, custos, parcelas e margem."
        actions={
          <>
            <label className="relative block min-w-0 flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
              <input
                type="search"
                placeholder="Buscar por projeto ou cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] py-0 pl-9 pr-3 text-sm outline-none transition focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/15"
              />
            </label>
            {canCreateRevenue && (
              <button
                type="button"
                onClick={openNovaReceitaModal}
                className={financePrimaryBtnClass}
                style={financePrimaryBtnStyle}
              >
                <Plus className="h-4 w-4" />
                Nova receita
              </button>
            )}
          </>
        }
      />

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
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
        <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[color:var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando projetos…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed bg-[color:var(--surface)] px-6 py-12 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {search.trim() ? "Nenhum projeto encontrado para a busca." : "Nenhum projeto disponível."}
          </p>
          {canCreateRevenue && !search.trim() && rows.length > 0 && (
            <button
              type="button"
              onClick={openNovaReceitaModal}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3.5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Nova receita
            </button>
          )}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border bg-[color:var(--surface)]"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[color:var(--muted-foreground)]"
                  style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--wps-purple-600) 4%, var(--surface))",
                  }}
                >
                  <th className="px-3.5 py-2.5">Projeto</th>
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5 text-center">Receitas</th>
                  <th className="px-3.5 py-2.5 text-right">Receita contratada</th>
                  <th className="px-3.5 py-2.5 text-right">Receita prevista</th>
                  <th className="px-3.5 py-2.5 text-right">Receita realizada</th>
                  <th className="px-3.5 py-2.5 text-right">Custo total</th>
                  <th className="px-3.5 py-2.5 text-right">Lucro bruto</th>
                  <th className="px-3.5 py-2.5 text-right">Margem</th>
                  <th className="px-3.5 py-2.5 text-center">Parcelas</th>
                  <th className="px-3.5 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.projectId}
                    className="border-b last:border-b-0 transition-colors hover:bg-[color:var(--primary)]/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium leading-snug text-[color:var(--foreground)]">
                        {row.projectName}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 leading-snug text-[color:var(--muted-foreground)]">
                      {row.clientName}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      {row.quantidadeReceitas === 0 ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                          Sem receitas
                        </span>
                      ) : (
                        <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[color:var(--primary)]/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--primary)]">
                          {row.quantidadeReceitas}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(row.receitaContratada)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(row.receitaPrevista)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(row.receitaRealizada)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(row.custoTotal)}</td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-medium tabular-nums ${
                        row.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatarMoeda(row.lucroBruto)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{formatPercent(row.margemPercentual)}</td>
                    <td className="px-3.5 py-2.5 text-center tabular-nums text-[color:var(--muted-foreground)]">
                      {formatParcelas(row.parcelasReceita)}
                      {row.quantidadeReceitas > 1 && row.parcelasReceita != null && (
                        <span className="ml-1 text-[10px]">(máx.)</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <Link
                        href={`${basePath}/financeiro/projetos/${row.projectId}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/8 hover:border-[color:var(--primary)]/35"
                        style={{ borderColor: "color-mix(in srgb, var(--primary) 25%, var(--border))" }}
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
                  className="border-t text-sm font-semibold"
                  style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--wps-purple-600) 3%, var(--surface))",
                  }}
                >
                  <td className="px-3.5 py-2.5" colSpan={3}>
                    Total ({filtered.length} {filtered.length === 1 ? "projeto" : "projetos"})
                    {margemTotal != null && (
                      <span className="ml-2 text-xs font-medium text-[color:var(--muted-foreground)]">
                        · Margem {formatPercent(margemTotal)}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(totals.receitaContratada)}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(totals.receitaPrevista)}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(totals.receitaRealizada)}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{formatarMoeda(totals.custoTotal)}</td>
                  <td
                    className={`px-3.5 py-2.5 text-right tabular-nums ${
                      totals.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {formatarMoeda(totals.lucroBruto)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{formatPercent(margemTotal)}</td>
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
            className="w-full max-w-md overflow-hidden rounded-xl border bg-[color:var(--surface)] shadow-xl"
            style={{ borderColor: "var(--border)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-receita-title"
          >
            <div
              className="flex items-start justify-between gap-3 border-b px-4 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h3 id="nova-receita-title" className="text-sm font-semibold text-[color:var(--foreground)]">
                  Nova receita
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                  Selecione o projeto para cadastrar a receita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNovaReceitaOpen(false)}
                className="rounded-md p-1 text-[color:var(--muted-foreground)] transition hover:bg-black/5"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3.5">
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
              className="flex justify-end gap-2 border-t px-4 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setNovaReceitaOpen(false)}
                className="inline-flex h-9 items-center rounded-lg border px-3.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!novaReceitaProjectId}
                onClick={confirmNovaReceita}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3.5 text-sm font-medium text-white disabled:opacity-50"
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
