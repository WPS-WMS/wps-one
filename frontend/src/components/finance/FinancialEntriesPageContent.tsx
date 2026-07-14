"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

type Option = { id: string; name: string; code?: string | null };
type AccountOption = Option & { type: string };
type EntryRow = {
  id: string;
  costCenterId: string;
  costCenterName: string;
  financialAccountId: string;
  financialAccountName: string;
  type: "RECEITA" | "DESPESA";
  amountFormatted: string;
  entryDate: string;
  description: string | null;
  status: string;
  supplierName: string | null;
  projectName: string | null;
  createdByName: string;
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

export function FinancialEntriesPageContent() {
  const { can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.lancamentos"), [can]);

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterCostCenterId, setFilterCostCenterId] = useState("");
  const [filterType, setFilterType] = useState<"" | "RECEITA" | "DESPESA">("");

  const [formType, setFormType] = useState<"RECEITA" | "DESPESA">("DESPESA");
  const [formCostCenterId, setFormCostCenterId] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDescription, setFormDescription] = useState("");

  const filteredAccounts = useMemo(
    () => accounts.filter((a) => a.type === formType),
    [accounts, formType],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status: "LANCADO" });
    if (filterStart) params.set("start", filterStart);
    if (filterEnd) params.set("end", filterEnd);
    if (filterCostCenterId) params.set("costCenterId", filterCostCenterId);
    if (filterType) params.set("type", filterType);
    const r = await apiFetch(`/api/financial-entries?${params.toString()}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar lançamentos.");
      setLoading(false);
      return;
    }
    setRows(Array.isArray(body) ? body : []);
    setLoading(false);
  }, [filterStart, filterEnd, filterCostCenterId, filterType]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void Promise.all([
      apiFetch("/api/cost-centers").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/financial-accounts").then((r) => (r.ok ? r.json() : [])),
    ]).then(([cc, acc]) => {
      setCostCenters(Array.isArray(cc) ? cc.filter((c: Option & { isActive?: boolean }) => c.isActive !== false) : []);
      setAccounts(Array.isArray(acc) ? acc.filter((a: AccountOption & { isActive?: boolean }) => a.isActive !== false) : []);
    });
    void loadEntries();
  }, [permissionsReady, canAccess, loadEntries]);

  useEffect(() => {
    if (!formAccountId) return;
    const acc = accounts.find((a) => a.id === formAccountId);
    if (acc && acc.type !== formType) setFormAccountId("");
  }, [formType, formAccountId, accounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formCostCenterId) {
      setError("Centro de custo é obrigatório.");
      return;
    }
    if (!formAccountId) {
      setError("Conta do plano de contas é obrigatória.");
      return;
    }
    setSaving(true);
    const r = await apiFetch("/api/financial-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: formType,
        costCenterId: formCostCenterId,
        financialAccountId: formAccountId,
        amount: formAmount,
        entryDate: formDate,
        description: formDescription.trim() || null,
      }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar lançamento.");
      setSaving(false);
      return;
    }
    setFormAmount("");
    setFormDescription("");
    setSaving(false);
    await loadEntries();
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancelar este lançamento?")) return;
    const r = await apiFetch(`/api/financial-entries/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      alert(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    await loadEntries();
  }

  if (!permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] gap-3 p-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Sem permissão para lançamentos financeiros.</p>
        <button type="button" onClick={() => router.push(basePath)} className="text-sm underline">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/60 backdrop-blur" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Lançamentos financeiros</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Registre receitas e despesas com centro de custo obrigatório.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>
          )}

          <form
            onSubmit={(e) => void handleCreate(e)}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Novo lançamento</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Tipo *</label>
                <PopoverSelect
                  id="financial-entry-form-type"
                  value={formType}
                  onChange={(v) => setFormType(v as "RECEITA" | "DESPESA")}
                  options={[
                    { value: "DESPESA", label: "Despesa" },
                    { value: "RECEITA", label: "Receita" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Centro de custo *</label>
                <PopoverSelect
                  id="financial-entry-form-cost-center"
                  value={formCostCenterId}
                  onChange={(v) => setFormCostCenterId(v)}
                  placeholder="Selecione..."
                  options={[
                    { value: "", label: "Selecione..." },
                    ...costCenters.map((c) => ({
                      value: c.id,
                      label: c.code ? `${c.code} — ${c.name}` : c.name,
                    })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Conta *</label>
                <PopoverSelect
                  id="financial-entry-form-account"
                  value={formAccountId}
                  onChange={(v) => setFormAccountId(v)}
                  placeholder="Selecione..."
                  options={[
                    { value: "", label: "Selecione..." },
                    ...filteredAccounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Valor (R$) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Data *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className={inputClass} required />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Descrição</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Opcional"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar lançamento
            </button>
          </form>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Filtros</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className={inputClass} />
              <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className={inputClass} />
              <PopoverSelect
                id="financial-entry-filter-cost-center"
                value={filterCostCenterId}
                onChange={(v) => setFilterCostCenterId(v)}
                placeholder="Todos os centros"
                options={[
                  { value: "", label: "Todos os centros" },
                  ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <PopoverSelect
                id="financial-entry-filter-type"
                value={filterType}
                onChange={(v) => setFilterType(v as "" | "RECEITA" | "DESPESA")}
                placeholder="Receita e despesa"
                options={[
                  { value: "", label: "Receita e despesa" },
                  { value: "RECEITA", label: "Receita" },
                  { value: "DESPESA", label: "Despesa" },
                ]}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum lançamento no período.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Tipo</th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Centro de custo</th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Conta</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Valor</th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Descrição</th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[color:var(--border)] last:border-0">
                        <td className="px-4 py-3 whitespace-nowrap">{row.entryDate.split("-").reverse().join("/")}</td>
                        <td className="px-4 py-3">
                          <span className={row.type === "RECEITA" ? "text-emerald-600" : "text-red-600"}>
                            {row.type === "RECEITA" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.costCenterName}</td>
                        <td className="px-4 py-3">{row.financialAccountName}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{row.amountFormatted}</td>
                        <td className="px-4 py-3 text-[color:var(--muted-foreground)] max-w-[200px] truncate">{row.description || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void handleCancel(row.id)}
                            className="inline-flex items-center justify-center rounded-lg border p-2 hover:opacity-90"
                            style={{ borderColor: "var(--border)" }}
                            title="Cancelar lançamento"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
