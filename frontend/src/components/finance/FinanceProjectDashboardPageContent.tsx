"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, LayoutDashboard, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";

type DashboardView = "completo" | "mensal";

type DashboardDetailRow = {
  id: string;
  label: string;
  hours: number | null;
  amount: number;
};

type DashboardExpandableRow = {
  id: string;
  label: string;
  amount: number;
  expandable: boolean;
  children: DashboardDetailRow[];
};

type ProjectFinancialDashboard = {
  projectId: string;
  projectName: string;
  view: DashboardView;
  year: number;
  month: number;
  periodLabel: string;
  receita: {
    valorTotal: DashboardExpandableRow;
    parcelas: number;
    valorParcela: number | null;
    reembolsoProjeto: DashboardExpandableRow;
    total: number;
  };
  despesa: {
    operacao: DashboardExpandableRow;
    despesasOperacionais: DashboardExpandableRow;
    despesaProjeto: DashboardExpandableRow;
    total: number;
  };
  impostos: {
    impostoFederal: DashboardExpandableRow;
    taxRatePercent: number | null;
    total: number;
  };
  resultado: {
    bruto: number;
    liquido: number;
  };
  notas: string[];
};

type FinanceProjectDashboardPageContentProps = {
  projectId: string;
};

function resultColor(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-600";
  return "text-[color:var(--foreground)]";
}

function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function ExpandableRow({
  row,
  expanded,
  onToggle,
}: {
  row: DashboardExpandableRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-1.5">
            {row.expandable ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[color:var(--muted)]/40"
                aria-expanded={expanded}
                aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                )}
              </button>
            ) : (
              <span className="inline-block h-6 w-6" />
            )}
            <span className="text-sm font-medium text-[color:var(--foreground)]">{row.label}</span>
          </div>
        </td>
        <td className="py-2.5 px-3 text-right text-sm text-[color:var(--muted-foreground)] tabular-nums">
          —
        </td>
        <td className="py-2.5 pl-3 text-right text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
          {formatarMoeda(row.amount)}
        </td>
      </tr>
      {expanded &&
        row.children.map((child) => (
          <tr key={child.id} className="bg-[color:var(--muted)]/10">
            <td className="py-2 pr-3 pl-10 text-sm text-[color:var(--muted-foreground)]">{child.label}</td>
            <td className="py-2 px-3 text-right text-sm tabular-nums text-[color:var(--muted-foreground)]">
              {child.hours != null ? `${formatHours(child.hours)} h` : "—"}
            </td>
            <td className="py-2 pl-3 text-right text-sm tabular-nums text-[color:var(--foreground)]">
              {formatarMoeda(child.amount)}
            </td>
          </tr>
        ))}
    </>
  );
}

function DashboardSection({
  title,
  total,
  children,
}: {
  title: string;
  total?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-[color:var(--surface)]/60 overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          {title}
        </h2>
        {total != null && (
          <span className="text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
            {formatarMoeda(total)}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] px-4">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <th className="py-2 pr-3 pl-4 text-left font-medium">Item</th>
              <th className="py-2 px-3 text-right font-medium">Quantidade</th>
              <th className="py-2 pl-3 pr-4 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="px-4">{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function StaticRow({
  label,
  value,
  quantity,
}: {
  label: string;
  value?: string;
  quantity?: string;
}) {
  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-2.5 pr-3 pl-10 text-sm text-[color:var(--foreground)]">{label}</td>
      <td className="py-2.5 px-3 text-right text-sm tabular-nums text-[color:var(--muted-foreground)]">
        {quantity ?? "—"}
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right text-sm font-medium tabular-nums text-[color:var(--foreground)]">
        {value ?? "—"}
      </td>
    </tr>
  );
}

