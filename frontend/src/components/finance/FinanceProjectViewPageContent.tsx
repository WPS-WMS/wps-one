"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hardNavigateFinanceProjectRoute } from "@/lib/financeProjectRoute";
import {
  ArrowLeft,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  Receipt,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

const REVENUE_STATUSES = [
  { value: "NEGOCIACAO", label: "Em negociação" },
  { value: "ATIVO", label: "Ativo" },
  { value: "FINALIZADO", label: "Finalizado" },
  { value: "CANCELADO", label: "Cancelado" },
] as const;

type RevenueRow = {
  id: string;
  projectId: string;
  title: string | null;
  billingTypeId: string | null;
  billingTypeName: string | null;
  contractedValue: number | null;
  expectedRevenue: number | null;
  realizedRevenue: number | null;
  installmentCount: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isAdditive: boolean;
  historyCount: number;
};

type BillingTypeOption = {
  id: string;
  name: string;
  code: string;
};

type FinancialSummary = {
  projectName: string;
  receitaContratada: number;
  receitaPrevista: number;
  receitaRealizada: number;
  custoTotal: number;
  lucroBruto: number;
  margemPercentual: number | null;
};

type HistoryRow = {
  id: string;
  action: string;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type RevenueFormState = {
  title: string;
  billingTypeId: string;
  status: string;
  contractedValue: string;
  expectedRevenue: string;
  realizedRevenue: string;
  installmentCount: string;
  startDate: string;
  endDate: string;
  isAdditive: boolean;
};

function toInputDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formFromRevenue(row: RevenueRow): RevenueFormState {
  return {
    title: row.title ?? "",
    billingTypeId: row.billingTypeId ?? "",
    status: row.status,
    contractedValue: row.contractedValue != null ? String(row.contractedValue) : "",
    expectedRevenue: row.expectedRevenue != null ? String(row.expectedRevenue) : "",
    realizedRevenue: row.realizedRevenue != null ? String(row.realizedRevenue) : "",
    installmentCount: row.installmentCount != null ? String(row.installmentCount) : "",
    startDate: toInputDate(row.startDate),
    endDate: toInputDate(row.endDate),
    isAdditive: row.isAdditive,
  };
}

const emptyForm = (): RevenueFormState => ({
  title: "",
  billingTypeId: "",
  status: "NEGOCIACAO",
  contractedValue: "",
  expectedRevenue: "",
  realizedRevenue: "",
  installmentCount: "",
  startDate: "",
  endDate: "",
  isAdditive: false,
});

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--foreground)]">{value}</p>
    </div>
  );
}

type FinanceProjectViewPageContentProps = {
  projectId: string;
};

