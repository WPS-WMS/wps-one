"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { navigateBack } from "@/lib/navigateBack";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  ConfigActiveToggle,
  ConfigStatusBadge,
  configDeleteIconBtnClass,
} from "@/components/ui/ConfigActiveToggle";

type DreSubcategory = "IMPOSTO" | "CUSTO" | "REEMBOLSOS" | "FATURAMENTO" | "OUTRAS_RECEITAS";

type AccountRow = {
  id: string;
  code: string | null;
  name: string;
  type: "RECEITA" | "DESPESA";
  parentId: string | null;
  parentName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  isActive: boolean;
  dreSubcategory?: DreSubcategory | null;
  enableHourRate?: boolean;
  enableAmount?: boolean;
  enableDiscount?: boolean;
  enableComplementaryHours?: boolean;
  enableInterestFine?: boolean;
};

type CostCenterOption = { id: string; name: string };

const FIELD_COLUMNS = [
  { key: "enableHourRate", label: "Tx hora" },
  { key: "enableAmount", label: "Valor" },
  { key: "enableDiscount", label: "Descontos" },
  { key: "enableComplementaryHours", label: "H. compl." },
  { key: "enableInterestFine", label: "Juros/Multa" },
] as const;

type FieldKey = (typeof FIELD_COLUMNS)[number]["key"];

const DRE_SUBCATEGORY_DESPESA_OPTIONS = [
  { value: "", label: "Sem subcategoria" },
  { value: "IMPOSTO", label: "Imposto" },
  { value: "CUSTO", label: "Custo" },
  { value: "REEMBOLSOS", label: "Reembolsos" },
] as const;

const DRE_SUBCATEGORY_RECEITA_OPTIONS = [
  { value: "", label: "Sem subcategoria" },
  { value: "FATURAMENTO", label: "Faturamento" },
  { value: "OUTRAS_RECEITAS", label: "Outras receitas" },
] as const;

function subcategoryLabel(value: string | null | undefined, type: "RECEITA" | "DESPESA"): string {
  if (type === "RECEITA") {
    if (value === "FATURAMENTO") return "Faturamento";
    if (value === "OUTRAS_RECEITAS") return "Outras receitas";
    return "—";
  }
  if (value === "IMPOSTO") return "Imposto";
  if (value === "CUSTO") return "Custo";
  if (value === "REEMBOLSOS") return "Reembolsos";
  return "—";
}

