"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Maximize2, Send, Pencil, Trash2, Check, X as XIcon, Plus, Users, Upload, Download, File, Image as ImageIcon } from "lucide-react";
import { API_BASE_URL, ASSET_PUBLIC_BASE_URL, apiFetch, apiFetchBlob, getToken, publicFileUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { TimeEntryPermissionModal, type TimeEntryPermissionPayload } from "./TimeEntryPermissionModal";
import { ConfirmModal } from "./ConfirmModal";
import type { PackageTicket } from "./PackageCard";
import { FinalizeTaskModal } from "./FinalizeTaskModal";
import { isTopicTicket } from "@/lib/ticketCodeDisplay";
import { resolveTicketResponsibleMembers } from "@/lib/ticketMemberNames";
import { Avatar } from "@/components/Avatar";
import { getTicketStatusDisplay } from "@/lib/ticketStatusDisplay";
import { sanitizeClientHtml } from "@/lib/sanitizeClientHtml";
import { commentHtmlBodyClassName } from "@/lib/commentHtmlDisplay";
import { projectRequiresFinalizeMotivo } from "@/lib/projectFinalizeMotivo";

type UserOption = { id: string; name: string; email?: string; avatarUrl?: string | null; updatedAt?: string };
type LightTicket = { id: string; code: string; title: string; type: string };

type EditTaskModalFullProps = {
  ticket: PackageTicket;
  projectId?: string;
  projectName?: string;
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
  /** Permite apontar horas mesmo com readOnly (ex.: abrir pela Home). */
  allowTimeEntryInReadOnly?: boolean;
};

type Tab = "descricao" | "horas" | "apontamentos" | "historico" | "orcamento" | "anexos";

const PRIORIDADES = [
  { value: "Baixa", label: "Baixa", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "Média", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "Alta", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "Urgente", label: "Urgente", color: "bg-red-100 text-red-700 border-red-300" },
];

function getIniciais(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Cor do pill de status = cor da coluna do Kanban (Backlog=cinza, Em execução=azul, Finalizadas=verde)
function getStatusPillClass(status: string): string {
  // Neutro e consistente com o tema; a cor fica na bolinha (dot).
  if (!status) return "bg-[color:var(--background)]/25 text-[color:var(--muted-foreground)] border-[color:var(--border)]";
  return "bg-[color:var(--background)]/25 text-[color:var(--foreground)] border-[color:var(--border)]";
}

// Cor do pill de prioridade = mesma paleta (Urgente=vermelho, Alta=laranja, Média=âmbar, Baixa=azul)
function getPrioridadePillClass(prioridade: string): string {
  if (!prioridade) return "bg-[color:var(--background)]/25 text-[color:var(--muted-foreground)] border-[color:var(--border)]";
  return "bg-[color:var(--background)]/25 text-[color:var(--foreground)] border-[color:var(--border)]";
}

// Cor da bolinha de prioridade (para o indicador ao lado do select)
function getPrioridadeDotClass(prioridade: string): string {
  if (!prioridade) return "bg-slate-400";
  const map: Record<string, string> = {
    Urgente: "bg-red-500", URGENTE: "bg-red-500",
    Alta: "bg-orange-500", ALTA: "bg-orange-500",
    Média: "bg-amber-500", MEDIA: "bg-amber-500",
    Baixa: "bg-blue-500", BAIXA: "bg-blue-500",
  };
  return map[prioridade] ?? "bg-slate-400";
}

/** Miniatura de anexo de imagem via rota autenticada (evita `<img src>` em URL pública). */
function TicketAttachmentImageThumb({ attachment }: { attachment: { id: string; filename: string } }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let obj: string | null = null;
    void (async () => {
      try {
        const res = await apiFetchBlob(`/api/ticket-attachments/${attachment.id}/file`);
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        obj = URL.createObjectURL(blob);
        if (!cancelled) setSrc(obj);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [attachment.id]);
  if (!src) {
    return <div className="mt-3 mb-2 h-32 w-full max-w-md animate-pulse rounded-lg border border-slate-200 bg-slate-50" />;
  }
  return (
    <button
      type="button"
      onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
      className="mt-3 mb-2 block text-left"
      title="Visualizar imagem"
    >
      <img
        src={src}
        alt={attachment.filename}
        className="max-w-full max-h-48 rounded-lg border border-slate-200 shadow-sm hover:ring-2 hover:ring-blue-400 transition-shadow cursor-pointer"
      />
    </button>
  );
}

export function EditTaskModalFull({
  ticket,
  projectId,
  projectName,
  onClose,
  onSaved,
  readOnly = false,
  allowTimeEntryInReadOnly = false,
}: EditTaskModalFullProps) {
  const isReadOnly = readOnly;
  const [activeTab, setActiveTab] = useState<Tab>("descricao");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [topics, setTopics] = useState<Array<{ id: string; code: string; title: string }>>([]);

  // Campos da aba Descrição
  const [title, setTitle] = useState(ticket.title);
  const [selectedTopicId, setSelectedTopicId] = useState(ticket.parentTicketId || "");
  const [description, setDescription] = useState(ticket.description ?? "");
  // Membros: assignedTo + responsibles, sem duplicar por id
  const [responsibleIds, setResponsibleIds] = useState<string[]>(() => {
    const ids = new Set<string>();
    if (ticket.assignedTo?.id) {
      ids.add(ticket.assignedTo.id);
    }
    ticket.responsibles?.forEach((r) => {
      if (r.user?.id) {
        ids.add(r.user.id);
      }
    });
    return Array.from(ids);
  });
  const [prioridade, setPrioridade] = useState(ticket.criticidade ?? "");
  const [status, setStatus] = useState(ticket.status || "ABERTO");
  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const [comments, setComments] = useState<
    Array<{
      id: string;
      content: string;
      createdAt: string;
      visibility?: "PUBLIC" | "INTERNAL";
      user: { id: string; name: string; email?: string };
    }>
  >([]);
  const [savingComment, setSavingComment] = useState(false);

  type StatusOption = { value: string; label: string };

  const effectiveProjectId =
    projectId ??
    (ticket as unknown as { projectId?: string }).projectId ??
    (ticket as unknown as { project?: { id?: string } }).project?.id ??
    "";

  function loadCustomStatusOptions(pid: string): StatusOption[] {
    if (!pid) return [];
    return [];
  }

  const [customStatusOptions, setCustomStatusOptions] = useState<StatusOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const load = async () => {
      if (!effectiveProjectId) {
        if (!cancelled) setCustomStatusOptions([]);
        return;
      }
      try {
        const r = await apiFetch(`/api/projects/${encodeURIComponent(effectiveProjectId)}/kanban-columns`, { signal: ac.signal });
        if (!r.ok) {
          if (!cancelled) setCustomStatusOptions([]);
          return;
        }
        const data = (await r.json().catch(() => [])) as unknown;
        const cols = Array.isArray(data) ? (data as Array<{ id: string; label: string }>) : [];
        if (!cancelled) {
          setCustomStatusOptions(cols.map((c) => ({ value: c.id, label: c.label })));
        }
      } catch {
        if (!cancelled) setCustomStatusOptions([]);
      }
    };

    void load();
    const onColumnsChanged = (e: Event) => {
      const ce = e as CustomEvent<{ projectId?: string }>;
      if (ce?.detail?.projectId === effectiveProjectId) {
        void load();
      }
    };
    window.addEventListener("wps_kanban_columns_changed", onColumnsChanged as EventListener);
    return () => {
      cancelled = true;
      ac.abort();
      window.removeEventListener("wps_kanban_columns_changed", onColumnsChanged as EventListener);
    };
  }, [effectiveProjectId]);

  const statusOptions = useMemo(() => {
    const base: StatusOption[] = [
      { value: "ABERTO", label: "Backlog" },
      { value: "EXECUCAO", label: "Em execução" },
      { value: "ENCERRADO", label: "Finalizadas" },
    ];
    const seen = new Set(base.map((o) => o.value));
    const customs = customStatusOptions.filter((o) => !seen.has(o.value));
    const merged = [...base, ...customs];
    // Garante que o status atual sempre apareça (mesmo se a coluna customizada não estiver no storage)
    if (status && !merged.some((o) => o.value === status)) {
      const resolved = getTicketStatusDisplay({
        status,
        statusLabel: (ticket as any).statusLabel,
        statusColor: (ticket as any).statusColor,
        projectId: effectiveProjectId,
        dataFimPrevista: ticket.dataFimPrevista,
        allowOverdue: false,
      });
      merged.push({ value: status, label: resolved.label });
    }
    return merged;
  }, [customStatusOptions, status, effectiveProjectId, ticket.dataFimPrevista]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  
  const { user: currentUser } = useAuth();
  const isClienteProfile = currentUser?.role === "CLIENTE";
  const [estimativa, setEstimativa] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [horasApontadas, setHorasApontadas] = useState(0); // Será calculado das horas apontadas
  
  // Estados para apontamento de horas
  const [timeEntries, setTimeEntries] = useState<Array<{
    id: string;
    date: string;
    horaInicio: string;
    horaFim: string;
    intervaloInicio?: string | null;
    intervaloFim?: string | null;
    description?: string | null;
    totalHoras: number;
    user?: { id: string; name: string };
  }>>([]);
  
  // Estados para histórico
  const [history, setHistory] = useState<Array<{
    id: string;
    action: string;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    details: string | null;
    createdAt: string;
    user: { id: string; name: string; email?: string };
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Estados para anexos
  const [attachments, setAttachments] = useState<Array<{
    id: string;
    filename: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    createdAt: string;
    user: { id: string; name: string; email?: string };
  }>>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const [timeEntryDate, setTimeEntryDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [timeEntryHoraInicio, setTimeEntryHoraInicio] = useState("09:00");
  const [timeEntryHoraFim, setTimeEntryHoraFim] = useState("17:00");
  const [timeEntryIntervaloInicio, setTimeEntryIntervaloInicio] = useState("");
  const [timeEntryIntervaloFim, setTimeEntryIntervaloFim] = useState("");
  const [timeEntryDescription, setTimeEntryDescription] = useState("");
  const [editingTimeEntry, setEditingTimeEntry] = useState<string | null>(null);
  const [savingTimeEntry, setSavingTimeEntry] = useState(false);
  const [timeEntryFieldErrors, setTimeEntryFieldErrors] = useState<Record<string, boolean>>({});
  const [permissionPayload, setPermissionPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const [overLimitDailyPayload, setOverLimitDailyPayload] = useState<TimeEntryPermissionPayload | null>(null);
  const timeEntryFormRef = useRef<HTMLDivElement>(null);
  const newCommentSectionRef = useRef<HTMLDivElement | null>(null);
  const [deleteTimeEntryId, setDeleteTimeEntryId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Configurações do projeto
  const [obrigatoriosHoras, setObrigatoriosHoras] = useState(false);
  const [obrigatoriosDataEntrega, setObrigatoriosDataEntrega] = useState(false);
  const [tipoProjeto, setTipoProjeto] = useState<string>("");
  const [projectStatus, setProjectStatus] = useState<string>("");

  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [statusBeforeFinalize, setStatusBeforeFinalize] = useState<string>(ticket.status || "ABERTO");
  const finalizePayloadRef = useRef<{ motivo: string } | null>(null);
  const [finalizacaoMotivoView, setFinalizacaoMotivoView] = useState<string | null>(ticket.finalizacaoMotivo ?? null);

  const [budget, setBudget] = useState<PackageTicket["budget"] | null>(ticket.budget ?? null);
  const [budgetHoras, setBudgetHoras] = useState("");
  const [budgetObservacao, setBudgetObservacao] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState("");
  const [budgetRejectReason, setBudgetRejectReason] = useState("");
  const [budgetDecisionSaving, setBudgetDecisionSaving] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [estimativaError, setEstimativaError] = useState(false);
  const [dataEntregaError, setDataEntregaError] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);
  const [showPrioridadeOpen, setShowPrioridadeOpen] = useState(false);

  async function handleSendBudget() {
    setBudgetError("");
    const h = budgetHoras.trim();
    const obs = budgetObservacao.trim();
    if (!h || !obs) {
      setBudgetError("Preencha Horas e Observação para enviar o orçamento.");
      return;
    }
    setBudgetSaving(true);
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}/budget`, {
        method: "POST",
        body: JSON.stringify({
          horas: Number(String(h).replace(",", ".")),
          observacao: obs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBudgetError(data.error || "Erro ao enviar orçamento.");
        return;
      }
      setBudget(((data as PackageTicket).budget ?? null) as PackageTicket["budget"] | null);
      onSaved();
    } catch {
      setBudgetError("Erro de conexão.");
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleApproveBudget() {
    setBudgetError("");
    setBudgetDecisionSaving(true);
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}/budget/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBudgetError(data.error || "Erro ao aprovar orçamento.");
        return;
      }
      setBudget(((data as PackageTicket).budget ?? null) as PackageTicket["budget"] | null);
      setStatus("EXECUCAO");
      onSaved();
    } catch {
      setBudgetError("Erro de conexão.");
    } finally {
      setBudgetDecisionSaving(false);
    }
  }

  async function handleRejectBudget() {
    setBudgetError("");
    if (!budgetRejectReason.trim()) {
      setBudgetError("Informe o motivo da reprovação.");
      return;
    }
    setBudgetDecisionSaving(true);
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}/budget/reject`, {
        method: "POST",
        body: JSON.stringify({ motivo: budgetRejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBudgetError(data.error || "Erro ao reprovar orçamento.");
        return;
      }
      setBudget(((data as PackageTicket).budget ?? null) as PackageTicket["budget"] | null);
      setStatus("ENCERRADO");
      onSaved();
    } catch {
      setBudgetError("Erro de conexão.");
    } finally {
      setBudgetDecisionSaving(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "orcamento") return;
    if (!ticket?.id) return;
    let cancelled = false;
    setBudgetLoading(true);
    setBudgetError("");
    apiFetch(`/api/tickets/${ticket.id}/budget`)
      .then(async (r) => (r.ok ? r.json().catch(() => null) : null))
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        const b = ((data as PackageTicket).budget ?? null) as PackageTicket["budget"] | null;
        setBudget(b);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBudgetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, ticket?.id]);

  useEffect(() => {
    // Cliente não deve acessar aba de histórico
    if (isClienteProfile && activeTab === "historico") {
      setActiveTab("descricao");
    }
    // Cliente só pode comentar em modo público
    if (isClienteProfile && commentVisibility !== "PUBLIC") {
      setCommentVisibility("PUBLIC");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClienteProfile, activeTab]);

  useEffect(() => {
    // Cliente: não precisa carregar lista de usuários (endpoint é restrito e gera 403)
    if (!isClienteProfile) {
      apiFetch("/api/users/for-select")
        .then((r) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
    } else {
      setUsers([]);
    }
    
    // Buscar informações do projeto para verificar campos obrigatórios
    // Cliente: não pode acessar /api/projects/:id nem listar tópicos (evita 403 e ruído)
    if (projectId && !isClienteProfile) {
      apiFetch(`/api/projects/${projectId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((project) => {
          if (project) {
            setObrigatoriosHoras(project.obrigatoriosHoras || false);
            setObrigatoriosDataEntrega(project.obrigatoriosDataEntrega || false);
            setTipoProjeto(String(project.tipoProjeto || ""));
            setProjectStatus(String(project.statusInicial || ""));
          }
        })
        .catch(() => {
          // Ignora erro silenciosamente
        });
      
      // Buscar tópicos do projeto através da API de tickets
      apiFetch(`/api/tickets?projectId=${projectId}&light=true`)
        .then((r) => (r.ok ? r.json() : []))
        .then((tickets: unknown) => {
          const list: LightTicket[] = Array.isArray(tickets) ? (tickets as LightTicket[]) : [];
          const topicos = list
            .filter((t) => t && t.type === "SUBPROJETO")
            .map((t) => ({ id: t.id, code: t.code, title: t.title }));
          setTopics(topicos);
        })
        .catch(() => {
          // Ignora erro silenciosamente
        });
    } else if (isClienteProfile) {
      setObrigatoriosHoras(false);
      setObrigatoriosDataEntrega(false);
      setTipoProjeto("");
      setProjectStatus("");
      setTopics([]);
    }
    
    // Buscar comentários do ticket
    if (ticket.id) {
      apiFetch(`/api/comments?ticketId=${ticket.id}`)
        .then((r) => {
          if (!r.ok) {
            return r.json().then((data) => {
              console.error("Erro ao buscar comentários:", data);
              throw new Error(data.error || "Erro ao buscar comentários");
            });
          }
          return r.json();
        })
        .then(setComments)
        .catch((err) => {
          console.error("Erro ao buscar comentários:", err);
          setComments([]);
        });
    }
  }, [ticket.id, projectId]);

  const normalizedProjectStatus = useMemo(() => {
    const s = String(projectStatus ?? "").toUpperCase();
    if (s === "ATIVO" || s === "ENCERRADO" || s === "EM_ESPERA") return s;
    if (s === "EM_ANDAMENTO") return "ATIVO";
    if (s === "PLANEJADO") return "EM_ESPERA";
    if (s === "CONCLUIDO") return "ENCERRADO";
    return s || "";
  }, [projectStatus]);
  const canLogTime = normalizedProjectStatus === "ATIVO" || normalizedProjectStatus === "";
  const canManageTimeEntries = !isClienteProfile && canLogTime && (!isReadOnly || allowTimeEntryInReadOnly);

  // Atualiza o formulário quando o ticket mudar
  useEffect(() => {
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setSelectedTopicId(ticket.parentTicketId || "");
    setResponsibleIds(() => {
      const ids = new Set<string>();
      if (ticket.assignedTo?.id) {
        ids.add(ticket.assignedTo.id);
      }
      ticket.responsibles?.forEach((r) => {
        if (r.user?.id) {
          ids.add(r.user.id);
        }
      });
      return Array.from(ids);
    });
    setPrioridade(ticket.criticidade ?? "");
    setStatus(ticket.status || "ABERTO");
    setFinalizacaoMotivoView(ticket.finalizacaoMotivo ?? null);
    setComment("");
    // Carregar dataFimPrevista: usar a data em UTC (YYYY-MM-DD) para bater com o backend e evitar "atualização fantasma" no histórico
    if (ticket.dataFimPrevista) {
      const iso = new Date(ticket.dataFimPrevista).toISOString();
      setDataEntrega(iso.slice(0, 10));
    } else {
      setDataEntrega("");
    }
    // Carregar dataInicio: mesmo critério (UTC) para consistência com o histórico
    if (ticket.dataInicio) {
      const iso = new Date(ticket.dataInicio).toISOString();
      setDataInicio(iso.slice(0, 10));
    } else {
      setDataInicio("");
    }
    // Carregar estimativaHoras se existir
    if (ticket.estimativaHoras !== undefined && ticket.estimativaHoras !== null) {
      setEstimativa(String(ticket.estimativaHoras));
    } else {
      setEstimativa("");
    }
    // Carregar progresso se existir
    if (ticket.progresso !== undefined && ticket.progresso !== null) {
      setProgresso(ticket.progresso);
    } else {
      setProgresso(0);
    }
    setHorasApontadas(0);
    setError("");
    setSaving(false);
    
    // Buscar comentários quando o ticket mudar
    if (ticket.id) {
      apiFetch(`/api/comments?ticketId=${ticket.id}`)
        .then((r) => {
          if (!r.ok) {
            return r.json().then((data) => {
              console.error("Erro ao buscar comentários:", data);
              throw new Error(data.error || "Erro ao buscar comentários");
            });
          }
          return r.json();
        })
        .then(setComments)
        .catch((err) => {
          console.error("Erro ao buscar comentários:", err);
          setComments([]);
        });
    }
  }, [ticket]);

  useEffect(() => {
    if (!ticket?.id) return;
    if (status !== "ENCERRADO") return;
    let cancelled = false;
    // Não depender só de tipoProjeto no estado: cliente não chama /api/projects/:id e tipo fica vazio.
    // Uma única leitura do ticket traz project.tipoProjeto + finalizacaoMotivo para qualquer perfil.
    apiFetch(`/api/tickets/${ticket.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (cancelled || !t) return;
        const tp = t.project?.tipoProjeto != null ? String(t.project.tipoProjeto) : "";
        if (tp) setTipoProjeto(tp);
        if (projectRequiresFinalizeMotivo(tp) && typeof t.finalizacaoMotivo === "string") {
          setFinalizacaoMotivoView(t.finalizacaoMotivo);
        }
        setBudget(((t as PackageTicket).budget ?? null) as PackageTicket["budget"] | null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticket?.id, status]);

  // Garante que o cliente (e qualquer origem "light") carregue os dados completos do ticket ao abrir a modal
  // para exibir sempre a versão mais recente (inclui descrição).
  useEffect(() => {
    if (!ticket?.id) return;
    const shouldHydrate = isClienteProfile || ticket.description == null;
    if (!shouldHydrate) return;

    let cancelled = false;
    apiFetch(`/api/tickets/${ticket.id}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json().catch(() => null);
      })
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        type TicketHydratePayload = Partial<PackageTicket> & {
          project?: { tipoProjeto?: string | null } | null;
          finalizacaoMotivo?: string | null;
        };
        const t = data as TicketHydratePayload;

        // Evita sobrescrever edições em andamento para perfis editáveis:
        // só aplica se o formulário ainda estiver igual ao snapshot inicial.
        const initialTitle = ticket.title;
        const initialDesc = ticket.description ?? "";
        const canApplySafely = isReadOnly || (title === initialTitle && description === initialDesc);
        if (!canApplySafely) return;

        if (typeof t.title === "string") setTitle(t.title);
        setDescription(t.description ?? "");
        setSelectedTopicId(t.parentTicketId ?? "");
        setPrioridade(t.criticidade ?? "");
        setStatus(t.status ?? "ABERTO");
        setBudget((t.budget ?? null) as PackageTicket["budget"] | null);
        if (t.dataFimPrevista) {
          const iso = new Date(t.dataFimPrevista).toISOString();
          setDataEntrega(iso.slice(0, 10));
        }
        if (t.dataInicio) {
          const iso = new Date(t.dataInicio).toISOString();
          setDataInicio(iso.slice(0, 10));
        }
        if (t.estimativaHoras !== undefined && t.estimativaHoras !== null) {
          setEstimativa(String(t.estimativaHoras));
        }
        if (t.progresso !== undefined && t.progresso !== null) {
          setProgresso(t.progresso);
        }
        if (t.project?.tipoProjeto != null) {
          setTipoProjeto(String(t.project.tipoProjeto));
        }
        if (typeof t.finalizacaoMotivo === "string") {
          setFinalizacaoMotivoView(t.finalizacaoMotivo);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, isClienteProfile]);

  const displayedResponsibleMembers = useMemo(
    () =>
      resolveTicketResponsibleMembers({
        responsibleIds,
        users,
        ticket: {
          responsibles: ticket.responsibles,
          createdBy: ticket.createdBy ?? null,
          assignedTo: ticket.assignedTo ?? null,
        },
      }),
    [responsibleIds, users, ticket.responsibles, ticket.createdBy, ticket.assignedTo],
  );
  const availableToAdd = users.filter((u) => !responsibleIds.includes(u.id));

  function resolveMemberMeta(id: string): { email?: string; avatarUrl?: string | null; updatedAt?: string } {
    const fromList = users.find((u) => u.id === id);
    if (fromList) return { email: fromList.email, avatarUrl: fromList.avatarUrl ?? null, updatedAt: fromList.updatedAt };
    const fromResp = ticket.responsibles?.find((r) => r.user?.id === id)?.user as any;
    if (fromResp) return { email: fromResp.email, avatarUrl: fromResp.avatarUrl ?? null, updatedAt: fromResp.updatedAt };
    const fromAssigned = (ticket.assignedTo as any)?.id === id ? (ticket.assignedTo as any) : null;
    if (fromAssigned) return { email: fromAssigned.email, avatarUrl: fromAssigned.avatarUrl ?? null, updatedAt: fromAssigned.updatedAt };
    const fromCreated = (ticket.createdBy as any)?.id === id ? (ticket.createdBy as any) : null;
    if (fromCreated) return { email: fromCreated.email, avatarUrl: fromCreated.avatarUrl ?? null, updatedAt: fromCreated.updatedAt };
    return { avatarUrl: null };
  }

  function addResponsible(userId: string) {
    if (!responsibleIds.includes(userId)) setResponsibleIds((ids) => [...ids, userId]);
    setShowUserPicker(false);
  }

  function removeResponsible(userId: string) {
    setResponsibleIds((ids) => ids.filter((id) => id !== userId));
  }

  useEffect(() => {
    if (!showUserPicker) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const el = userPickerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      setShowUserPicker(false);
    };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [showUserPicker]);

  async function handleImageUpload(file: File): Promise<string> {
    if (!ticket?.id) throw new Error("ticketId ausente");
    // Faz upload como anexo do ticket e devolve a URL pública para inserir no comentário.
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(String(e.target?.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await apiFetch("/api/ticket-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        fileName: file.name || `print-${Date.now()}.png`,
        fileData: base64Data,
        fileType: file.type,
        fileSize: file.size,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string } | null)?.error || "Falha ao enviar imagem");
    }
    const attachment = await response.json().catch(() => null);
    const fileUrl = attachment?.fileUrl as string | undefined;
    if (!fileUrl) throw new Error("Resposta sem fileUrl");
    const absolute = publicFileUrl(fileUrl);
    // Mantém lista de anexos atualizada caso o usuário esteja na aba
    if (activeTab === "anexos") loadAttachments();
    // Retornamos ABSOLUTO para o editor conseguir pré-visualizar a imagem imediatamente.
    // Na hora de salvar no backend, removemos o prefixo e persistimos URL relativa (/uploads/...).
    return absolute;
  }

  function stripApiBaseFromCommentHtml(html: string): string {
    try {
      const bases = [
        String(API_BASE_URL || "").trim().replace(/\/+$/, ""),
        String(ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
      ].filter((b, i, a) => b && a.indexOf(b) === i);
      if (!bases.length) return html;
      const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

      const strip = (raw: string | null): string | null => {
        if (!raw) return raw;
        const s = String(raw).trim();
        if (!s) return s;
        if (s.startsWith("data:")) return s;

        // Converte qualquer URL absoluta com pathname contendo /uploads/ -> "/uploads/..."
        try {
          const u = new URL(s);
          if (u.pathname.includes("/uploads/")) return `${u.pathname}${u.search}${u.hash}`;
        } catch {
          // ignore
        }

        // Converte "https://.../uploads/..." (API ou origem pública de assets) -> "/uploads/..."
        for (const base of bases) {
          if (s.startsWith(`${base}/uploads/`)) return s.slice(base.length);
        }
        return s;
      };

      doc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        const fixed = strip(src);
        if (fixed && fixed !== src) img.setAttribute("src", fixed);
      });
      doc.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href");
        const fixed = strip(href);
        if (fixed && fixed !== href) a.setAttribute("href", fixed);
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  function normalizeCommentHtmlForAssets(html: string): string {
    try {
      const base = String(ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
      if (!base) return html;

      const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

      const normalizeUrl = (raw: string | null): string | null => {
        if (!raw) return raw;
        const s = String(raw).trim();
        if (!s) return s;
        if (s.startsWith("data:")) return s;

        // Se for URL absoluta e o pathname contiver /uploads/, força a origem pública (mesma dos PDFs do portal)
        try {
          const u = new URL(s);
          if (u.pathname.includes("/uploads/")) return `${base}${u.pathname}${u.search}${u.hash}`;
        } catch {
          // ignore
        }

        // Normaliza "uploads/..." (sem slash)
        if (s.startsWith("uploads/")) return `${base}/${s}`;

        // URL relativa deve apontar para a origem pública de uploads
        if (s.startsWith("/uploads/")) return `${base}${s}`;

        return s;
      };

      doc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        const fixed = normalizeUrl(src);
        if (fixed && fixed !== src) img.setAttribute("src", fixed);
      });

      doc.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href");
        const fixed = normalizeUrl(href);
        if (fixed && fixed !== href) a.setAttribute("href", fixed);
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  // Função auxiliar para verificar se o HTML tem conteúdo de texto real
  function hasTextContent(html: string): boolean {
    if (!html || typeof html !== "string") return false;
    // Remove todas as tags HTML e verifica se sobra texto
    const textContent = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return textContent.length > 0;
  }

  async function handleSaveComment() {
    if (!hasTextContent(comment) || savingComment) {
      console.log("Comentário vazio ou já salvando:", { comment, hasText: hasTextContent(comment), savingComment });
      return;
    }
    
    setSavingComment(true);
    try {
      console.log("Enviando comentário:", { ticketId: ticket.id, content: comment });
      const res = await apiFetch("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          ticketId: ticket.id,
          content: stripApiBaseFromCommentHtml(comment),
          visibility: isClienteProfile ? "PUBLIC" : commentVisibility,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Erro ao salvar comentário:", data);
        setError(data.error || "Erro ao salvar comentário.");
        return;
      }
      
      const newComment = await res.json();
      console.log("Comentário salvo com sucesso:", newComment);
      setComments((prev) => [...prev, newComment]);
      setComment("");
      setCommentVisibility("PUBLIC");
    } catch (error) {
      console.error("Erro ao salvar comentário:", error);
      setError("Erro ao salvar comentário.");
    } finally {
      setSavingComment(false);
    }
  }

  async function handleEditComment(commentId: string) {
    const commentToEdit = comments.find((c) => c.id === commentId);
    if (!commentToEdit) return;
    
    setEditingCommentId(commentId);
    setEditingCommentContent(commentToEdit.content);
  }

  async function handleSaveEditComment() {
    if (isReadOnly) return;
    if (!editingCommentId || !hasTextContent(editingCommentContent)) {
      return;
    }

    setSavingComment(true);
    try {
      const res = await apiFetch(`/api/comments/${editingCommentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: stripApiBaseFromCommentHtml(editingCommentContent),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Erro ao editar comentário:", data);
        setError(data.error || "Erro ao editar comentário.");
        return;
      }

      const updatedComment = await res.json();
      setComments((prev) =>
        prev.map((c) => (c.id === editingCommentId ? updatedComment : c))
      );
      setEditingCommentId(null);
      setEditingCommentContent("");
    } catch (error) {
      console.error("Erro ao editar comentário:", error);
      setError("Erro ao editar comentário.");
    } finally {
      setSavingComment(false);
    }
  }

  function handleCancelEdit() {
    setEditingCommentId(null);
    setEditingCommentContent("");
  }

  async function handleDeleteComment(commentId: string) {
    if (isReadOnly) return;
    if (!confirm("Tem certeza que deseja excluir este comentário?")) {
      return;
    }

    setDeletingCommentId(commentId);
    try {
      const res = await apiFetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Erro ao excluir comentário:", data);
        setError(data.error || "Erro ao excluir comentário.");
        return;
      }

      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (error) {
      console.error("Erro ao excluir comentário:", error);
      setError("Erro ao excluir comentário.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  // Funções para apontamento de horas
  function formatHorasInput(value: string): string {
    // Mantém só dígitos e limita a 4 (HHMM)
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      // Enquanto o usuário está digitando as horas, não força os dois pontos
      return digits;
    }
    // A partir de 3 dígitos, formata como HH:MM
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  const parseTimeEntryHours = (h: string) => {
    if (!h?.trim()) return 0;
    const parts = h.trim().split(":").map(Number);
    const hh = isNaN(parts[0]) ? 0 : parts[0];
    const mm = isNaN(parts[1]) ? 0 : parts[1];
    return hh + mm / 60;
  };

  function calcTotalHoras(): string {
    let t = parseTimeEntryHours(timeEntryHoraFim) - parseTimeEntryHours(timeEntryHoraInicio);
    if (timeEntryIntervaloInicio && timeEntryIntervaloFim) {
      t -= parseTimeEntryHours(timeEntryIntervaloFim) - parseTimeEntryHours(timeEntryIntervaloInicio);
    }
    if (t <= 0) return "00:00";
    const h = Math.floor(t);
    const m = Math.round((t - h) * 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  function calcTotalHorasDecimal(): number {
    let t = parseTimeEntryHours(timeEntryHoraFim) - parseTimeEntryHours(timeEntryHoraInicio);
    if (timeEntryIntervaloInicio && timeEntryIntervaloFim) {
      t -= parseTimeEntryHours(timeEntryIntervaloFim) - parseTimeEntryHours(timeEntryIntervaloInicio);
    }
    return t > 0 ? t : 0;
  }

  function loadTimeEntries() {
    if (!ticket.id) {
      console.log("loadTimeEntries: ticket.id não disponível", { ticketId: ticket.id });
      setTimeEntries([]);
      setHorasApontadas(0);
      return;
    }
    
    console.log("Carregando apontamentos para ticket:", ticket.id);
    apiFetch(`/api/time-entries?ticketId=${ticket.id}`)
      .then((r) => {
        console.log("Resposta da API de apontamentos:", { status: r.status, ok: r.ok });
        if (r.ok) {
          return r.json();
        }
        return r.json().then((data) => {
          console.error("Erro na resposta da API:", data);
          return [];
        });
      })
      .then((entries) => {
        console.log("Apontamentos carregados:", entries.length, entries);
        setTimeEntries(entries);
        const total = (entries as Array<{ totalHoras?: number | null }>).reduce(
          (sum, e) => sum + (e.totalHoras || 0),
          0,
        );
        setHorasApontadas(total);
      })
      .catch((err) => {
        console.error("Erro ao carregar apontamentos:", err);
        setTimeEntries([]);
        setHorasApontadas(0);
      });
  }

  // Carregar apontamentos quando a aba horas for aberta ou quando o ticket/projeto mudar
  useEffect(() => {
    if (activeTab === "apontamentos" && ticket.id) {
      loadTimeEntries();
    }
  }, [activeTab, ticket.id]);

  function loadHistory() {
    if (!ticket.id) {
      setHistory([]);
      return;
    }
    
    setLoadingHistory(true);
    apiFetch(`/api/ticket-history?ticketId=${ticket.id}`)
      .then((r) => {
        if (r.ok) {
          return r.json();
        }
        return [];
      })
      .then((data) => {
        setHistory(data || []);
      })
      .catch((error) => {
        console.error("Erro ao carregar histórico:", error);
        setHistory([]);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }

  useEffect(() => {
    if (activeTab === "historico" && ticket.id) {
      loadHistory();
    }
  }, [activeTab, ticket.id]);

  function loadAttachments() {
    if (!ticket.id) {
      setAttachments([]);
      return;
    }
    
    setLoadingAttachments(true);
    apiFetch(`/api/ticket-attachments?ticketId=${ticket.id}`)
      .then((r) => {
        if (r.ok) {
          return r.json();
        }
        return [];
      })
      .then((data) => {
        setAttachments(data || []);
      })
      .catch((error) => {
        console.error("Erro ao carregar anexos:", error);
        setAttachments([]);
      })
      .finally(() => {
        setLoadingAttachments(false);
      });
  }

  useEffect(() => {
    if (activeTab === "anexos" && ticket.id) {
      loadAttachments();
    }
  }, [activeTab, ticket.id]);

  useEffect(() => {
    if (!isReadOnly) return;
    const id = window.setTimeout(() => {
      newCommentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [isReadOnly, ticket.id]);

  useEffect(() => {
    if (activeTab === "anexos" && ticket.id) {
      loadAttachments();
    }
  }, [activeTab, ticket.id]);

  async function handleFileUpload(file: File) {
    if (!ticket.id) {
      setError("Tarefa não encontrada.");
      return;
    }

    // Validar tamanho (máximo 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("Arquivo muito grande. Tamanho máximo: 10MB");
      return;
    }

    setUploadingAttachment(true);
    setError("");

    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        
        try {
          const response = await apiFetch("/api/ticket-attachments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticketId: ticket.id,
              fileName: file.name,
              fileData: base64Data,
              fileType: file.type,
              fileSize: file.size,
            }),
          });

          if (response.ok) {
            await loadAttachments();
            // Recarregar histórico se estiver na aba de histórico
            if (activeTab === "historico") {
              setTimeout(() => loadHistory(), 300);
            }
          } else {
            const errorData = await response.json();
            setError(errorData.error || "Erro ao fazer upload do arquivo");
          }
        } catch (error) {
          console.error("Erro ao fazer upload:", error);
          setError("Erro ao fazer upload do arquivo");
        } finally {
          setUploadingAttachment(false);
        }
      };
      reader.onerror = () => {
        setError("Erro ao ler o arquivo");
        setUploadingAttachment(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      setError("Erro ao processar arquivo");
      setUploadingAttachment(false);
    }
  }

  async function handleDownloadAttachment(attachment: typeof attachments[0]) {
    try {
      const res = await apiFetchBlob(`/api/ticket-attachments/${attachment.id}/file`);
      if (!res.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao baixar anexo:", err);
      setError("Não foi possível baixar o arquivo.");
    }
  }

  async function openTicketAttachmentInNewTab(attachment: typeof attachments[0]) {
    try {
      const res = await apiFetchBlob(`/api/ticket-attachments/${attachment.id}/file`);
      if (!res.ok) throw new Error("Falha ao abrir arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      console.error("Erro ao abrir anexo:", err);
      setError("Não foi possível abrir o arquivo.");
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!confirm("Tem certeza que deseja excluir este anexo?")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/ticket-attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadAttachments();
        // Recarregar histórico se estiver na aba de histórico
        if (activeTab === "historico") {
          setTimeout(() => loadHistory(), 300);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Erro ao excluir anexo");
      }
    } catch (error) {
      console.error("Erro ao excluir anexo:", error);
      setError("Erro ao excluir anexo");
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  }

  function getFileIcon(fileType: string) {
    if (fileType.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5" />;
    }
    return <File className="h-5 w-5" />;
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  async function handleSaveTimeEntry() {
    if (isReadOnly && !allowTimeEntryInReadOnly) return;
    if (!canLogTime) {
      setError("O status do projeto não permite apontamento de horas");
      return;
    }
    if (!projectId) {
      setError("Projeto não encontrado.");
      return;
    }

    setTimeEntryFieldErrors({});
    let hasErrors = false;

    if (!timeEntryHoraInicio || !timeEntryHoraFim) {
      setError("Preencha as horas de início e fim.");
      return;
    }

    if (!timeEntryDescription.trim()) {
      setTimeEntryFieldErrors({ description: true });
      hasErrors = true;
    }

    if (timeEntryDescription.length > 500) {
      setError("O comentário deve ter no máximo 500 caracteres.");
      return;
    }

    const totalHoras = calcTotalHoras();
    if (totalHoras === "00:00") {
      setError("As horas totais devem ser maiores que zero.");
      return;
    }

    if (hasErrors) {
      setError("Preencha o campo obrigatório: Descrição");
      return;
    }

    const totalDecimal = calcTotalHorasDecimal();

    // Soma de horas já registradas nesse dia (para este ticket),
    // desconsiderando o apontamento que está sendo editado.
    const baseDayTotal = timeEntries
      .filter((e) => e.date.slice(0, 10) === timeEntryDate && (!editingTimeEntry || e.id !== editingTimeEntry))
      .reduce((sum, e) => sum + e.totalHoras, 0);

    const willExceedByEntry = totalDecimal > 8;
    const willExceedByDay = baseDayTotal + totalDecimal > 8;

    // Regra: usuários sem permissão não podem exceder 8h diárias.
    if (!currentUser?.permitirMaisHoras && (willExceedByEntry || willExceedByDay)) {
      setOverLimitDailyPayload({
        date: timeEntryDate,
        horaInicio: timeEntryHoraInicio,
        horaFim: timeEntryHoraFim,
        intervaloInicio: timeEntryIntervaloInicio || undefined,
        intervaloFim: timeEntryIntervaloFim || undefined,
        totalHoras: totalDecimal,
        description: timeEntryDescription.trim() || undefined,
        projectId: projectId!,
        ticketId: ticket.id,
        activityId: undefined,
      });
      return;
    }

    setSavingTimeEntry(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        date: timeEntryDate,
        horaInicio: timeEntryHoraInicio,
        horaFim: timeEntryHoraFim,
        projectId,
        ticketId: ticket.id,
        description: timeEntryDescription.trim() || null,
      };

      if (timeEntryIntervaloInicio && timeEntryIntervaloFim) {
        body.intervaloInicio = timeEntryIntervaloInicio;
        body.intervaloFim = timeEntryIntervaloFim;
      }

      const url = editingTimeEntry 
        ? `/api/time-entries/${editingTimeEntry}`
        : "/api/time-entries";
      const method = editingTimeEntry ? "PATCH" : "POST";

      console.log("Salvando apontamento:", { url, method, body });
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Erro ao salvar apontamento:", data);
        setError(data.error || "Erro ao salvar apontamento.");
        return;
      }

      const savedEntry = await res.json();
      console.log("Apontamento salvo com sucesso:", savedEntry);

      // Limpar formulário
      setTimeEntryHoraInicio("09:00");
      setTimeEntryHoraFim("17:00");
      setTimeEntryIntervaloInicio("");
      setTimeEntryIntervaloFim("");
      setTimeEntryDescription("");
      setEditingTimeEntry(null);
      
      // Recarregar lista após um pequeno delay para garantir que o backend processou
      setTimeout(() => {
        loadTimeEntries();
      }, 500);
    } catch (error) {
      console.error("Erro ao salvar apontamento:", error);
      setError("Erro ao salvar apontamento.");
    } finally {
      setSavingTimeEntry(false);
    }
  }

  function handleEditTimeEntry(entry: typeof timeEntries[0]) {
    setEditingTimeEntry(entry.id);
    setTimeEntryDate(entry.date.split('T')[0]);
    setTimeEntryHoraInicio(entry.horaInicio);
    setTimeEntryHoraFim(entry.horaFim);
    setTimeEntryIntervaloInicio(entry.intervaloInicio || "");
    setTimeEntryIntervaloFim(entry.intervaloFim || "");
    setTimeEntryDescription(entry.description || "");
    // Rolagem para o formulário de edição após o React atualizar o DOM
    requestAnimationFrame(() => {
      timeEntryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleCancelEditTimeEntry() {
    setEditingTimeEntry(null);
    setTimeEntryFieldErrors({});
    setError("");
    const today = new Date();
    setTimeEntryDate(today.toISOString().split('T')[0]);
    setTimeEntryHoraInicio("09:00");
    setTimeEntryHoraFim("17:00");
    setTimeEntryIntervaloInicio("");
    setTimeEntryIntervaloFim("");
    setTimeEntryDescription("");
  }

  async function confirmDeleteTimeEntry(entryId: string) {
    if (isReadOnly && !allowTimeEntryInReadOnly) return;
    try {
      const res = await apiFetch(`/api/time-entries/${entryId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao excluir apontamento.");
        return;
      }

      setDeleteTimeEntryId(null);
      loadTimeEntries();
    } catch (error) {
      console.error("Erro ao excluir apontamento:", error);
      setError("Erro ao excluir apontamento.");
    }
  }

  function fmtHoras(n: number): string {
    const h = Math.floor(n);
    const m = Math.round((n - h) * 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  function formatDateOnly(dateValue: string | Date): string {
    const raw = typeof dateValue === "string" ? dateValue : dateValue.toISOString();
    const iso = raw.slice(0, 10);
    const [year, month, day] = iso.split("-");
    if (year && month && day) {
      return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    }
    try {
      return new Date(dateValue).toLocaleDateString("pt-BR");
    } catch {
      return String(dateValue);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) return;
    setError("");
    setEstimativaError(false);
    setDataEntregaError(false);

    const isClosing = status === "ENCERRADO" && ticket.status !== "ENCERRADO";
    if (projectRequiresFinalizeMotivo(tipoProjeto) && isClosing && !showFinalizeModal && !finalizePayloadRef.current) {
      setStatusBeforeFinalize(ticket.status || "ABERTO");
      setShowFinalizeModal(true);
      return;
    }

    if (!title.trim()) {
      setError("O título é obrigatório.");
      return;
    }

    const faltaHoras = obrigatoriosHoras && !estimativa.trim();
    const faltaDataEntrega = obrigatoriosDataEntrega && !dataEntrega;
    if (faltaHoras) setEstimativaError(true);
    if (faltaDataEntrega) setDataEntregaError(true);
    if (faltaHoras || faltaDataEntrega) return;

    if (description.length > 1000) {
      setError("A descrição deve ter no máximo 1000 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const statusOpt = statusOptions.find((o) => o.value === status) ?? null;
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        criticidade: prioridade || undefined,
        status: status || ticket.status,
        ...(statusOpt?.label && String(status ?? "").startsWith("CUSTOM_") ? { statusLabel: statusOpt.label } : {}),
        responsibleIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      };

      if (status === "ENCERRADO" && ticket.status !== "ENCERRADO" && projectRequiresFinalizeMotivo(tipoProjeto)) {
        body.finalizacaoMotivo = finalizePayloadRef.current?.motivo;
      }
      
      // Se o tópico mudou, atualizar parentTicketId
      if (selectedTopicId !== ticket.parentTicketId) {
        body.parentTicketId = selectedTopicId || null;
      }
      
      // Enviar dataFimPrevista se preenchida
      if (dataEntrega) {
        body.dataFimPrevista = dataEntrega;
      } else {
        body.dataFimPrevista = null;
      }
      
      // Enviar dataInicio se preenchida
      if (dataInicio) {
        body.dataInicio = dataInicio;
      } else {
        body.dataInicio = null;
      }
      
      // Enviar estimativaHoras se preenchida
      if (estimativa.trim()) {
        const estimativaNum = parseFloat(estimativa.replace(/[^0-9.]/g, ""));
        body.estimativaHoras = isNaN(estimativaNum) ? null : estimativaNum;
      } else {
        body.estimativaHoras = null;
      }
      
      // Enviar progresso
      body.progresso = progresso || 0;
      
      // Enviar assignedToId baseado no primeiro responsável (compatibilidade)
      if (responsibleIds.length > 0) {
        body.assignedToId = responsibleIds[0];
      } else {
        body.assignedToId = null;
      }

      const res = await apiFetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string } | null)?.error || "Erro ao atualizar tarefa");
        return;
      }

      finalizePayloadRef.current = null;
      if ((data as { finalizacaoMotivo?: unknown } | null)?.finalizacaoMotivo != null) {
        setFinalizacaoMotivoView(String((data as { finalizacaoMotivo?: unknown }).finalizacaoMotivo));
      } else if (status !== "ENCERRADO") {
        setFinalizacaoMotivoView(null);
      }
      onSaved();
      // Recarregar histórico se estiver na aba de histórico
      if (activeTab === "historico") {
        setTimeout(() => loadHistory(), 300);
      }
      onClose();
    } catch (err) {
      console.error("Erro ao atualizar tarefa:", err);
      setError("Erro de conexão. Verifique se o backend está rodando.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] transition hover:opacity-[0.98]";
  const readOnlyNoFocusClass =
    "focus:ring-0 focus:border-[color:var(--border)] focus:outline-none hover:opacity-100 cursor-default";
  const labelClass = "block text-sm font-semibold text-[color:var(--muted-foreground)] mb-2";

  const tabs: { id: Tab; label: string }[] = isClienteProfile
    ? [
        { id: "descricao", label: "Descrição" },
        { id: "apontamentos", label: "Apontamentos" },
        { id: "orcamento", label: "Orçamento" },
        { id: "anexos", label: "Anexos" },
      ]
    : [
        { id: "descricao", label: "Descrição" },
        { id: "apontamentos", label: "Apontamentos" },
        { id: "historico", label: "Histórico" },
        { id: "orcamento", label: "Orçamento" },
        { id: "anexos", label: "Anexos" },
      ];

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        ref={formRef}
        className="bg-[color:var(--surface)] rounded-3xl border border-[color:var(--border)] w-full max-w-5xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs fixos */}
        <div className="border-b border-[color:var(--border)] bg-[color:var(--surface)] rounded-t-3xl">
          <div className="flex items-start justify-between px-6 pt-6 pb-4 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 text-xs text-[color:var(--muted-foreground)]">
                {!isTopicTicket(ticket.type) && (
                  <span className="font-mono font-semibold text-[color:var(--foreground)]">#{ticket.code}</span>
                )}
                {projectName && (
                  <>
                    <span className="opacity-60">•</span>
                    <span className="opacity-90">{projectName}</span>
                  </>
                )}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-[color:var(--foreground)] truncate mb-3">
                {title || ticket.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${getStatusPillClass(status)}`}>
                  {(() => {
                    const resolved = getTicketStatusDisplay({
                      status,
                      statusLabel: status === ticket.status ? (ticket as any).statusLabel : undefined,
                      statusColor: status === ticket.status ? (ticket as any).statusColor : undefined,
                      projectId,
                      dataFimPrevista: ticket.dataFimPrevista,
                      allowOverdue: false,
                    });
                    return (
                      <>
                        <span className={`h-2 w-2 rounded-full ${resolved.color || "bg-slate-400"}`} aria-hidden />
                        {resolved.label}
                      </>
                    );
                  })()}
                </span>
                {String(budget?.status ?? "").toUpperCase() === "AGUARDANDO_APROVACAO" && (
                  <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-1 text-xs font-semibold text-[color:var(--foreground)]">
                    Aguardando aprovação
                  </span>
                )}
                {status === "ENCERRADO" &&
                  projectRequiresFinalizeMotivo(tipoProjeto) &&
                  finalizacaoMotivoView && (
                    <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-1 text-xs font-semibold text-[color:var(--foreground)]">
                      {finalizacaoMotivoView}
                    </span>
                  )}
                {prioridade && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${getPrioridadePillClass(prioridade)}`}>
                    <span className={`h-2 w-2 rounded-full ${getPrioridadeDotClass(prioridade)}`} />
                    {prioridade}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-black/5 transition-colors duration-200"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center border-t border-[color:var(--border)] px-3 sm:px-6 overflow-x-auto bg-[color:var(--background)]/18">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.id
                    ? "text-[color:var(--primary)]"
                    : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[color:var(--primary)] rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[color:var(--background)]">
          <div className="h-full overflow-y-auto px-6 pb-6 pt-6">
            {activeTab === "descricao" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)] gap-6">
                  {/* Coluna Esquerda */}
                  <div className="space-y-5 bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                    <div>
                      <label className={labelClass}>
                        Título <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={`${inputClass} ${isReadOnly ? readOnlyNoFocusClass : ""}`}
                        placeholder="Ex: Implementar relatório de vendas"
                        required
                        autoFocus
                        disabled={isReadOnly}
                      />
                    </div>

                    {projectId && topics.length > 0 && (
                      <div>
                        <label className={labelClass}>
                          Tópico
                        </label>
                        <div className="relative">
                          <select
                            value={selectedTopicId}
                            onChange={(e) => setSelectedTopicId(e.target.value)}
                            className={inputClass + " appearance-none pr-9"}
                            disabled={isReadOnly}
                          >
                            <option value="">Selecione um tópico</option>
                            {topics.map((topic) => (
                              <option key={topic.id} value={topic.id}>
                                {topic.title}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[color:var(--muted-foreground)] text-xs">
                            ▾
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Data de início</label>
                        <input
                          type="date"
                          value={dataInicio}
                          onChange={(e) => setDataInicio(e.target.value)}
                          className={inputClass}
                          disabled={isReadOnly}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>
                          Data de entrega
                          {obrigatoriosDataEntrega && <span className="text-red-500"> *</span>}
                        </label>
                        <input
                          type="date"
                          value={dataEntrega}
                          onChange={(e) => {
                            setDataEntrega(e.target.value);
                            if (dataEntregaError) setDataEntregaError(false);
                          }}
                          className={
                            inputClass +
                            (obrigatoriosDataEntrega && dataEntregaError
                              ? " border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50/50"
                              : "")
                          }
                          disabled={isReadOnly}
                        />
                        {obrigatoriosDataEntrega && dataEntregaError && (
                          <p className="mt-1 text-xs text-red-600">
                            Data de entrega é obrigatória para este projeto.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coluna Direita */}
                  <div className="space-y-5 bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                    {!isClienteProfile && (
                      <div>
                        <label className={labelClass}>Membros</label>
                        <div className="flex flex-wrap items-center gap-2 mb-2 min-h-[44px]">
                          {displayedResponsibleMembers.map((u) => (
                            <div key={u.id} className="relative -ml-1 first:ml-0 group">
                              <div className="flex items-center">
                                {(() => {
                                  const meta = resolveMemberMeta(u.id);
                                  return (
                                    <Avatar
                                      name={u.name}
                                      email={meta.email}
                                      avatarUrl={meta.avatarUrl ?? null}
                                      avatarVersion={meta.updatedAt}
                                      size={32}
                                      className="ring-2 ring-[color:var(--surface)] shadow-sm"
                                      imgClassName="ring-2 ring-[color:var(--surface)] shadow-sm"
                                      fallbackClassName="text-xs"
                                    />
                                  );
                                })()}
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    onClick={() => removeResponsible(u.id)}
                                    className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{
                                      borderColor: "var(--border)",
                                      background: "rgba(0,0,0,0.35)",
                                      color: "#ffffff",
                                    }}
                                    aria-label={`Remover ${u.name}`}
                                    title="Remover"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
                                <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-slate-800">
                                  {u.name}
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="relative" ref={userPickerRef}>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => setShowUserPicker(!showUserPicker)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:opacity-95"
                                style={{
                                  borderColor: "rgba(92,0,225,0.35)",
                                  color: "var(--foreground)",
                                  background: "rgba(0,0,0,0.02)",
                                }}
                                title="Adicionar"
                                aria-label="Adicionar"
                              >
                                <Users className="h-3.5 w-3.5" />
                                Adicionar
                              </button>
                            )}
                            {!isReadOnly && showUserPicker && (
                              <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg py-1 max-h-48 overflow-y-auto">
                                {availableToAdd.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                                    Todos já adicionados
                                  </p>
                                ) : (
                                  availableToAdd.map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() => addResponsible(u.id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--foreground)] hover:bg-black/5"
                                    >
                                      <Avatar
                                        name={u.name}
                                        email={u.email}
                                        avatarUrl={u.avatarUrl ?? null}
                                        avatarVersion={u.updatedAt}
                                        size={24}
                                        className="shadow-sm"
                                        imgClassName="shadow-sm"
                                        fallbackClassName="text-[10px]"
                                      />
                                      {u.name}
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className={labelClass}>
                        Número de horas
                        {obrigatoriosHoras && <span className="text-red-500"> *</span>}
                      </label>
                      <input
                        type="text"
                        value={estimativa}
                        onChange={(e) => {
                          setEstimativa(e.target.value);
                          if (estimativaError) {
                            setEstimativaError(false);
                          }
                        }}
                        className={
                          inputClass +
                          (obrigatoriosHoras && estimativaError
                            ? " border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50/50"
                            : "") +
                          (isReadOnly ? ` ${readOnlyNoFocusClass}` : "")
                        }
                        placeholder="Ex: 8h"
                        disabled={isReadOnly}
                      />
                      {obrigatoriosHoras && estimativaError && (
                        <p className="mt-1 text-xs text-red-600">
                          Número de horas é obrigatório para este projeto.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Status</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className={inputClass}
                          disabled={isReadOnly}
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {status === "ENCERRADO" &&
                          ticket.finalizacaoMotivo &&
                          projectRequiresFinalizeMotivo(tipoProjeto) && (
                            <div className="mt-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-2 text-sm text-[color:var(--foreground)]">
                              <p className="font-semibold">
                                Motivo: <span className="font-medium">{ticket.finalizacaoMotivo ?? "—"}</span>
                              </p>
                            </div>
                          )}
                      </div>

                      <div className="relative">
                        <label className={labelClass}>Prioridade</label>
                        <button
                          type="button"
                          onClick={() => setShowPrioridadeOpen(!showPrioridadeOpen)}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-[color:var(--surface)] text-left text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] transition-all duration-200 ${showPrioridadeOpen ? "shadow-sm" : ""}`}
                          disabled={isReadOnly}
                        >
                          {prioridade ? (
                            <>
                              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getPrioridadeDotClass(prioridade)}`} aria-hidden />
                              <span>{PRIORIDADES.find((p) => p.value === prioridade)?.label ?? prioridade}</span>
                            </>
                          ) : (
                            <span className="text-[color:var(--muted-foreground)]">Selecione...</span>
                          )}
                          <span className="ml-auto text-[color:var(--muted-foreground)] pointer-events-none">▼</span>
                        </button>
                        {!isReadOnly && showPrioridadeOpen && (
                          <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl py-1 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                            <button
                              type="button"
                              onClick={() => {
                                setPrioridade("");
                                setShowPrioridadeOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-[color:var(--muted-foreground)] hover:bg-black/5"
                            >
                              Selecione...
                            </button>
                            {PRIORIDADES.map((p) => (
                              <button
                                key={p.value}
                                type="button"
                                onClick={() => {
                                  setPrioridade(p.value);
                                  setShowPrioridadeOpen(false);
                                }}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm ${prioridade === p.value ? "bg-[color:var(--background)]/35 text-[color:var(--foreground)]" : "text-[color:var(--foreground)] hover:bg-black/5"}`}
                              >
                                <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getPrioridadeDotClass(p.value)}`} aria-hidden />
                                {p.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Progresso (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={progresso}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setProgresso(Math.max(0, Math.min(100, val)));
                        }}
                        className={inputClass}
                        disabled={isReadOnly}
                      />
                      <div className="mt-3 h-2 bg-black/10 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full transition-all duration-500 ease-out shadow-sm"
                          style={{ width: `${progresso}%`, background: "var(--primary)" }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)] text-right">{progresso}% concluído</p>
                    </div>
                  </div>
                </div>

                {/* Campo Descrição - Largura completa */}
                <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <label className={labelClass}>
                    Descrição{" "}
                    {description.length > 0 && (
                      <span className="text-xs text-[color:var(--muted-foreground)] font-normal">
                        ({description.length}/1000)
                      </span>
                    )}
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => {
                      if (e.target.value.length <= 1000) {
                        setDescription(e.target.value);
                      }
                    }}
                    className={`${inputClass} min-h-[150px] resize-y ${isReadOnly ? readOnlyNoFocusClass : ""}`}
                    placeholder="Descreva os detalhes da tarefa..."
                    rows={8}
                    maxLength={1000}
                    disabled={isReadOnly}
                  />
                </div>

                {/* Seção de Comentários */}
                <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-base font-bold text-[color:var(--foreground)] mb-5 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                    Comentários
                  </h3>
                  
                  {/* Lista de comentários */}
                  {comments.length > 0 ? (
                    <div className="mb-6 space-y-4">
                      {comments.map((c) => {
                        const isAuthor = currentUser?.id === c.user?.id;
                        const isAdmin = currentUser?.role === "SUPER_ADMIN";
                        const canEditOrDelete = isAuthor || isAdmin;
                        const isEditing = editingCommentId === c.id;
                        const isDeleting = deletingCommentId === c.id;
                        const vis = String(c.visibility || "PUBLIC").toUpperCase();

                        return (
                          <div key={c.id} className="bg-[color:var(--background)]/25 border border-[color:var(--border)] rounded-2xl p-4 hover:bg-black/5 transition-colors duration-200">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-[color:var(--foreground)]">{c.user?.name || "Usuário"}</span>
                                <span className="text-xs text-[color:var(--muted-foreground)]">
                                  {new Date(c.createdAt).toLocaleString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {!isClienteProfile && vis === "INTERNAL" && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                                    Interno
                                  </span>
                                )}
                              </div>
                              {!isReadOnly && canEditOrDelete && !isEditing && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditComment(c.id)}
                                    disabled={isDeleting || savingComment}
                                    className="p-2 rounded-xl hover:bg-black/5 text-[color:var(--muted-foreground)] hover:text-[color:var(--primary)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Editar comentário"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(c.id)}
                                    disabled={isDeleting || savingComment}
                                    className="p-2 rounded-xl hover:bg-black/5 text-[color:var(--muted-foreground)] hover:text-red-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Excluir comentário"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="space-y-3">
                                <RichTextEditor
                                  value={editingCommentContent}
                                  onChange={setEditingCommentContent}
                                  placeholder="Editar comentário..."
                                  onImageUpload={handleImageUpload}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    disabled={savingComment}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-[color:var(--foreground)] hover:bg-black/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEditComment}
                                    disabled={!hasTextContent(editingCommentContent) || savingComment}
                                    className="px-4 py-2 rounded-xl text-[color:var(--primary-foreground)] text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95"
                                    style={{ background: "var(--primary)" }}
                                  >
                                    {savingComment ? "Salvando..." : "Salvar"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={commentHtmlBodyClassName}
                                dangerouslySetInnerHTML={{ __html: sanitizeClientHtml(normalizeCommentHtmlForAssets(c.content)) }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mb-6 text-sm text-[color:var(--muted-foreground)] py-8 text-center border-2 border-dashed border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/25">
                      <p className="opacity-90">Nenhum comentário ainda.</p>
                      <p className="text-xs opacity-75 mt-1">Seja o primeiro a comentar!</p>
                    </div>
                  )}
                  
                  {/* Editor de novo comentário */}
                  <div ref={newCommentSectionRef} className="mt-6 pt-6 border-t border-[color:var(--border)]">
                    <label className={labelClass}>Novo comentário</label>
                    {!isClienteProfile && (
                      <div className="mb-3 flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setCommentVisibility("PUBLIC")}
                          className={`px-3 py-1 rounded-full border transition ${
                            commentVisibility === "PUBLIC"
                              ? "text-[color:var(--primary-foreground)] border-transparent"
                              : "bg-[color:var(--surface)] text-[color:var(--foreground)] border-[color:var(--border)] hover:bg-black/5"
                          }`}
                          style={commentVisibility === "PUBLIC" ? { background: "var(--primary)" } : undefined}
                        >
                          Público
                        </button>
                        <button
                          type="button"
                          onClick={() => setCommentVisibility("INTERNAL")}
                          className={`px-3 py-1 rounded-full border transition ${
                            commentVisibility === "INTERNAL"
                              ? "text-white border-transparent"
                              : "bg-[color:var(--surface)] text-[color:var(--foreground)] border-[color:var(--border)] hover:bg-black/5"
                          }`}
                          style={commentVisibility === "INTERNAL" ? { background: "#7c3aed" } : undefined}
                        >
                          Interno
                        </button>
                        <span className="text-[color:var(--muted-foreground)]">
                          {commentVisibility === "INTERNAL"
                            ? "Somente equipe interna (não aparece para cliente)."
                            : "Visível para o cliente."}
                        </span>
                      </div>
                    )}
                    <RichTextEditor
                      value={comment}
                      onChange={setComment}
                      onImageUpload={handleImageUpload}
                      placeholder="Escrever novo comentário..."
                    />
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveComment}
                        disabled={!hasTextContent(comment) || savingComment}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[color:var(--primary-foreground)] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md hover:opacity-95"
                        style={{ background: "var(--primary)" }}
                      >
                        <Send className="h-4 w-4" />
                        {savingComment ? "Enviando..." : "Enviar comentário"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "apontamentos" && !isClienteProfile && (
              <div className="space-y-6">
                {!canLogTime && (
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-5 py-4 text-[color:var(--foreground)] text-sm">
                    O status do projeto não permite apontamento de horas.
                  </div>
                )}
                {/* Formulário de apontamento */}
                {canManageTimeEntries && <div
                  ref={timeEntryFormRef}
                  className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <h3 className="text-base font-bold text-[color:var(--foreground)] mb-5 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                    {editingTimeEntry ? "Editar apontamento" : "Novo apontamento"}
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Data */}
                    <div>
                      <label className={labelClass}>Data</label>
                      <input
                        type="date"
                        value={timeEntryDate}
                        onChange={(e) => setTimeEntryDate(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>

                    {/* Horas trabalhadas */}
                    <div>
                      <label className={labelClass}>Horas trabalhadas</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-[color:var(--muted-foreground)] mb-1 block">Início</label>
                          <input
                            type="text"
                            value={timeEntryHoraInicio}
                            onChange={(e) => {
                              const formatted = formatHorasInput(e.target.value);
                              setTimeEntryHoraInicio(formatted);
                            }}
                            placeholder="09:00"
                            className={inputClass}
                            maxLength={5}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[color:var(--muted-foreground)] mb-1 block">Fim</label>
                          <input
                            type="text"
                            value={timeEntryHoraFim}
                            onChange={(e) => {
                              const formatted = formatHorasInput(e.target.value);
                              setTimeEntryHoraFim(formatted);
                            }}
                            placeholder="17:00"
                            className={inputClass}
                            maxLength={5}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Intervalo */}
                    <div>
                      <label className={labelClass}>Intervalo</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-[color:var(--muted-foreground)] mb-1 block">Início</label>
                          <input
                            type="text"
                            value={timeEntryIntervaloInicio}
                            onChange={(e) => {
                              const formatted = formatHorasInput(e.target.value);
                              setTimeEntryIntervaloInicio(formatted);
                            }}
                            placeholder="12:00"
                            className={inputClass}
                            maxLength={5}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[color:var(--muted-foreground)] mb-1 block">Fim</label>
                          <input
                            type="text"
                            value={timeEntryIntervaloFim}
                            onChange={(e) => {
                              const formatted = formatHorasInput(e.target.value);
                              setTimeEntryIntervaloFim(formatted);
                            }}
                            placeholder="13:00"
                            className={inputClass}
                            maxLength={5}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Horas totais (automático) */}
                    <div>
                      <label className={labelClass}>Horas totais</label>
                      <input
                        type="text"
                        value={calcTotalHoras()}
                        className={inputClass + " bg-[color:var(--background)]/25 cursor-not-allowed"}
                        readOnly
                        disabled
                      />
                    </div>

                    {/* Comentário */}
                    <div>
                      <label className={labelClass}>
                        Comentário <span className="text-red-500">*</span>
                        {timeEntryDescription.length > 0 && (
                          <span className="text-xs text-[color:var(--muted-foreground)] font-normal ml-1">
                            ({timeEntryDescription.length}/500)
                          </span>
                        )}
                      </label>
                      <textarea
                        value={timeEntryDescription}
                        onChange={(e) => {
                          if (e.target.value.length <= 500) {
                            setTimeEntryDescription(e.target.value);
                            setTimeEntryFieldErrors((prev) => ({ ...prev, description: false }));
                          }
                        }}
                        className={`${inputClass} min-h-[80px] resize-y ${timeEntryFieldErrors.description ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`}
                        placeholder="Escrever comentário..."
                        maxLength={500}
                        rows={3}
                      />
                    </div>

                    {/* Botões */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--border)]">
                      {editingTimeEntry && (
                        <button
                          type="button"
                          onClick={handleCancelEditTimeEntry}
                          disabled={savingTimeEntry}
                          className="px-5 py-2.5 rounded-xl border border-[color:var(--border)] bg-transparent text-[color:var(--foreground)] text-sm font-semibold hover:bg-black/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveTimeEntry}
                        disabled={savingTimeEntry || !timeEntryHoraInicio || !timeEntryHoraFim}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[color:var(--primary-foreground)] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md hover:opacity-95"
                        style={{ background: "var(--primary)" }}
                      >
                        {editingTimeEntry ? (
                          <>
                            <Check className="h-4 w-4" />
                            {savingTimeEntry ? "Salvando..." : "Salvar alterações"}
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            {savingTimeEntry ? "Registrando..." : "Registrar apontamento"}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>}

                {/* Tabela de apontamentos */}
                <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-base font-bold text-[color:var(--foreground)] mb-5 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                    Apontamentos registrados
                  </h3>
                  
                  {timeEntries.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="px-4 py-3 text-left text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Usuário</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Horas trabalhadas</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Intervalo</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Horas totais</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Comentário</th>
                            {canManageTimeEntries && (
                              <th className="px-4 py-3 text-right text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider">Ações</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {timeEntries.map((entry) => (
                            <tr key={entry.id} className="border-b border-[color:var(--border)]/60 hover:bg-black/5 transition-colors duration-150">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--primary-foreground)] text-xs font-semibold" style={{ background: "var(--primary)" }}>
                                    {entry.user?.name ? getIniciais(entry.user.name) : "U"}
                                  </span>
                                  <div>
                                    <p className="text-sm font-medium text-[color:var(--foreground)]">
                                      {entry.user?.name || "Usuário"}
                                    </p>
                                    <p className="text-xs text-[color:var(--muted-foreground)]">
                                      {formatDateOnly(entry.date)}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">
                                {entry.horaInicio} às {entry.horaFim}
                              </td>
                              <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">
                                {entry.intervaloInicio && entry.intervaloFim
                                  ? `${entry.intervaloInicio} às ${entry.intervaloFim}`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono font-semibold text-[color:var(--primary)]">
                                {fmtHoras(entry.totalHoras)}
                              </td>
                              <td className="px-4 py-3 text-sm text-[color:var(--foreground)] max-w-xs">
                                <p className="truncate" title={entry.description || ""}>
                                  {entry.description || "—"}
                                </p>
                              </td>
                              {canManageTimeEntries && (
                                <td className="px-4 py-3">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditTimeEntry(entry)}
                                      disabled={savingTimeEntry || editingTimeEntry === entry.id}
                                      className="p-2 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Editar apontamento"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteTimeEntryId(entry.id)}
                                      disabled={savingTimeEntry}
                                      className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Excluir apontamento"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50 border-t-2 border-blue-200">
                            <td colSpan={3} className="px-4 py-4 text-sm font-bold text-slate-800">
                              Total de horas
                            </td>
                            <td className="px-4 py-4 text-lg font-mono font-bold text-blue-600">
                              {fmtHoras(timeEntries.reduce((sum, e) => sum + e.totalHoras, 0))}
                            </td>
                            <td colSpan={canManageTimeEntries ? 2 : 1}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                      <p className="text-slate-400 mb-1">Nenhum apontamento registrado ainda.</p>
                      <p className="text-xs text-slate-400">
                        {canManageTimeEntries ? "Use o formulário acima para registrar horas trabalhadas." : "Sem permissão para apontar horas neste contexto."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "apontamentos" && isClienteProfile && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                    Apontamentos registrados
                  </h3>

                  {timeEntries.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Usuário</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Horas trabalhadas</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Intervalo</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Horas totais</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Comentário</th>
                          </tr>
                        </thead>
                        <tbody>
                          {timeEntries.map((entry) => (
                            <tr key={entry.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors duration-150">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">
                                    {entry.user?.name ? getIniciais(entry.user.name) : "U"}
                                  </span>
                                  <div>
                                    <p className="text-sm font-medium text-slate-800">
                                      {entry.user?.name || "Usuário"}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {formatDateOnly(entry.date)}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700">
                                {entry.horaInicio} às {entry.horaFim}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700">
                                {entry.intervaloInicio && entry.intervaloFim
                                  ? `${entry.intervaloInicio} às ${entry.intervaloFim}`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-600">
                                {fmtHoras(entry.totalHoras)}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                                <p className="truncate" title={entry.description || ""}>
                                  {entry.description || "—"}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50 border-t-2 border-blue-200">
                            <td colSpan={3} className="px-4 py-4 text-sm font-bold text-slate-800">
                              Total de horas
                            </td>
                            <td className="px-4 py-4 text-lg font-mono font-bold text-blue-600">
                              {fmtHoras(timeEntries.reduce((sum, e) => sum + e.totalHoras, 0))}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/25">
                      <p className="text-[color:var(--muted-foreground)] mb-1">Nenhum apontamento registrado ainda.</p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">Esta aba é somente para visualização.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "historico" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Histórico de Alterações</h3>
                </div>
                
                {loadingHistory ? (
                  <div className="text-center py-12 text-sm text-[color:var(--muted-foreground)]">
                    Carregando histórico...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/25">
                    <p className="text-[color:var(--muted-foreground)] mb-1">Nenhum registro de histórico encontrado.</p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">As alterações na tarefa serão registradas aqui automaticamente.</p>
                  </div>
                ) : (
                  <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-[color:var(--border)] bg-[color:var(--background)]/25">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                              Data
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                              Usuário
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                              Ação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                              Detalhes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--border)]/60">
                          {history.map((entry) => {
                            const getActionLabel = (action: string) => {
                              const labels: Record<string, string> = {
                                CREATE: "Criação",
                                UPDATE: "Atualização",
                                DELETE: "Exclusão",
                                STATUS_CHANGE: "Alteração de Status",
                                PRIORITY_CHANGE: "Alteração de Prioridade",
                                ASSIGNED: "Atribuição",
                                UNASSIGNED: "Remoção de Atribuição",
                                RESPONSIBLES_CHANGE: "Alteração de Responsáveis",
                                COMMENT_ADDED: "Comentário Adicionado",
                                COMMENT_EDITED: "Comentário Editado",
                                COMMENT_DELETED: "Comentário Removido",
                                TIME_ENTRY_ADDED: "Apontamento Adicionado",
                                TIME_ENTRY_EDITED: "Apontamento Editado",
                                TIME_ENTRY_DELETED: "Apontamento Removido",
                                ATTACHMENT_ADDED: "Anexo Adicionado",
                                ATTACHMENT_DELETED: "Anexo Removido",
                              };
                              return labels[action] || action;
                            };

                            const getActionColor = () =>
                              "bg-[color:var(--background)]/25 text-[color:var(--foreground)] border-[color:var(--border)]";

                            return (
                              <tr key={entry.id} className="hover:bg-black/5 transition-colors duration-150">
                                <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {new Date(entry.createdAt).toLocaleDateString("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })}
                                    </span>
                                    <span className="text-xs text-[color:var(--muted-foreground)]">
                                      {new Date(entry.createdAt).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-[color:var(--primary-foreground)] text-xs font-semibold shadow-sm" style={{ background: "var(--primary)" }}>
                                      {getIniciais(entry.user.name)}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-medium text-[color:var(--foreground)]">{entry.user.name}</span>
                                      {entry.user.email && (
                                        <span className="text-xs text-[color:var(--muted-foreground)]">{entry.user.email}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getActionColor()}`}>
                                    {getActionLabel(entry.action)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">
                                  {entry.details ? (
                                    <div className="max-w-md">
                                      <p className="text-[color:var(--foreground)]">{entry.details}</p>
                                      {entry.field && entry.oldValue !== null && entry.newValue !== null && (
                                        <div className="mt-2 text-xs text-[color:var(--muted-foreground)] space-y-1">
                                          <div className="flex items-start gap-2">
                                            <span className="font-medium">Campo:</span>
                                            <span className="opacity-90">{entry.field}</span>
                                          </div>
                                          <div className="flex items-start gap-2">
                                            <span className="font-medium">De:</span>
                                            <span className="text-red-600 line-through">{entry.oldValue || "(vazio)"}</span>
                                          </div>
                                          <div className="flex items-start gap-2">
                                            <span className="font-medium">Para:</span>
                                            <span className="text-emerald-600 font-medium">{entry.newValue || "(vazio)"}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[color:var(--muted-foreground)]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "orcamento" && ticket.type !== "SUBPROJETO" && (
              <div className="space-y-6">
                <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-5 py-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Orçamento</h3>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        Horas + observação, com controle de aprovação (usuário, data e hora).
                      </p>
                    </div>
                  </div>

                  {budgetLoading && (
                    <div className="mt-3 text-sm text-[color:var(--muted-foreground)]">Carregando orçamento...</div>
                  )}

                  {budgetError && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {budgetError}
                    </div>
                  )}

                  {budget && String(budget.status ?? "").toUpperCase() !== "NENHUM" ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-2">
                        <div className="text-xs text-[color:var(--muted-foreground)]">Horas</div>
                        <div className="text-sm font-semibold text-[color:var(--foreground)]">{Number(budget.horas ?? 0)}</div>
                      </div>
                      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-2 md:col-span-3">
                        <div className="text-xs text-[color:var(--muted-foreground)]">Observação</div>
                        <div className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
                          {String(budget.observacao ?? "")}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 md:col-span-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[color:var(--muted-foreground)]">Status:</span>
                          {String(budget.status ?? "").toUpperCase() === "AGUARDANDO_APROVACAO" && (
                            <span className="text-xs font-semibold text-[color:var(--foreground)] bg-[color:var(--background)]/25 border border-[color:var(--border)] px-2 py-1 rounded-full">
                              Aguardando aprovação
                            </span>
                          )}
                          {String(budget.status ?? "").toUpperCase() === "APROVADO" && (
                            <span className="text-xs font-semibold text-[color:var(--foreground)] bg-[color:var(--background)]/25 border border-[color:var(--border)] px-2 py-1 rounded-full">
                              Aprovado
                            </span>
                          )}
                          {String(budget.status ?? "").toUpperCase() === "REPROVADO" && (
                            <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                              Reprovado
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[color:var(--muted-foreground)]">
                          <div>
                            <b>Enviado por:</b> {budget.sentBy?.name ?? "—"}
                            {budget.sentAt ? ` • ${new Date(budget.sentAt).toLocaleString("pt-BR")}` : ""}
                          </div>
                          <div>
                            <b>Decidido por:</b> {budget.decidedBy?.name ?? "—"}
                            {budget.decidedAt ? ` • ${new Date(budget.decidedAt).toLocaleString("pt-BR")}` : ""}
                          </div>
                        </div>

                        {String(budget.status ?? "").toUpperCase() === "REPROVADO" && (
                          <div className="mt-2 text-xs text-red-700">
                            <b>Motivo:</b> {String(budget.rejectionReason ?? "—")}
                          </div>
                        )}
                      </div>

                      {currentUser?.role === "CLIENTE" &&
                        String(budget.status ?? "").toUpperCase() === "AGUARDANDO_APROVACAO" && (
                          <div className="md:col-span-3">
                            <div className="flex flex-col md:flex-row md:items-end gap-3">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">
                                  Motivo da reprovação (obrigatório para reprovar)
                                </label>
                                <input
                                  value={budgetRejectReason}
                                  onChange={(e) => setBudgetRejectReason(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)]"
                                  placeholder="Descreva o motivo"
                                  disabled={budgetDecisionSaving}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleApproveBudget}
                                  disabled={budgetDecisionSaving}
                                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                  Aprovar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRejectBudget}
                                  disabled={budgetDecisionSaving}
                                  className="inline-flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                  Reprovar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  ) : (currentUser?.role === "CONSULTOR" ||
                      currentUser?.role === "ADMIN_PORTAL" ||
                      currentUser?.role === "GESTOR_PROJETOS" ||
                      currentUser?.role === "SUPER_ADMIN") ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Horas *</label>
                        <input
                          value={budgetHoras}
                          onChange={(e) => setBudgetHoras(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)]"
                          placeholder="Ex: 10"
                          disabled={budgetSaving}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1">Observação *</label>
                        <textarea
                          value={budgetObservacao}
                          onChange={(e) => setBudgetObservacao(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] min-h-[110px]"
                          placeholder="Observação do orçamento"
                          disabled={budgetSaving}
                        />
                      </div>
                      <div className="md:col-span-3 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSendBudget}
                          disabled={budgetSaving}
                          className="inline-flex items-center justify-center rounded-xl text-[color:var(--primary-foreground)] px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-95"
                          style={{ background: "var(--primary)" }}
                        >
                          {budgetSaving ? "Enviando..." : "Enviar orçamento"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-[color:var(--muted-foreground)]">Nenhum orçamento enviado.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "anexos" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Anexos</h3>
                </div>

                {/* Área de Upload com Drag & Drop */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 ${
                    dragActive
                      ? "border-[color:var(--primary)] bg-[color:var(--background)]/35"
                      : "border-[color:var(--border)] bg-[color:var(--background)]/25 hover:opacity-95"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                        e.target.value = ""; // Reset input
                      }
                    }}
                    disabled={uploadingAttachment}
                  />
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-4 p-4 rounded-full" style={{ background: "color-mix(in oklab, var(--primary) 18%, transparent)" }}>
                      <Upload className="h-8 w-8" style={{ color: "var(--primary)" }} />
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--foreground)] mb-1">
                      {uploadingAttachment ? "Enviando arquivo..." : "Arraste um arquivo aqui ou clique para selecionar"}
                    </p>
                    <p className="text-xs text-[color:var(--muted-foreground)] mb-4">
                      Suporta imagens, documentos e outros arquivos (máximo 10MB)
                    </p>
                    <label
                      htmlFor="file-upload"
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        uploadingAttachment
                          ? "bg-black/10 text-[color:var(--muted-foreground)] cursor-not-allowed"
                          : "text-[color:var(--primary-foreground)] shadow-sm hover:shadow-md cursor-pointer hover:opacity-95"
                      }`}
                      style={!uploadingAttachment ? { background: "var(--primary)" } : undefined}
                    >
                      <Upload className="h-4 w-4" />
                      Escolher arquivo
                    </label>
                  </div>
                </div>

                {/* Lista de Anexos */}
                {loadingAttachments ? (
                  <div className="text-center py-8 text-sm text-[color:var(--muted-foreground)]">
                    Carregando anexos...
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/25">
                    <p className="text-[color:var(--muted-foreground)] mb-1">Nenhum anexo adicionado ainda.</p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">Use a área acima para adicionar arquivos.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {attachments.map((attachment) => {
                        const isImage = attachment.fileType.startsWith("image/");

                        return (
                          <div
                            key={attachment.id}
                            className="p-4 hover:bg-blue-50/50 transition-colors duration-150"
                          >
                            <div className="flex items-start gap-4">
                              {/* Ícone do arquivo — clicável para visualizar */}
                              <button
                                type="button"
                                onClick={() => void openTicketAttachmentInNewTab(attachment)}
                                className="shrink-0 p-3 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                                title="Visualizar arquivo"
                              >
                                {getFileIcon(attachment.fileType)}
                              </button>

                              {/* Informações do arquivo — clicável para visualizar */}
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => void openTicketAttachmentInNewTab(attachment)}
                                  className="text-left w-full group"
                                  title="Visualizar arquivo"
                                >
                                  <h4 className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors" title={attachment.filename}>
                                    {attachment.filename}
                                  </h4>
                                </button>
                                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                                  <span>{formatFileSize(attachment.fileSize)}</span>
                                  <span>•</span>
                                  <span>
                                    {new Date(attachment.createdAt).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  <span>•</span>
                                  <span className="truncate">{attachment.user.name}</span>
                                </div>

                                {isImage && (
                                  <TicketAttachmentImageThumb
                                    attachment={{ id: attachment.id, filename: attachment.filename }}
                                  />
                                )}

                                {/* Botões de ação */}
                                <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAttachment(attachment)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Baixar
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openTicketAttachmentInNewTab(attachment);
                                    }}
                                  >
                                    Visualizar
                                  </button>
                                  {(currentUser?.id === attachment.user.id ||
                                    currentUser?.role === "SUPER_ADMIN" ||
                                    currentUser?.role === "GESTOR_PROJETOS") && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(attachment.id)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex justify-between items-center gap-4 bg-white rounded-b-2xl shadow-sm">
          {error ? (
            <div className="flex-1 flex items-center gap-2 text-sm text-red-600 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
              <span className="truncate">{error}</span>
            </div>
          ) : (
            <div className="flex-1 text-xs text-slate-500 flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-slate-400"></span>
              {isReadOnly
                ? "Modo somente visualização para este perfil."
                : "As alterações são salvas automaticamente para este projeto."}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 hover:border-slate-400 transition-all duration-200"
            >
              Cancelar
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="px-6 py-2.5 rounded-xl text-[color:var(--primary-foreground)] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md hover:opacity-95"
                style={{ background: "var(--primary)" }}
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            )}
          </div>
        </div>
      </form>

      <FinalizeTaskModal
        open={showFinalizeModal}
        onClose={() => {
          setShowFinalizeModal(false);
          finalizePayloadRef.current = null;
          setStatus(statusBeforeFinalize);
        }}
        onConfirm={({ motivo }) => {
          // Usa ref para não depender de setState antes do submit
          finalizePayloadRef.current = { motivo };
          setShowFinalizeModal(false);
          // Submete novamente agora com motivo/observação
          formRef.current?.requestSubmit();
        }}
      />

      {permissionPayload && (
        <TimeEntryPermissionModal
          payload={permissionPayload}
          onClose={() => setPermissionPayload(null)}
          onSent={() => {
            setPermissionPayload(null);
            setTimeEntryHoraInicio("09:00");
            setTimeEntryHoraFim("17:00");
            setTimeEntryIntervaloInicio("");
            setTimeEntryIntervaloFim("");
            setTimeEntryDescription("");
            setTimeout(() => loadTimeEntries(), 300);
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
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body?.error || "Erro ao enviar solicitação para aprovação.");
            }
            return true;
          }}
        />
      )}

      {overLimitDailyPayload && (
        <ConfirmModal
          title="Apontamento acima do limite diário"
          message="Este apontamento excede o limite permitido e precisa de aprovação do Administrador ou Gestor de Projetos. Confirmar?"
          confirmLabel="Enviar para aprovação"
          cancelLabel="Cancelar"
          onCancel={() => setOverLimitDailyPayload(null)}
          onConfirm={async () => {
            try {
              const res = await apiFetch("/api/permission-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  justification: "Apontamento acima do limite diário de 8 horas.",
                  date: overLimitDailyPayload.date,
                  horaInicio: overLimitDailyPayload.horaInicio,
                  horaFim: overLimitDailyPayload.horaFim,
                  intervaloInicio: overLimitDailyPayload.intervaloInicio,
                  intervaloFim: overLimitDailyPayload.intervaloFim,
                  totalHoras: overLimitDailyPayload.totalHoras,
                  description: overLimitDailyPayload.description,
                  projectId: overLimitDailyPayload.projectId,
                  ticketId: overLimitDailyPayload.ticketId,
                  activityId: overLimitDailyPayload.activityId,
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Erro ao enviar para aprovação.");
                return;
              }
              setOverLimitDailyPayload(null);
              setEditingTimeEntry(null);
              setTimeEntryHoraInicio("09:00");
              setTimeEntryHoraFim("17:00");
              setTimeEntryIntervaloInicio("");
              setTimeEntryIntervaloFim("");
              setTimeEntryDescription("");
              setTimeout(() => loadTimeEntries(), 300);
            } catch {
              setError("Erro ao enviar para aprovação.");
            }
          }}
        />
      )}

      {deleteTimeEntryId && (
        <ConfirmModal
          title="Excluir apontamento"
          message="Tem certeza que deseja excluir este apontamento? Esta ação não pode ser desfeita."
          cancelLabel="Cancelar"
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={() => confirmDeleteTimeEntry(deleteTimeEntryId)}
          onCancel={() => setDeleteTimeEntryId(null)}
        />
      )}
    </div>
  );
}

