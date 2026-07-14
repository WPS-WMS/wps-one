"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

type CategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  enableHourRate: boolean;
  enableAmount: boolean;
  enableBenefit: boolean;
  enableReimbursement: boolean;
  enableDiscount: boolean;
  enableComplementaryHours: boolean;
  enableInterestFine: boolean;
};

const FIELD_COLUMNS = [
  { key: "enableHourRate", label: "Tx hora" },
  { key: "enableAmount", label: "Valor" },
  { key: "enableBenefit", label: "Benefício" },
  { key: "enableReimbursement", label: "Reembolso" },
  { key: "enableDiscount", label: "Descontos" },
  { key: "enableComplementaryHours", label: "H. compl." },
  { key: "enableInterestFine", label: "Juros/Multa" },
] as const;

type FieldKey = (typeof FIELD_COLUMNS)[number]["key"];

const PERMISSION = "configuracoes.financeiro.categoriasFinanceiras";
const API = "/api/financial-categories";

export function FinancialCategoriesConfigPage() {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () => isFinanceiroModuleEnabled() && can(PERMISSION),
    [can],
  );

  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch(API);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Não foi possível carregar.");
      setLoadingRows(false);
      return;
    }
    setError(null);
    setRows(Array.isArray(body) ? body : []);
    setLoadingRows(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  async function addRow() {
    setError(null);
    const name = formName.trim();
    if (!name) {
      setError("Categoria financeira é obrigatória.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isActive: true }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setFormName("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: CategoryRow) {
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`${API}/${row.id}`, {
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

  function startEdit(row: CategoryRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(row: CategoryRow) {
    const name = editName.trim();
    if (!name) {
      setError("Categoria financeira é obrigatória.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`${API}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Excluir esta categoria?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`${API}/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) {
        const body = await r.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Não foi possível excluir.");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleField(row: CategoryRow, key: FieldKey) {
    setSavingFieldId(row.id);
    setError(null);
    const next = !row[key];
    const r = await apiFetch(`${API}/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const body = await r.json().catch(() => null);
    setSavingFieldId(null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar campo.");
      return;
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, [key]: next } : item)));
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-[color:var(--muted-foreground)] text-sm">Carregando...</p>
      </div>
    );
  }

  if (!isFinanceiroModuleEnabled()) {
    return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="text-xs font-semibold text-[color:var(--muted-foreground)] tracking-wider">403</div>
          <h1 className="mt-2 text-xl font-bold text-[color:var(--foreground)]">Acesso negado</h1>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
            Você não tem permissão para acessar esta configuração.
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
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Categorias financeiras</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Cadastre os tipos (Folha, Custo…) e marque quais campos aparecem em Nova conta.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && <div className="wps-finance-alert-error">{error}</div>}

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)] mb-3">Adicionar</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Categoria financeira"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void addRow()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
            {loadingRows ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum registro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-[color:var(--muted-foreground)] whitespace-nowrap">
                        Categoria
                      </th>
                      {FIELD_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className="px-2 py-2.5 text-center font-medium text-[color:var(--muted-foreground)] whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-center font-medium text-[color:var(--muted-foreground)]">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[color:var(--border)] last:border-b-0">
                        <td className="px-3 py-2.5 font-medium text-[color:var(--foreground)] whitespace-nowrap">
                          {editingId === row.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full min-w-[10rem] rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                            />
                          ) : (
                            row.name
                          )}
                        </td>
                        {FIELD_COLUMNS.map((col) => (
                          <td key={col.key} className="px-2 py-2.5 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[color:var(--primary)]"
                              checked={Boolean(row[col.key])}
                              disabled={savingFieldId === row.id || !row.isActive}
                              onChange={() => void toggleField(row, col.key)}
                              aria-label={`${row.name} — ${col.label}`}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={togglingId === row.id}
                            onClick={() => void toggleActive(row)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              row.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {togglingId === row.id ? "…" : row.isActive ? "Ativa" : "Inativa"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {editingId === row.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveEdit(row)}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--primary-foreground)]"
                                style={{ background: "var(--primary)" }}
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-lg border px-2 py-1 text-xs"
                                style={{ borderColor: "var(--border)" }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="rounded-lg p-1.5 text-[color:var(--muted-foreground)] hover:bg-black/5"
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void removeRow(row.id)}
                                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
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
