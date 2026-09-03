"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, History, Loader2, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  draftToPayload,
  emptyCompositionState,
  mapApiToDraft,
  ProjectRevenueCompositionEditor,
  SaveButton,
  type TaxTypeOption,
} from "@/components/finance/ProjectRevenueCompositionEditor";
import {
  sumBillingLines,
  type BillingLineDraft,
  type CostLineDraft,
} from "@/components/finance/projectRevenueCompositionUtils";
import { ProjectRevenueTaxSelector } from "@/components/finance/ProjectRevenueTaxSelector";
import {
  emptyVariableRevenueEntry,
  mapVariableEntriesToDraft,
  ProjectVariableRevenueEditor,
  variableEntriesToPayload,
  type VariableRevenueEntryApi,
  type VariableRevenueEntryDraft,
} from "@/components/finance/ProjectVariableRevenueEditor";

type RevenueRow = {
  id: string;
  projectId: string;
  title: string | null;
  revenueType: "FIXA" | "VARIAVEL";
  contractProposal: string | null;
  paymentMethod: "PIX" | "BOLETO" | "TED" | null;
  clientHourlyRate?: number | null;
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
  costLines: Array<{ id: string; skill: string; hourlyRate: number; hours: number; totalValue: number; isDiscount?: boolean }>;
  billingLines: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    expectedPaymentDate?: string | null;
    amount: number;
  }>;
  historyCount: number;
  variableEntries: VariableRevenueEntryApi[];
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
  revenueType: "FIXA" | "VARIAVEL";
  contractProposal: string;
  paymentMethod: "" | "PIX" | "BOLETO" | "TED";
  clientHourlyRate: string;
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
    revenueType: row.revenueType ?? "FIXA",
    contractProposal: row.contractProposal ?? "",
    paymentMethod: row.paymentMethod ?? "",
    clientHourlyRate: row.clientHourlyRate != null ? String(row.clientHourlyRate) : "",
    billingTypeId: row.billingTypeId ?? "",
    status: row.status,
    realizedRevenue: row.realizedRevenue != null ? String(row.realizedRevenue) : "",
    isAdditive: row.isAdditive,
  };
}