export function FinanceProjectDashboardPageContent({ projectId }: FinanceProjectDashboardPageContentProps) {
  const router = useRouter();
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const projectsHref = `${basePath}/financeiro/projetos`;

  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<DashboardView>("completo");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ProjectFinancialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const canAccess = useMemo(
    () =>
      can("financeiro.projetos") ||
      can("financeiro.projetos.resultado") ||
      can("financeiro.projetos.receitas"),
    [can],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        projectId,
        view,
        year: String(year),
        month: String(month),
      });
      const r = await apiFetch(`/api/project-financial-result/dashboard?${params.toString()}`);
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar dashboard.");
      }
      setData(body as ProjectFinancialDashboard);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard do projeto.");
    } finally {
      setLoading(false);
    }
  }, [projectId, view, year, month]);

  useEffect(() => {
    if (!permissionsReady || !canAccess || !projectId) return;
    void load();
  }, [permissionsReady, canAccess, projectId, load]);

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push(projectsHref)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-4 md:px-6 py-4 md:py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-[color:var(--primary)]" />
            <h1 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]">
              {data?.projectName ?? "Dashboard do projeto"}
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-[color:var(--muted-foreground)]">
            Resultado por projeto — receita, despesa, impostos e margem (inclui change requests vinculados).
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 pt-8 md:pt-10 pb-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => setView("completo")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view === "completo"
                    ? "bg-[color:var(--primary)] text-white"
                    : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/30"
                }`}
              >
                Completo
              </button>
              <button
                type="button"
                onClick={() => setView("mensal")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view === "mensal"
                    ? "bg-[color:var(--primary)] text-white"
                    : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/30"
                }`}
              >
                Mensal
              </button>
            </div>

            {view === "mensal" && (
              <div className="flex items-center gap-2">
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="rounded-lg border bg-[color:var(--surface)] px-3 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {new Date(2024, index, 1).toLocaleDateString("pt-BR", { month: "long" })}
                    </option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="rounded-lg border bg-[color:var(--surface)] px-3 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  {Array.from({ length: 6 }, (_, index) => {
                    const y = now.getFullYear() - 2 + index;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
                {data?.periodLabel && (
                  <span className="text-xs text-[color:var(--muted-foreground)]">{data.periodLabel}</span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-[color:var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dashboard…
            </div>
          ) : data ? (
            <div className="flex flex-col gap-5">
              <DashboardSection title="Receita" total={data.receita.total}>
                <ExpandableRow
                  row={data.receita.valorTotal}
                  expanded={!!expanded[data.receita.valorTotal.id]}
                  onToggle={() => toggleExpanded(data.receita.valorTotal.id)}
                />
                <StaticRow label="Parcelas" quantity={String(data.receita.parcelas)} />
                <StaticRow
                  label="Valor parcela"
                  value={data.receita.valorParcela != null ? formatarMoeda(data.receita.valorParcela) : "—"}
                />
                <ExpandableRow
                  row={data.receita.reembolsoProjeto}
                  expanded={!!expanded[data.receita.reembolsoProjeto.id]}
                  onToggle={() => toggleExpanded(data.receita.reembolsoProjeto.id)}
                />
              </DashboardSection>

              <DashboardSection title="Despesa" total={data.despesa.total}>
                <ExpandableRow
                  row={data.despesa.operacao}
                  expanded={!!expanded[data.despesa.operacao.id]}
                  onToggle={() => toggleExpanded(data.despesa.operacao.id)}
                />
                <ExpandableRow
                  row={data.despesa.despesasOperacionais}
                  expanded={!!expanded[data.despesa.despesasOperacionais.id]}
                  onToggle={() => toggleExpanded(data.despesa.despesasOperacionais.id)}
                />
                <ExpandableRow
                  row={data.despesa.despesaProjeto}
                  expanded={!!expanded[data.despesa.despesaProjeto.id]}
                  onToggle={() => toggleExpanded(data.despesa.despesaProjeto.id)}
                />
              </DashboardSection>

              <DashboardSection title="Impostos" total={data.impostos.total}>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pr-3 pl-10 text-sm text-[color:var(--foreground)]">
                    {data.impostos.impostoFederal.label}
                    {data.impostos.taxRatePercent != null && (
                      <span className="ml-2 text-xs text-[color:var(--muted-foreground)]">
                        ({data.impostos.taxRatePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm text-[color:var(--muted-foreground)]">—</td>
                  <td className="py-2.5 pl-3 pr-4 text-right text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
                    {formatarMoeda(data.impostos.impostoFederal.amount)}
                  </td>
                </tr>
              </DashboardSection>

              <section
                className="rounded-xl border bg-[color:var(--surface)]/60 p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Resultado
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-xs text-[color:var(--muted-foreground)]">Resultado bruto</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${resultColor(data.resultado.bruto)}`}>
                      {formatarMoeda(data.resultado.bruto)}
                    </p>
                  </div>
                  <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-xs text-[color:var(--muted-foreground)]">Resultado líquido</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${resultColor(data.resultado.liquido)}`}>
                      {formatarMoeda(data.resultado.liquido)}
                    </p>
                  </div>
                </div>
              </section>

              {data.notas.length > 0 && (
                <ul
                  className="rounded-lg border p-4 text-xs text-[color:var(--muted-foreground)] space-y-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  {data.notas.map((nota) => (
                    <li key={nota}>• {nota}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
