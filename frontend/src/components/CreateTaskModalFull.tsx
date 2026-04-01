"use client";

import { useState, useEffect } from "react";
import { X, Maximize2, Send, Pencil, Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { RichTextEditor } from "./RichTextEditor";

type UserOption = { id: string; name: string; email?: string };

type CreateTaskModalFullProps = {
  projectId: string;
  projectName?: string;
  initialStatus?: string;
  parentTicketId?: string;
  onClose: () => void;
  onSaved: () => void;
};

type Tab = "descricao" | "horas" | "historico" | "anexos";

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
  { value: "CRITICA", label: "Crítica", color: "bg-red-100 text-red-700 border-red-300" },
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
  if (!status) return "bg-slate-100 text-slate-700 border-slate-200";
  if (["EXECUCAO", "TESTE"].includes(status)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "ENCERRADO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

// Cor do pill de prioridade = mesma paleta
function getPrioridadePillClass(prioridade: string): string {
  if (!prioridade) return "bg-slate-100 text-slate-600 border-slate-200";
  const map: Record<string, string> = {
    Urgente: "bg-red-50 text-red-700 border-red-200", URGENTE: "bg-red-50 text-red-700 border-red-200",
    Crítica: "bg-red-50 text-red-700 border-red-200", CRITICA: "bg-red-50 text-red-700 border-red-200",
    Alta: "bg-orange-50 text-orange-700 border-orange-200", ALTA: "bg-orange-50 text-orange-700 border-orange-200",
    Média: "bg-amber-50 text-amber-700 border-amber-200", MEDIA: "bg-amber-50 text-amber-700 border-amber-200",
    Baixa: "bg-blue-50 text-blue-700 border-blue-200", BAIXA: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return map[prioridade] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

// Cor da bolinha de prioridade
function getPrioridadeDotClass(prioridade: string): string {
  if (!prioridade) return "bg-slate-400";
  const map: Record<string, string> = {
    Urgente: "bg-red-500", URGENTE: "bg-red-500",
    Crítica: "bg-red-500", CRITICA: "bg-red-500",
    Alta: "bg-orange-500", ALTA: "bg-orange-500",
    Média: "bg-amber-500", MEDIA: "bg-amber-500",
    Baixa: "bg-blue-500", BAIXA: "bg-blue-500",
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
  const [showUserPicker, setShowUserPicker] = useState(false);
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
      .then((tickets) => {
        const topicos = tickets
          .filter((t: any) => t.type === "SUBPROJETO")
          .map((t: any) => ({ id: t.id, code: t.code, title: t.title }));
        setTopics(topicos);
        
        // Se já houver um parentTicketId inicial e ele estiver na lista, usar como selecionado
        if (parentTicketId && topicos.some((t: any) => t.id === parentTicketId)) {
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

  async function handleImageUpload(file: File): Promise<string> {
    // Por enquanto, retorna uma URL de data URL
    // Em produção, você deve fazer upload para um servidor
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
          content: comment,
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
          content: editingCommentContent,
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
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";

  const tabs: { id: Tab; label: string }[] = [
    { id: "descricao", label: "Descrição" },
    { id: "horas", label: "Horas" },
    { id: "historico", label: "Histórico" },
    { id: "anexos", label: "Anexos" },
  ];

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-slate-200/70 w-full max-w-5xl shadow-[0_24px_80px_rgba(15,23,42,0.45)] h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs fixos */}
        <div className="border-b border-slate-100 bg-white rounded-t-3xl">
          <div className="flex items-start justify-between px-6 pt-5 pb-3 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
                {projectName && <span className="text-slate-400/90">• {projectName}</span>}
              </div>
              <h2 className="text-lg md:text-xl font-semibold text-slate-900 truncate">
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
                className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center border-t border-slate-100 px-3 sm:px-6 overflow-x-auto bg-slate-50/60">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-50">
          <div className="h-full overflow-y-auto px-4 sm:px-6 pb-6 pt-4">
            {activeTab === "descricao" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)] gap-6 xl:gap-8">
                  {/* Coluna Esquerda */}
                  <div className="space-y-5 bg-white rounded-xl border border-slate-100 px-4 py-4 shadow-sm">
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
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs">
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
                  <div className="space-y-5 bg-white rounded-xl border border-slate-100 px-4 py-4 shadow-sm">
                    <div>
                      <label className={labelClass}>Membros</label>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {selectedUsers.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center gap-1.5 rounded-full bg-slate-100 pl-1 pr-2 py-1 border border-slate-200"
                          >
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold"
                              title={u.name}
                            >
                              {getIniciais(u.name)}
                            </span>
                            <span className="text-sm text-slate-700 max-w-[100px] truncate">
                              {u.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeResponsible(u.id)}
                              className="ml-0.5 text-slate-400 hover:text-red-600 p-0.5"
                              aria-label="Remover"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowUserPicker(!showUserPicker)}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 text-sm font-medium transition-colors"
                            title="Adicionar membro"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar
                          </button>
                          {showUserPicker && (
                            <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 max-h-48 overflow-y-auto">
                              {availableToAdd.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-slate-500">
                                  Todos já adicionados
                                </p>
                              ) : (
                                availableToAdd.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => addResponsible(u.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                                      {getIniciais(u.name)}
                                    </span>
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
                          <option value="ABERTO">Backlog</option>
                          <option value="EXECUCAO">Em execução</option>
                          <option value="ENCERRADO">Finalizadas</option>
                        </select>
                      </div>

                      <div className="relative">
                        <label className={labelClass}>Prioridade</label>
                        <button
                          type="button"
                          onClick={() => setShowPrioridadeOpen(!showPrioridadeOpen)}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-left text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 ${showPrioridadeOpen ? "border-blue-400 ring-2 ring-blue-400" : "border-slate-200"}`}
                        >
                          {prioridade ? (
                            <>
                              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getPrioridadeDotClass(prioridade)}`} aria-hidden />
                              <span>{prioridades.find((p) => p.value === prioridade)?.label ?? prioridade}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">Selecione...</span>
                          )}
                          <span className="ml-auto text-slate-400 pointer-events-none">▼</span>
                        </button>
                        {showPrioridadeOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-slate-200 bg-white shadow-lg py-1 max-h-56 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setPrioridade("");
                                setShowPrioridadeOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50"
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
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm ${prioridade === p.value ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
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
                      <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 w-0" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-100 px-4 py-4 shadow-sm">
                  <label className={labelClass}>
                    Descrição{" "}
                    {description.length > 0 && (
                      <span className="text-xs text-slate-400 font-normal">
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
                <div className="border-t border-slate-200 pt-6 mt-2">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Comentários</h3>
                  
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
                          <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-700">{c.user?.name || "Usuário"}</span>
                                <span className="text-xs text-slate-400">
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
                                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Editar comentário"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(c.id)}
                                    disabled={isDeleting || savingComment}
                                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    disabled={savingComment}
                                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEditComment}
                                    disabled={!hasTextContent(editingCommentContent) || savingComment}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {savingComment ? "Salvando..." : "Salvar"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="text-sm text-slate-700 prose prose-sm max-w-none [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
                                dangerouslySetInnerHTML={{ __html: c.content }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mb-6 text-sm text-slate-500 py-4 text-center border border-slate-200 rounded-lg bg-slate-50">
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
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
                <p className="text-slate-500">
                  Horas serão exibidas aqui após a criação da tarefa.
                </p>
              </div>
            )}

            {activeTab === "historico" && (
              <div className="text-center py-12">
                <p className="text-slate-500">
                  Histórico será exibido aqui após a criação da tarefa.
                </p>
              </div>
            )}

            {activeTab === "anexos" && (
              <div className="text-center py-12">
                <p className="text-slate-500">
                  Anexos serão exibidos aqui após a criação da tarefa.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600 pt-1">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 sm:px-6 py-4 flex justify-between items-center gap-3 bg-white rounded-b-3xl">
          <div className="flex-1 text-xs text-slate-400">
            Preencha os campos obrigatórios para criar a tarefa.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 sm:px-5 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 sm:px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
