"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { History, Loader2, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import {
  draftToPayload,
  emptyCompositionState,
  mapApiToDraft,
  ProjectRevenueCompositionEditor,
  SaveButton,
  type TaxTypeOption,
} from "@/components/finance/ProjectRevenueCompositionEditor";
import type { BillingLineDraft, CostLineDraft } from "@/components/finance/projectRevenueCompositionUtils";

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
  autoBillingCalculation: boolean;
  taxTypeId: string | null;
  taxTypeName: string | null;
  taxRatePercent: number | null;
  costLines: Array<{ id: string; skill: string; hourlyRate: number; hours: number; totalValue: number }>;
  billingLines: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    amount: number;
  }>;
  historyCount: number;
};

type ChildProjectRow = {
  id: string;
  name: string;
  statusInicial: string;
  dataInicio: string;
  dataFimPrevista: string | null;
  createdAt: string;
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

type RevenueMetaState = {
  title: string;
  billingTypeId: string;
  status: string;
  realizedRevenue: string;
  isAdditive: boolean;
};

type ProjectRevenuesSectionProps = {
  projectId: string;
  financeContext?: boolean;
};

function metaFromRevenue(row: RevenueRow): RevenueMetaState {
  return {
    title: row.title ?? "",
    billingTypeId: row.billingTypeId ?? "",
    status: row.status,
    realizedRevenue: row.realizedRevenue != null ? String(row.realizedRevenue) : "",
    isAdditive: row.isAdditive,
  };
}

export function ProjectRevenuesSection({ projectId, financeContext = false }: ProjectRevenuesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.projetos.receitas"), [can]);
  const canCreateProject = useMemo(() => can("projeto.novo"), [can]);

  const projectDetailHref = useCallback(
    (id: string) =>
      financeContext
        ? `${basePath}/financeiro/projetos/${id}`
        : `${basePath}/projetos/${id}`,
    [basePath, financeContext],
  );

  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [children, setChildren] = useState<ChildProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meta, setMeta] = useState<RevenueMetaState>({
    title: "",
    billingTypeId: "",
    status: "NEGOCIACAO",
    realizedRevenue: "",
    isAdditive: false,
  });
  const [costLines, setCostLines] = useState<CostLineDraft[]>(emptyCompositionState().costLines);
  const [billingLines, setBillingLines] = useState<BillingLineDraft[]>(emptyCompositionState().billingLines);
  const [autoBillingCalculation, setAutoBillingCalculation] = useState(true);
  const [taxTypeId, setTaxTypeId] = useState("");
  const [taxTypes, setTaxTypes] = useState<TaxTypeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [crName, setCrName] = useState("");
  const [crSaving, setCrSaving] = useState(false);

  const selectedRevenue = useMemo(
    () => revenues.find((row) => row.id === selectedId) ?? null,
    [revenues, selectedId],
  );

  const loadEditorFromRevenue = useCallback((row: RevenueRow) => {
    const draft = mapApiToDraft(row);
    setMeta(metaFromRevenue(row));
    setCostLines(draft.costLines);
    setBillingLines(draft.billingLines);
    setAutoBillingCalculation(draft.autoBillingCalculation);
    setTaxTypeId(draft.taxTypeId);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const revRes = await apiFetch(`/api/project-revenues?projectId=${encodeURIComponent(projectId)}`);
      const revBody = await revRes.json().catch(() => null);
      if (!revRes.ok) {
        throw new Error(typeof revBody?.error === "string" ? revBody.error : "Erro ao carregar receitas.");
      }
      const rows = Array.isArray(revBody) ? (revBody as RevenueRow[]) : [];
      setRevenues(rows);

      if (!financeContext) {
        const childRes = await apiFetch(`/api/projects/${projectId}/child-projects`);
        const childBody = await childRes.json().catch(() => null);
        setChildren(childRes.ok && Array.isArray(childBody) ? childBody : []);
      } else {
        setChildren([]);
      }
      setSelectedId((current) => {
        if (rows.length === 0) {
          const empty = emptyCompositionState();
          setMeta({
            title: "",
            billingTypeId: "",
            status: "NEGOCIACAO",
            realizedRevenue: "",
            isAdditive: false,
          });
          setCostLines(empty.costLines);
          setBillingLines(empty.billingLines);
          setAutoBillingCalculation(empty.autoBillingCalculation);
          setTaxTypeId(empty.taxTypeId);
          return null;
        }
        const keep = current && rows.some((row) => row.id === current) ? current : rows[0].id;
        const row = rows.find((item) => item.id === keep);
        if (row) loadEditorFromRevenue(row);
        return keep;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [projectId, financeContext, loadEditorFromRevenue]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void (async () => {
      const r = await apiFetch("/api/tax-types");
      const body = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(body)) {
        setTaxTypes([]);
        return;
      }
      setTaxTypes(
        body
          .filter((row: { isActive?: boolean }) => row.isActive !== false)
          .map((row: { id: string; name: string; ratePercent: number | null }) => ({
            id: row.id,
            name: row.name,
            ratePercent: row.ratePercent,
          })),
      );
    })();
  }, [permissionsReady, canAccess]);

  function selectRevenue(row: RevenueRow) {
    setSelectedId(row.id);
    loadEditorFromRevenue(row);
    setError(null);
  }

  async function saveRevenue() {
    setSaving(true);
    setError(null);
    const composition = draftToPayload(costLines, billingLines, autoBillingCalculation, taxTypeId);
    const payload = {
      title: meta.title.trim() || null,
      billingTypeId: meta.billingTypeId || null,
      status: meta.status,
      realizedRevenue: meta.realizedRevenue !== "" ? Number(meta.realizedRevenue) : null,
      isAdditive: meta.isAdditive,
      ...composition,
    };

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
      if (body?.id) {
        setSelectedId(body.id);
        loadEditorFromRevenue(body as RevenueRow);
      }
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
    if (body?.id) {
      setSelectedId(body.id);
      loadEditorFromRevenue(body as RevenueRow);
    }
  }

  async function deleteRevenue(id: string) {
    if (!window.confirm("Excluir esta receita?")) return;
    const r = await apiFetch(`/api/project-revenues/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir receita.");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function openHistory(revenueId: string) {
    setHistoryOpen(revenueId);
    setHistoryLoading(true);
    const r = await apiFetch(`/api/project-revenues/${revenueId}/history`);
    const body = await r.json().catch(() => null);
    setHistoryRows(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  async function createChangeRequest() {
    const name = crName.trim();
    if (!name) {
      setError("Nome do change request é obrigatório.");
      return;
    }
    setCrSaving(true);
    setError(null);
    const r = await apiFetch(`/api/projects/${projectId}/child-projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dataInicio: new Date().toISOString() }),
    });
    const body = await r.json().catch(() => null);
    setCrSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar change request.");
      return;
    }
    setCrModalOpen(false);
    setCrName("");
    if (financeContext && body?.id) {
      router.push(projectDetailHref(String(body.id)));
      return;
    }
    await load();
  }

  if (!permissionsReady) return null;
  if (!canAccess) return null;

  const saveActions = (
    <div className="flex flex-wrap items-center gap-2">
      {selectedRevenue && (
        <>
          <button
            type="button"
            onClick={() => void openHistory(selectedRevenue.id)}
            className="rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <History className="h-3.5 w-3.5 inline" />
          </button>
          <button
            type="button"
            onClick={() => void deleteRevenue(selectedRevenue.id)}
            className="rounded-lg border px-2.5 py-1.5 text-xs text-red-600"
            style={{ borderColor: "var(--border)" }}
          >
            <Trash2 className="h-3.5 w-3.5 inline" />
          </button>
        </>
      )}
      <SaveButton saving={saving} onClick={() => void saveRevenue()} />
    </div>
  );

  return (
    <>
      <section
        className={
          financeContext
            ? "rounded-2xl border p-3 md:p-4 space-y-3 w-full bg-[color:var(--surface)]/80 backdrop-blur"
            : "rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        }
        style={{ borderColor: "var(--border)" }}
      >
        {!financeContext && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Receita do projeto
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Composição de custos e faturamento por parcelas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedRevenue && (
              <>
                <button
                  type="button"
                  onClick={() => void openHistory(selectedRevenue.id)}
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  <History className="h-3.5 w-3.5 inline" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteRevenue(selectedRevenue.id)}
                  className="rounded-lg border px-3 py-2 text-xs text-red-600"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Trash2 className="h-3.5 w-3.5 inline" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const empty = emptyCompositionState();
                setSelectedId(null);
                setMeta({
                  title: "",
                  billingTypeId: "",
                  status: "NEGOCIACAO",
                  realizedRevenue: "",
                  isAdditive: false,
                });
                setCostLines(empty.costLines);
                setBillingLines(empty.billingLines);
                setAutoBillingCalculation(empty.autoBillingCalculation);
                setTaxTypeId(empty.taxTypeId);
                setError(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-4 w-4" />
              Nova receita
            </button>
            <SaveButton saving={saving} onClick={() => void saveRevenue()} />
          </div>
        </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Carregando receitas...</p>
        ) : (
          <>
            {revenues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {revenues.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRevenue(row)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      selectedId === row.id ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 font-medium" : ""
                    }`}
                    style={{ borderColor: selectedId === row.id ? undefined : "var(--border)" }}
                  >
                    {row.title || "Receita sem título"}
                    {row.isAdditive && " · Aditivo"}
                  </button>
                ))}
              </div>
            )}

            <ProjectRevenueCompositionEditor
              costLines={costLines}
              billingLines={billingLines}
              autoBillingCalculation={autoBillingCalculation}
              taxTypeId={taxTypeId}
              taxTypes={taxTypes}
              impostosConfigHref={`${basePath}/configuracoes/financeiro/impostos`}
              onCostLinesChange={setCostLines}
              onBillingLinesChange={setBillingLines}
              onAutoBillingChange={setAutoBillingCalculation}
              onTaxTypeChange={setTaxTypeId}
              compact={financeContext}
              headerActions={financeContext ? saveActions : undefined}
            />
          </>
        )}
      </section>

      {!financeContext && (
      <section
        className="rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Change requests (projetos filhos)
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Projetos vinculados a este escopo para aditivos e extensões.
            </p>
          </div>
          {canCreateProject && (
            <button
              type="button"
              onClick={() => setCrModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-4 w-4" />
              Novo change request
            </button>
          )}
        </div>
        {children.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Nenhum projeto filho vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold">Início</th>
                  <th className="px-3 py-2 text-left font-semibold">Término previsto</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {children.map((child) => (
                  <tr
                    key={child.id}
                    className="border-t cursor-pointer hover:bg-black/5"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => router.push(projectDetailHref(child.id))}
                  >
                    <td className="px-3 py-2 font-medium text-[color:var(--primary)]">{child.name}</td>
                    <td className="px-3 py-2">{formatarData(child.dataInicio)}</td>
                    <td className="px-3 py-2">{formatarData(child.dataFimPrevista)}</td>
                    <td className="px-3 py-2">{child.statusInicial}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {!financeContext && crModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Novo change request</h3>
              <button type="button" onClick={() => setCrModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4">
              <label className={formModalLabelClass}>Nome do projeto filho</label>
              <input className={formModalInputClass()} value={crName} onChange={(e) => setCrName(e.target.value)} placeholder="Ex: CR — Módulo relatórios" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCrModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Cancelar</button>
              <button type="button" onClick={() => void createChangeRequest()} disabled={crSaving} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {crSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Histórico da receita</h3>
              <button type="button" onClick={() => setHistoryOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            {historyLoading ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Carregando...</p>
            ) : historyRows.length === 0 ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Sem registros.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {historyRows.map((h) => (
                  <li key={h.id} className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                    <p className="font-medium">{h.user.name} · {formatarData(h.createdAt)}</p>
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
    </>
  );
}
