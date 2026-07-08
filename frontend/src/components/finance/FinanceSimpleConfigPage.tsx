"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Link } from "@/components/Link";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

type Row = {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
};

type FinanceSimpleConfigPageProps = {
  permission: string;
  apiPath: string;
  title: string;
  subtitle: string;
  nameLabel?: string;
  showCode?: boolean;
  allowEdit?: boolean;
};

export function FinanceSimpleConfigPage({
  permission,
  apiPath,
  title,
  subtitle,
  nameLabel = "Nome",
  showCode = false,
  allowEdit = false,
}: FinanceSimpleConfigPageProps) {
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
    () => isFinanceiroModuleEnabled() && can(permission),
    [can, permission],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch(apiPath);
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
  }, [apiPath]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  async function addRow() {
    setError(null);
    const name = formName.trim();
    if (!name) {
      setError(`${nameLabel} é obrigatório.`);
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(showCode ? { code: formCode.trim() || null } : {}),
          isActive: true,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setFormName("");
      setFormCode("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: Row) {
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`${apiPath}/${row.id}`, {
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

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCode(row.code ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditCode("");
  }

  async function saveEdit(row: Row) {
    const name = editName.trim();
    if (!name) {
      setError(`${nameLabel} é obrigatório.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`${apiPath}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(showCode ? { code: editCode.trim() || null } : {}),
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

  async function removeRow(id: string) {
    if (!confirm("Excluir este registro?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
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
            <Link
              href={`${basePath}/configuracoes`}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] hover:opacity-95"
              style={{ background: "var(--primary)" }}
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push(`${basePath}/configuracoes`)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">{title}</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">{subtitle}</p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="wps-finance-alert-error">{error}</div>
          )}

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)] mb-3">Adicionar</h2>
            <div className={`grid gap-3 ${showCode ? "sm:grid-cols-[120px_1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
              {showCode && (
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Código"
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                />
              )}
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={nameLabel}
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
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                  <tr>
                    {showCode && (
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Código</th>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">{nameLabel}</th>
                    <th className="px-4 py-3 text-center font-medium text-[color:var(--muted-foreground)]">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[color:var(--border)] last:border-b-0">
                      {showCode && (
                        <td className="px-4 py-3 text-[color:var(--foreground)]">
                          {editingId === row.id ? (
                            <input
                              type="text"
                              value={editCode}
                              onChange={(e) => setEditCode(e.target.value)}
                              placeholder="Código"
                              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                            />
                          ) : (
                            row.code || "—"
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-[color:var(--foreground)]">
                        {editingId === row.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={nameLabel}
                            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                          />
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!row.isActive ? (
                          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            Inativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Ativo
                          </span>
                        )}
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
                              {allowEdit ? (
                                <button
                                  type="button"
                                  onClick={() => startEdit(row)}
                                  disabled={saving || editingId != null}
                                  className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-colors disabled:opacity-50"
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void toggleActive(row)}
                                disabled={saving || togglingId === row.id || editingId != null}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                  !row.isActive
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                                title={!row.isActive ? "Ativar" : "Inativar"}
                              >
                                {!row.isActive ? "Ativar" : "Inativar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeRow(row.id)}
                                disabled={saving || editingId != null}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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
