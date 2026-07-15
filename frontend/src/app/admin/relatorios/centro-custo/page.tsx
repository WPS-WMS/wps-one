"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";

type TabId = "visao" | "configurar";

type GroupRow = {
  id: string;
  name: string;
  code: string | null;
  orcadoCents?: number;
  realizadoCents?: number;
  receitaCents: number;
  despesaCents: number;
  saldoCents: number;
  consumoPercentual?: number | null;
  orcadoFormatted?: string;
  realizadoFormatted?: string;
  receitaFormatted: string;
  despesaFormatted: string;
  saldoFormatted: string;
  count: number;
};

type ReportData = {
  groups?: GroupRow[];
  totalOrcadoCents?: number;
  totalRealizadoCents?: number;
  totalReceitaCents?: number;
  totalDespesaCents?: number;
  saldoCents?: number;
};

type CostCenterOption = { id: string; name: string };

type BudgetRow = {
  costCenterId: string;
  name: string;
  code: string | null;
  months: Record<string, number>;
  yearTotalCents: number;
};

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function centsToInput(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function inputToCents(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function RelatorioCentroCustoPage() {
  const { can, permissionsReady } = useAuth();
  if (!permissionsReady) return null;
  if (!canFinanceFeature(can, "relatorios.financeiroCentroCusto")) {
    return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  }
  return <BudgetControlPageInner />;
}

function BudgetControlPageInner() {
  const [tab, setTab] = useState<TabId>("visao");

  return (
    <ReportsPageShell
      title="Controle de orçamento"
      subtitle="Configure o orçamento mensal por centro de custo e compare com o realizado."
    >
      <div className="flex gap-2 border-b mb-4" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "visao"
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : "border-transparent text-[color:var(--muted-foreground)]"
          }`}
          onClick={() => setTab("visao")}
        >
          Visão
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "configurar"
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : "border-transparent text-[color:var(--muted-foreground)]"
          }`}
          onClick={() => setTab("configurar")}
        >
          Configurar orçamento
        </button>
      </div>

      {tab === "visao" ? <VisaoTab /> : <ConfigurarTab />}
    </ReportsPageShell>
  );
}

function VisaoTab() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [costCenterId, setCostCenterId] = useState("");
  const [view, setView] = useState<"" | "ORCADO" | "REALIZADO">("");
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/cost-centers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) =>
        setCostCenters(
          Array.isArray(rows)
            ? rows.filter((c: CostCenterOption & { isActive?: boolean }) => c.isActive !== false)
            : [],
        ),
      )
      .catch(() => setCostCenters([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start, end });
    if (costCenterId) params.set("costCenterId", costCenterId);
    if (view) params.set("view", view);
    apiFetch(`/api/reports/finance/cost-centers?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [start, end, costCenterId, view]);

  const groups = data?.groups ?? [];
  const totalOrcado = data?.totalOrcadoCents ?? data?.totalReceitaCents ?? 0;
  const totalRealizado = data?.totalRealizadoCents ?? data?.totalDespesaCents ?? 0;

  return (
    <div className="space-y-4">
      <ReportsCard>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">
                Centro de custo
              </label>
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className={reportsSelectClass}
              >
                <option value="">Todos</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Exibir</label>
              <select
                value={view}
                onChange={(e) => setView(e.target.value as "" | "ORCADO" | "REALIZADO")}
                className={reportsSelectClass}
              >
                <option value="">Orçado e realizado</option>
                <option value="ORCADO">Somente orçado</option>
                <option value="REALIZADO">Somente realizado</option>
              </select>
            </div>
          </div>
        </div>
      </ReportsCard>

      {loading ? (
        <ReportsEmpty>Carregando...</ReportsEmpty>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
              <p className="text-[color:var(--muted-foreground)]">Orçado</p>
              <p className="text-lg font-semibold text-emerald-600 tabular-nums">{formatCents(totalOrcado)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
              <p className="text-[color:var(--muted-foreground)]">Realizado</p>
              <p className="text-lg font-semibold text-red-600 tabular-nums">{formatCents(totalRealizado)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
              <p className="text-[color:var(--muted-foreground)]">Saldo</p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--primary)" }}>
                {formatCents(data?.saldoCents ?? totalOrcado - totalRealizado)}
              </p>
            </div>
          </div>

          <ReportsCard>
            {groups.length === 0 ? (
              <ReportsEmpty>
                Nenhum orçamento ou despesa no período. Configure o orçamento na aba correspondente.
              </ReportsEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Centro de custo
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Orçado</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">
                        Realizado
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Saldo</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">
                        Consumo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.id} className="border-b border-[color:var(--border)] last:border-0">
                        <td className="px-4 py-3 font-medium">{g.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                          {g.orcadoFormatted ?? g.receitaFormatted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">
                          {g.realizadoFormatted ?? g.despesaFormatted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{g.saldoFormatted}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[color:var(--muted-foreground)]">
                          {g.consumoPercentual == null
                            ? "—"
                            : `${g.consumoPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportsCard>
        </>
      )}
    </div>
  );
}