export default function AdminFinanceiroPlanoContasPage() {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const canAccess = useMemo(
    () =>
      can("configuracoes.financeiro.planoContas") ||
      can("configuracoes.financeiro.categoriasFinanceiras"),
    [can],
  );
  const [tab, setTab] = useState<"RECEITA" | "DESPESA">("RECEITA");
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formCostCenterId, setFormCostCenterId] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const [accRes, ccRes] = await Promise.all([
      apiFetch(`/api/financial-accounts?type=${tab}`),
      apiFetch("/api/cost-centers"),
    ]);
    const accBody = await accRes.json().catch(() => null);
    const ccBody = await ccRes.json().catch(() => null);
    if (!accRes.ok) {
      setRows([]);
      setError(typeof accBody?.error === "string" ? accBody.error : "Não foi possível carregar o plano de contas.");
      setLoadingRows(false);
      return;
    }
    setError(null);
    setRows(Array.isArray(accBody) ? accBody : []);
    setCostCenters(
      Array.isArray(ccBody)
        ? ccBody.filter((c: { isActive?: boolean }) => c.isActive !== false).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        : [],
    );
    setLoadingRows(false);
  }, [tab]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === "DESPESA") setTab("DESPESA");
  }, []);

  const parentOptions = useMemo(
    () => rows.filter((r) => r.type === tab && r.isActive),
    [rows, tab],
  );

  async function addAccount() {
    setError(null);
    const name = formName.trim();
    if (!name) {
      setError("Nome da conta é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        type: tab,
        code: null,
        parentId: formParentId || null,
        costCenterId: tab === "DESPESA" ? formCostCenterId || null : null,
        isActive: true,
      };
      if (tab === "DESPESA") {
        payload.dreSubcategory = formSubcategory || null;
        payload.enableAmount = true;
      }
      if (tab === "RECEITA") {
        payload.dreSubcategory = formSubcategory || null;
      }
      const r = await apiFetch("/api/financial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setFormName("");
      setFormParentId("");
      setFormCostCenterId("");
      setFormSubcategory("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: AccountRow) {
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/financial-accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível atualizar.");
        return;
      }
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  async function patchField(row: AccountRow, key: FieldKey, value: boolean) {
    setSavingFieldId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/financial-accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível atualizar.");
        return;
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, [key]: value } : x)));
    } finally {
      setSavingFieldId(null);
    }
  }

  async function patchSubcategory(row: AccountRow, value: string) {
    setSavingFieldId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/financial-accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dreSubcategory: value || null }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível atualizar.");
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.id === row.id
            ? { ...x, dreSubcategory: (value || null) as DreSubcategory | null }
            : x,
        ),
      );
    } finally {
      setSavingFieldId(null);
    }
  }

  async function deleteRow(row: AccountRow) {
    if (!window.confirm(`Excluir a conta "${row.name}"?`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/financial-accounts/${row.id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) {
        const body = await r.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Não foi possível excluir.");
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-[color:var(--muted-foreground)] text-sm">Carregando...</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="text-xs font-semibold text-[color:var(--muted-foreground)] tracking-wider">403</div>
          <h1 className="mt-2 text-xl font-bold text-[color:var(--foreground)]">Acesso negado</h1>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
            Você não tem permissão para gerenciar o plano de contas.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => navigateBack(router, basePath)}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] hover:opacity-95"
              style={{ background: "var(--primary)" }}
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isDespesa = tab === "DESPESA";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => navigateBack(router, basePath)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Plano de contas</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Estruture receitas e despesas com hierarquia. Em Receitas, defina a subcategoria
            (Faturamento ou Outras receitas) usada na importação de Contas a receber, no DRE e no
            resultado do projeto. Em Despesas, configure centro de custo, subcategoria DRE e os
            campos do Contas a pagar.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex gap-2">
            {(["RECEITA", "DESPESA"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setFormSubcategory("");
                  if (t === "RECEITA") setFormCostCenterId("");
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  tab === t
                    ? "text-[color:var(--primary-foreground)]"
                    : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)]"
                }`}
                style={tab === t ? { background: "var(--primary)" } : undefined}
              >
                {t === "RECEITA" ? "Receitas" : "Despesas"}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Adicionar conta</h2>
            <div className={`grid gap-3 ${isDespesa ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome da conta"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              />
              <PopoverSelect
                id="plano-contas-parent"
                value={formParentId}
                onChange={setFormParentId}
                placeholder="Conta pai (opcional)"
                options={[
                  { value: "", label: "Conta pai (opcional)" },
                  ...parentOptions.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              {isDespesa && (
                <PopoverSelect
                  id="plano-contas-cost-center"
                  value={formCostCenterId}
                  onChange={setFormCostCenterId}
                  placeholder="Centro de custo (opcional)"
                  options={[
                    { value: "", label: "Centro de custo (opcional)" },
                    ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}
              {isDespesa ? (
                <PopoverSelect
                  id="plano-contas-dre"
                  value={formSubcategory}
                  onChange={setFormSubcategory}
                  placeholder="Subcategoria DRE"
                  options={DRE_SUBCATEGORY_DESPESA_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              ) : (
                <PopoverSelect
                  id="plano-contas-dre-receita"
                  value={formSubcategory}
                  onChange={setFormSubcategory}
                  placeholder="Subcategoria"
                  options={DRE_SUBCATEGORY_RECEITA_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => void addAccount()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm overflow-x-auto">
            {loadingRows ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Nenhuma conta.</div>
            ) : (
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Conta</th>
                    {isDespesa && (
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Centro de custo
                      </th>
                    )}
                    <th className="px-3 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                      Subcategoria
                    </th>
                    {isDespesa && (
                      <>
                        {FIELD_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            className="px-2 py-3 text-center font-medium text-[color:var(--muted-foreground)] whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[color:var(--border)] last:border-b-0">
                      <td className="px-4 py-3 font-medium text-[color:var(--foreground)]">{row.name}</td>
                      {isDespesa && (
                        <td className="px-4 py-3 text-[color:var(--muted-foreground)]">
                          {row.costCenterName || "—"}
                        </td>
                      )}
                      <td className="px-3 py-3 min-w-[160px]">
                        <PopoverSelect
                          id={`dre-${row.id}`}
                          value={row.dreSubcategory ?? ""}
                          onChange={(v) => void patchSubcategory(row, v)}
                          placeholder={subcategoryLabel(row.dreSubcategory, row.type)}
                          disabled={savingFieldId === row.id}
                          options={(isDespesa
                            ? DRE_SUBCATEGORY_DESPESA_OPTIONS
                            : DRE_SUBCATEGORY_RECEITA_OPTIONS
                          ).map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                        />
                      </td>
                      {isDespesa && (
                        <>
                          {FIELD_COLUMNS.map((col) => (
                            <td key={col.key} className="px-2 py-3 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={Boolean(row[col.key])}
                                disabled={savingFieldId === row.id}
                                onChange={(e) => void patchField(row, col.key, e.target.checked)}
                                aria-label={col.label}
                              />
                            </td>
                          ))}
                        </>
                      )}
                      <td className="px-4 py-3">
                        <ConfigStatusBadge active={row.isActive} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <ConfigActiveToggle
                            active={row.isActive}
                            loading={togglingId === row.id}
                            disabled={saving || deletingId === row.id}
                            onToggle={() => void toggleActive(row)}
                          />
                          <button
                            type="button"
                            disabled={saving || deletingId === row.id}
                            onClick={() => void deleteRow(row)}
                            className={configDeleteIconBtnClass}
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            {deletingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
