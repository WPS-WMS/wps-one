"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Pencil, Search, ArrowLeft } from "lucide-react";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";
import { FormModalSection } from "@/components/FormModalPrimitives";

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
  birthDate?: string | null;
  clientAccess?: { clientId: string }[];
  ativo?: boolean | null;
  inativadoEm?: string | null;
  inativacaoMotivo?: string | null;
  dataInicioAtividades?: string | null;
};

const ROLES: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN_PORTAL: "Administrador do portal",
  GESTOR_PROJETOS: "Gestor de Projetos",
  CONSULTOR: "Consultor",
  CLIENTE: "Cliente",
};

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super administrador" },
  { value: "ADMIN_PORTAL", label: "Administrador do portal" },
  { value: "GESTOR_PROJETOS", label: "Gestor de Projetos" },
  { value: "CONSULTOR", label: "Consultor" },
  { value: "CLIENTE", label: "Cliente" },
];

const formLabelClass = "block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5";
function formInputClass(hasError?: boolean) {
  const base =
    "w-full px-4 py-3 rounded-xl border bg-[color:var(--surface)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2";
  return hasError
    ? `${base} border-red-500 focus:ring-red-500/40`
    : `${base} border-[color:var(--border)] focus:ring-[color:var(--primary)]/35`;
}
const modalBackdropClass = "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4";

const userModalPanelClass =
  "bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] w-full max-w-2xl max-h-[min(92vh,900px)] shadow-lg flex flex-col overflow-hidden";

