"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardNavigateFinanceProjectRoute } from "@/lib/financeProjectRoute";
import { Eye, LayoutDashboard, Loader2, Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";

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

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full max-w-xs";

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatParcelas(value: number | null): string {
  if (value == null || value <= 0) return "—";
  return `${value}x`;
}

export function FinanceProjectsPageContent() {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
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

  const [rows, setRows] = useState<ProjectFinancialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projetos</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Visão financeira por projeto: receitas vinculadas, custos, parcelas e margem.
          </p>
        </div>
        <input
          type="search"
          placeholder="Buscar por projeto ou cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
      </div>

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
          className="rounded-xl border p-8 text-center text-sm text-[color:var(--muted-foreground)]"
          style={{ borderColor: "var(--border)" }}
        >
          {search.trim() ? "Nenhum projeto encontrado para a busca." : "Nenhum projeto disponível."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-full text-sm">
            <thead>
              <tr
                className="border-b bg-[color:var(--muted)]/40 text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="px-4 py-3 font-medium">Projeto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-center">Receitas</th>
                <th className="px-4 py-3 font-medium text-right">Receita contratada</th>
                <th className="px-4 py-3 font-medium text-right">Receita prevista</th>
                <th className="px-4 py-3 font-medium text-right">Receita realizada</th>
                <th className="px-4 py-3 font-medium text-right">Custo total</th>
                <th className="px-4 py-3 font-medium text-right">Lucro bruto</th>
                <th className="px-4 py-3 font-medium text-right">Margem</th>
                <th className="px-4 py-3 font-medium text-center">Parcelas</th>
                <th className="px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.projectId}
                  className="border-b last:border-b-0 hover:bg-[color:var(--muted)]/20"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3 font-medium">{row.projectName}</td>
                  <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{row.clientName}</td>
                  <td className="px-4 py-3 text-center">
                    {row.quantidadeReceitas === 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Sem receitas
                      </span>
                    ) : (
                      <span className="tabular-nums text-[color:var(--muted-foreground)]">
                        {row.quantidadeReceitas}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(row.receitaContratada)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(row.receitaPrevista)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(row.receitaRealizada)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(row.custoTotal)}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      row.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {formatarMoeda(row.lucroBruto)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.margemPercentual)}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {formatParcelas(row.parcelasReceita)}
                    {row.quantidadeReceitas > 1 && row.parcelasReceita != null && (
                      <span className="ml-1 text-[10px] text-[color:var(--muted-foreground)]">
                        (máx.)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <a
                        href={`${basePath}/financeiro/projetos/${row.projectId}/visualizar`}
                        onClick={(e) => {
                          e.preventDefault();
                          hardNavigateFinanceProjectRoute(
                            `${basePath}/financeiro/projetos/${row.projectId}/visualizar`,
                          );
                        }}
                        className="inline-flex items-center justify-center rounded-lg border p-2 text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/30 transition-colors"
                        style={{ borderColor: "var(--border)" }}
                        title="Visualizar"
                        aria-label="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </a>
                      <a
                        href={`${basePath}/financeiro/projetos/${row.projectId}/dashboard`}
                        onClick={(e) => {
                          e.preventDefault();
                          hardNavigateFinanceProjectRoute(
                            `${basePath}/financeiro/projetos/${row.projectId}/dashboard`,
                          );
                        }}
                        className="inline-flex items-center justify-center rounded-lg border p-2 text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/30 transition-colors"
                        style={{ borderColor: "var(--border)" }}
                        title="Dashboard"
                        aria-label="Dashboard"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                      </a>
                      <Link
                        href={`${basePath}/financeiro/projetos/${row.projectId}`}
                        className="inline-flex items-center justify-center rounded-lg border p-2 text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10 transition-colors"
                        style={{ borderColor: "var(--border)" }}
                        title="Receitas"
                        aria-label="Receitas"
                      >
                        <Receipt className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t bg-[color:var(--muted)]/30 font-semibold"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-4 py-3" colSpan={3}>
                  Total ({filtered.length} {filtered.length === 1 ? "projeto" : "projetos"})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(totals.receitaContratada)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(totals.receitaPrevista)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(totals.receitaRealizada)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(totals.custoTotal)}</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    totals.lucroBruto >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {formatarMoeda(totals.lucroBruto)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPercent(margemTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
