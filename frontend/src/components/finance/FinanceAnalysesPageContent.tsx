"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
} from "@/components/reports/ReportsPrimitives";
import {
  defaultReportEnd,
  defaultReportStart,
  FinancialKpiCard,
  FinancialReportPeriodFilter,
} from "@/components/finance/FinancialReportShared";

type TabId =
  | "inOut"
  | "project"
  | "client"
  | "costCenter"
  | "expenses"
  | "consultant"
  | "margin";

const TABS: { id: TabId; label: string }[] = [
  { id: "inOut", label: "Entrada vs saída" },
  { id: "project", label: "Por projeto" },
  { id: "client", label: "Por cliente" },
  { id: "costCenter", label: "Por centro de custo" },
  { id: "expenses", label: "Despesas por categoria" },
  { id: "consultant", label: "Receita por consultor" },
  { id: "margin", label: "Margem por projeto" },
];

export function FinanceAnalysesPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "relatorios.financeiroAnalises"), [can]);
  const [start, setStart] = useState(defaultReportStart);
  const [end, setEnd] = useState(defaultReportEnd);
  const [tab, setTab] = useState<TabId>("inOut");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ start, end });
    apiFetch(`/api/reports/finance/analyses?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!controller.signal.aborted) setData(body);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [permissionsReady, canAccess, start, end]);

  if (!permissionsReady) return null;
  if (!canAccess) return <ReportsEmpty>Sem permissão.</ReportsEmpty>;

  const inOut = data?.inOut as Record<string, string> | undefined;

  function renderTable(headers: string[], rows: ReactNode[][]) {
    if (rows.length === 0) return <ReportsEmpty>Nenhum dado no período.</ReportsEmpty>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-b border-[color:var(--border)] last:border-0">
                {cells.map((cell, j) => (
                  <td key={j} className={`px-4 py-3 ${j > 0 ? "text-right tabular-nums" : "font-medium"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderTabContent() {
    if (!data) return null;
    if (tab === "inOut") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
          <FinancialKpiCard label="Entradas" value={inOut?.receitaFormatted ?? "—"} tone="positive" />
          <FinancialKpiCard label="Saídas" value={inOut?.despesaFormatted ?? "—"} tone="negative" />
          <FinancialKpiCard label="Saldo" value={inOut?.saldoFormatted ?? "—"} />
        </div>
      );
    }
    if (tab === "project") {
      const rows = (data.byProject as Array<Record<string, string>>) ?? [];
      return renderTable(
        ["Projeto", "Cliente", "Receita", "Despesa", "Resultado"],
        rows.map((r) => [r.projectName, r.clientName, r.receitaFormatted, r.despesaFormatted, r.resultadoFormatted]),
      );
    }
    if (tab === "client") {
      const rows = (data.byClient as Array<Record<string, string>>) ?? [];
      return renderTable(
        ["Cliente", "Resultado"],
        rows.map((r) => [r.clientName, r.resultadoFormatted]),
      );
    }
    if (tab === "costCenter") {
      const rows = (data.byCostCenter as Array<Record<string, string>>) ?? [];
      return renderTable(
        ["Centro de custo", "Resultado"],
        rows.map((r) => [r.costCenterName, r.resultadoFormatted]),
      );
    }
    if (tab === "expenses") {
      const rows = (data.expensesByCategory as Array<Record<string, string>>) ?? [];
      return renderTable(
        ["Categoria", "Valor"],
        rows.map((r) => [r.category, r.formatted]),
      );
    }
    if (tab === "consultant") {
      const rows = (data.revenueByConsultant as Array<Record<string, string>>) ?? [];
      return renderTable(
        ["Consultor", "Receita atribuída"],
        rows.map((r) => [r.userName, r.formatted]),
      );
    }
    const rows = (data.marginByProject as Array<Record<string, string>>) ?? [];
    return renderTable(
      ["Projeto", "Resultado", "Margem"],
      rows.map((r) => [r.projectName, r.resultadoFormatted, r.margemLabel]),
    );
  }

  return (
    <ReportsPageShell
      eyebrow="Financeiro"
      title="Análises financeiras"
      subtitle="Análises detalhadas por dimensão."
      chip="Análises"
    >
      <div className="space-y-4">
        <ReportsCard tone="filter">
          <div className="p-4">
            <FinancialReportPeriodFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          </div>
        </ReportsCard>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs border ${tab === t.id ? "bg-[color:var(--primary)] text-white border-transparent" : ""}`}
              style={tab === t.id ? undefined : { borderColor: "var(--border)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <ReportsEmpty>Carregando...</ReportsEmpty>
        ) : (
          <ReportsCard>{renderTabContent()}</ReportsCard>
        )}
      </div>
    </ReportsPageShell>
  );
}