function nextRevenueTitle(rows: Array<{ title: string | null }>): string {
  let max = rows.length;
  for (const row of rows) {
    const match = /^Receita\s+(\d+)$/i.exec((row.title ?? "").trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Receita ${max + 1}`;
}

export function ProjectRevenuesSection({ projectId, financeContext = false }: ProjectRevenuesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  /** Em contexto financeiro: lista primeiro; editor só ao criar/editar. */
  const [editorOpen, setEditorOpen] = useState(!financeContext);
  const [isCreating, setIsCreating] = useState(false);
  const pendingNovaRef = useRef(false);
  const isCreatingRef = useRef(false);
  const editorOpenRef = useRef(!financeContext);

  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

  useEffect(() => {
    editorOpenRef.current = editorOpen;
  }, [editorOpen]);
  const [meta, setMeta] = useState<RevenueMetaState>({
    title: "",
    revenueType: "FIXA",
    contractProposal: "",
    paymentMethod: "",
    clientHourlyRate: "",
    billingTypeId: "",
    status: "NEGOCIACAO",
    realizedRevenue: "",
    isAdditive: false,
  });
  const [costLines, setCostLines] = useState<CostLineDraft[]>(emptyCompositionState().costLines);
  const [billingLines, setBillingLines] = useState<BillingLineDraft[]>(emptyCompositionState().billingLines);
  const [autoBillingCalculation, setAutoBillingCalculation] = useState(true);
  const [taxTypeId, setTaxTypeId] = useState("");
  const [variableEntries, setVariableEntries] = useState<VariableRevenueEntryDraft[]>([
    emptyVariableRevenueEntry(),
  ]);
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
  const variableBillingTotal = useMemo(
    () =>
      Math.round(
        variableEntries.reduce((sum, entry) => sum + sumBillingLines(entry.billingLines), 0) * 100,
      ) / 100,
    [variableEntries],
  );

  const loadEditorFromRevenue = useCallback((row: RevenueRow) => {
    const draft = mapApiToDraft(row);
    setMeta(metaFromRevenue(row));
    setCostLines(draft.costLines);
    setBillingLines(draft.billingLines);
    setAutoBillingCalculation(draft.autoBillingCalculation);
    setTaxTypeId(draft.taxTypeId);
    setVariableEntries(mapVariableEntriesToDraft(row.variableEntries));
  }, []);

  const resetEmptyEditor = useCallback((title = "") => {
    const empty = emptyCompositionState();
    setSelectedId(null);
    setMeta({
      title,
      revenueType: "FIXA",
      contractProposal: "",
      paymentMethod: "",
      clientHourlyRate: "",
      billingTypeId: "",
      status: "NEGOCIACAO",
      realizedRevenue: "",
      isAdditive: false,
    });
    setCostLines(empty.costLines);
    setBillingLines(empty.billingLines);
    setAutoBillingCalculation(empty.autoBillingCalculation);
    setTaxTypeId(empty.taxTypeId);
    setVariableEntries([emptyVariableRevenueEntry()]);
    setError(null);
  }, []);

  const startCreate = useCallback(() => {
    resetEmptyEditor(nextRevenueTitle(revenues));
    isCreatingRef.current = true;
    editorOpenRef.current = true;
    setIsCreating(true);
    setEditorOpen(true);
  }, [resetEmptyEditor, revenues]);

  useEffect(() => {
    if (!financeContext) return;
    if (searchParams.get("nova") === "1") {
      pendingNovaRef.current = true;
      router.replace(pathname, { scroll: false });
    }
  }, [financeContext, searchParams, router, pathname]);

  const load = useCallback(async (options?: { preferSelectedId?: string | null }) => {
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

      if (financeContext && pendingNovaRef.current) {
        pendingNovaRef.current = false;
        resetEmptyEditor(nextRevenueTitle(rows));
        isCreatingRef.current = true;
        editorOpenRef.current = true;
        setIsCreating(true);
        setEditorOpen(true);
        return;
      }

      const preferredId = options?.preferSelectedId;

      setSelectedId((current) => {
        if (financeContext) {
          if (isCreatingRef.current) {
            return null;
          }
          if (!editorOpenRef.current) {
            return current && rows.some((row) => row.id === current) ? current : null;
          }
          if (rows.length === 0) {
            resetEmptyEditor(nextRevenueTitle(rows));
            isCreatingRef.current = true;
            editorOpenRef.current = true;
            setIsCreating(true);
            setEditorOpen(true);
            return null;
          }
          const keep =
            (preferredId && rows.some((row) => row.id === preferredId) ? preferredId : null) ??
            (current && rows.some((row) => row.id === current) ? current : null) ??
            rows[0].id;
          const row = rows.find((item) => item.id === keep);
          if (row) {
            loadEditorFromRevenue(row);
            isCreatingRef.current = false;
            setIsCreating(false);
          }
          return keep;
        }

        if (rows.length === 0) {
          resetEmptyEditor(nextRevenueTitle(rows));
          return null;
        }
        const keep =
          (preferredId && rows.some((row) => row.id === preferredId) ? preferredId : null) ??
          (current && rows.some((row) => row.id === current) ? current : null) ??
          rows[0].id;
        const row = rows.find((item) => item.id === keep);
        if (row) loadEditorFromRevenue(row);
        return keep;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [projectId, financeContext, loadEditorFromRevenue, resetEmptyEditor]);

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
    isCreatingRef.current = false;
    editorOpenRef.current = true;
    setSelectedId(row.id);
    setIsCreating(false);
    loadEditorFromRevenue(row);
    setEditorOpen(true);
    setError(null);
  }

  function closeEditor() {
    if (!financeContext) return;
    isCreatingRef.current = false;
    editorOpenRef.current = false;
    setEditorOpen(false);
    setIsCreating(false);
    setError(null);
  }

  async function saveRevenue() {
    setSaving(true);
    setError(null);
    const composition =
      meta.revenueType === "FIXA"
        ? draftToPayload(costLines, billingLines, autoBillingCalculation, taxTypeId)
        : {
            taxTypeId: taxTypeId || null,
            variableEntries: variableEntriesToPayload(variableEntries),
          };
    const creating = isCreatingRef.current || !selectedId;
    const payload = {
      title: meta.title.trim() || (creating ? nextRevenueTitle(revenues) : null),
      revenueType: meta.revenueType,
      contractProposal: meta.contractProposal.trim() || null,
      paymentMethod: meta.paymentMethod || null,
      clientHourlyRate:
        meta.revenueType === "VARIAVEL" && meta.clientHourlyRate !== ""
          ? Number(meta.clientHourlyRate)
          : null,
      billingTypeId: meta.billingTypeId || null,
      status: meta.status,
      realizedRevenue: meta.realizedRevenue !== "" ? Number(meta.realizedRevenue) : null,
      isAdditive: meta.isAdditive,
      ...composition,
    };

    if (creating) {
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
      const createdId = typeof body?.id === "string" ? body.id : null;
      setIsCreating(false);
      isCreatingRef.current = false;
      setEditorOpen(true);
      editorOpenRef.current = true;
      if (createdId) {
        setSelectedId(createdId);
        if (body) loadEditorFromRevenue(body as RevenueRow);
      }
      await load({ preferSelectedId: createdId });
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
    setIsCreating(false);
    isCreatingRef.current = false;
    setEditorOpen(true);
    editorOpenRef.current = true;
    const savedId = typeof body?.id === "string" ? body.id : selectedId;
    if (savedId) {
      setSelectedId(savedId);
      if (body) loadEditorFromRevenue(body as RevenueRow);
    }
    await load({ preferSelectedId: savedId });
  }

  async function cancelRevenue(id: string) {
    if (!window.confirm("Cancelar esta receita? A conta a receber vinculada também será cancelada.")) return;
    const r = await apiFetch(`/api/project-revenues/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar receita.");
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      if (financeContext) {
        isCreatingRef.current = false;
        editorOpenRef.current = false;
        setEditorOpen(false);
        setIsCreating(false);
      }
    }
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

  const revenueTypeLabel = meta.revenueType === "VARIAVEL" ? "Receita variável" : "Receita fixa";
  const editorTitle = isCreating
    ? "Nova receita"
    : selectedRevenue?.title || meta.title || "Editar receita";

  const revenueEditorHeader = (
    <div
      className="rounded-xl border p-3.5 md:p-4 space-y-3"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--wps-purple-600) 3%, var(--surface))",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-snug text-[color:var(--foreground)]">
              {editorTitle}
            </h3>
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background:
                  meta.revenueType === "VARIAVEL"
                    ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                    : "rgba(0,0,0,0.06)",
                color:
                  meta.revenueType === "VARIAVEL"
                    ? "var(--primary)"
                    : "var(--muted-foreground)",
              }}
            >
              {revenueTypeLabel}
            </span>
            {selectedRevenue?.isAdditive && (
              <span className="inline-flex rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                Aditivo
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-[color:var(--muted-foreground)]">
            {isCreating
              ? "Preencha os dados e salve para vincular ao projeto."
              : "Altere a composição e salve as mudanças."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedRevenue && (
            <>
              <button
                type="button"
                onClick={() => void openHistory(selectedRevenue.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
                style={{ borderColor: "var(--border)" }}
                title="Histórico da receita"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Histórico</span>
              </button>
              <button
                type="button"
                onClick={() => void cancelRevenue(selectedRevenue.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-red-600"
                style={{ borderColor: "var(--border)" }}
                title="Excluir receita"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Excluir</span>
              </button>
            </>
          )}
          <SaveButton saving={saving} onClick={() => void saveRevenue()} />
          {financeContext && (
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs text-[color:var(--muted-foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${meta.revenueType === "VARIAVEL" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <div>
          <label className={formModalLabelClass} htmlFor="revenue-type">
            Tipo de receita
          </label>
          <PopoverSelect
            id="revenue-type"
            value={meta.revenueType}
            disabled={Boolean(selectedId)}
            onChange={(value) =>
              setMeta((current) => ({
                ...current,
                revenueType: value as "FIXA" | "VARIAVEL",
              }))
            }
            options={[
              { value: "FIXA", label: "Receita fixa" },
              { value: "VARIAVEL", label: "Receita variável" },
            ]}
          />
          {selectedId && (
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
              O tipo não pode ser alterado depois da criação.
            </p>
          )}
        </div>
        <div>
          <label className={formModalLabelClass} htmlFor="revenue-contract-proposal">
            Contrato / Proposta
          </label>
          <input
            id="revenue-contract-proposal"
            className={formModalInputClass()}
            value={meta.contractProposal}
            onChange={(event) =>
              setMeta((current) => ({ ...current, contractProposal: event.target.value }))
            }
            placeholder="Ex.: Contrato 123/2026 ou Proposta COM-045"
          />
        </div>
        <div>
          <label className={formModalLabelClass} htmlFor="revenue-payment-method">
            Forma de pagamento
          </label>
          <PopoverSelect
            id="revenue-payment-method"
            value={meta.paymentMethod}
            onChange={(value) =>
              setMeta((current) => ({
                ...current,
                paymentMethod: value as RevenueMetaState["paymentMethod"],
              }))
            }
            placeholder="Selecione…"
            options={[
              { value: "", label: "Selecione…" },
              { value: "PIX", label: "PIX" },
              { value: "BOLETO", label: "Boleto" },
              { value: "TED", label: "TED" },
            ]}
          />
        </div>
        {meta.revenueType === "VARIAVEL" ? (
          <div>
            <label className={formModalLabelClass} htmlFor="revenue-client-hourly-rate">
              Taxa hora do contrato
            </label>
            <input
              id="revenue-client-hourly-rate"
              type="text"
              inputMode="numeric"
              className={formModalInputClass()}
              value={formatarMoedaInput(meta.clientHourlyRate)}
              placeholder="R$ 0,00"
              onChange={(event) =>
                setMeta((current) => ({
                  ...current,
                  clientHourlyRate: parseMoedaInputToString(event.target.value),
                }))
              }
            />
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
              Taxa cobrada do cliente. Multiplica as horas apontadas de cada medição.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <section
        className={
          financeContext
            ? "relative overflow-hidden rounded-xl border p-4 pl-5 md:p-5 md:pl-6 space-y-3.5 w-full bg-[color:var(--surface)]"
            : "rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        }
        style={{ borderColor: "var(--border)" }}
      >
        {financeContext && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1"
            style={{ background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))" }}
            aria-hidden
          />
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className={
                financeContext
                  ? "text-sm font-semibold text-[color:var(--foreground)]"
                  : "text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]"
              }
            >
              {financeContext ? "Receitas do projeto" : "Receita do projeto"}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
              {financeContext
                ? "Cadastre, edite e visualize a composição de custos e faturamento."
                : "Composição de custos e faturamento por parcelas."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startCreate}
              className={
                financeContext
                  ? "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white transition hover:brightness-110"
                  : "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              }
              style={
                financeContext
                  ? {
                      background:
                        "linear-gradient(135deg, var(--wps-purple-600) 0%, color-mix(in srgb, var(--wps-purple-600) 65%, var(--wps-purple-900)) 100%)",
                    }
                  : { borderColor: "var(--border)" }
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Nova receita
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Carregando receitas...</p>
        ) : (
          <>
            {financeContext && (
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                {revenues.length === 0 ? (
                  <div className="px-4 py-7 text-center">
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      Nenhuma receita cadastrada neste projeto.
                    </p>
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr
                        className="border-b text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[color:var(--muted-foreground)]"
                        style={{
                          borderColor: "var(--border)",
                          background: "color-mix(in srgb, var(--wps-purple-600) 4%, var(--surface))",
                        }}
                      >
                        <th className="px-3 py-2">Receita</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2 text-right">Contratada</th>
                        <th className="px-3 py-2 text-right">Prevista</th>
                        <th className="px-3 py-2 text-center">Parcelas</th>
                        <th className="px-3 py-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenues.map((row, index) => {
                        const active = editorOpen && selectedId === row.id && !isCreating;
                        return (
                          <tr
                            key={row.id}
                            className={`border-b last:border-b-0 transition-colors ${
                              active ? "bg-[color:var(--primary)]/[0.05]" : "hover:bg-black/[0.02]"
                            }`}
                            style={{ borderColor: "var(--border)" }}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-medium leading-snug text-[color:var(--foreground)]">
                                {row.title || `Receita ${index + 1}`}
                              </div>
                              {row.contractProposal && (
                                <div className="mt-0.5 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                                  {row.contractProposal}
                                </div>
                              )}
                              {row.isAdditive && (
                                <span className="mt-1 inline-flex rounded-full bg-[color:var(--primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                                  Aditivo
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[color:var(--muted-foreground)]">
                              <div>{row.revenueType === "VARIAVEL" ? "Variável" : "Fixa"}</div>
                              {row.taxTypeName ? (
                                <div className="mt-0.5 text-[11px] leading-snug">
                                  {row.taxTypeName}
                                  {row.taxRatePercent != null
                                    ? ` (${row.taxRatePercent.toLocaleString("pt-BR", {
                                        maximumFractionDigits: 2,
                                      })}%)`
                                    : ""}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatarMoeda(row.contractedValue)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatarMoeda(row.expectedRevenue)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-[color:var(--muted-foreground)]">
                              {row.installmentCount != null && row.installmentCount > 0
                                ? `${row.installmentCount}x`
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => selectRevenue(row)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/8"
                                style={{
                                  borderColor: "color-mix(in srgb, var(--primary) 25%, var(--border))",
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Editar / Visualizar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {!financeContext && revenues.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {revenues.map((row, index) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRevenue(row)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      selectedId === row.id
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 font-medium"
                        : ""
                    }`}
                    style={{ borderColor: selectedId === row.id ? undefined : "var(--border)" }}
                  >
                    {row.title || `Receita ${index + 1}`}
                    {row.revenueType === "VARIAVEL" ? " · Variável" : " · Fixa"}
                    {row.isAdditive && " · Aditivo"}
                  </button>
                ))}
              </div>
            )}

            {(!financeContext || editorOpen) && (
              <div className={financeContext ? "space-y-3" : "space-y-3"}>
                {revenueEditorHeader}

                {meta.revenueType === "FIXA" ? (
                  <ProjectRevenueCompositionEditor
                    costLines={costLines}
                    billingLines={billingLines}
                    autoBillingCalculation={autoBillingCalculation}
                    paymentMethod={meta.paymentMethod}
                    taxTypeId={taxTypeId}
                    taxTypes={taxTypes}
                    impostosConfigHref={`${basePath}/configuracoes/financeiro/impostos`}
                    onCostLinesChange={setCostLines}
                    onBillingLinesChange={setBillingLines}
                    onAutoBillingChange={setAutoBillingCalculation}
                    onPaymentMethodChange={(paymentMethod) =>
                      setMeta((current) => ({ ...current, paymentMethod }))
                    }
                    onTaxTypeChange={setTaxTypeId}
                    compact={financeContext}
                    hidePaymentMethod
                  />
                ) : (
                  <>
                    <ProjectRevenueTaxSelector
                      id="revenue-variable-tax-type"
                      taxTypeId={taxTypeId}
                      taxTypes={taxTypes}
                      billingTotal={variableBillingTotal}
                      onTaxTypeChange={setTaxTypeId}
                      impostosConfigHref={`${basePath}/configuracoes/financeiro/impostos`}
                    />
                    <ProjectVariableRevenueEditor
                      projectId={projectId}
                      revenueId={selectedId}
                      entries={variableEntries}
                      onChange={setVariableEntries}
                      clientHourlyRate={
                        meta.clientHourlyRate !== "" ? Number(meta.clientHourlyRate) : null
                      }
                      onReceivableGenerated={(payload) => {
                        if (payload && Array.isArray(payload.variableEntries)) {
                          loadEditorFromRevenue(payload as RevenueRow);
                        }
                        void load({ preferSelectedId: selectedId });
                      }}
                    />
                  </>
                )}
              </div>
            )}
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
