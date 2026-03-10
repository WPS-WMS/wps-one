"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  cargo?: string | null;
  cargaHorariaSemanal?: number | null;
  limiteHorasDiarias?: number | null;
  permitirMaisHoras?: boolean;
  permitirFimDeSemana?: boolean;
  permitirOutroPeriodo?: boolean;
  diasPermitidos?: string | null;
  clientAccess?: { clientId: string }[];
};

const ROLES: Record<string, string> = {
  ADMIN: "Admin",
  GESTOR_PROJETOS: "Gestor de Projetos",
  CONSULTOR: "Consultor",
  CLIENTE: "Cliente",
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "GESTOR_PROJETOS", label: "Gestor de Projetos" },
  { value: "CONSULTOR", label: "Consultor" },
  { value: "CLIENTE", label: "Cliente" },
];

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});

  function loadUsers() {
    apiFetch(`/api/users?q=${encodeURIComponent(search)}`).then((r) => r.json()).then(setUsers);
  }

  useEffect(() => {
    loadUsers();
  }, [search]);

  useEffect(() => {
    apiFetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; name: string }[]) => {
        const map: Record<string, string> = {};
        for (const c of list || []) map[c.id] = c.name;
        setClientsById(map);
      })
      .catch(() => setClientsById({}));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Usuários</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie todos os usuários do sistema.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuários..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Novo Usuário
            </button>
          </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">E-mail</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Cargo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Empresas</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{u.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600">{ROLES[u.role] || u.role}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600">{u.cargo || "—"}</div>
                  </td>
                  <td className="px-6 py-4">
                    {u.role === "CLIENTE" ? (() => {
                      const ids = u.clientAccess?.map((a) => a.clientId) ?? [];
                      if (ids.length === 0) return <div className="text-sm text-slate-600">—</div>;
                      const names = ids.map((id) => clientsById[id]).filter(Boolean);
                      const label = names.length > 0 ? names.join(", ") : `${ids.length} empresa(s)`;
                      return (
                        <div className="text-sm text-slate-600 max-w-[260px] truncate" title={label}>
                          {label}
                        </div>
                      );
                    })() : (
                      <div className="text-sm text-slate-600">—</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(u)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(u.id)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
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
      </main>

      {modalOpen && (
        <NovoUsuarioModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            loadUsers();
          }}
        />
      )}

      {editingUser && (
        <EditarUsuarioModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            loadUsers();
          }}
        />
      )}

      {deletingId && (
        <ConfirmarExclusaoModal
          userName={users.find((u) => u.id === deletingId)?.name ?? "este usuário"}
          onClose={() => setDeletingId(null)}
          onConfirm={async () => {
            const res = await apiFetch(`/api/users/${deletingId}`, { method: "DELETE" });
            if (res.ok) {
              setDeletingId(null);
              loadUsers();
            } else {
              const data = await res.json().catch(() => ({}));
              alert(data.error || "Erro ao excluir");
            }
          }}
        />
      )}
    </div>
  );
}

type ClientOption = { id: string; name: string };

function NovoUsuarioModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("CONSULTOR");
  const [cargo, setCargo] = useState("");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [permitirMaisHoras, setPermitirMaisHoras] = useState(false);
  const [permitirFimDeSemana, setPermitirFimDeSemana] = useState(false);
  const [permitirOutroPeriodo, setPermitirOutroPeriodo] = useState(false);
  const [limiteHorasDiarias, setLimiteHorasDiarias] = useState("08:00");
  const [diasPermitidos, setDiasPermitidos] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; email?: boolean; password?: boolean; cargo?: boolean }>({});

  useEffect(() => {
    if (role === "CLIENTE") {
      apiFetch("/api/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: ClientOption[]) => setClients(list))
        .catch(() => setClients([]));
    } else {
      setClients([]);
      setClientIds([]);
    }
  }, [role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const nextFieldErrors: typeof fieldErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name.trim()) nextFieldErrors.name = true;
    if (!email.trim() || !emailRegex.test(email.trim())) nextFieldErrors.email = true;
    if (!password.trim()) nextFieldErrors.password = true;
    if (!cargo.trim()) nextFieldErrors.cargo = true;
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError("Preencha todos os campos obrigatórios corretamente.");
      return;
    }
    if (role === "CLIENTE" && clientIds.length === 0) {
      setError("Usuários com perfil Cliente devem estar vinculados a pelo menos uma empresa.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        cargo: cargo.trim() || undefined,
        permitirMaisHoras,
        permitirFimDeSemana,
        permitirOutroPeriodo,
        limiteHorasDiarias: limiteHorasDiarias.trim()
          ? (() => {
              const [hh, mm] = limiteHorasDiarias.split(":").map((n) => parseInt(n || "0", 10));
              return hh + (mm || 0) / 60;
            })()
          : undefined,
        diasPermitidos: diasPermitidos.trim() ? parseInt(diasPermitidos, 10) : undefined,
      };
      if (role === "CLIENTE") body.clientIds = clientIds;
      const res = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao salvar");
        return;
      }
      onSaved();
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  const inputBaseClass = "w-full px-4 py-3 rounded-xl bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2";
  const inputClass = `${inputBaseClass} border border-blue-100 focus:ring-blue-300`;
  const labelClass = "block text-sm font-medium text-gray-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-6">Novo usuário</h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: false }));
                }}
                className={`${inputClass} ${fieldErrors.name ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className={labelClass}>
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: false }));
                }}
                className={`${inputClass} ${fieldErrors.email ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className={labelClass}>
                Senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: false }));
                }}
                className={`${inputClass} ${fieldErrors.password ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="Senha de acesso"
              />
            </div>
            <div>
              <label className={labelClass}>
                Perfil <span className="text-red-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {role === "CLIENTE" && (
              <div>
                <label className={labelClass}>
                  Empresa <span className="text-red-500">*</span>
                </label>
                <select
                  value={clientIds[0] ?? ""}
                  onChange={(e) =>
                    setClientIds(e.target.value ? [e.target.value] : [])
                  }
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Selecione</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>
                Cargo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cargo}
                onChange={(e) => {
                  setCargo(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, cargo: false }));
                }}
                className={`${inputClass} ${fieldErrors.cargo ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="Cargo na empresa"
              />
            </div>

            <div className="pt-4 border-t border-blue-50 space-y-4">
              <p className="text-sm font-medium text-gray-700">Permissões</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirMaisHoras}
                  onChange={(e) => setPermitirMaisHoras(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar mais horas que o planejado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirFimDeSemana}
                  onChange={(e) => setPermitirFimDeSemana(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar em final de semana e feriado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirOutroPeriodo}
                  onChange={(e) => setPermitirOutroPeriodo(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar em outro período</span>
              </label>
              <div>
                <label className={labelClass}>Dias permitidos para apontamento</label>
                <input
                  type="number"
                  min={0}
                  value={diasPermitidos}
                  onChange={(e) => setDiasPermitidos(e.target.value)}
                  className={inputClass}
                  placeholder="Quantidade de dias"
                />
              </div>
              <div>
                <label className={labelClass}>Limite diário de horas para apontamento</label>
                <input
                  type="text"
                  value={limiteHorasDiarias}
                  onChange={(e) => setLimiteHorasDiarias(e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 08:00"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Você pode inserir no máximo 23:59 de horas trabalhadas por dia.
                </p>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EditarUsuarioModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user.role);
  const [cargo, setCargo] = useState(user.cargo ?? "");
  const [clientIds, setClientIds] = useState<string[]>(
    () => user.clientAccess?.map((a) => a.clientId) ?? []
  );
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [permitirMaisHoras, setPermitirMaisHoras] = useState(user.permitirMaisHoras ?? false);
  const [permitirFimDeSemana, setPermitirFimDeSemana] = useState(user.permitirFimDeSemana ?? false);
  const [permitirOutroPeriodo, setPermitirOutroPeriodo] = useState(user.permitirOutroPeriodo ?? false);
  const [diasPermitidos, setDiasPermitidos] = useState(() => {
    const d = user.diasPermitidos;
    if (d == null || d === "") return "";
    try {
      const arr = JSON.parse(d);
      return Array.isArray(arr) ? String(arr.length) : String(d);
    } catch {
      return String(d);
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; email?: boolean; cargo?: boolean }>({});

  useEffect(() => {
    if (role === "CLIENTE") {
      apiFetch("/api/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: ClientOption[]) => setClients(list))
        .catch(() => setClients([]));
    } else {
      setClients([]);
      setClientIds([]);
    }
  }, [role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const nextFieldErrors: typeof fieldErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name.trim()) nextFieldErrors.name = true;
    if (!email.trim() || !emailRegex.test(email.trim())) nextFieldErrors.email = true;
    if (!cargo.trim()) nextFieldErrors.cargo = true;
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError("Preencha todos os campos obrigatórios corretamente.");
      return;
    }
    if (role === "CLIENTE" && clientIds.length === 0) {
      setError("Usuários com perfil Cliente devem estar vinculados a pelo menos uma empresa.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        role,
        cargo: cargo.trim() || undefined,
        permitirMaisHoras,
        permitirFimDeSemana,
        permitirOutroPeriodo,
        diasPermitidos: diasPermitidos.trim() ? parseInt(diasPermitidos, 10) : undefined,
      };
      if (password.trim()) body.password = password;
      if (role === "CLIENTE") body.clientIds = clientIds;
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: { error?: string };
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          res.status === 502
            ? (data.error || "Backend offline. Na raiz do projeto execute: npm run backend")
            : (data.error || "Erro ao salvar");
        setError(msg);
        return;
      }
      onSaved();
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-4 py-3 rounded-xl border border-blue-100 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300";
  const labelClass = "block text-sm font-medium text-gray-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-6">Editar usuário</h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: false }));
                }}
                className={`${inputClass} ${fieldErrors.name ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className={labelClass}>
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: false }));
                }}
                className={`${inputClass} ${fieldErrors.email ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className={labelClass}>Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Deixar em branco para não alterar"
              />
            </div>
            <div>
              <label className={labelClass}>
                Perfil <span className="text-red-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {role === "CLIENTE" && (
              <div>
                <label className={labelClass}>
                  Empresa <span className="text-red-500">*</span>
                </label>
                <select
                  value={clientIds[0] ?? ""}
                  onChange={(e) =>
                    setClientIds(e.target.value ? [e.target.value] : [])
                  }
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Selecione</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>
                Cargo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cargo}
                onChange={(e) => {
                  setCargo(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, cargo: false }));
                }}
                className={`${inputClass} ${fieldErrors.cargo ? "border-red-400 focus:ring-red-300" : ""}`}
                placeholder="Cargo na empresa"
              />
            </div>

            <div className="pt-4 border-t border-blue-50 space-y-4">
              <p className="text-sm font-medium text-gray-700">Permissões</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirMaisHoras}
                  onChange={(e) => setPermitirMaisHoras(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar mais horas que o planejado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirFimDeSemana}
                  onChange={(e) => setPermitirFimDeSemana(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar em final de semana e feriado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permitirOutroPeriodo}
                  onChange={(e) => setPermitirOutroPeriodo(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Permitido apontar em outro período</span>
              </label>
              <div>
                <label className={labelClass}>Dias permitidos para apontamento</label>
                <input
                  type="number"
                  min={0}
                  value={diasPermitidos}
                  onChange={(e) => setDiasPermitidos(e.target.value)}
                  className={inputClass}
                  placeholder="Quantidade de dias"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