export default function UsuariosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
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
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Usuários</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Gerencie todos os usuários do sistema.
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
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar usuários..."
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Novo Usuário
              </button>
            </div>
          </div>
          {loadError && (
            <div className="wps-apontamento-consultor-error rounded-xl border px-4 py-3 text-sm">
              {loadError}
            </div>
          )}
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface)]/80 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">E-mail</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3">Cargo</th>
                    <th className="px-6 py-3">Empresas</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-[color:var(--border)]/70 hover:bg-[color:var(--surface)]/60 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-[color:var(--foreground)]">{u.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[color:var(--muted-foreground)]">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[color:var(--muted-foreground)]">{ROLES[u.role] || u.role}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[color:var(--muted-foreground)]">{u.cargo || "—"}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.role === "CLIENTE" ? (() => {
                          const ids = u.clientAccess?.map((a) => a.clientId) ?? [];
                          if (ids.length === 0) return <div className="text-sm text-[color:var(--muted-foreground)]">—</div>;
                          const names = ids.map((id) => clientsById[id]).filter(Boolean);
                          const label = names.length > 0 ? names.join(", ") : `${ids.length} empresa(s)`;
                          return (
                            <div className="text-sm text-[color:var(--muted-foreground)] max-w-[260px] truncate" title={label}>
                              {label}
                            </div>
                          );
                        })() : (
                          <div className="text-sm text-[color:var(--muted-foreground)]">—</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {u.ativo === false ? (
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
                            onClick={() => setEditingUser(u)}
                            className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusUser(u)}
                            disabled={!!authUser && u.role === "SUPER_ADMIN" && u.id === authUser.id && u.ativo !== false}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                              u.ativo === false
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                            title={
                              !!authUser && u.role === "SUPER_ADMIN" && u.id === authUser.id && u.ativo !== false
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

function LimitePorDiaGrid({
  limitesPorDia,
  setLimitesPorDia,
}: {
  limitesPorDia: Record<DiaKey, string>;
  setLimitesPorDia: Dispatch<SetStateAction<Record<DiaKey, string>>>;
}) {
  return (
    <div>
      <label className={formLabelClass}>Limite diário de horas para apontamento</label>
      <div className="overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
        <div className="flex gap-3 md:grid md:grid-cols-7 md:gap-2">
          {(Object.keys(DIA_LABELS) as DiaKey[]).map((k) => (
            <div
              key={k}
              className="flex w-[5.25rem] shrink-0 flex-col items-center gap-1.5 md:w-auto md:shrink md:min-w-0"
            >
              <span className="text-[11px] font-medium text-[color:var(--muted-foreground)]">{DIA_LABELS[k]}</span>
              <input
                type="text"
                value={limitesPorDia[k]}
                onChange={(e) =>
                  setLimitesPorDia((prev) => ({ ...prev, [k]: e.target.value }))
                }
                className="w-full px-2 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] text-xs text-center focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                placeholder="00:00"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    !isAtivar && !!authUser && user.role === "SUPER_ADMIN" && user.id === authUser.id && user.ativo !== false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (cannotSelfInactivateAdmin) {
        setError("O usuário Super administrador não pode se inativar.");
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

  return (
    <div className={modalBackdropClass} onClick={onClose}>
      <div
        className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {isAtivar ? "Ativar usuário" : "Inativar usuário"}
          </h3>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Usuário: <span className="font-medium text-[color:var(--foreground)]">{user.name}</span>
          </p>
          {!isAtivar && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={formLabelClass}>
                  Motivo da inativação <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)] cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="ROMPIMENTO"
                      checked={motivo === "ROMPIMENTO"}
                      onChange={() => setMotivo("ROMPIMENTO")}
                      className="border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                    />
                    Rompimento de contrato
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)] cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="SOLICITACAO"
                      checked={motivo === "SOLICITACAO"}
                      onChange={() => setMotivo("SOLICITACAO")}
                      className="border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                    />
                    Solicitação de rompimento de contrato
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)] cursor-pointer">
                    <input
                      type="radio"
                      name="motivoInativacao"
                      value="OUTROS"
                      checked={motivo === "OUTROS"}
                      onChange={() => setMotivo("OUTROS")}
                      className="border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                    />
                    Outros
                  </label>
                </div>
              </div>
              <div>
                <label className={formLabelClass}>Descrição breve (opcional)</label>
                <textarea
                  value={descricaoBreve}
                  onChange={(e) => setDescricaoBreve(e.target.value)}
                  className={`${formInputClass()} min-h-[80px] resize-y`}
                  placeholder="Inclua uma observação, se necessário..."
                  maxLength={500}
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-[color:var(--border)] text-[color:var(--foreground)] font-medium hover:opacity-90"
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
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Confirme a ativação deste usuário. Ele voltará a ter acesso ao sistema.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-[color:var(--border)] text-[color:var(--foreground)] font-medium hover:opacity-90"
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
  const [birthDate, setBirthDate] = useState("");
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
        body.birthDate = birthDate || undefined;
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

  return (
    <div className={modalBackdropClass} onClick={onClose}>
      <div className={userModalPanelClass} onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 px-5 pt-5 pb-4 md:px-6 border-b border-[color:var(--border)]">
          <h3 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]">Novo usuário</h3>
          <p className="text-sm text-[color:var(--muted-foreground)] mt-1.5 leading-relaxed">
            Cadastre acesso ao portal e, quando não for perfil Cliente, as regras de apontamento de horas em projetos.
          </p>
        </header>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 space-y-5">
            {error && <p className="text-red-500 text-sm shrink-0">{error}</p>}

            <FormModalSection
              title="Dados de acesso"
              description="Credenciais usadas para entrar no sistema."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={formLabelClass}>
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, name: false }));
                    }}
                    className={formInputClass(!!fieldErrors.name)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className={formLabelClass}>
                    E-mail <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, email: false }));
                    }}
                    className={formInputClass(!!fieldErrors.email)}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className={formLabelClass}>
                    Senha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, password: false }));
                    }}
                    className={formInputClass(!!fieldErrors.password)}
                    placeholder="Senha de acesso"
                  />
                </div>
              </div>
            </FormModalSection>

            <FormModalSection
              title="Perfil e cargo"
              description="Define permissões gerais e o papel na empresa."
            >
              <div>
                <label className={formLabelClass}>
                  Perfil <span className="text-red-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={`${formInputClass()} cursor-pointer`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {role === "CLIENTE" && (
                <div>
                  <label className={formLabelClass}>
                    Empresa <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={clientIds[0] ?? ""}
                    onChange={(e) =>
                      setClientIds(e.target.value ? [e.target.value] : [])
                    }
                    className={`${formInputClass()} cursor-pointer`}
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
                <label className={formLabelClass}>
                  Cargo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cargo}
                  onChange={(e) => {
                    setCargo(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, cargo: false }));
                  }}
                  className={formInputClass(!!fieldErrors.cargo)}
                  placeholder="Cargo na empresa"
                />
              </div>
            </FormModalSection>

            {role !== "CLIENTE" && (
              <FormModalSection title="Dados pessoais" description="Opcional; não afeta o apontamento.">
                <div>
                  <label className={formLabelClass}>
                    Data de nascimento{" "}
                    <span className="text-xs text-[color:var(--muted-foreground)]">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={formInputClass()}
                  />
                </div>
              </FormModalSection>
            )}

            {role !== "CLIENTE" && (
              <FormModalSection
                title="Apontamento de horas"
                description="Regras para registrar horas em projetos e limite por dia da semana (Dom–Sáb), conforme combinado com a gestão."
              >
                <p className="text-sm font-medium text-[color:var(--foreground)]">Permissões</p>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirMaisHoras}
                    onChange={(e) => setPermitirMaisHoras(e.target.checked)}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar mais horas que o planejado
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirFimDeSemana}
                    onChange={(e) => setPermitirFimDeSemana(e.target.checked)}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar em final de semana e feriado
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirOutroPeriodo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPermitirOutroPeriodo(checked);
                      if (!checked) setDiasPermitidos("");
                    }}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar em outro período
                  </span>
                </label>
                {permitirOutroPeriodo && (
                  <div>
                    <label className={formLabelClass}>
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
                      className={formInputClass()}
                      placeholder="Quantidade de dias (somente datas anteriores)"
                    />
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      Informe quantos dias para trás o usuário pode apontar (0 = apenas hoje).
                    </p>
                  </div>
                )}
                <div>
                  <label className={formLabelClass}>
                    Data de início das atividades <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataInicioAtividades}
                    onChange={(e) => {
                      setDataInicioAtividades(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, dataInicioAtividades: false }));
                    }}
                    className={formInputClass(!!fieldErrors.dataInicioAtividades)}
                  />
                </div>
                <LimitePorDiaGrid limitesPorDia={limitesPorDia} setLimitesPorDia={setLimitesPorDia} />
              </FormModalSection>
            )}
          </div>
          <footer className="shrink-0 flex gap-3 px-5 py-4 md:px-6 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[color:var(--border)] text-[color:var(--foreground)] font-medium hover:opacity-90"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[color:var(--primary)] text-[color:var(--primary-foreground)] font-semibold hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </footer>
        </form>
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
  const [birthDate, setBirthDate] = useState(() => {
    if (!user.birthDate) return "";
    return String(user.birthDate).slice(0, 10);
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
        body.birthDate = birthDate || undefined;
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

  return (
    <div className={modalBackdropClass} onClick={onClose}>
      <div className={userModalPanelClass} onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 px-5 pt-5 pb-4 md:px-6 border-b border-[color:var(--border)]">
          <h3 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]">Editar usuário</h3>
          <p className="text-sm text-[color:var(--muted-foreground)] mt-1.5 leading-relaxed">
            Atualize dados de acesso e, para perfis que apontam horas, as regras e o limite por dia da semana.
          </p>
        </header>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 space-y-5">
            {error && <p className="text-red-500 text-sm shrink-0">{error}</p>}

            <FormModalSection
              title="Dados de acesso"
              description="Identificação no portal. A senha só é alterada se você preencher o campo."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={formLabelClass}>
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, name: false }));
                    }}
                    className={formInputClass(!!fieldErrors.name)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className={formLabelClass}>
                    E-mail <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, email: false }));
                    }}
                    className={formInputClass(!!fieldErrors.email)}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className={formLabelClass}>Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={formInputClass()}
                    placeholder="Deixar em branco para não alterar"
                  />
                </div>
              </div>
            </FormModalSection>

            <FormModalSection
              title="Perfil e cargo"
              description="Define permissões gerais e o papel na empresa."
            >
              <div>
                <label className={formLabelClass}>
                  Perfil <span className="text-red-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={`${formInputClass()} cursor-pointer`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {role === "CLIENTE" && (
                <div>
                  <label className={formLabelClass}>
                    Empresa <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={clientIds[0] ?? ""}
                    onChange={(e) =>
                      setClientIds(e.target.value ? [e.target.value] : [])
                    }
                    className={`${formInputClass()} cursor-pointer`}
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
                <label className={formLabelClass}>
                  Cargo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cargo}
                  onChange={(e) => {
                    setCargo(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, cargo: false }));
                  }}
                  className={formInputClass(!!fieldErrors.cargo)}
                  placeholder="Cargo na empresa"
                />
              </div>
            </FormModalSection>

            {role !== "CLIENTE" && (
              <FormModalSection title="Dados pessoais" description="Opcional; não afeta o apontamento.">
                <div>
                  <label className={formLabelClass}>
                    Data de nascimento{" "}
                    <span className="text-xs text-[color:var(--muted-foreground)]">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={formInputClass()}
                  />
                </div>
              </FormModalSection>
            )}

            {role !== "CLIENTE" && (
              <FormModalSection
                title="Apontamento de horas"
                description="Data a partir da qual pode apontar, permissões e limite diário por dia da semana (Dom–Sáb), conforme combinado com a gestão."
              >
                <div>
                  <label className={formLabelClass}>
                    Data de início das atividades <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataInicioAtividades}
                    onChange={(e) => {
                      setDataInicioAtividades(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, dataInicioAtividades: false }));
                    }}
                    className={formInputClass(!!fieldErrors.dataInicioAtividades)}
                  />
                </div>
                <p className="text-sm font-medium text-[color:var(--foreground)] pt-1">Permissões</p>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirMaisHoras}
                    onChange={(e) => setPermitirMaisHoras(e.target.checked)}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar mais horas que o planejado
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirFimDeSemana}
                    onChange={(e) => setPermitirFimDeSemana(e.target.checked)}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar em final de semana e feriado
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={permitirOutroPeriodo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPermitirOutroPeriodo(checked);
                      if (!checked) setDiasPermitidos("");
                    }}
                    className="mt-0.5 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                  />
                  <span className="text-sm text-[color:var(--foreground)] leading-snug">
                    Permitido apontar em outro período
                  </span>
                </label>
                {permitirOutroPeriodo && (
                  <div>
                    <label className={formLabelClass}>
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
                      className={formInputClass()}
                      placeholder="Quantidade de dias (somente datas anteriores)"
                    />
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      Informe quantos dias para trás o usuário pode apontar (0 = apenas hoje).
                    </p>
                  </div>
                )}
                <LimitePorDiaGrid limitesPorDia={limitesPorDia} setLimitesPorDia={setLimitesPorDia} />
              </FormModalSection>
            )}
          </div>
          <footer className="shrink-0 flex gap-3 px-5 py-4 md:px-6 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[color:var(--border)] text-[color:var(--foreground)] font-medium hover:opacity-90"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[color:var(--primary)] text-[color:var(--primary-foreground)] font-semibold hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

