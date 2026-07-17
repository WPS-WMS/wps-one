"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

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
  /** Quando true, omite botão voltar e cabeçalho próprio (usado no hub). */
  embedded?: boolean;
};

const tableClass = "min-w-full text-xs border rounded-xl overflow-hidden";
const thClass = "px-3 py-2 text-left font-semibold whitespace-nowrap";
const tdClass = "px-3 py-2 align-middle";
const rowBorder = { borderColor: "var(--border)" } as const;

function resultColor(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-600";
  return "text-[color:var(--foreground)]";
}

function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function RowLabel({
  label,
  expandable,
  expanded,
  onToggle,
  indent = false,
  suffix,
}: {
  label: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  indent?: boolean;
  suffix?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1 ${indent ? "pl-7" : ""}`}>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[color:var(--muted)]/40"
          aria-expanded={expanded}
          aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
          )}
        </button>
      ) : (
        <span className="inline-block h-5 w-5 shrink-0" />
      )}
      <span className="text-[color:var(--foreground)]">
        {label}
        {suffix}
      </span>
    </div>
  );
}

function ExpandableRow({
  row,
  expanded,
  onToggle,
  suffix,
}: {
  row: DashboardExpandableRow;
  expanded: boolean;
  onToggle: () => void;
  suffix?: ReactNode;
}) {
  return (
    <>
      <tr className="border-t" style={rowBorder}>
        <td className={tdClass}>
          <RowLabel
            label={row.label}
            expandable={row.expandable}
            expanded={expanded}
            onToggle={onToggle}
            suffix={suffix}
          />
        </td>
        <td className={`${tdClass} text-right tabular-nums text-[color:var(--muted-foreground)]`}>—</td>
        <td className={`${tdClass} text-right font-semibold tabular-nums`}>{formatarMoeda(row.amount)}</td>
      </tr>
      {expanded &&
        row.children.map((child) => (
          <tr key={child.id} style={{ background: "rgba(0,0,0,0.02)" }}>
            <td className={tdClass}>
              <RowLabel label={child.label} indent />
            </td>
            <td className={`${tdClass} text-right tabular-nums text-[color:var(--muted-foreground)]`}>
              {child.hours != null ? `${formatHours(child.hours)} h` : "—"}
            </td>
            <td className={`${tdClass} text-right tabular-nums`}>{formatarMoeda(child.amount)}</td>
          </tr>
        ))}
    </>
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
    <tr className="border-t" style={rowBorder}>
      <td className={tdClass}>
        <RowLabel label={label} />
      </td>
      <td className={`${tdClass} text-right tabular-nums text-[color:var(--muted-foreground)]`}>
        {quantity ?? "—"}
      </td>
      <td className={`${tdClass} text-right font-medium tabular-nums`}>{value ?? "—"}</td>
    </tr>
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
    <section
      className="rounded-2xl border p-3 md:p-4 space-y-3 w-full bg-[color:var(--surface)]/80 backdrop-blur"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-3">
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
        <table className={tableClass} style={rowBorder}>
          <thead style={{ background: "rgba(0,0,0,0.04)" }}>
            <tr>
              <th className={thClass}>Item</th>
              <th className={`${thClass} text-right`}>Quantidade</th>
              <th className={`${thClass} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative" | "neutral";
}) {
  const color =
    highlight === "positive"
      ? "text-emerald-700"
      : highlight === "negative"
        ? "text-red-600"
        : "text-[color:var(--foreground)]";
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs text-[color:var(--muted-foreground)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function FinanceProjectDashboardPageContent({
  projectId,
  embedded = false,
}: FinanceProjectDashboardPageContentProps) {
  const router = useRouter();
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const projectsHref = `${basePath}/financeiro/dashboard-projetos`;

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

  const lucroHighlight =
    data && data.resultado.bruto > 0
      ? "positive"
      : data && data.resultado.bruto < 0
        ? "negative"
        : "neutral";
  const liquidoHighlight =
    data && data.resultado.liquido > 0
      ? "positive"
      : data && data.resultado.liquido < 0
        ? "negative"
        : "neutral";

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className={embedded ? "min-h-0" : "flex-1 flex flex-col min-h-0 bg-[color:var(--background)]"}>
      {!embedded && (
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
      )}

      {!embedded && (
        <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-4 md:px-6 py-4 md:py-5">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]">
              {data?.projectName ?? "Resultado de projeto"}
            </h1>
            <p className="mt-1.5 text-sm text-[color:var(--muted-foreground)]">
              Resultado por projeto — receita, despesa, impostos e margem (inclui change requests vinculados).
            </p>
          </div>
        </header>
      )}

      <main className={embedded ? "min-h-0" : "flex-1 px-4 md:px-6 pt-8 md:pt-10 pb-4 min-h-0 overflow-auto"}>
        <div className={embedded ? "space-y-3" : "max-w-6xl mx-auto space-y-3"}>
          <section
            className="rounded-2xl border p-3 md:p-4 bg-[color:var(--surface)]/80 backdrop-blur"
            style={{ borderColor: "var(--border)" }}
          >
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
                <div className="flex flex-wrap items-center gap-2">
                  <PopoverSelect
                    id="project-dashboard-month"
                    value={String(month)}
                    onChange={(v) => setMonth(Number(v))}
                    options={Array.from({ length: 12 }, (_, index) => ({
                      value: String(index + 1),
                      label: new Date(2024, index, 1).toLocaleDateString("pt-BR", { month: "long" }),
                    }))}
                  />
                  <PopoverSelect
                    id="project-dashboard-year"
                    value={String(year)}
                    onChange={(v) => setYear(Number(v))}
                    options={Array.from({ length: 6 }, (_, index) => {
                      const y = now.getFullYear() - 2 + index;
                      return { value: String(y), label: String(y) };
                    })}
                  />
                  {data?.periodLabel && (
                    <span className="text-xs text-[color:var(--muted-foreground)]">{data.periodLabel}</span>
                  )}
                </div>
              )}
            </div>
          </section>

          {error && (
            <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-xs text-[color:var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dashboard…
            </div>
          ) : data ? (
            <div className="space-y-3">
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
                <ExpandableRow
                  row={data.impostos.impostoFederal}
                  expanded={!!expanded[data.impostos.impostoFederal.id]}
                  onToggle={() => toggleExpanded(data.impostos.impostoFederal.id)}
                  suffix={
                    data.impostos.taxRatePercent != null ? (
                      <span className="ml-1.5 text-[10px] text-[color:var(--muted-foreground)]">
                        ({data.impostos.taxRatePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)
                      </span>
                    ) : null
                  }
                />
              </DashboardSection>

              <section
                className="rounded-2xl border p-3 md:p-4 space-y-3 w-full bg-[color:var(--surface)]/80 backdrop-blur"
                style={{ borderColor: "var(--border)" }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Resultado
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    label="Resultado bruto"
                    value={formatarMoeda(data.resultado.bruto)}
                    highlight={lucroHighlight}
                  />
                  <MetricCard
                    label="Resultado líquido"
                    value={formatarMoeda(data.resultado.liquido)}
                    highlight={liquidoHighlight}
                  />
                </div>
              </section>

              {data.notas.length > 0 && (
                <ul
                  className="rounded-2xl border p-3 md:p-4 text-xs text-[color:var(--muted-foreground)] space-y-1 bg-[color:var(--surface)]/80 backdrop-blur"
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
