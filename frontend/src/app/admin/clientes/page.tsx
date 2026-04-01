"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Eye, Pencil, Trash2, Search, ChevronLeft } from "lucide-react";
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
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const basePath =
    user?.role === "GESTOR_PROJETOS"
      ? "/gestor"
      : user?.role === "CONSULTOR"
        ? "/consultor"
        : "/admin";

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
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Clientes</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie todos os clientes cadastrados no sistema.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Barra de ações */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
              <div className="relative w-56 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar clientes..."
                  className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Novo Cliente
            </button>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500 text-sm">Carregando clientes...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-500 text-sm mb-4">Nenhum cliente cadastrado.</p>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Criar primeiro cliente
              </button>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-500 text-sm">Nenhum cliente encontrado para "{searchTerm}".</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      E-mail
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Telefone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Cidade/Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Projetos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900">{client.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">{client.email || "—"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">{client.telefone || "—"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">
                          {client.cidade && client.estado
                            ? `${client.cidade}/${client.estado}`
                            : "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">{client._count.projects}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`${basePath}/clientes/${client.id}`)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingClient(client)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
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
                            className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
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