export function FinanceProjectViewPageContent({ projectId }: FinanceProjectViewPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { can, permissionsReady } = useAuth();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const projectsHref = `${basePath}/financeiro/projetos`;
  const receitasHref = `${basePath}/financeiro/projetos/${projectId}`;
  const dashboardHref = `${basePath}/financeiro/dashboard-projetos?projectId=${encodeURIComponent(projectId)}`;

  const canAccess = useMemo(
    () =>
      can("financeiro.projetos") ||
      can("financeiro.projetos.receitas") ||
      can("financeiro.projetos.contratos") ||
      can("financeiro.projetos.resultado"),
    [can],
  );
  const canEditRevenues = useMemo(() => can("financeiro.projetos.receitas"), [can]);

  const [projectName, setProjectName] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [billingTypes, setBillingTypes] = useState<BillingTypeOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<RevenueFormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectedRevenue = useMemo(
    () => revenues.find((row) => row.id === selectedId) ?? null,
    [revenues, selectedId],
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [projectRes, summaryRes, revRes, billingRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}?light=1`),
        apiFetch(`/api/project-financial-result?projectId=${encodeURIComponent(projectId)}`),
        can("financeiro.projetos.receitas")
          ? apiFetch(`/api/project-revenues?projectId=${encodeURIComponent(projectId)}`)
          : Promise.resolve(null),
        can("financeiro.projetos.receitas")
          ? apiFetch("/api/project-billing-types")
          : Promise.resolve(null),
      ]);

      const projectBody = await projectRes.json().catch(() => null);
      if (!projectRes.ok) {
        throw new Error(typeof projectBody?.error === "string" ? projectBody.error : "Projeto não encontrado.");
      }
      setProjectName(typeof projectBody?.name === "string" ? projectBody.name : "Projeto");
      setClientName(typeof projectBody?.client?.name === "string" ? projectBody.client.name : "—");

      const summaryBody = await summaryRes.json().catch(() => null);
      if (summaryRes.ok && summaryBody) {
        setSummary({
          projectName: summaryBody.projectName ?? projectBody?.name ?? "Projeto",
          receitaContratada: summaryBody.receitaContratada ?? 0,
          receitaPrevista: summaryBody.receitaPrevista ?? 0,
          receitaRealizada: summaryBody.receitaRealizada ?? 0,
          custoTotal: summaryBody.custoTotal ?? 0,
          lucroBruto: summaryBody.lucroBruto ?? 0,
          margemPercentual: summaryBody.margemPercentual ?? null,
        });
      } else {
        setSummary(null);
      }

      if (revRes) {
        const revBody = await revRes.json().catch(() => null);
        if (!revRes.ok) {
          throw new Error(typeof revBody?.error === "string" ? revBody.error : "Erro ao carregar receitas.");
        }
        const rows = Array.isArray(revBody) ? (revBody as RevenueRow[]) : [];
        setRevenues(rows);
        setSelectedId((current) => {
          if (rows.length === 0) {
            setForm(emptyForm());
            return null;
          }
          const keep = current && rows.some((row) => row.id === current) ? current : rows[0].id;
          const row = rows.find((item) => item.id === keep);
          if (row) setForm(formFromRevenue(row));
          return keep;
        });
      } else {
        setRevenues([]);
        setSelectedId(null);
        setForm(emptyForm());
      }

      if (billingRes) {
        const billingBody = await billingRes.json().catch(() => null);
        setBillingTypes(
          billingRes.ok && Array.isArray(billingBody)
            ? billingBody
                .filter((row: { isActive?: boolean }) => row.isActive !== false)
                .map((row: { id: string; name: string; code: string }) => ({
                  id: row.id,
                  name: row.name,
                  code: row.code,
                }))
            : [],
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [projectId, can]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  function selectRevenue(row: RevenueRow) {
    setSelectedId(row.id);
    setForm(formFromRevenue(row));
    setError(null);
  }

  function startNewRevenue() {
    setSelectedId(null);
    setForm(emptyForm());
    setError(null);
  }

  function buildPayload() {
    return {
      title: form.title.trim() || null,
      billingTypeId: form.billingTypeId || null,
      status: form.status,
      contractedValue: parseOptionalNumber(form.contractedValue),
      expectedRevenue: parseOptionalNumber(form.expectedRevenue),
      realizedRevenue: parseOptionalNumber(form.realizedRevenue),
      installmentCount: (() => {
        const trimmed = form.installmentCount.trim();
        if (!trimmed) return null;
        const n = Number.parseInt(trimmed, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      isAdditive: form.isAdditive,
    };
  }

  async function saveRevenue() {
    if (!canEditRevenues) return;
    setSaving(true);
    setError(null);
    const payload = buildPayload();

    if (!selectedId) {
      const r = await apiFetch("/api/project-revenues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...payload }),
      });
      const body = await r.json().catch(() => null);
      setSaving(false);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao criar receita.");
        return;
      }
      await load();
      if (body?.id) setSelectedId(body.id);
      return;
    }

    const r = await apiFetch(`/api/project-revenues/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar receita.");
      return;
    }
    await load();
  }

  async function cancelRevenue(id: string) {
    if (!window.confirm("Cancelar esta receita? A conta a receber vinculada também será cancelada.")) return;
    const r = await apiFetch(`/api/project-revenues/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar receita.");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function openHistory() {
    if (!selectedId) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    const r = await apiFetch(`/api/project-revenues/${selectedId}/history`);
    const body = await r.json().catch(() => null);
    setHistoryRows(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[color:var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando projeto…
      </div>
    );
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
          <h1 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]">{projectName}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Cliente: {clientName} · Contrato e receitas do projeto
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={receitasHref}
              onClick={(e) => {
                e.preventDefault();
                hardNavigateFinanceProjectRoute(receitasHref);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--muted)]/30"
              style={{ borderColor: "var(--border)" }}
            >
              <Receipt className="h-3.5 w-3.5" />
              Composição (Receitas)
            </a>
            <a
              href={dashboardHref}
              onClick={(e) => {
                e.preventDefault();
                router.push(dashboardHref);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--muted)]/30"
              style={{ borderColor: "var(--border)" }}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Resultado
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && (
            <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
          )}

          {summary && (
            <FormModalSection
              title="Resumo financeiro"
              description="Valores consolidados do projeto (inclui change requests vinculados)."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard label="Receita contratada" value={formatarMoeda(summary.receitaContratada)} />
                <SummaryCard label="Receita prevista" value={formatarMoeda(summary.receitaPrevista)} />
                <SummaryCard label="Receita realizada" value={formatarMoeda(summary.receitaRealizada)} />
                <SummaryCard label="Custo total" value={formatarMoeda(summary.custoTotal)} />
                <SummaryCard
                  label="Lucro bruto"
                  value={formatarMoeda(summary.lucroBruto)}
                />
                <SummaryCard
                  label="Margem"
                  value={
                    summary.margemPercentual != null
                      ? `${summary.margemPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                      : "—"
                  }
                />
              </div>
            </FormModalSection>
          )}

          {canEditRevenues && (
            <FormModalSection
              title="Receitas do projeto"
              description="Metadados do contrato: tipo de cobrança, status, valores e parcelamento. A composição detalhada fica em Receitas."
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {revenues.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => selectRevenue(row)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        selectedId === row.id
                          ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 font-medium"
                          : ""
                      }`}
                      style={{
                        borderColor: selectedId === row.id ? undefined : "var(--border)",
                      }}
                    >
                      {row.title || "Receita sem título"}
                      {row.isAdditive && " · Aditivo"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={startNewRevenue}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova receita
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={formModalLabelClass}>Título / identificação</label>
                  <input
                    className={formModalInputClass()}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex.: Contrato principal"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Tipo de cobrança</label>
                  <PopoverSelect
                    id="project-revenue-billing-type"
                    value={form.billingTypeId}
                    onChange={(v) => setForm((f) => ({ ...f, billingTypeId: v }))}
                    placeholder="Selecione…"
                    options={[
                      { value: "", label: "Selecione…" },
                      ...billingTypes.map((type) => ({ value: type.id, label: type.name })),
                    ]}
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Status</label>
                  <PopoverSelect
                    id="project-revenue-status"
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                    options={REVENUE_STATUSES.map((status) => ({ value: status.value, label: status.label }))}
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Parcelamento (nº de parcelas)</label>
                  <input
                    type="number"
                    min={0}
                    className={formModalInputClass()}
                    value={form.installmentCount}
                    onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))}
                    placeholder="Ex.: 4"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Valor contratado (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={formModalInputClass()}
                    value={form.contractedValue}
                    onChange={(e) => setForm((f) => ({ ...f, contractedValue: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Receita prevista (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={formModalInputClass()}
                    value={form.expectedRevenue}
                    onChange={(e) => setForm((f) => ({ ...f, expectedRevenue: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Receita realizada (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={formModalInputClass()}
                    value={form.realizedRevenue}
                    onChange={(e) => setForm((f) => ({ ...f, realizedRevenue: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Data início</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Data fim</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.isAdditive}
                  onChange={(e) => setForm((f) => ({ ...f, isAdditive: e.target.checked }))}
                  className="rounded border-[color:var(--border)]"
                />
                Receita aditiva (change request)
              </label>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void saveRevenue()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </button>
                {selectedRevenue && (
                  <>
                    <button
                      type="button"
                      onClick={() => void openHistory()}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <History className="h-4 w-4" />
                      Histórico
                      {selectedRevenue.historyCount > 0 && (
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          ({selectedRevenue.historyCount})
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void cancelRevenue(selectedRevenue.id)}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-red-600"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Cancelar
                    </button>
                  </>
                )}
              </div>

              {!selectedId && revenues.length === 0 && (
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Nenhuma receita cadastrada. Preencha os campos e clique em Salvar para criar a primeira.
                </p>
              )}
            </FormModalSection>
          )}
        </div>
      </main>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Histórico da receita</h3>
              <button type="button" onClick={() => setHistoryOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {historyLoading ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Carregando…</p>
            ) : historyRows.length === 0 ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Sem registros.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {historyRows.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg border p-3 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="font-medium">
                      {h.user.name} · {formatarData(h.createdAt)}
                    </p>
                    {h.details && <p className="mt-1 text-[color:var(--muted-foreground)]">{h.details}</p>}
                    {h.fieldLabel && (
                      <p className="mt-1">
                        {h.fieldLabel}: {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
