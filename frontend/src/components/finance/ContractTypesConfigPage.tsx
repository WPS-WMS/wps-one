"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { navigateBack } from "@/lib/navigateBack";
import {
  formModalInputClass,
  formModalLabelClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";

type ContractTypeRow = {
  id: string;
  name: string;
  isActive: boolean;
};

type ContractTypesConfigPageProps = {
  permission: string;
};

export function ContractTypesConfigPage({ permission }: ContractTypesConfigPageProps) {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(() => can(permission), [can, permission]);
  const [rows, setRows] = useState<ContractTypeRow[]>([]);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch("/api/contract-types");
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

  function startEdit(row: ContractTypeRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function addRow() {
    setError(null);
    const name = formName.trim();
    if (!name) {
      setError("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/api/contract-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao criar tipo de contrato.");
        return;
      }
      setFormName("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(row: ContractTypeRow) {
    const name = editName.trim();
    if (!name) {
      setError("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/contract-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
        return;
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ContractTypeRow) {
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/contract-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao atualizar.");
        return;
      }
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteRow(row: ContractTypeRow) {
    if (
      !window.confirm(
        `Excluir o tipo de contrato "${row.name}"? Contratos e contas vinculadas ficarão sem esse tipo.`,
      )
    ) {
      return;
    }
    setDeletingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/contract-types/${row.id}`, { method: "DELETE" });
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

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Sem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
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
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--foreground)]">Tipos de contrato</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Classificação dos contratos vinculados aos projetos (AMS, escopo fechado, T&M, etc.).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <FormModalSection title="Novo tipo">
        <div>
          <label className={formModalLabelClass}>Nome</label>
          <input
            className={formModalInputClass()}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ex: AMS mensal"
          />
        </div>
        <button
          type="button"
          onClick={() => void addRow()}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar
        </button>
      </FormModalSection>

      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        {loadingRows ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Nenhum tipo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[color:var(--muted-foreground)]">
                  <th className="pb-2 pr-4 font-medium">Nome</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4">
                      {editingId === row.id ? (
                        <input
                          className={formModalInputClass()}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="py-2 pr-4">
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
                    <td className="py-2 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {editingId === row.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdit(row)}
                              disabled={saving}
                              className="rounded-lg bg-[color:var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded-lg p-1.5 text-[color:var(--muted-foreground)] hover:bg-black/5 disabled:opacity-50"
                              title="Cancelar"
                              aria-label="Cancelar"
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
                              className="rounded-lg p-1.5 text-[color:var(--muted-foreground)] hover:bg-black/5 disabled:opacity-50"
                              title="Editar"
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === row.id || editingId != null}
                              onClick={() => void deleteRow(row)}
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="Excluir"
                              aria-label="Excluir"
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(row)}
                              disabled={saving || togglingId === row.id || editingId != null}
                              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                                row.isActive
                                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {togglingId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : row.isActive ? (
                                "Inativar"
                              ) : (
                                "Ativar"
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
