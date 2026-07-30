"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";

type FinancialResult = {
  projectId: string;
  projectName: string;
  horasPrevistas: number | null;
  horasRealizadas: number;
  receitaContratada: number;
  receitaPrevista: number;
  receitaRealizada: number;
  receitaFaturada: number;
  receitaRecebida: number;
  receitaConsumida: number;
  custoHorasInternas: number | null;
  custoReembolsos: number;
  custoDespesasDiretas: number;
  custoParceiros: number;
  custoTotal: number;
  lucroBruto: number;
  margemPercentual: number | null;
  resultadoAcumulado: number;
  consumoHorasPercentual: number | null;
  consumoReceitaPercentual: number | null;
  notas: string[];
};

type ProjectFinancialResultSectionProps = {
  projectId: string;
};

function formatHoras(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
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
      <p className={`mt-1 text-sm font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[color:var(--muted-foreground)]">{sub}</p>}
    </div>
  );
}

export function ProjectFinancialResultSection({ projectId }: ProjectFinancialResultSectionProps) {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.projetos.receitas"),
    [can],
  );

  const [data, setData] = useState<FinancialResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(
        `/api/project-financial-result?projectId=${encodeURIComponent(projectId)}`,
      );
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar resultado.");
      }
      setData(body as FinancialResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar resultado financeiro.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  if (!permissionsReady) return null;
  if (!canAccess) return null;

  const lucroHighlight =
    data && data.lucroBruto > 0 ? "positive" : data && data.lucroBruto < 0 ? "negative" : "neutral";

  return (
    <section
      className="rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Resultado financeiro do projeto
        </h2>
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          Medição de horas vs receita, custos diretos e margem (inclui projetos filhos / change requests).
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando indicadores...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Horas realizadas / previstas"
              value={`${formatHoras(data.horasRealizadas)} / ${formatHoras(data.horasPrevistas)}`}
              sub={data.consumoHorasPercentual != null ? `Consumo: ${formatPercent(data.consumoHorasPercentual)}` : undefined}
            />
            <MetricCard
              label="Receita contratada"
              value={formatarMoeda(data.receitaContratada)}
            />
            <MetricCard
              label="Receita prevista / realizada"
              value={`${formatarMoeda(data.receitaPrevista)} / ${formatarMoeda(data.receitaRealizada)}`}
              sub={
                data.consumoReceitaPercentual != null
                  ? `Receita consumida (proporcional): ${formatPercent(data.consumoReceitaPercentual)}`
                  : undefined
              }
            />
            <MetricCard
              label="Lucro bruto / margem"
              value={`${formatarMoeda(data.lucroBruto)} (${formatPercent(data.margemPercentual)})`}
              highlight={lucroHighlight}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Receita faturada (lançamentos)" value={formatarMoeda(data.receitaFaturada)} />
            <MetricCard label="Receita consumida (horas × previsto)" value={formatarMoeda(data.receitaConsumida)} />
            <MetricCard label="Custo reembolsos (pagos)" value={formatarMoeda(data.custoReembolsos)} />
            <MetricCard label="Custo despesas diretas" value={formatarMoeda(data.custoDespesasDiretas)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Custo total" value={formatarMoeda(data.custoTotal)} />
            <MetricCard
              label="Resultado acumulado"
              value={formatarMoeda(data.resultadoAcumulado)}
              highlight={lucroHighlight}
            />
            <MetricCard
              label="Custo horas internas"
              value={data.custoHorasInternas != null ? formatarMoeda(data.custoHorasInternas) : "N/D"}
            />
          </div>

          {data.notas.length > 0 && (
            <ul className="rounded-lg border p-3 text-xs text-[color:var(--muted-foreground)] space-y-1" style={{ borderColor: "var(--border)" }}>
              {data.notas.map((nota) => (
                <li key={nota}>• {nota}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
