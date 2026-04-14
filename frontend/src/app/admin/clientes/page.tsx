"use client";

import { useEffect, useState, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Eye, Pencil, Trash2, Search, ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { NewClientModal } from "@/components/NewClientModal";
import { EditClientModal } from "@/components/EditClientModal";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";
import { useAuth } from "@/contexts/AuthContext";

type Client = {
  id: string;
  name: string;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  createdAt: string;
  _count: { projects: number };
};

export default function ClientesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term),
    );
  }, [clients, searchTerm]);

  function loadClients() {
    setLoading(true);
    setError(null);
    apiFetch("/api/clients")
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar clientes");
        return r.json();
      })
      .then(setClients)
      .catch((err) => setError(err?.message ?? "Erro ao carregar clientes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadClients();
  }, []);

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
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Clientes</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Gerencie todos os clientes cadastrados no sistema.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative min-w-0 flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar clientes..."
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Novo Cliente
              </button>
            </div>
          </div>
          {error && (
            <div className="wps-apontamento-consultor-error rounded-xl border px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <p className="text-[color:var(--muted-foreground)] text-sm">Carregando clientes...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <p className="text-[color:var(--muted-foreground)] text-sm mb-4 text-center">Nenhum cliente cadastrado.</p>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Criar primeiro cliente
              </button>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <p className="text-[color:var(--muted-foreground)] text-sm text-center">
                Nenhum cliente encontrado para &quot;{searchTerm}&quot;.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface)]/80 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                      <th className="px-6 py-3">Nome</th>
                      <th className="px-6 py-3">E-mail</th>
                      <th className="px-6 py-3">Telefone</th>
                      <th className="px-6 py-3">Cidade/Estado</th>
                      <th className="px-6 py-3">Projetos</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className="border-t border-[color:var(--border)]/70 hover:bg-[color:var(--surface)]/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-[color:var(--foreground)]">{client.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-[color:var(--muted-foreground)]">{client.email || "—"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-[color:var(--muted-foreground)]">{client.telefone || "—"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-[color:var(--muted-foreground)]">
                            {client.cidade && client.estado
                              ? `${client.cidade}/${client.estado}`
                              : "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm tabular-nums text-[color:var(--muted-foreground)]">{client._count.projects}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => router.push(`${basePath}/clientes/${client.id}`)}
                              className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-colors"
                              title="Visualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingClient(client)}
                              className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (client._count.projects > 0) return;
                                setDeletingId(client.id);
                              }}
                              disabled={client._count.projects > 0}
                              className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-red-500/10 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--muted-foreground)]"
                              title={
                                client._count.projects > 0
                                  ? "Não é possível excluir cliente com projetos associados"
                                  : "Excluir"
                              }
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

      {showNewModal && (
        <NewClientModal
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            loadClients();
          }}
        />
      )}

      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => {
            setEditingClient(null);
            loadClients();
          }}
        />
      )}

      {deletingId && (
        <ConfirmarExclusaoModal
          userName={clients.find((c) => c.id === deletingId)?.name ?? "este cliente"}
          onClose={() => setDeletingId(null)}
          onConfirm={async () => {
            const res = await apiFetch(`/api/clients/${deletingId}`, { method: "DELETE" });
            if (res.ok) {
              setDeletingId(null);
              loadClients();
            } else {
              const data = await res.json().catch(() => ({}));
              alert(data?.error ?? "Erro ao excluir cliente.");
            }
          }}
        />
      )}
    </div>
  );
}
