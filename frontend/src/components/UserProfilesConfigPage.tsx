"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { navigateBack } from "@/lib/navigateBack";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  ConfigActiveToggle,
  ConfigStatusBadge,
  configDeleteIconBtnClass,
  configEditIconBtnClass,
} from "@/components/ui/ConfigActiveToggle";

type ProfileRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  requiresClientLink: boolean;
  requiresTimeEntry: boolean;
  excludeFromHourBank: boolean;
  assignable?: boolean;
  configurable?: boolean;
};

export function UserProfilesConfigPage() {
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

  const canAccess = useMemo(() => can("configuracoes.perfisUsuario"), [can]);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingRows(true);
    try {
      const r = await apiFetch("/api/user-profiles");
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
      setRows(Array.isArray(body) ? body : []);
      setError(null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      if (!opts?.silent) setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!permissionsReady) return;
    if (!canAccess) {
      router.replace(basePath);
      return;
    }
    void load();
  }, [loading, user, permissionsReady, canAccess, router, basePath, load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch("/api/user-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim() }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "Erro ao criar.");
      setFormName("");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || saving) return;
    const row = rows.find((r) => r.id === id);
    if (!row || row.isSystem) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/user-profiles/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      setEditingId(null);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(row: ProfileRow) {
    if (togglingId || (row.isSystem && row.code === "SUPER_ADMIN" && row.isActive)) return;
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/user-profiles/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "Erro ao atualizar.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(row: ProfileRow) {
    if (row.isSystem || deletingId) return;
    if (!window.confirm(`Excluir o perfil "${row.name}"?`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/user-profiles/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      if (!r.ok && r.status !== 204) {
        const body = await r.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao excluir.");
      }
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => navigateBack(router, basePath)}
        aria-label="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header className="shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Configurações · Cadastro
          </p>
          <h1 className="mt-0.5 text-xl font-semibold md:text-2xl">Perfis de usuário</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Crie perfis personalizados ou inative os padrão. Perfis padrão (Administrador do portal,
            Gestor, Consultor, Administrativo, Financeiro, Diretoria, Cliente etc.) não podem ser
            editados nem excluídos.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-16 md:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {error ? <div className="wps-finance-alert-error">{error}</div> : null}

          <form
            onSubmit={handleCreate}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm space-y-3"
          >
            <h2 className="text-sm font-semibold">Novo perfil</h2>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Nome</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full max-w-md rounded-xl border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm"
                placeholder="Ex.: Arquiteto"
                maxLength={80}
              />
            </div>
            <p className="text-[11px] text-[color:var(--muted-foreground)]">
              Após criar, configure as permissões em Gestão de perfis. Sem isso, o perfil novo começa sem
              acessos.
            </p>
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar perfil
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            {loadingRows ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-[color:var(--muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-[color:var(--muted-foreground)]">Nenhum perfil.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {rows.map((row) => {
                  const editing = editingId === row.id;
                  const canEdit = !row.isSystem;
                  const canDelete = !row.isSystem;
                  const toggleDisabled =
                    !!togglingId || (row.isSystem && row.code === "SUPER_ADMIN" && row.isActive);
                  return (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        {editing && canEdit ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-transparent px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <>
                            <p className="truncate text-sm font-medium">
                              {row.name}
                              {row.isSystem ? (
                                <span className="ml-2 text-[10px] uppercase text-[color:var(--muted-foreground)]">
                                  padrão
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                              {row.code}
                              {row.isSystem ? " · não editável — apenas inativar" : ""}
                            </p>
                          </>
                        )}
                      </div>
                      <ConfigStatusBadge active={row.isActive} />
                      <div className="inline-flex items-center gap-1">
                        {editing && canEdit ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleSaveEdit(row.id)}
                              className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg p-2 hover:bg-black/5"
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {canEdit ? (
                              <button
                                type="button"
                                className={configEditIconBtnClass}
                                title="Editar"
                                onClick={() => {
                                  setEditingId(row.id);
                                  setEditName(row.name);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className={configDeleteIconBtnClass}
                                title="Excluir"
                                disabled={deletingId === row.id}
                                onClick={() => void handleDelete(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                            <ConfigActiveToggle
                              active={row.isActive}
                              loading={togglingId === row.id}
                              disabled={toggleDisabled}
                              onToggle={() => void handleToggle(row)}
                              title={
                                row.isSystem && row.code === "SUPER_ADMIN" && row.isActive
                                  ? "Super administrador não pode ser inativado"
                                  : row.isActive
                                    ? "Inativar"
                                    : "Ativar"
                              }
                            />
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
