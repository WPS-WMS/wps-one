"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { TimeEntryPermissionModal, isOutsideAllowedHours, type TimeEntryPermissionPayload } from "@/components/TimeEntryPermissionModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Plus, Trash2 } from "lucide-react";

const DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_META = 8;

function getDailyLimitFromUserForDate(
  user: { limiteHorasPorDia?: string; limiteHorasDiarias?: number } | null,
  date: Date,
): number {
  const dow = date.getDay();
  const defaultDaily = dow === 0 || dow === 6 ? 0 : HORAS_META;
  if (!user) return defaultDaily;

  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : HORAS_META;
  const raw = user.limiteHorasPorDia;
  if (!raw) {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    const key = keys[dow] as string;
    const v = map[key];
    if (typeof v === "number" && v >= 0) return v;
    return dow === 0 || dow === 6 ? 0 : fallback;
  } catch {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
}

function getWeekBounds(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const dom = new Date(d);
  dom.setDate(diff);
  const sab = new Date(dom);
  sab.setDate(sab.getDate() + 6);
  sab.setHours(23, 59, 59, 999);
  return { dom, sab };
}

function fmt(n: number) {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

type TimeEntryFull = {
  id: string;
  date: string;
  totalHoras: number;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  description?: string | null;
  project?: { id: string; name: string; clientId?: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string };
  activity?: { id: string; name: string };
};

type TimeEntryRequest = {
  id: string;
  date: string;
  totalHoras: number;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  description?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  project?: { id: string; name: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string } | null;
};

export function ApontamentoClient() {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    const diff = d.getDate() - d.getDay();
    const dom = new Date(d);
    dom.setDate(diff);
    return dom;
  });
  const [entries, setEntries] = useState<TimeEntryFull[]>([]);
  const [requests, setRequests] = useState<TimeEntryRequest[]>([]);
  const [modal, setModal] = useState<{ date: Date; baseTotal: number } | null>(null);
  const [editEntry, setEditEntry] = useState<TimeEntryFull | null>(null);
  const { dom, sab } = getWeekBounds(weekStart);
  const { user } = useAuth();

  function loadEntries() {
    apiFetch(`/api/time-entries?start=${dom.toISOString()}&end=${sab.toISOString()}`)
      .then((r) => r.json())
      .then(setEntries)
      .catch((err) => console.error("Erro ao carregar apontamentos:", err));
  }

  function loadRequests() {
    apiFetch("/api/permission-requests?scope=own")
      .then((r) => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) {
          setRequests([]);
          return;
        }
        const mapped: TimeEntryRequest[] = data.map((req) => ({
          id: req.id,
          date: req.date,
          totalHoras: req.totalHoras,
          horaInicio: req.horaInicio,
          horaFim: req.horaFim,
          intervaloInicio: req.intervaloInicio,
          intervaloFim: req.intervaloFim,
          description: req.description,
          status: req.status as "PENDING" | "APPROVED" | "REJECTED",
          project: req.project
            ? {
                id: req.project.id,
                name: req.project.name,
                client: req.project.client ?? undefined,
              }
            : undefined,
          ticket: req.ticket
            ? {
                id: req.ticket.id,
                code: req.ticket.code,
                title: req.ticket.title,
              }
            : undefined,
        }));
        setRequests(mapped);
      })
      .catch((err) => {
        console.error("Erro ao carregar solicitações de apontamento:", err);
        setRequests([]);
      });
  }

  useEffect(() => {
    loadEntries();
    loadRequests();
  }, [dom.toISOString(), sab.toISOString()]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dom);
    d.setDate(d.getDate() + i);
    return d;
  });

  const entriesByDay = days.reduce<Record<string, TimeEntryFull[]>>((acc, d) => {
    const key = d.toDateString();
    acc[key] = entries.filter((e) => {
      const ed = e.date.slice(0, 10);
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return ed === dStr;
    });
    return acc;
  }, {});

  const requestsByDay = days.reduce<Record<string, TimeEntryRequest[]>>((acc, d) => {
    const key = d.toDateString();
    acc[key] = requests.filter((r) => {
      const ed = String(r.date).slice(0, 10);
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // Mostrar apenas pendentes e reprovados; aprovados já viram TimeEntry
      return ed === dStr && (r.status === "PENDING" || r.status === "REJECTED");
    });
    return acc;
  }, {});

  const dailyLimits = days.map((d) => getDailyLimitFromUserForDate(user, d));
  const totalSemana = entries.reduce((s, e) => s + e.totalHoras, 0);
  const metaSemana = dailyLimits.reduce((s, v) => s + v, 0);
  // Se ainda não há apontamentos, o saldo deve iniciar zerado
  const saldoSemana = totalSemana === 0 ? 0 : totalSemana - metaSemana;

  function prevWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 7);
      return n;
    });
  }
  function nextWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 7);
      return n;
    });
  }
  function goToday() {
    const d = new Date();
    const diff = d.getDate() - d.getDay();
    const dom = new Date(d);
    dom.setDate(diff);
    setWeekStart(dom);
  }

  const semanaNum = Math.ceil(dom.getDate() / 7);

  return (
    <div className="space-y-4">
      {/* Header com navegação e resumo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-gray-700"
          >
            ←
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-sm text-gray-700"
          >
            Hoje
          </button>
          <button
            onClick={nextWeek}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-gray-700"
          >
            →
          </button>
        </div>
        <p className="text-gray-600 text-sm font-medium">
          {dom.toLocaleDateString("pt-BR", { month: "long" })} {dom.getFullYear()} · {semanaNum}ª semana
        </p>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600 font-medium">Horas da Semana: {fmt(totalSemana)}</span>
          <span className={`font-medium ${saldoSemana >= 0 ? "text-green-600" : "text-red-600"}`}>
            Saldo: {saldoSemana >= 0 ? "+" : ""}{fmt(saldoSemana)}
          </span>
        </div>
      </div>

      {/* 7 colunas */}
      <div className="grid grid-cols-7 gap-2 min-w-0">
        {days.map((d, index) => {
          const key = d.toDateString();
          const dayEntries = entriesByDay[key] ?? [];
          const dayRequests = requestsByDay[key] ?? [];
          const totalDay = dayEntries.reduce((s, e) => s + e.totalHoras, 0);
          const meta = dailyLimits[index] ?? 0;

          return (
            <div
              key={key}
              className="flex flex-col min-w-0 rounded-xl border border-blue-100 bg-white overflow-hidden"
            >
              {/* Cabeçalho do dia */}
              <div className="px-2 py-2 text-center">
                <div className="text-sm font-medium text-gray-800">
                  {d.getDate()} {DIAS_ABREV[d.getDay()]}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                    {fmt(totalDay)} de {fmt(meta)}
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                      style={{
                        width: `${
                          meta > 0
                            ? Math.min(100, (totalDay / meta) * 100)
                            : totalDay > 0
                            ? 100
                            : 0
                        }%`,
                      }}
                  />
                </div>
              </div>

              {/* + logo abaixo do dia */}
              <div className="px-2 pb-2 flex justify-center">
                  <button
                    onClick={() => setModal({ date: new Date(d), baseTotal: totalDay })}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-all text-sm font-medium"
                  title={`Adicionar apontamento em ${d.toLocaleDateString("pt-BR")}`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  Adicionar
                </button>
              </div>

              {/* Cards de apontamentos */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[140px]">
                {dayEntries.length === 0 && dayRequests.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-6">Sem apontamentos</div>
                ) : (
                  <>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => setEditEntry(e)}
                        className="group rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm cursor-pointer hover:bg-blue-100/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-blue-600 font-semibold text-base">{fmt(e.totalHoras)}</div>
                            {e.ticket && (
                              <div className="text-gray-600 truncate mt-0.5" title={e.ticket.title}>
                                {e.ticket.code}: {e.ticket.title}
                              </div>
                            )}
                            {e.project && (
                              <div className="text-gray-500 truncate text-xs mt-0.5">
                                {e.project.client?.name} - {e.project.name}
                              </div>
                            )}
                            <div className="text-gray-400 text-xs mt-1">
                              {e.horaInicio} - {e.horaFim}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (!confirm("Excluir este apontamento?")) return;
                              apiFetch(`/api/time-entries/${e.id}`, { method: "DELETE" })
                                .then(() => loadEntries())
                                .catch((err) => console.error("Erro ao excluir:", err));
                            }}
                            className="shrink-0 p-1.5 rounded-md hover:bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {dayRequests.map((r) => (
                      <div
                        key={r.id}
                        className={`group rounded-lg border p-3 text-sm transition-colors ${
                          r.status === "PENDING"
                            ? "border-amber-200 bg-amber-50/60"
                            : "border-red-200 bg-red-50/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-mono font-semibold text-base text-gray-800">
                                {fmt(r.totalHoras)}
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  r.status === "PENDING"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {r.status === "PENDING" ? "Aguardando aprovação" : "Reprovado"}
                              </span>
                            </div>
                            {r.ticket && (
                              <div className="text-gray-700 truncate mt-0.5" title={r.ticket.title}>
                                {r.ticket.code}: {r.ticket.title}
                              </div>
                            )}
                            {r.project && (
                              <div className="text-gray-500 truncate text-xs mt-0.5">
                                {r.project.client?.name ? `${r.project.client.name} - ` : ""}
                                {r.project.name}
                              </div>
                            )}
                            <div className="text-gray-400 text-xs mt-1">
                              {r.horaInicio} - {r.horaFim}
                            </div>
                            {r.description && (
                              <div className="text-gray-500 text-xs mt-1 line-clamp-2">
                                {r.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <ApontamentoModal
          date={modal.date}
          baseDayTotal={modal.baseTotal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            loadEntries();
            loadRequests();
          }}
        />
      )}
      {editEntry && (
        <ApontamentoModal
          date={new Date(editEntry.date)}
          baseDayTotal={entries
            .filter(
              (e) =>
                String(e.date).slice(0, 10) === String(editEntry.date).slice(0, 10),
            )
            .reduce((sum, e) => sum + e.totalHoras, 0)}
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            loadEntries();
            loadRequests();
          }}
        />
      )}
    </div>
  );
}

function ApontamentoModal({
  date,
  baseDayTotal,
  entry,
  onClose,
  onSaved,
}: {
  date: Date;
  baseDayTotal: number;
  entry?: TimeEntryFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; clientId?: string; client?: { id: string } }>
  >([]);
  type TicketForSelect = {
    id: string;
    code: string;
    title: string;
    projectId: string;
    type?: string;
    parentTicketId?: string | null;
  };
  const [tickets, setTickets] = useState<TicketForSelect[]>([]);
  const [activities, setActivities] = useState<Array<{ id: string; name: string }>>([]);
  const [clientId, setClientId] = useState(entry?.project?.clientId ?? entry?.project?.client?.id ?? "");
  const [projectId, setProjectId] = useState(entry?.project?.id ?? "");
  const [topicId, setTopicId] = useState<string>("");
  const [ticketId, setTicketId] = useState(entry?.ticket?.id ?? "");
  const [activityId, setActivityId] = useState(entry?.activity?.id ?? "");
  const [horaInicio, setHoraInicio] = useState(entry?.horaInicio ?? "09:00");
  const [horaFim, setHoraFim] = useState(entry?.horaFim ?? "17:00");
  const [intervaloInicio, setIntervaloInicio] = useState(entry?.intervaloInicio ?? "");
  const [intervaloFim, setIntervaloFim] = useState(entry?.intervaloFim ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [permissionPayload, setPermissionPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const [overLimitPayload, setOverLimitPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    apiFetch("/api/clients")
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then(setClients);
    apiFetch("/api/activities")
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]));
  }, []);
  useEffect(() => {
    if (!clientId) {
      setProjects([]);
      setProjectId("");
      setTicketId("");
      return;
    }
    const entryClientId = entry?.project?.clientId ?? entry?.project?.client?.id;
    const isEditSameClient = entry && clientId === entryClientId;
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((list: Array<{ id: string; name: string; clientId?: string; client?: { id: string } }>) =>
        setProjects(list.filter((p) => (p.clientId || p.client?.id) === clientId))
      );
    if (!isEditSameClient) {
      setProjectId("");
      setTicketId("");
    }
  }, [clientId, entry?.project?.clientId, entry?.project?.client?.id]);
  useEffect(() => {
    if (!projectId) {
      setTickets([]);
      setTopicId("");
      setTicketId("");
      return;
    }
    const isEditSameProject = entry && projectId === entry.project?.id;
    apiFetch(`/api/tickets?projectId=${projectId}`)
      .then((r) => r.json())
      .then((list) => {
        setTickets(Array.isArray(list) ? list : []);
      });
    if (!isEditSameProject) {
      setTopicId("");
      setTicketId("");
    }
  }, [projectId, entry?.project?.id]);

  const topics = tickets.filter((t) => t.type === "SUBPROJETO");
  const taskOptions = tickets.filter(
    (t) =>
      t.type !== "SUBPROJETO" &&
      t.type !== "SUBTAREFA" &&
      (!topicId || t.parentTicketId === topicId),
  );

  function formatHorasInput(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits + (digits.length > 0 ? ":" : "");
    return digits.slice(0, 2) + ":" + digits.slice(2, 4);
  }

  function parseHours(h: string): number {
    if (!h?.trim()) return 0;
    const parts = h.trim().split(":").map(Number);
    const hh = isNaN(parts[0]) ? 0 : parts[0];
    const mm = isNaN(parts[1]) ? 0 : parts[1];
    return hh + mm / 60;
  }

  function calcTotal() {
    let t = parseHours(horaFim) - parseHours(horaInicio);
    if (intervaloInicio && intervaloFim) t -= parseHours(intervaloFim) - parseHours(intervaloInicio);
    return t > 0 ? fmt(t) : "00:00";
  }

  function calcTotalHorasDecimal(): number {
    let t = parseHours(horaFim) - parseHours(horaInicio);
    if (intervaloInicio && intervaloFim) t -= parseHours(intervaloFim) - parseHours(intervaloInicio);
    return t > 0 ? t : 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    // Validação dos campos obrigatórios
    const errors: Record<string, boolean> = {};
    let hasErrors = false;

    if (!clientId) {
      errors.clientId = true;
      hasErrors = true;
    }
    if (!projectId) {
      errors.projectId = true;
      hasErrors = true;
    }
    if (!ticketId) {
      errors.ticketId = true;
      hasErrors = true;
    }
    if (!description.trim()) {
      errors.description = true;
      hasErrors = true;
    }

    if (hasErrors) {
      setFieldErrors(errors);
      setError("Preencha todos os campos obrigatórios: Cliente, Projeto, Tarefa e Descrição");
      return;
    }

    const totalDecimal = calcTotalHorasDecimal();

    // Regra: usuários sem permissão não podem exceder o limite diário configurado.
    // Considera tanto um único apontamento > limite quanto a soma do dia (novo ou edição).
    const dailyLimit = getDailyLimitFromUserForDate(user ?? null, date);
    const previousHours = isEdit && entry ? entry.totalHoras : 0;
    const effectiveBaseTotal = Math.max(0, baseDayTotal - previousHours);
    const willExceedByEntry = totalDecimal > dailyLimit;
    const willExceedByDay = effectiveBaseTotal + totalDecimal > dailyLimit;

    if (!user?.permitirMaisHoras && (willExceedByEntry || willExceedByDay)) {
      setOverLimitPayload({
        date: date.toISOString().slice(0, 10),
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || undefined,
        intervaloFim: intervaloFim || undefined,
        totalHoras: totalDecimal,
        description: description || undefined,
        projectId,
        ticketId: ticketId || undefined,
        activityId: activityId || undefined,
      });
      return;
    }

    // Sem permissão para apontar fora de 08:00–18:00: abrir modal de solicitação
    if (!isEdit && !user?.permitirOutroPeriodo && isOutsideAllowedHours(horaInicio, horaFim)) {
      setPermissionPayload({
        date: date.toISOString().slice(0, 10),
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || undefined,
        intervaloFim: intervaloFim || undefined,
        totalHoras: totalDecimal,
        description: description || undefined,
        projectId,
        ticketId: ticketId || undefined,
        activityId: activityId || undefined,
      });
      return;
    }

    setSaving(true);
    try {
      const body = {
        date: date.toISOString().slice(0, 10),
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || undefined,
        intervaloFim: intervaloFim || undefined,
        description: description || undefined,
        projectId,
        ticketId: ticketId || undefined,
        activityId: activityId || undefined,
      };
      const res = isEdit
        ? await apiFetch(`/api/time-entries/${entry!.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/time-entries", {
            method: "POST",
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

  const inputClass = "w-full px-4 py-3 text-[17px] rounded-xl border border-blue-100 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-shadow";
  const labelClass = "block text-sm font-medium text-gray-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "var(--font-dm-sans)" }}
      >
        <div className="p-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-1" style={{ fontFamily: "var(--font-dm-sans)" }}>
            {isEdit ? "Editar apontamento" : "Novo apontamento"}
          </h3>
          <p className="text-gray-500 text-[15px] mb-6">{date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>
                Cliente <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, clientId: false }));
                }}
                className={`${inputClass} cursor-pointer ${fieldErrors.clientId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`}
              >
                <option value="">Selecione o cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Projeto <span className="text-red-500">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, projectId: false }));
                }}
                className={`${inputClass} cursor-pointer ${
                  fieldErrors.projectId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""
                }`}
              >
                <option value="">Selecione o projeto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tópico</label>
              <select
                value={topicId}
                onChange={(e) => {
                  const next = e.target.value;
                  setTopicId(next);
                  // Se a tarefa atual não pertence mais ao tópico selecionado, limpa
                  if (next && ticketId) {
                    const validTaskIds = new Set(
                      tickets
                        .filter(
                          (t) =>
                            t.type !== "SUBPROJETO" &&
                            t.type !== "SUBTAREFA" &&
                            t.parentTicketId === next,
                        )
                        .map((t) => t.id),
                    );
                    if (!validTaskIds.has(ticketId)) {
                      setTicketId("");
                    }
                  }
                }}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Todos os tópicos</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}: {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Tarefa <span className="text-red-500">*</span>
              </label>
              <select
                value={ticketId}
                onChange={(e) => {
                  setTicketId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, ticketId: false }));
                }}
                className={`${inputClass} cursor-pointer ${
                  fieldErrors.ticketId ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""
                }`}
              >
                <option value="">Selecione a tarefa</option>
                {taskOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}: {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Atividade</label>
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Nenhuma</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="pt-2 pb-1 border-t border-blue-50">
              <p className="text-sm font-medium text-gray-600 mb-3">Horário</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Início</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(formatHorasInput(e.target.value))}
                    placeholder="09:00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fim</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={horaFim}
                    onChange={(e) => setHoraFim(formatHorasInput(e.target.value))}
                    placeholder="17:00"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervalo início</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={intervaloInicio}
                    onChange={(e) => setIntervaloInicio(formatHorasInput(e.target.value))}
                    placeholder="12:00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervalo fim</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={intervaloFim}
                    onChange={(e) => setIntervaloFim(formatHorasInput(e.target.value))}
                    placeholder="13:00"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-3 text-blue-600 text-[17px] font-medium">Total: {calcTotal()}</p>
            </div>

            <div>
              <label className={labelClass}>
                Descrição <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value.slice(0, 600));
                  setFieldErrors((prev) => ({ ...prev, description: false }));
                }}
                rows={3}
                maxLength={600}
                className={`${inputClass} resize-none ${fieldErrors.description ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`}
                placeholder="O que foi feito..."
              />
              <p className="text-xs text-gray-400 mt-1">{description.length}/600</p>
            </div>
            {error && <p className="text-red-500 text-sm py-1 font-medium">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition"
              >
                {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {permissionPayload && (
        <TimeEntryPermissionModal
          payload={permissionPayload}
          onClose={() => setPermissionPayload(null)}
          onSent={() => {
            setPermissionPayload(null);
            setError("");
            onSaved();
          }}
          onSubmitRequest={async (data) => {
            const res = await apiFetch("/api/permission-requests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                justification: data.justification,
                date: data.date,
                horaInicio: data.horaInicio,
                horaFim: data.horaFim,
                intervaloInicio: data.intervaloInicio,
                intervaloFim: data.intervaloFim,
                totalHoras: data.totalHoras,
                description: data.description,
                projectId: data.projectId,
                ticketId: data.ticketId,
                activityId: data.activityId,
              }),
            });
            if (!res.ok) return false;
            return true;
          }}
        />
      )}
      {overLimitPayload && (
        <ConfirmModal
          title="Apontamento acima do limite diário"
          message="Este apontamento excede o limite permitido e precisa de aprovação do Administrador ou Gestor de Projetos. Confirmar?"
          confirmLabel="Enviar para aprovação"
          cancelLabel="Cancelar"
          onCancel={() => setOverLimitPayload(null)}
          onConfirm={async () => {
            try {
              const res = await apiFetch("/api/permission-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  justification: "Apontamento acima do limite diário de 8 horas.",
                  date: overLimitPayload.date,
                  horaInicio: overLimitPayload.horaInicio,
                  horaFim: overLimitPayload.horaFim,
                  intervaloInicio: overLimitPayload.intervaloInicio,
                  intervaloFim: overLimitPayload.intervaloFim,
                  totalHoras: overLimitPayload.totalHoras,
                  description: overLimitPayload.description,
                  projectId: overLimitPayload.projectId,
                  ticketId: overLimitPayload.ticketId,
                  activityId: overLimitPayload.activityId,
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Erro ao enviar para aprovação.");
                return;
              }
              setOverLimitPayload(null);
              setError("");
              onSaved();
            } catch {
              setError("Erro ao enviar para aprovação.");
            }
          }}
        />
      )}
    </div>
  );
}
