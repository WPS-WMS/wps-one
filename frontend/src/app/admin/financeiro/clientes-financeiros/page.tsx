"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type ClientRow = {
  id: string;
  name: string;
  email?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

export default function FinanceiroClientesFinanceirosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => can("financeiro.clientesFinanceiros"), [can]);

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term) ||
        (c.cnpj ?? "").includes(term.replace(/\D/g, "")),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    setLoading(true);
    setError(null);
    apiFetch("/api/clients")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Erro ao carregar clientes.");
        return data as ClientRow[];
      })
      .then(setRows)
      .catch((err) => setError(err?.message ?? "Erro ao carregar clientes."))
      .finally(() => setLoading(false));
  }, [permissionsReady, canAccess]);

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
            Você não tem permissão para gerenciar clientes financeiros.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Clientes financeiros</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Configure dados fiscais, pagamento e contato financeiro por cliente.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted-foreground)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar clientes..."
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum cliente encontrado.</div>
          ) : (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">E-mail</th>
                    <th className="px-6 py-3">Local</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-t border-[color:var(--border)]/70 hover:bg-[color:var(--background)]/40">
                      <td className="px-6 py-4 font-medium text-[color:var(--foreground)]">{row.name}</td>
                      <td className="px-6 py-4 text-[color:var(--muted-foreground)]">{row.email || "—"}</td>
                      <td className="px-6 py-4 text-[color:var(--muted-foreground)]">
                        {row.cidade && row.estado ? `${row.cidade}/${row.estado}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`${basePath}/financeiro/clientes-financeiros/${row.id}`)}
                          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-medium text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10"
                        >
                          <Eye className="h-4 w-4" />
                          Dados financeiros
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
