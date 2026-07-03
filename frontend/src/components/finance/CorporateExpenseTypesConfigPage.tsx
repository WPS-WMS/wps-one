"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Link } from "@/components/Link";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import {
  formModalInputClass,
  formModalLabelClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";

type ExpenseTypeRow = { id: string; name: string; isActive: boolean };

type CorporateExpenseTypesConfigPageProps = {
  permission: string;
};

export function CorporateExpenseTypesConfigPage({ permission }: CorporateExpenseTypesConfigPageProps) {
  const { user, loading, can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(() => can(permission), [can, permission]);
  const [rows, setRows] = useState<ExpenseTypeRow[]>([]);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch("/api/corporate-expense-types");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
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
    const name = formName.trim();
    if (!name) {
      setError("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    const r = await apiFetch("/api/corporate-expense-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar.");
      return;
    }
    setFormName("");
    await load();
  }

  async function toggleActive(row: ExpenseTypeRow) {
    const r = await apiFetch(`/api/corporate-expense-types/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao atualizar.");
      return;
    }
    await load();
  }

  async function removeRow(id: string) {
    if (!window.confirm("Excluir este tipo?")) return;
    const r = await apiFetch(`/api/corporate-expense-types/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir.");
      return;
    }
    await load();
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
      </div>
    );
  }

  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <Link href={`${basePath}/configuracoes`} className="inline-flex items-center gap-1 text-sm text-[color:var(--muted-foreground)]">
        <ArrowLeft className="h-4 w-4" /> Configurações
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Tipos de despesa corporativa</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Infraestrutura, software, marketing, viagens, eventos, administrativo, etc.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <FormModalSection title="Novo tipo">
        <label className={formModalLabelClass}>Nome</label>
        <input className={formModalInputClass()} value={formName} onChange={(e) => setFormName(e.target.value)} />
        <button type="button" onClick={() => void addRow()} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar
        </button>
      </FormModalSection>
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        {loadingRows ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[color:var(--muted-foreground)]">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{row.name}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => void toggleActive(row)} className={`rounded-full px-2 py-0.5 text-xs ${row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                      {row.isActive ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="py-2">
                    <button type="button" onClick={() => void removeRow(row.id)} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
