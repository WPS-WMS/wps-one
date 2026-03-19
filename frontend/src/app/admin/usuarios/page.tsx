"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
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
  limiteHorasPorDia?: string | null;
  permitirMaisHoras?: boolean;
  permitirFimDeSemana?: boolean;
  permitirOutroPeriodo?: boolean;
  diasPermitidos?: string | null;
  clientAccess?: { clientId: string }[];
  ativo?: boolean | null;
  inativadoEm?: string | null;
  inativacaoMotivo?: string | null;
  dataInicioAtividades?: string | null;
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
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusUser, setStatusUser] = useState<UserRow | null>(null);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});

  function loadUsers() {
    setLoadError(null);
    apiFetch(`/api/users?q=${encodeURIComponent(search)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(data?.error || "Erro ao carregar usuários.");
        }
        if (!Array.isArray(data)) return [];
        return data as UserRow[];
      })
      .then((data) => setUsers(data))
      .catch((err) => {
        setUsers([]);
        setLoadError(String(err?.message || "Erro ao carregar usuários."));
      });
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
          {loadError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {loadError}
            </div>
          )}
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
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {u.ativo === false ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Inativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Ativo
                      </span>
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
                        onClick={() => setStatusUser(u)}
                        disabled={!!authUser && u.role === "ADMIN" && u.id === authUser.id && u.ativo !== false}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          u.ativo === false
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                        title={
                          !!authUser && u.role === "ADMIN" && u.id === authUser.id && u.ativo !== false
                            ? "O usuário Admin não pode se inativar"
                            : u.ativo === false
                              ? "Ativar usuário"
                              : "Inativar usuário"
                        }
                      >
                        {u.ativo === false ? "Ativar" : "Inativar"}
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

      {statusUser && (
        <InativarUsuarioModal
          user={statusUser}
          onClose={() => setStatusUser(null)}
          onSaved={() => {
            setStatusUser(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

type ClientOption = { id: string; name: string };

type DiaKey = "dom" | "seg" | "ter" | "qua" | "qui" | "sex" | "sab";

const DIA_LABELS: Record<DiaKey, string> = {
  dom: "Dom",
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sáb",
};

function parseLimitesFromUser(
  limiteHorasPorDia?: string | null,
  limiteHorasDiarias?: number | null
): Record<DiaKey, string> {
  const base: Record<DiaKey, string> = {
    dom: "00:00",
    seg: "08:00",
    ter: "08:00",
    qua: "08:00",
    qui: "08:00",
    sex: "08:00",
    sab: "00:00",
  };
  if (!limiteHorasPorDia) return base;
  try {
    const obj = JSON.parse(limiteHorasPorDia) as Record<string, number>;
    (Object.keys(base) as DiaKey[]).forEach((k) => {
      const v = obj[k];
      if (typeof v === "number" && v >= 0) {
        const h = Math.floor(v);
        const m = Math.round((v - h) * 60);
        base[k] = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      }
    });
    return base;
  } catch {
    if (typeof limiteHorasDiarias === "number" && limiteHorasDiarias > 0) {
      const h = Math.floor(limiteHorasDiarias);
      const m = Math.round((limiteHorasDiarias - h) * 60);
      const hhmm = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return { dom: "00:00", seg: hhmm, ter: hhmm, qua: hhmm, qui: hhmm, sex: hhmm, sab: "00:00" };
    }
    return base;
  }
}

function parseHorasToNumber(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n || "0", 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh + mm / 60;
}

function validateLimitesPorDia(limites: Record<DiaKey, string>): string | null {
  // Obrigatório: cada dia deve estar em HH:MM e dentro de 00:00–23:59
  // e pelo menos um dia deve ser > 00:00.
  let anyPositive = false;
  for (const k of Object.keys(DIA_LABELS) as DiaKey[]) {
    const raw = (limites[k] ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(raw)) {
      return `Preencha o limite diário em formato HH:MM para ${DIA_LABELS[k]}.`;
    }
    const [hhStr, mmStr] = raw.split(":");
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr, 10);
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return `Valor inválido no limite diário de ${DIA_LABELS[k]} (use 00:00 até 23:59).`;
    }
    if (hh > 0 || mm > 0) anyPositive = true;
  }
  if (!anyPositive) {
    return "O limite diário não pode ser 00:00 para todos os dias.";
  }
  return null;
}

function InativarUsuarioModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: authUser } = useAuth();
  const [motivo, setMotivo] = useState<"ROMPIMENTO" | "SOLICITACAO" | "OUTROS">("ROMPIMENTO");
  const [descricaoBreve, setDescricaoBreve] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAtivar = user.ativo === false;
  const cannotSelfInactivateAdmin =
    !isAtivar && !!authUser && user.role === "ADMIN" && user.id === authUser.id && user.ativo !== false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (cannotSelfInactivateAdmin) {
        setError("O usuário Admin não pode se inativar.");
        return;
      }
      const body: Record<string, unknown> = {
        ativo: isAtivar,
      };
      if (!isAtivar) {
        const baseMotivo =
          motivo === "ROMPIMENTO"
            ? "Rompimento de contrato"
            : motivo === "SOLICITACAO"
            ? "Solicitação de rompimento de contrato"
            : "Outros";
        const desc = descricaoBreve.trim();
        body.inativacaoMotivo = desc ? `${baseMotivo} - ${desc}` : baseMotivo;
      }
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao atualizar usuário.");
        return;
      }
      onSaved();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "block text-sm font-medium text-gray-600 mb-1.5";
  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-blue-100 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">
            {isAtivar ? "Ativar usuário" : "Inativar usuário"}
          </h3>
          <p className="text-sm text-gray-600">
            Usuário: <span className="font-medium">{user.name}</span>
          </p>
          {!isAtivar && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>
                  Motivo da inativação <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="ROMPIMENTO"
                      checked={motivo === "ROMPIMENTO"}
                      onChange={() => setMotivo("ROMPIMENTO")}
                      className="text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    Rompimento de contrato
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="SOLICITACAO"
                      checked={motivo === "SOLICITACAO"}
                      onChange={() => setMotivo("SOLICITACAO")}
                      className="text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    Solicitação de rompimento de contrato
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="OUTROS"
                      checked={motivo === "OUTROS"}
                      onChange={() => setMotivo("OUTROS")}
                      className="text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    Outros
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>Descrição breve (opcional)</label>
                <textarea
                  value={descricaoBreve}
                  onChange={(e) => setDescricaoBreve(e.target.value)}
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder="Inclua uma observação, se necessário..."
                  maxLength={500}
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar inativação"}
                </button>
              </div>
            </form>
          )}
          {isAtivar && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <p className="text-sm text-gray-600">
                Confirme a ativação deste usuário. Ele voltará a ter acesso ao sistema.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar ativação"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [limitesPorDia, setLimitesPorDia] = useState<Record<DiaKey, string>>({
    dom: "00:00",
    seg: "08:00",
    ter: "08:00",
    qua: "08:00",
    qui: "08:00",
    sex: "08:00",
    sab: "00:00",
  });
  const [diasPermitidos, setDiasPermitidos] = useState("");
  const [dataInicioAtividades, setDataInicioAtividades] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; email?: boolean; password?: boolean; cargo?: boolean; dataInicioAtividades?: boolean }>({});

  useEffect(() => {
    if (role === "CLIENTE") {
      apiFetch("/api/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: ClientOption[]) => setClients(list))
        .catch(() => setClients([]));
      // Cliente não aponta horas: resetar configurações de apontamento
      setPermitirMaisHoras(false);
      setPermitirFimDeSemana(false);
      setPermitirOutroPeriodo(false);
      setDiasPermitidos("");
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
    // Cliente não aponta horas: não exige data de início nem configurações de apontamento
    if (role !== "CLIENTE" && !dataInicioAtividades) nextFieldErrors.dataInicioAtividades = true;
    // Quando "Permitido apontar em outro período" estiver marcado,
    // o campo "Dias permitidos para apontamento" passa a ser obrigatório.
    if (role !== "CLIENTE" && permitirOutroPeriodo) {
      const diasNum = diasPermitidos.trim() ? parseInt(diasPermitidos, 10) : NaN;
      if (Number.isNaN(diasNum) || diasNum < 0) {
        nextFieldErrors.dataInicioAtividades = nextFieldErrors.dataInicioAtividades || false;
        setError("Informe uma quantidade válida de dias permitidos para apontamento (0 ou mais).");
        // marcamos erro de validação genérico para impedir o submit
        setFieldErrors(nextFieldErrors);
        return;
      }
    }

    if (role !== "CLIENTE") {
      const limiteErr = validateLimitesPorDia(limitesPorDia);
      if (limiteErr) {
        setError(limiteErr);
        return;
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      if (!error) {
        setError("Preencha todos os campos obrigatórios corretamente.");
      }
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
      };
      if (role !== "CLIENTE") {
        body.permitirMaisHoras = permitirMaisHoras;
        body.permitirFimDeSemana = permitirFimDeSemana;
        body.permitirOutroPeriodo = permitirOutroPeriodo;
        body.limiteHorasPorDia = (() => {
          const result: Record<string, number> = {};
          (Object.keys(limitesPorDia) as DiaKey[]).forEach((k) => {
            result[k] = parseHorasToNumber(limitesPorDia[k]);
          });
          return result;
        })();
        body.limiteHorasDiarias = (() => {
          const valores = (Object.keys(limitesPorDia) as DiaKey[]).map((k) =>
            parseHorasToNumber(limitesPorDia[k]),
          );
          return Math.max(...valores, 0);
        })();
        body.diasPermitidos = diasPermitidos.trim() ? parseInt(diasPermitidos, 10) : undefined;
        body.dataInicioAtividades = dataInicioAtividades || undefined;
      }
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

            {role !== "CLIENTE" && (
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
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPermitirOutroPeriodo(checked);
                      if (!checked) setDiasPermitidos("");
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Permitido apontar em outro período</span>
                </label>
                {permitirOutroPeriodo && (
                  <div>
                    <label className={labelClass}>
                      Dias permitidos para apontamento <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={diasPermitidos}
                      onChange={(e) => {
                        const raw = e.target.value.replace("-", "");
                        setDiasPermitidos(raw);
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setDiasPermitidos("");
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isNaN(n) || n < 0) {
                          setDiasPermitidos("0");
                        } else {
                          setDiasPermitidos(String(n));
                        }
                      }}
                      className={inputClass}
                      placeholder="Quantidade de dias (somente datas anteriores)"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Informe quantos dias para trás o usuário pode apontar (0 = apenas hoje).
                    </p>
                  </div>
                )}
                <div>
                  <label className={labelClass}>
                    Data de início das atividades <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataInicioAtividades}
                    onChange={(e) => {
                      setDataInicioAtividades(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, dataInicioAtividades: false }));
                    }}
                    className={`${inputClass} ${
                      fieldErrors.dataInicioAtividades ? "border-red-400 focus:ring-red-300" : ""
                    }`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Limite diário de horas para apontamento</label>
                  <div className="grid grid-cols-7 gap-2 text-xs text-center mb-1">
                    {(Object.keys(DIA_LABELS) as DiaKey[]).map((k) => (
                      <div key={k} className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-medium text-gray-600">{DIA_LABELS[k]}</span>
                        <input
                          type="text"
                          value={limitesPorDia[k]}
                          onChange={(e) =>
                            setLimitesPorDia((prev) => ({ ...prev, [k]: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg border border-blue-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                          placeholder="00:00"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Você pode inserir no máximo 23:59 de horas trabalhadas por dia.
                  </p>
                </div>
              </div>
            )}

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
  const [limitesPorDia, setLimitesPorDia] = useState<Record<DiaKey, string>>(
    () => parseLimitesFromUser(user.limiteHorasPorDia, user.limiteHorasDiarias ?? undefined),
  );
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
  const [dataInicioAtividades, setDataInicioAtividades] = useState(() => {
    if (!user.dataInicioAtividades) return "";
    return String(user.dataInicioAtividades).slice(0, 10);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: boolean;
    email?: boolean;
    cargo?: boolean;
    dataInicioAtividades?: boolean;
  }>({});

  useEffect(() => {
    if (role === "CLIENTE") {
      apiFetch("/api/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: ClientOption[]) => setClients(list))
        .catch(() => setClients([]));
      // Cliente não aponta horas: resetar configurações de apontamento
      setPermitirMaisHoras(false);
      setPermitirFimDeSemana(false);
      setPermitirOutroPeriodo(false);
      setDiasPermitidos("");
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
    if (role !== "CLIENTE" && !dataInicioAtividades) nextFieldErrors.dataInicioAtividades = true;
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError("Preencha todos os campos obrigatórios corretamente.");
      return;
    }

    if (role !== "CLIENTE") {
      const limiteErr = validateLimitesPorDia(limitesPorDia);
      if (limiteErr) {
        setError(limiteErr);
        return;
      }
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
      };
      if (role !== "CLIENTE") {
        body.permitirMaisHoras = permitirMaisHoras;
        body.permitirFimDeSemana = permitirFimDeSemana;
        body.permitirOutroPeriodo = permitirOutroPeriodo;
        body.limiteHorasPorDia = (() => {
          const result: Record<string, number> = {};
          (Object.keys(limitesPorDia) as DiaKey[]).forEach((k) => {
            result[k] = parseHorasToNumber(limitesPorDia[k]);
          });
          return result;
        })();
        body.limiteHorasDiarias = (() => {
          const valores = (Object.keys(limitesPorDia) as DiaKey[]).map((k) =>
            parseHorasToNumber(limitesPorDia[k]),
          );
          return Math.max(...valores, 0);
        })();
        body.diasPermitidos = diasPermitidos.trim() ? parseInt(diasPermitidos, 10) : undefined;
        body.dataInicioAtividades = dataInicioAtividades || undefined;
      } else {
        // Cliente não aponta horas: ao editar/migrar para CLIENTE, limpar configs
        body.dataInicioAtividades = null;
        body.diasPermitidos = null;
        body.limiteHorasPorDia = null;
        body.limiteHorasDiarias = null;
        body.permitirMaisHoras = false;
        body.permitirFimDeSemana = false;
        body.permitirOutroPeriodo = false;
      }
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
            {role !== "CLIENTE" && (
              <>
                <div>
                  <label className={labelClass}>
                    Data de início das atividades <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataInicioAtividades}
                    onChange={(e) => {
                      setDataInicioAtividades(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, dataInicioAtividades: false }));
                    }}
                    className={`${inputClass} ${
                      fieldErrors.dataInicioAtividades ? "border-red-400 focus:ring-red-300" : ""
                    }`}
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
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPermitirOutroPeriodo(checked);
                        if (!checked) setDiasPermitidos("");
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Permitido apontar em outro período</span>
                  </label>
                  {permitirOutroPeriodo && (
                    <div>
                      <label className={labelClass}>
                        Dias permitidos para apontamento <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={diasPermitidos}
                        onChange={(e) => {
                          const raw = e.target.value.replace("-", "");
                          setDiasPermitidos(raw);
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) {
                            setDiasPermitidos("");
                            return;
                          }
                          const n = Number(raw);
                          if (Number.isNaN(n) || n < 0) {
                            setDiasPermitidos("0");
                          } else {
                            setDiasPermitidos(String(n));
                          }
                        }}
                        className={inputClass}
                        placeholder="Quantidade de dias (somente datas anteriores)"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Informe quantos dias para trás o usuário pode apontar (0 = apenas hoje).
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Limite diário de horas para apontamento</label>
                    <div className="grid grid-cols-7 gap-2 text-xs text-center mb-1">
                      {(Object.keys(DIA_LABELS) as DiaKey[]).map((k) => (
                        <div key={k} className="flex flex-col items-center gap-1">
                          <span className="text-[11px] font-medium text-gray-600">{DIA_LABELS[k]}</span>
                          <input
                            type="text"
                            value={limitesPorDia[k]}
                            onChange={(e) =>
                              setLimitesPorDia((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-blue-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                            placeholder="00:00"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Você pode inserir no máximo 23:59 de horas trabalhadas por dia.
                    </p>
                  </div>
                </div>
              </>
            )}

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

