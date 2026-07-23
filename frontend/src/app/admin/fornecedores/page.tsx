"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { displayDocumento } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { NewSupplierModal } from "@/components/finance/NewSupplierModal";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import { unwrapPaginatedList } from "@/lib/financePaginated";
import { navigateBack } from "@/lib/navigateBack";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

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
  const [listTotal, setListTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const listLimit = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ATIVO" | "INATIVO">("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function loadSuppliers(offset = 0) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", String(listLimit));
    params.set("offset", String(offset));
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (statusFilter) params.set("status", statusFilter);
    apiFetch(`/api/suppliers?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Erro ao carregar fornecedores.");
        return unwrapPaginatedList<SupplierRow>(data);
      })
      .then((page) => {
        setRows(page.items);
        setListTotal(page.total);
        setListOffset(offset);
      })
      .catch((err) => setError(err?.message ?? "Erro ao carregar fornecedores."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    const t = setTimeout(() => loadSuppliers(0), searchTerm ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce search/status
  }, [searchTerm, statusFilter, permissionsReady, canAccess]);

  async function toggleSupplierStatus(row: SupplierRow) {
    const nextStatus = row.status === "ATIVO" ? "INATIVO" : "ATIVO";
    setTogglingId(row.id);
    setError(null);
    try {
      const r = await apiFetch(`/api/suppliers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Não foi possível alterar o status.");
      }
      loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar status.");
    } finally {
      setTogglingId(null);
    }
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
                <div className="w-full min-w-[11rem] max-w-[13rem]">
                  <PopoverSelect
                    id="fornecedores-status-filter"
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as "" | "ATIVO" | "INATIVO")}
                    placeholder="Todos os status"
                    options={[
                      { value: "", label: "Todos os status" },
                      { value: "ATIVO", label: "Ativos" },
                      { value: "INATIVO", label: "Inativos" },
                    ]}
                  />
                </div>
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
                      <th className="px-6 py-3 text-center">Status</th>
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
                        <td className="px-6 py-4 text-center">
                          {row.status === "INATIVO" ? (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              Inativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`${basePath}/fornecedores/${row.id}`)}
                              className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleSupplierStatus(row)}
                              disabled={togglingId === row.id}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                row.status === "INATIVO"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              } disabled:opacity-60 disabled:cursor-not-allowed`}
                              title={row.status === "INATIVO" ? "Ativar fornecedor" : "Inativar fornecedor"}
                            >
                              {row.status === "INATIVO" ? "Ativar" : "Inativar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {listTotal > listLimit ? (
                <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-6 py-3 text-sm">
                  <span className="text-[color:var(--muted-foreground)]">
                    {listOffset + 1}–{Math.min(listOffset + listLimit, listTotal)} de {listTotal}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={listOffset <= 0 || loading}
                      className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                      onClick={() => loadSuppliers(Math.max(0, listOffset - listLimit))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={listOffset + listLimit >= listTotal || loading}
                      className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                      onClick={() => loadSuppliers(listOffset + listLimit)}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              ) : null}
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
    </div>
  );
}