function ConfigurarTab() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await apiFetch(`/api/cost-centers/budgets?year=${year}`);
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar orçamentos.");
      }
      const list = Array.isArray(body?.rows) ? (body.rows as BudgetRow[]) : [];
      setRows(list);
      const next: Record<string, string> = {};
      for (const row of list) {
        for (let m = 1; m <= 12; m += 1) {
          next[`${row.costCenterId}:${m}`] = centsToInput(row.months[String(m)] ?? 0);
        }
      }
      setDraft(next);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = nowYear - 2; y <= nowYear + 2; y += 1) opts.push(y);
    return opts;
  }, [nowYear]);

  function patchCell(costCenterId: string, month: number, value: string) {
    setDraft((prev) => ({ ...prev, [`${costCenterId}:${month}`]: value }));
    setSavedMsg(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    const items: { costCenterId: string; month: number; amountCents: number }[] = [];
    for (const row of rows) {
      for (let m = 1; m <= 12; m += 1) {
        const key = `${row.costCenterId}:${m}`;
        const amountCents = inputToCents(draft[key] ?? "");
        const original = row.months[String(m)] ?? 0;
        if (amountCents !== original) {
          items.push({ costCenterId: row.costCenterId, month: m, amountCents });
        }
      }
    }
    if (items.length === 0) {
      setSavedMsg("Nenhuma alteração para salvar.");
      setSaving(false);
      return;
    }
    try {
      const r = await apiFetch("/api/cost-centers/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, items }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao salvar orçamento.");
      }
      setSavedMsg("Orçamento salvo.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ReportsCard>
        <div className="p-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Ano</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={reportsSelectClass}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar orçamento
          </button>
        </div>
      </ReportsCard>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedMsg && <p className="text-sm text-emerald-700">{savedMsg}</p>}

      {loading ? (
        <ReportsEmpty>Carregando...</ReportsEmpty>
      ) : rows.length === 0 ? (
        <ReportsEmpty>Nenhum centro de custo ativo. Cadastre em Configurações → Financeiro.</ReportsEmpty>
      ) : (
        <ReportsCard>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-xs">
              <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[color:var(--surface)] px-3 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                    Centro de custo
                  </th>
                  {MONTH_LABELS.map((label) => (
                    <th
                      key={label}
                      className="px-2 py-3 text-right font-medium text-[color:var(--muted-foreground)] whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  let total = 0;
                  for (let m = 1; m <= 12; m += 1) {
                    total += inputToCents(draft[`${row.costCenterId}:${m}`] ?? "");
                  }
                  return (
                    <tr key={row.costCenterId} className="border-b border-[color:var(--border)] last:border-0">
                      <td className="sticky left-0 z-10 bg-[color:var(--surface)] px-3 py-2 font-medium whitespace-nowrap">
                        {row.name}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                        const key = `${row.costCenterId}:${month}`;
                        return (
                          <td key={month} className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-[88px] rounded-md border bg-transparent px-1.5 py-1 text-right tabular-nums"
                              style={{ borderColor: "var(--border)" }}
                              value={draft[key] ?? ""}
                              onChange={(e) => patchCell(row.costCenterId, month, e.target.value)}
                              placeholder="0,00"
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                        {formatCents(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportsCard>
      )}
    </div>
  );
}
