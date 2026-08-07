"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  ConfigActiveToggle,
  ConfigStatusBadge,
  configDeleteIconBtnClass,
  configEditIconBtnClass,
} from "@/components/ui/ConfigActiveToggle";

type TaxTypeRow = {
  id: string;
  name: string;
  ratePercent: number | null;
  isActive: boolean;
};

const PERMISSION = "configuracoes.financeiro.impostos";
const API_PATH = "/api/tax-types";

function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function TaxTypesConfigPage() {
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
    () => isFinanceiroModuleEnabled() && can(PERMISSION),
    [can],
  );
  const [rows, setRows] = useState<TaxTypeRow[]>([]);
  const [formName, setFormName] = useState("");
  const [formRate, setFormRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch(API_PATH);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Não foi possível carregar os dados.");
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
      setError("Nome do imposto é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ratePercent: formRate.trim() || null,
          isActive: true,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setFormName("");
      setFormRate("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: TaxTypeRow) {
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`${API_PATH}/${row.id}`, {
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

  async function deleteRow(row: TaxTypeRow) {
    if (!window.confirm(`Excluir o imposto "${row.name}"?`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`${API_PATH}/${row.id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) {
        const body = await r.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Não foi possível excluir.");
        return;
      }
      if (editingId === row.id) cancelEdit();
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(row: TaxTypeRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditRate(row.ratePercent != null ? String(row.ratePercent) : "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditRate("");
  }

  async function saveEdit(row: TaxTypeRow) {
    const name = editName.trim();
    if (!name) {
      setError("Nome do imposto é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_PATH}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ratePercent: editRate.trim() || null,
        }),
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
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Impostos</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Tipos de impostos e alíquotas usados nos cálculos financeiros (ex.: imposto federal, ISS, PIS/COFINS).
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && <div className="wps-finance-alert-error">{error}</div>}

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)] mb-3">Adicionar</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome do imposto (ex.: Imposto federal)"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formRate}
                onChange={(e) => setFormRate(e.target.value)}
                placeholder="Alíquota (%)"
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
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum imposto cadastrado.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Imposto</th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Alíquota</th>
                    <th className="px-4 py-3 text-center font-medium text-[color:var(--muted-foreground)]">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[color:var(--border)] last:border-b-0">
                      <td className="px-4 py-3 font-medium text-[color:var(--foreground)]">
                        {editingId === row.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nome do imposto"
                            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                          />
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--foreground)] tabular-nums">
                        {editingId === row.id ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            placeholder="Alíquota (%)"
                            className="w-32 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                          />
                        ) : (
                          formatRate(row.ratePercent)
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ConfigStatusBadge active={row.isActive} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === row.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void saveEdit(row)}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
                                style={{ background: "var(--primary)" }}
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={saving}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-[color:var(--muted-foreground)] hover:bg-[color:var(--background)] disabled:opacity-50"
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                disabled={saving || editingId != null}
                                className={configEditIconBtnClass}
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteRow(row)}
                                disabled={saving || deletingId === row.id || editingId != null}
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
                              <ConfigActiveToggle
                                active={row.isActive}
                                loading={togglingId === row.id}
                                disabled={saving || editingId != null}
                                onToggle={() => void toggleActive(row)}
                              />
                            </>
                          )}
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
