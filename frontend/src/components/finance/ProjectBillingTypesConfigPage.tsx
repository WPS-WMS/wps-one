"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { navigateBack } from "@/lib/navigateBack";
import {
  formModalInputClass,
  formModalLabelClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";

type BillingTypeRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type ProjectBillingTypesConfigPageProps = {
  permission: string;
};

export function ProjectBillingTypesConfigPage({ permission }: ProjectBillingTypesConfigPageProps) {
  const { user, loading, can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(() => can(permission), [can, permission]);
  const [rows, setRows] = useState<BillingTypeRow[]>([]);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch("/api/project-billing-types");
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
    const code = formCode.trim();
    const name = formName.trim();
    if (!code || !name) {
      setError("Código e nome são obrigatórios.");
      return;
    }
    setSaving(true);
    const r = await apiFetch("/api/project-billing-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar tipo de cobrança.");
      return;
    }
    setFormCode("");
    setFormName("");
    await load();
  }

  async function toggleActive(row: BillingTypeRow) {
    setError(null);
    const r = await apiFetch(`/api/project-billing-types/${row.id}`, {
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigateBack(router, basePath)}
          className="inline-flex items-center gap-1 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--foreground)]">Tipos de cobrança</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Tipos usados nas receitas de projetos (hora, mensal, fixo, marco, etc.).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <FormModalSection title="Novo tipo">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={formModalLabelClass}>Código</label>
            <input
              className={formModalInputClass()}
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              placeholder="Ex: HORA"
            />
          </div>
          <div>
            <label className={formModalLabelClass}>Nome</label>
            <input
              className={formModalInputClass()}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ex: Por hora"
            />
          </div>
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
                  <th className="pb-2 pr-4 font-medium">Código</th>
                  <th className="pb-2 pr-4 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4 font-mono text-xs">{row.code}</td>
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => void toggleActive(row)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
                      >
                        {row.isActive ? "Ativo" : "Inativo"}
                      </button>
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
