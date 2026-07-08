"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Loader2, Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";

type FinancialResult = {
  projectId: string;
  projectName: string;
  receitaContratada: number;
  receitaFaturada: number;
  receitaRecebida: number;
  custoHorasInternas: number | null;
  custoParceiros: number;
  custoReembolsos: number;
  custoDespesasDiretas: number;
  lucroBruto: number;
  margemPercentual: number | null;
  resultadoAcumulado: number;
  notas: string[];
};

type FinanceProjectDashboardPageContentProps = {
  projectId: string;
};

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
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
    <div className="rounded-xl border bg-[color:var(--surface)]/60 p-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{label}</p>
      <p className={`mt-2 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function FinanceProjectDashboardPageContent({ projectId }: FinanceProjectDashboardPageContentProps) {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () =>
      can("financeiro.projetos") ||
      can("financeiro.projetos.resultado") ||
      can("financeiro.projetos.receitas"),
    [can],
  );

  const [data, setData] = useState<FinancialResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(
        `/api/project-financial-result?projectId=${encodeURIComponent(projectId)}`,
      );
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar dashboard.");
      }
      setData(body as FinancialResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard do projeto.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess || !projectId) return;
    void load();
  }, [permissionsReady, canAccess, projectId, load]);

  const lucroHighlight =
    data && data.lucroBruto > 0 ? "positive" : data && data.lucroBruto < 0 ? "negative" : "neutral";

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${basePath}/financeiro/projetos`}
          className="inline-flex w-fit items-center gap-2 text-sm text-[color:var(--primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para projetos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-[color:var(--primary)]" />
              <h1 className="text-xl font-semibold">
                {data?.projectName ?? "Dashboard do projeto"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Resultado por projeto — receitas, custos e margem (inclui change requests vinculados).
            </p>
          </div>
          {can("financeiro.projetos.receitas") && (
            <Link
              href={`${basePath}/financeiro/projetos/${projectId}`}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[color:var(--muted)]/30"
              style={{ borderColor: "var(--border)" }}
            >
              <Receipt className="h-3.5 w-3.5" />
              Receitas do projeto
            </Link>
          )}
        </div>
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
        <div className="flex flex-col gap-8">
          <SectionBlock title="Receitas">
            <MetricCard label="Valor contratado" value={formatarMoeda(data.receitaContratada)} />
            <MetricCard label="Valor faturado" value={formatarMoeda(data.receitaFaturada)} />
            <MetricCard label="Valor recebido" value={formatarMoeda(data.receitaRecebida)} />
          </SectionBlock>

          <SectionBlock title="Custos">
            <MetricCard
              label="Horas internas"
              value={data.custoHorasInternas != null ? formatarMoeda(data.custoHorasInternas) : "N/D"}
            />
            <MetricCard label="Parceiros" value={formatarMoeda(data.custoParceiros)} />
            <MetricCard label="Reembolsos" value={formatarMoeda(data.custoReembolsos)} />
            <MetricCard label="Despesas diretas" value={formatarMoeda(data.custoDespesasDiretas)} />
          </SectionBlock>

          <SectionBlock title="Resultado">
            <MetricCard
              label="Lucro bruto"
              value={formatarMoeda(data.lucroBruto)}
              highlight={lucroHighlight}
            />
            <MetricCard label="Margem %" value={formatPercent(data.margemPercentual)} highlight={lucroHighlight} />
            <MetricCard
              label="Resultado acumulado"
              value={formatarMoeda(data.resultadoAcumulado)}
              highlight={lucroHighlight}
            />
          </SectionBlock>

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
  );
}
