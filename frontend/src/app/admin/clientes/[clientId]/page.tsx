"use client";

import { use, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { NewContactModal } from "@/components/NewContactModal";
import { EditContactModal } from "@/components/EditContactModal";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";
import { useAuth } from "@/contexts/AuthContext";

type PageProps = {
  params: Promise<{ clientId: string }>;
};

type ClientContact = {
  id: string;
  name: string;
  email?: string | null;
  telefone?: string | null;
  createdAt: string;
};

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
  _count: { projects: number; contacts: number };
  contacts: ClientContact[];
  projects: Array<{ id: string; name: string; createdAt: string }>;
};

export default function ClienteDetalhePage({ params }: PageProps) {
  const { clientId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  const basePath =
    user?.role === "GESTOR_PROJETOS"
      ? "/gestor"
      : user?.role === "CONSULTOR"
        ? "/consultor"
        : "/admin";

  const resolvedClientId = useMemo(() => {
    if (clientId && clientId !== "_") return clientId;
    const parts = pathname.split("/").filter(Boolean);
    const idFromPath = parts[parts.length - 1];
    return idFromPath && idFromPath !== "_" ? idFromPath : "";
  }, [clientId, pathname]);

  function loadClient() {
    if (!resolvedClientId) {
      setClient(null);
      setError("Cliente inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(`/api/clients/${resolvedClientId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao carregar cliente");
        return r.json();
      })
      .then(setClient)
      .catch((err) => setError(err?.message ?? "Erro ao carregar cliente"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadClient();
  }, [resolvedClientId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando cliente...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors self-end"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Cliente não encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-slate-900">{client.name}</h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                {client._count.projects} projetos · {client._count.contacts} contatos
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>
          {/* Informações do Cliente */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Informações do Cliente</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">E-mail</p>
                <p className="text-sm text-slate-900">{client.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Telefone</p>
                <p className="text-sm text-slate-900">{client.telefone || "—"}</p>
              </div>
              {client.endereco && (
                <>
                  <div className="md:col-span-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Endereço</p>
                    <p className="text-sm text-slate-900">
                      {client.endereco}
                      {client.numero && `, ${client.numero}`}
                      {client.complemento && ` - ${client.complemento}`}
                    </p>
                    <p className="text-sm text-slate-600">
                      {client.bairro && `${client.bairro}, `}
                      {client.cidade && `${client.cidade}`}
                      {client.estado && `/${client.estado}`}
                      {client.cep && ` - CEP: ${client.cep}`}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contatos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Contatos</h2>
              <button
                type="button"
                onClick={() => setShowNewContactModal(true)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Novo Contato
              </button>
            </div>

            {client.contacts.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Nenhum contato cadastrado.
              </div>
            ) : (
              <div className="space-y-3">
                {client.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{contact.name}</p>
                      <div className="flex gap-4 mt-1">
                        {contact.email && (
                          <p className="text-xs text-slate-600">{contact.email}</p>
                        )}
                        {contact.telefone && (
                          <p className="text-xs text-slate-600">{contact.telefone}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingContact(contact)}
                        className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingContactId(contact.id)}
                        className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projetos */}
          {client.projects.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Projetos Recentes</h2>
              <div className="space-y-2">
                {client.projects.map((project) => (
                  <div
                    key={project.id}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <p className="text-sm font-medium text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {showNewContactModal && (
        <NewContactModal
          clientId={resolvedClientId}
          onClose={() => setShowNewContactModal(false)}
          onSaved={() => {
            setShowNewContactModal(false);
            loadClient();
          }}
        />
      )}

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            setEditingContact(null);
            loadClient();
          }}
        />
      )}

      {deletingContactId && (
        <ConfirmarExclusaoModal
          userName={client.contacts.find((c) => c.id === deletingContactId)?.name ?? "este contato"}
          onClose={() => setDeletingContactId(null)}
          onConfirm={async () => {
            const res = await apiFetch(`/api/client-contacts/${deletingContactId}`, {
              method: "DELETE",
            });
            if (res.ok) {
              setDeletingContactId(null);
              loadClient();
            } else {
              const data = await res.json().catch(() => ({}));
              alert(data?.error ?? "Erro ao excluir contato.");
            }
          }}
        />
      )}
    </div>
  );
}
