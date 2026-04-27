"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Maximize2, Send, Pencil, Trash2, Plus, Users } from "lucide-react";
import { API_BASE_URL, ASSET_PUBLIC_BASE_URL, apiFetch, publicFileUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { Avatar } from "@/components/Avatar";
import { sanitizeClientHtml } from "@/lib/sanitizeClientHtml";

type UserOption = { id: string; name: string; email?: string; avatarUrl?: string | null; updatedAt?: string };

type CreateTaskModalFullProps = {
  projectId: string;
  projectName?: string;
  initialStatus?: string;
  parentTicketId?: string;
  onClose: () => void;
  onSaved: () => void;
};

type Tab = "descricao" | "horas" | "historico" | "anexos";

type LightTicket = {
  id: string;
  code: string;
  title: string;
  type: string;
};

const PRIORIDADES_DEFAULT = [
  { value: "BAIXA", label: "Baixa", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "MEDIA", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "ALTA", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "URGENTE", label: "Urgente", color: "bg-red-100 text-red-700 border-red-300" },
];

const PRIORIDADES_AMS = [
  { value: "BAIXA", label: "Baixa", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "MEDIA", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "ALTA", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "CRITICA", label: "Urgente", color: "bg-red-100 text-red-700 border-red-300" },
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

// Cor do pill de status = cor da coluna do Kanban
function getStatusPillClass(status: string): string {
  // Estilo neutro (compatível com tema). A cor fica nos detalhes (ex.: dot).
  if (!status) return "bg-[color:var(--background)]/25 text-[color:var(--muted-foreground)] border-[color:var(--border)]";
  return "bg-[color:var(--background)]/25 text-[color:var(--foreground)] border-[color:var(--border)]";
}

// Cor do pill de prioridade = mesma paleta
function getPrioridadePillClass(prioridade: string): string {
  if (!prioridade) return "bg-[color:var(--background)]/25 text-[color:var(--muted-foreground)] border-[color:var(--border)]";
  return "bg-[color:var(--background)]/25 text-[color:var(--foreground)] border-[color:var(--border)]";
}

// Cor da bolinha de prioridade
function getPrioridadeDotClass(prioridade: string): string {
  if (!prioridade) return "bg-slate-400";
  const map: Record<string, string> = {
    Urgente: "bg-red-500",
    URGENTE: "bg-red-500",
    CRITICA: "bg-red-500",
    Alta: "bg-orange-500", ALTA: "bg-orange-500",
    Média: "bg-amber-500", MEDIA: "bg-amber-500",
    Baixa: "bg-[color:var(--primary)]", BAIXA: "bg-[color:var(--primary)]",
  };
  return map[prioridade] ?? "bg-slate-400";
}

export function CreateTaskModalFull({
  projectId,
  projectName,
  initialStatus = "ABERTO",
  parentTicketId,
  onClose,
  onSaved,
}: CreateTaskModalFullProps) {
  const [activeTab, setActiveTab] = useState<Tab>("descricao");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [topics, setTopics] = useState<Array<{ id: string; code: string; title: string }>>([]);
  
  // Campos da aba Descrição
  const [title, setTitle] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState(parentTicketId || "");
  const [description, setDescription] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [prioridade, setPrioridade] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; content: string; createdAt: string; user: { id: string; name: string; email?: string } }>>([]);
  const [savingComment, setSavingComment] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  
  const { user: currentUser } = useAuth();
  const [estimativa, setEstimativa] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [horasApontadas, setHorasApontadas] = useState(0); // Será calculado das horas apontadas
  
  // Configurações do projeto
  const [obrigatoriosHoras, setObrigatoriosHoras] = useState(false);
  const [obrigatoriosDataEntrega, setObrigatoriosDataEntrega] = useState(false);
  const [tipoProjeto, setTipoProjeto] = useState("INTERNO");
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [estimativaError, setEstimativaError] = useState(false);
  const [dataEntregaError, setDataEntregaError] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  type StatusOption = { value: string; label: string };

  const [customStatusOptions, setCustomStatusOptions] = useState<StatusOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const load = async () => {
      if (!projectId) {
        if (!cancelled) setCustomStatusOptions([]);
        return;
      }
      try {
        const r = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/kanban-columns`, { signal: ac.signal });
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
      if (ce?.detail?.projectId === projectId) {
        void load();
      }
    };
    window.addEventListener("wps_kanban_columns_changed", onColumnsChanged as EventListener);
    return () => {
      cancelled = true;
      ac.abort();
      window.removeEventListener("wps_kanban_columns_changed", onColumnsChanged as EventListener);
    };
  }, [projectId]);

  const statusOptions = useMemo(() => {
    const base: StatusOption[] = [
      { value: "ABERTO", label: "Backlog" },
      { value: "EXECUCAO", label: "Em execução" },
      { value: "ENCERRADO", label: "Finalizadas" },
    ];
    const seen = new Set(base.map((o) => o.value));
    const customs = customStatusOptions.filter((o) => !seen.has(o.value));
    return [...base, ...customs];
  }, [customStatusOptions]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);
  const [showPrioridadeOpen, setShowPrioridadeOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers);
    
    // Buscar informações do projeto para verificar campos obrigatórios
    apiFetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((project) => {
        if (project) {
          setObrigatoriosHoras(project.obrigatoriosHoras || false);
          setObrigatoriosDataEntrega(project.obrigatoriosDataEntrega || false);
          setTipoProjeto(project.tipoProjeto || "INTERNO");
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
        
        // Se já houver um parentTicketId inicial e ele estiver na lista, usar como selecionado
        if (parentTicketId && topicos.some((t) => t.id === parentTicketId)) {
          setSelectedTopicId(parentTicketId);
        } else if (parentTicketId) {
          // Se parentTicketId foi passado mas não está na lista, ainda assim usar
          setSelectedTopicId(parentTicketId);
        }
      })
      .catch(() => {
        // Ignora erro silenciosamente
      });
  }, [projectId, parentTicketId]);

  const selectedUsers = users.filter((u) => responsibleIds.includes(u.id));
  const availableToAdd = users.filter((u) => !responsibleIds.includes(u.id));
  const prioridades = tipoProjeto === "AMS" ? PRIORIDADES_AMS : PRIORIDADES_DEFAULT;

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
    if (!currentTicketId) {
      throw new Error("Crie a tarefa primeiro antes de anexar imagens no comentário.");
    }

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
        ticketId: currentTicketId,
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
    return publicFileUrl(fileUrl);
  }

  function inferredMaxAttachmentBytes(): number {
    const base = String(API_BASE_URL || "").toLowerCase();
    // QA/dev costuma ter limites menores; o backend reforça o limite real.
    if (base.includes("qa") || base.includes("localhost") || base.includes("127.0.0.1")) return 10 * 1024 * 1024;
    return 30 * 1024 * 1024;
  }

  async function uploadTicketAttachment(ticketId: string, file: File): Promise<void> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
      reader.readAsDataURL(file);
    });

    const response = await apiFetch("/api/ticket-attachments", {
      method: "POST",
      body: JSON.stringify({
        ticketId,
        fileName: file.name,
        fileData: base64Data,
        fileType: file.type,
        fileSize: file.size,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string } | null)?.error || "Falha ao enviar anexo");
    }
  }

  async function uploadPendingAttachmentsFor(ticketId: string): Promise<void> {
    if (!pendingAttachments.length) return;
    setUploadingAttachments(true);
    try {
      for (const f of pendingAttachments) {
        await uploadTicketAttachment(ticketId, f);
      }
      setPendingAttachments([]);
    } finally {
      setUploadingAttachments(false);
    }
  }

  function onPickPendingAttachments(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const maxBytes = inferredMaxAttachmentBytes();
    const tooBig = list.find((f) => f.size > maxBytes);
    if (tooBig) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      setError(`Arquivo muito grande para anexar aqui. Tamanho máximo: ${mb}MB`);
      return;
    }
    setPendingAttachments((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const next = [...prev];
      for (const f of list) {
        const key = `${f.name}|${f.size}|${f.lastModified}`;
        if (!seen.has(key)) next.push(f);
      }
      return next;
    });
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

        // Converte qualquer URL absoluta com pathname /uploads/... -> "/uploads/..."
        try {
          const u = new URL(s);
          if (u.pathname.startsWith("/uploads/")) return `${u.pathname}${u.search}${u.hash}`;
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

        // Se for URL absoluta e o pathname for /uploads/..., força a origem pública (mesma dos PDFs do portal)
        try {
          const u = new URL(s);
          if (u.pathname.startsWith("/uploads/")) return `${base}${u.pathname}${u.search}${u.hash}`;
        } catch {
          // ignore
        }

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
    
    // Se ainda não há ticketId, não pode salvar comentário
    if (!currentTicketId) {
      setError("Crie a tarefa primeiro antes de adicionar comentários.");
      return;
    }
    
    setSavingComment(true);
    try {
      console.log("Enviando comentário:", { ticketId: currentTicketId, content: comment });
      const res = await apiFetch("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          ticketId: currentTicketId,
          content: stripApiBaseFromCommentHtml(comment),
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

  // Buscar comentários quando houver ticketId
  useEffect(() => {
    if (!currentTicketId) return;
    
    apiFetch(`/api/comments?ticketId=${currentTicketId}`)
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
  }, [currentTicketId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEstimativaError(false);
    setDataEntregaError(false);
    
    if (!title.trim()) {
      setError("O título é obrigatório.");
      return;
    }
    
    if (!selectedTopicId) {
      setError("Selecione um tópico para a tarefa.");
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
      // Converter estimativa (texto) para número de horas
      let estimativaNum: number | null = null;
      if (estimativa.trim()) {
        const parsed = parseFloat(
          estimativa.replace(/[^0-9,.\s]/g, "").replace(",", ".")
        );
        estimativaNum = isNaN(parsed) ? null : parsed;
      }

      const body: Record<string, unknown> = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        type: "Tarefa",
        criticidade: prioridade || undefined,
        status: status || initialStatus,
        parentTicketId: selectedTopicId || undefined,
        responsibleIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      };
      if (estimativaNum !== null) {
        body.estimativaHoras = estimativaNum;
      }
      if (dataEntrega) {
        body.dataFimPrevista = dataEntrega;
      }
      
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify(body),
      });
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao criar tarefa");
        return;
      }
      
      const ticketId = data.id;
      if (ticketId) {
        setCurrentTicketId(ticketId);
        if (pendingAttachments.length) {
          try {
            await uploadPendingAttachmentsFor(ticketId);
          } catch (e: unknown) {
            // A tarefa foi criada, mas algum anexo falhou.
            setActiveTab("anexos");
            setError(e instanceof Error ? e.message : "Falha ao enviar anexos.");
            onSaved();
            return;
          }
        }
        // Se houver comentário pendente, salvar agora
        if (hasTextContent(comment)) {
          try {
            const commentRes = await apiFetch("/api/comments", {
              method: "POST",
              body: JSON.stringify({
                ticketId,
                content: comment,
              }),
            });
            if (commentRes.ok) {
              const newComment = await commentRes.json();
              setComments([newComment]);
              setComment("");
            }
          } catch {
            // Ignora erro ao salvar comentário
          }
        }
      }
      
      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] transition";
  const labelClass = "block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5";

  const tabs: { id: Tab; label: string }[] = [
    { id: "descricao", label: "Descrição" },
    { id: "horas", label: "Horas" },
    { id: "historico", label: "Histórico" },
    { id: "anexos", label: "Anexos" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-[color:var(--surface)] rounded-3xl border border-[color:var(--border)] w-full max-w-5xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs fixos */}
        <div className="border-b border-[color:var(--border)] bg-[color:var(--surface)] rounded-t-3xl">
          <div className="flex items-start justify-between px-6 pt-5 pb-3 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-[11px] text-[color:var(--muted-foreground)]">
                {projectName && <span className="opacity-90">• {projectName}</span>}
              </div>
              <h2 className="text-lg md:text-xl font-semibold text-[color:var(--foreground)] truncate">
                {title || "Nova tarefa"}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${getStatusPillClass(status)}`}>
                  Status: {status || "ABERTO"}
                </span>
                {prioridade && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${getPrioridadePillClass(prioridade)}`}>
                    Prioridade: {prioridade}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-[color:var(--muted-foreground)] hover:opacity-90 hover:bg-black/5"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center border-t border-[color:var(--border)] px-3 sm:px-6 overflow-x-auto bg-[color:var(--background)]/25">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "text-[color:var(--primary)]"
                    : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[color:var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[color:var(--background)]">
          <div className="h-full overflow-y-auto px-4 sm:px-6 pb-6 pt-4">
            {activeTab === "descricao" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)] gap-6 xl:gap-8">
                  {/* Coluna Esquerda */}
                  <div className="space-y-5 bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-4 py-4 shadow-sm">
                    <div>
                      <label className={labelClass}>
                        Título <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                        placeholder="Ex: Implementar relatório de vendas"
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className={labelClass}>
                        Tópico <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={selectedTopicId}
                          onChange={(e) => setSelectedTopicId(e.target.value)}
                          className={inputClass + " appearance-none pr-9"}
                          required
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Data de início</label>
                        <input type="date" className={inputClass} />
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
                        />
                        {obrigatoriosDataEntrega && dataEntregaError && (
                          <p className="mt-1 text-xs text-red-600">
                            Data de entrega é obrigatória na criação da tarefa.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coluna Direita */}
                  <div className="space-y-5 bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-4 py-4 shadow-sm">
                    <div>
                      <label className={labelClass}>Membros</label>
                      <div className="flex flex-wrap items-center gap-2 mb-2 min-h-[44px]">
                        {selectedUsers.map((u) => (
                          <div key={u.id} className="relative -ml-1 first:ml-0 group">
                            <div className="flex items-center">
                              <Avatar
                                name={u.name}
                                email={u.email}
                                avatarUrl={u.avatarUrl ?? null}
                                avatarVersion={u.updatedAt}
                                size={32}
                                className="ring-2 ring-[color:var(--surface)] shadow-sm"
                                imgClassName="ring-2 ring-[color:var(--surface)] shadow-sm"
                                fallbackClassName="text-xs"
                              />
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
                            </div>
                            <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
                              <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-slate-800">
                                {u.name}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="relative" ref={userPickerRef}>
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
                          {showUserPicker && (
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
                            : "")
                        }
                        placeholder="Ex: 8h"
                      />
                      {obrigatoriosHoras && estimativaError && (
                        <p className="mt-1 text-xs text-red-600">
                          Número de horas é obrigatório na criação da tarefa.
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
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="relative">
                        <label className={labelClass}>Prioridade</label>
                        <button
                          type="button"
                          onClick={() => setShowPrioridadeOpen(!showPrioridadeOpen)}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-[color:var(--surface)] text-left text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] transition ${showPrioridadeOpen ? "shadow-sm" : ""}`}
                        >
                          {prioridade ? (
                            <>
                              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getPrioridadeDotClass(prioridade)}`} aria-hidden />
                              <span>{prioridades.find((p) => p.value === prioridade)?.label ?? prioridade}</span>
                            </>
                          ) : (
                            <span className="text-[color:var(--muted-foreground)]">Selecione...</span>
                          )}
                          <span className="ml-auto text-[color:var(--muted-foreground)] pointer-events-none">▼</span>
                        </button>
                        {showPrioridadeOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg py-1 max-h-56 overflow-y-auto">
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
                            {prioridades.map((p) => (
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
                        defaultValue="0"
                        className={inputClass}
                      />
                      <div className="mt-2 h-1.5 bg-black/10 rounded-full overflow-hidden">
                        <div className="h-full w-0" style={{ background: "var(--primary)" }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] px-4 py-4 shadow-sm">
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
                    className={inputClass + " min-h-[150px] resize-y"}
                    placeholder="Descreva os detalhes da tarefa..."
                    rows={8}
                    maxLength={1000}
                  />
                </div>

                {/* Seção de Comentários */}
                <div className="border-t border-[color:var(--border)] pt-6 mt-2">
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)] mb-4">Comentários</h3>
                  
                  {/* Lista de comentários */}
                  {comments.length > 0 ? (
                    <div className="mb-6 space-y-4">
                      {comments.map((c) => {
                        const isAuthor = currentUser?.id === c.user?.id;
                        const isAdmin = currentUser?.role === "SUPER_ADMIN";
                        const canEditOrDelete = isAuthor || isAdmin;
                        const isEditing = editingCommentId === c.id;
                        const isDeleting = deletingCommentId === c.id;

                        return (
                          <div key={c.id} className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-2xl p-4">
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
                              </div>
                              {canEditOrDelete && !isEditing && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditComment(c.id)}
                                    disabled={isDeleting || savingComment}
                                    className="p-1.5 rounded hover:bg-black/5 text-[color:var(--muted-foreground)] hover:text-[color:var(--primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Editar comentário"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(c.id)}
                                    disabled={isDeleting || savingComment}
                                    className="p-1.5 rounded hover:bg-black/5 text-[color:var(--muted-foreground)] hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    className="px-3 py-1.5 rounded-xl text-sm font-medium text-[color:var(--foreground)] hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEditComment}
                                    disabled={!hasTextContent(editingCommentContent) || savingComment}
                                    className="px-3 py-1.5 rounded-xl text-[color:var(--primary-foreground)] text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95"
                                    style={{ background: "var(--primary)" }}
                                  >
                                    {savingComment ? "Salvando..." : "Salvar"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="text-sm text-[color:var(--foreground)] prose prose-sm max-w-none [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
                                dangerouslySetInnerHTML={{ __html: sanitizeClientHtml(normalizeCommentHtmlForAssets(c.content)) }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mb-6 text-sm text-[color:var(--muted-foreground)] py-4 text-center border border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/25">
                      Não há comentários cadastrados para a tarefa.
                    </div>
                  )}

                  {/* Editor de novo comentário */}
                  <div>
                    <label className={labelClass}>Novo comentário</label>
                    <RichTextEditor
                      value={comment}
                      onChange={setComment}
                      placeholder="Escrever novo comentário..."
                      maxLength={5000}
                      onImageUpload={handleImageUpload}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveComment}
                        disabled={!hasTextContent(comment) || savingComment}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[color:var(--primary-foreground)] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-opacity hover:opacity-95"
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

            {activeTab === "horas" && (
              <div className="text-center py-12">
                <p className="text-[color:var(--muted-foreground)]">
                  Horas serão exibidas aqui após a criação da tarefa.
                </p>
              </div>
            )}

            {activeTab === "historico" && (
              <div className="text-center py-12">
                <p className="text-[color:var(--muted-foreground)]">
                  Histórico será exibido aqui após a criação da tarefa.
                </p>
              </div>
            )}

            {activeTab === "anexos" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[color:var(--foreground)]">Anexar arquivos</p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        Selecione arquivos agora; eles serão enviados automaticamente após salvar a tarefa.
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] hover:bg-black/5">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          onPickPendingAttachments(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      Selecionar arquivos
                    </label>
                  </div>
                </div>

                {pendingAttachments.length === 0 ? (
                  <div className="text-center py-10 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
                    <p className="text-sm text-[color:var(--muted-foreground)]">Nenhum anexo selecionado.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[color:var(--foreground)]">Arquivos selecionados</p>
                      <button
                        type="button"
                        disabled={saving || uploadingAttachments}
                        onClick={() => setPendingAttachments([])}
                        className="text-xs font-semibold text-red-600 disabled:opacity-50"
                      >
                        Limpar
                      </button>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {pendingAttachments.map((f) => (
                        <li
                          key={`${f.name}|${f.size}|${f.lastModified}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-[color:var(--foreground)]">{f.name}</p>
                            <p className="text-[11px] text-[color:var(--muted-foreground)]">
                              {(f.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={saving || uploadingAttachments}
                            onClick={() =>
                              setPendingAttachments((prev) =>
                                prev.filter((x) => `${x.name}|${x.size}|${x.lastModified}` !== `${f.name}|${f.size}|${f.lastModified}`),
                              )
                            }
                            className="rounded-lg border border-[color:var(--border)] bg-transparent p-2 text-[color:var(--muted-foreground)] hover:bg-black/5 disabled:opacity-50"
                            aria-label="Remover"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {uploadingAttachments && (
                  <p className="text-xs text-[color:var(--muted-foreground)]">Enviando anexos…</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600 pt-1">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[color:var(--border)] px-4 sm:px-6 py-4 flex justify-between items-center gap-3 bg-[color:var(--surface)] rounded-b-3xl">
          <div className="flex-1 text-xs text-[color:var(--muted-foreground)]">
            Preencha os campos obrigatórios para criar a tarefa.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 sm:px-5 py-2 rounded-xl border border-[color:var(--border)] bg-transparent text-[color:var(--foreground)] text-sm font-medium hover:bg-black/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 sm:px-6 py-2 rounded-xl text-[color:var(--primary-foreground)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-95"
              style={{ background: "var(--primary)" }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
