"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { navigateBack } from "@/lib/navigateBack";

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
};

type CostCenterOption = { id: string; name: string };

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

  const canAccess = useMemo(() => can("configuracoes.financeiro.planoContas"), [can]);
  const [tab, setTab] = useState<"RECEITA" | "DESPESA">("RECEITA");
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formCostCenterId, setFormCostCenterId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const r = await apiFetch("/api/financial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: tab,
          code: formCode.trim() || null,
          parentId: formParentId || null,
          costCenterId: formCostCenterId || null,
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
      setFormParentId("");
      setFormCostCenterId("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: AccountRow) {
    setSaving(true);
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
      setSaving(false);
    }
  }

  async function removeAccount(id: string) {
    if (!confirm("Excluir esta conta?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/financial-accounts/${id}`, { method: "DELETE" });
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
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Plano de contas</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Estruture receitas e despesas com hierarquia e centro de custo. Valores padrão são criados na primeira visita.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex gap-2">
            {(["RECEITA", "DESPESA"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Código (opcional)"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome da conta"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm sm:col-span-2"
              />
              <select
                value={formParentId}
                onChange={(e) => setFormParentId(e.target.value)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              >
                <option value="">Conta pai (opcional)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={formCostCenterId}
                onChange={(e) => setFormCostCenterId(e.target.value)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              >
                <option value="">Centro de custo (opcional)</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
            {loadingRows ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">Nenhuma conta.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Código</th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Conta</th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Conta pai</th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Centro de custo</th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[color:var(--border)] last:border-b-0">
                      <td className="px-4 py-3 text-[color:var(--foreground)]">{row.code || "—"}</td>
                      <td className="px-4 py-3 font-medium text-[color:var(--foreground)]">{row.name}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{row.parentName || "—"}</td>
                      <td className="px-4 py-3 text-[color:var(--muted-foreground)]">{row.costCenterName || "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          disabled={saving}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {row.isActive ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void removeAccount(row.id)}
                          disabled={saving}
                          className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
