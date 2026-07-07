"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { displayDocumento } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { NewSupplierModal } from "@/components/finance/NewSupplierModal";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";
import { canFinanceFeature } from "@/lib/financeiroEnv";

type SupplierRow = {
  id: string;
  personType: "PJ" | "PF";
  nomeApelido: string;
  razaoSocial: string | null;
  cnpjCpf: string;
  status: "ATIVO" | "INATIVO";
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  categoryName: string | null;
  attachmentsCount: number;
};

export default function FornecedoresPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.fornecedores"), [can]);

  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ATIVO" | "INATIVO">("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);

  function loadSuppliers() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (statusFilter) params.set("status", statusFilter);
    apiFetch(`/api/suppliers?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Erro ao carregar fornecedores.");
        return data as SupplierRow[];
      })
      .then(setRows)
      .catch((err) => setError(err?.message ?? "Erro ao carregar fornecedores."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    loadSuppliers();
  }, [permissionsReady, canAccess, statusFilter]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    const t = setTimeout(() => loadSuppliers(), 300);
    return () => clearTimeout(t);
  }, [searchTerm, permissionsReady, canAccess, statusFilter]);

  if (!permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
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
            Você não tem permissão para gerenciar fornecedores.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Fornecedores</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Cadastro de parceiros PJ/PF com histórico e anexos de contratos.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, documento ou e-mail..."
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "" | "ATIVO" | "INATIVO")}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm"
                >
                  <option value="">Todos os status</option>
                  <option value="ATIVO">Ativos</option>
                  <option value="INATIVO">Inativos</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)]"
                style={{ background: "var(--primary)" }}
              >
                <Plus className="h-4 w-4" />
                Novo fornecedor
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum fornecedor encontrado.</div>
          ) : (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                      <th className="px-6 py-3">Fornecedor</th>
                      <th className="px-6 py-3">Documento</th>
                      <th className="px-6 py-3">Categoria</th>
                      <th className="px-6 py-3">Contato</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-[color:var(--border)]/70 hover:bg-[color:var(--background)]/40">
                        <td className="px-6 py-4">
                          <div className="font-medium text-[color:var(--foreground)]">{row.nomeApelido}</div>
                          {row.razaoSocial ? (
                            <div className="text-xs text-[color:var(--muted-foreground)]">{row.razaoSocial}</div>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-[color:var(--muted-foreground)]">
                          {displayDocumento(row.personType, row.cnpjCpf)}
                        </td>
                        <td className="px-6 py-4 text-[color:var(--muted-foreground)]">{row.categoryName || "—"}</td>
                        <td className="px-6 py-4 text-[color:var(--muted-foreground)]">
                          <div>{row.email || "—"}</div>
                          {row.telefone ? <div className="text-xs">{row.telefone}</div> : null}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              row.status === "ATIVO"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {row.status === "ATIVO" ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => router.push(`${basePath}/fornecedores/${row.id}`)}
                              className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)]"
                              title="Abrir"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(row)}
                              className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {showNewModal ? (
        <NewSupplierModal
          onClose={() => setShowNewModal(false)}
          onSaved={(id) => {
            setShowNewModal(false);
            router.push(`${basePath}/fornecedores/${id}`);
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmarExclusaoModal
          userName={deleting.nomeApelido}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const r = await apiFetch(`/api/suppliers/${deleting.id}`, { method: "DELETE" });
            if (!r.ok && r.status !== 204) {
              const body = await r.json().catch(() => ({}));
              setError(typeof body?.error === "string" ? body.error : "Não foi possível excluir.");
              setDeleting(null);
              return;
            }
            setDeleting(null);
            loadSuppliers();
          }}
        />
      ) : null}
    </div>
  );
}
