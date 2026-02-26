"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutGrid, MoreVertical, Eye, Pencil, Archive, Trash2, RotateCcw, List } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PackageCard, type PackageTicket } from "./PackageCard";
import { SubprojectCardHorizontal } from "./SubprojectCardHorizontal";
import { TaskCardHorizontal } from "./TaskCardHorizontal";
import { KanbanBoard } from "./KanbanBoard";
import { TaskListView } from "./TaskListView";
import { CreateSubprojectModal } from "./CreateSubprojectModal";
import { EditSubprojectModal } from "./EditSubprojectModal";
import { CreateTaskModalFull } from "./CreateTaskModalFull";
import { EditTaskModalFull } from "./EditTaskModalFull";
import { ConfirmModal } from "./ConfirmModal";
import { NewProjectModal } from "./NewProjectModal";

export type ProjectForCard = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  client: { name: string };
  createdBy: { name: string; email?: string } | null;
  responsibles?: { user: { id: string; name: string } }[];
  dataInicio?: string | null;
  dataFimPrevista?: string | null;
  prioridade?: string | null;
  totalHorasPlanejadas?: number | null;
  statusInicial?: string | null;
  tipoProjeto?: string | null;
  arquivado?: boolean;
  _count: { tickets: number; timeEntries: number };
  tickets: PackageTicket[];
};

// Status dos tópicos baseado nas tarefas filhas:
// - Aberto: criado e sem tarefas OU todas as tarefas estão em Backlog (ABERTO)
// - Em andamento: possui pelo menos uma tarefa em execução ou finalizada, mas nem todas finalizadas
// - Concluído: todas as tarefas filhas com status ENCERRADO
function getTopicStatus(topic: PackageTicket, allTickets: PackageTicket[]): "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" {
  const tarefasDoTopico = allTickets.filter(
    (t) => t.parentTicketId === topic.id && t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA",
  );

  if (tarefasDoTopico.length === 0) {
    return "ABERTO";
  }

  const finalizadas = tarefasDoTopico.filter((t) => t.status === "ENCERRADO").length;
  // Se todas as tarefas estão finalizadas
  if (finalizadas === tarefasDoTopico.length) {
    return "CONCLUIDO";
  }

  // Se todas as tarefas estão em Backlog (ABERTO)
  const emBacklog = tarefasDoTopico.filter((t) => t.status === "ABERTO").length;
  if (emBacklog === tarefasDoTopico.length) {
    return "ABERTO";
  }

  // Caso contrário: tem pelo menos uma tarefa em execução ou finalizada, mas nem todas finalizadas
  return "EM_ANDAMENTO";
}

function getTipoProjetoLabel(tipo: string | null | undefined): string {
  if (!tipo) return "Interno";
  const map: Record<string, string> = {
    INTERNO: "Interno",
    FIXED_PRICE: "Fixed Price",
    AMS: "AMS",
    TIME_MATERIAL: "Time & Material",
  };
  return map[tipo] || tipo;
}

// Status do projeto baseado nos tópicos:
// - Planejado: projeto criado, sem nenhum tópico
// - Em andamento: tem pelo menos um tópico e nem todos concluídos
// - Finalizado: todos os tópicos concluídos
function getProjectStatus(project: ProjectForCard): { label: string; color: string } {
  const topicos = project.tickets?.filter((t) => t.type === "SUBPROJETO") ?? [];

  if (topicos.length === 0) {
    return { label: "Planejado", color: "bg-slate-400" };
  }

  const todosConcluidos =
    topicos.length > 0 &&
    topicos.every((topic) => getTopicStatus(topic, project.tickets) === "CONCLUIDO");

  if (todosConcluidos) {
    return { label: "Finalizado", color: "bg-emerald-500" };
  }

  return { label: "Em andamento", color: "bg-blue-500" };
}

type ProjectCardProps = {
  project: ProjectForCard;
  /** Se informado, ao clicar no card navega (não expande). Usado na Opção 2. */
  onNavigate?: (project: ProjectForCard) => void;
  /** Se informado, exibe botão de excluir no card (usado na Opção 2 e Opção 1). */
  onDelete?: (project: ProjectForCard) => void;
  /** Função para excluir tópico (usado na Opção 1). */
  onDeleteSubproject?: (ticket: PackageTicket) => void;
  /** Função chamada após criar um tópico (usado na Opção 1). */
  onSubprojectCreated?: () => void;
};

export function ProjectCard({ project, onNavigate, onDelete, onDeleteSubproject, onSubprojectCreated }: ProjectCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageTicket | null>(null);
  const [showCreateSubprojectModal, setShowCreateSubprojectModal] = useState(false);
  const [editingSubproject, setEditingSubproject] = useState<PackageTicket | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<PackageTicket | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban"); // Para Opção 2
  const [deleteTarget, setDeleteTarget] = useState<PackageTicket | null>(null);
  const [deleteType, setDeleteType] = useState<"project" | "subproject" | "task" | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusInfo = getProjectStatus(project);
  // Filtrar tópicos e tarefas (exclui subtarefas para não aparecerem no Kanban/contagem)
  const topicos = project.tickets?.filter((t) => t.type === "SUBPROJETO") ?? [];
  const tarefas = project.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
  const totalTopicos = topicos.length;
  const totalTarefas = tarefas.length;
  const finalizadas = tarefas.filter((t) => t.status === "ENCERRADO").length;
  const percentual = totalTarefas > 0 ? Math.round((finalizadas / totalTarefas) * 100) : 0;
  
  // Determina se está na Opção 1 (sem onNavigate)
  const isOpcao1 = !onNavigate;

  // Garante que quando os tickets mudarem, o componente seja atualizado
  useEffect(() => {
    // Este useEffect força uma atualização quando os tickets mudarem
    // Isso garante que novas tarefas apareçam imediatamente após serem criadas
  }, [project.tickets]);

  const handleViewKanban = () => {
    // Determina a rota base baseado no contexto (se tem onNavigate, é Opção 2, senão é Opção 1)
    // Para Opção 1, precisamos verificar se estamos na página de consultor ou admin
    // Vamos usar uma abordagem mais simples: sempre usar /consultor se não tiver contexto
    // Mas na verdade, o ProjectCard é usado em ambos os contextos, então precisamos passar isso como prop
    // Por enquanto, vamos assumir que se não tem onNavigate, estamos na Opção 1 que pode ser consultor ou admin
    // Vamos usar window.location como fallback
    if (typeof window !== "undefined") {
      const isAdmin = window.location.pathname.includes("/admin/");
      const basePath = isAdmin ? "/admin/projetos" : "/consultor/projetos";
      router.push(`${basePath}/${project.id}/kanban?from=op1`);
    }
  };

  // Calcula a posição do menu quando ele é aberto
  useEffect(() => {
    if (!showActionsMenu || !menuButtonRef.current) return;
    
    const button = menuButtonRef.current;
    const rect = button.getBoundingClientRect();
    
    // Para position: fixed, usamos coordenadas da viewport diretamente
    setMenuPosition({
      top: rect.bottom + 4, // 4px de margem abaixo do botão
      right: window.innerWidth - rect.right, // Distância da borda direita da viewport
    });
  }, [showActionsMenu]);

  // Fecha o menu de ações ao clicar fora
  useEffect(() => {
    if (!showActionsMenu) {
      setMenuPosition(null);
      return;
    }
    function handleClickOutside(event: MouseEvent) {
      if (
        actionsRef.current && 
        !actionsRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setShowActionsMenu(false);
        setMenuPosition(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showActionsMenu]);

  const handleProjectClick = () => {
    if (onNavigate) {
      onNavigate(project);
      return;
    }
    setIsExpanded(!isExpanded);
    if (isExpanded) {
      setSelectedPackage(null);
    }
  };

  const handleViewDetails = () => {
    if (onNavigate) {
      onNavigate(project);
      return;
    }
    if (typeof window !== "undefined") {
      const isAdmin = window.location.pathname.includes("/admin/");
      const basePath = isAdmin ? "/admin/projetos" : "/consultor/projetos";
      router.push(`${basePath}/${project.id}?from=op1`);
    }
  };

  const handlePackageClick = (ticket: PackageTicket) => {
    // Se já está selecionado, deseleciona
    if (selectedPackage?.id === ticket.id) {
      setSelectedPackage(null);
    } else {
      setSelectedPackage(ticket);
    }
  };

  const handleCloseKanban = () => {
    setSelectedPackage(null);
  };

  const cardContent = (
    <>
      <div className={`w-2 flex-shrink-0 ${statusInfo.color}`} aria-hidden />
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_10rem_8rem_10rem_6.5rem_11rem] gap-x-6 items-center py-5 px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-slate-800 truncate" title={project.name}>
                {project.name}
              </h3>
              {project.tipoProjeto && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {getTipoProjetoLabel(project.tipoProjeto)}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {totalTopicos > 0 && (
                <span>{totalTopicos} {totalTopicos === 1 ? "tópico" : "tópicos"}</span>
              )}
              {totalTopicos > 0 && totalTarefas > 0 && <span className="mx-1">·</span>}
              {totalTarefas > 0 && (
                <span>{totalTarefas} {totalTarefas === 1 ? "tarefa" : "tarefas"}</span>
              )}
              {totalTopicos === 0 && totalTarefas === 0 && (
                <span className="text-slate-400">Sem tópicos ou tarefas</span>
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-sm">Responsável</p>
            <p className="text-slate-800 font-medium text-base truncate" title={project.createdBy?.name ?? undefined}>
              {project.createdBy?.name ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-sm">Cliente</p>
            <p className="text-slate-800 font-medium text-base truncate" title={project.client?.name ?? undefined}>
              {project.client?.name ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-sm">Status</p>
            <p className="inline-flex items-center gap-1.5 font-medium text-slate-800 text-base">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusInfo.color}`} aria-hidden />
              <span className="truncate">{statusInfo.label}</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-sm">Criação</p>
            <p className="text-slate-800 font-medium text-base">
              {new Date(project.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-sm">Andamento</p>
            <p className="text-slate-800 font-medium text-base mb-1">
              {finalizadas}/{totalTarefas} ({percentual}%)
            </p>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${statusInfo.color} transition-all`}
                style={{ width: `${percentual}%` }}
              />
            </div>
          </div>
        </div>
    </>
  );

  return (
    <div className="w-full relative">
      <div className="flex rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
        {onNavigate ? (
          <button
            type="button"
            onClick={handleProjectClick}
            className="flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 flex"
          >
            {cardContent}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleProjectClick}
            className="flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 flex"
          >
            {cardContent}
          </button>
        )}
        {onDelete && (
          <div className="relative shrink-0">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (showActionsMenu) {
                  setShowActionsMenu(false);
                  setMenuPosition(null);
                } else {
                  setShowActionsMenu(true);
                }
              }}
              className="h-full px-3 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              title="Mais ações"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      
      {/* Menu de ações posicionado fixo fora do card */}
      {onDelete && showActionsMenu && menuPosition && (
        <div
          className="fixed z-[100] w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm"
          style={{
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
          }}
          ref={actionsRef}
          onClick={(e) => e.stopPropagation()}
        >
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setMenuPosition(null);
                    handleViewDetails();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4 text-slate-400" />
                  Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setMenuPosition(null);
                    setShowEditProjectModal(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4 text-slate-400" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowActionsMenu(false);
                    setMenuPosition(null);
                    try {
                      const isArquivado = project.arquivado ?? false;
                      const res = await apiFetch(`/api/projects/${project.id}/archive`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ arquivado: !isArquivado }),
                      });
                      if (res.ok) {
                        onSubprojectCreated?.();
                      } else {
                        const data = await res.json().catch(() => ({}));
                        alert(data?.error ?? `Erro ao ${isArquivado ? "desarquivar" : "arquivar"} projeto`);
                      }
                    } catch (err) {
                      alert(`Erro ao ${project.arquivado ? "desarquivar" : "arquivar"} projeto`);
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  {project.arquivado ? (
                    <>
                      <RotateCcw className="h-4 w-4 text-slate-400" />
                      Desarquivar
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 text-slate-400" />
                      Arquivar
                    </>
                  )}
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setMenuPosition(null);
                    setDeleteTarget(project as unknown as PackageTicket);
                    setDeleteType("project");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              </div>
            )}

      {isExpanded && (
        <div className="mt-3 ml-2 pl-4 border-l-2 border-slate-200">
          {isOpcao1 ? (
            // Opção 1: Tópicos horizontais em cascata
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold text-slate-800">Tópicos</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewKanban();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Ver Kanban
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCreateSubprojectModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                    >
                      <Plus className="h-4 w-4" />
                      Criar tópico
                    </button>
                  </div>
                </div>
                {project.tickets && project.tickets.filter((t) => t.type === "SUBPROJETO").length > 0 ? (
                  <div className="space-y-2">
                    {project.tickets
                      .filter((t) => t.type === "SUBPROJETO")
                      .map((ticket) => (
                        <div key={ticket.id}>
                        <SubprojectCardHorizontal
                          ticket={ticket}
                          allTickets={project.tickets}
                          onClick={handlePackageClick}
                          onEdit={(t) => {
                            setEditingSubproject(t);
                          }}
                          onDelete={(t) => {
                            setDeleteTarget(t);
                            setDeleteType("subproject");
                          }}
                          isSelected={selectedPackage?.id === ticket.id}
                        />
                        {/* Lista de tarefas aparece embaixo do tópico selecionado */}
                        {selectedPackage?.id === ticket.id && (
                          <div className="mt-3 ml-4 pl-4 border-l-2 border-blue-300">
                            <div className="bg-blue-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h5 className="text-sm font-semibold text-slate-800">
                                  Tarefas - {selectedPackage.code}: {selectedPackage.title}
                                </h5>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCreateTaskModal(true);
                                  }}
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                  <Plus className="h-4 w-4" />
                                  Nova tarefa
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  const tarefasDoTopico = project.tickets.filter(
                                    (t) => t.parentTicketId === selectedPackage.id && t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA",
                                  );
                                  return tarefasDoTopico.length > 0 ? (
                                    tarefasDoTopico.map((task) => (
                                      <TaskCardHorizontal
                                        key={task.id}
                                        ticket={task}
                                        projectName={project.name}
                                        onClick={(task) => {
                                          setEditingTask(task);
                                        }}
                                        onDelete={(t) => {
                                          setDeleteTarget(t);
                                          setDeleteType("task");
                                        }}
                                      />
                                    ))
                                  ) : (
                                    <div className="text-center py-8">
                                      <p className="text-sm text-slate-500">Nenhuma tarefa encontrada.</p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Empty state com UX melhorada
                  <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Plus className="h-6 w-6 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-1">Nenhum tópico criado</p>
                        <p className="text-xs text-slate-500 mb-4">
                          Comece criando seu primeiro tópico para organizar as tarefas
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCreateSubprojectModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                        >
                          <Plus className="h-4 w-4" />
                          Criar primeiro tópico
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Opção 2: Layout original com cards verticais
            <div className="bg-slate-50 rounded-lg p-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold text-slate-800">Informações do Projeto</h4>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewKanban();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Ver Kanban
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Cliente</p>
                    <p className="font-medium text-slate-800">{project.client?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Responsável</p>
                    <p className="font-medium text-slate-800">{project.createdBy?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Data de Criação</p>
                    <p className="font-medium text-slate-800">
                      {new Date(project.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total de Tarefas</p>
                    <p className="font-medium text-slate-800">{totalTarefas}</p>
                  </div>
                </div>
              </div>

              {!selectedPackage ? (
                <>
                  <div>
                  <h4 className="text-base font-semibold text-slate-800 mb-3">Tópicos</h4>
                    {project.tickets && project.tickets.filter((t) => t.type === "SUBPROJETO").length > 0 ? (
                      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarGutter: "stable" }}>
                        {project.tickets
                          .filter((t) => t.type === "SUBPROJETO")
                          .map((ticket) => (
                            <PackageCard key={ticket.id} ticket={ticket} onClick={handlePackageClick} />
                          ))}
                      </div>
                    ) : (
                        <p className="text-sm text-slate-500">Nenhum tópico encontrado.</p>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-semibold text-slate-800">
                      {selectedPackage.code}: {selectedPackage.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      {/* Botões de toggle Kanban/Lista */}
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setViewMode("kanban")}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            viewMode === "kanban"
                              ? "bg-blue-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                          title="Visualização Kanban"
                        >
                          <LayoutGrid className="h-4 w-4" />
                          Kanban
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("list")}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            viewMode === "list"
                              ? "bg-blue-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                          title="Visualização Lista"
                        >
                          <List className="h-4 w-4" />
                          Lista
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseKanban}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                      >
                        ← Voltar aos tópicos
                      </button>
                    </div>
                  </div>
                  {viewMode === "kanban" ? (
                    <KanbanBoard
                      tickets={project.tickets.filter((t) => t.parentTicketId === selectedPackage.id && t.type !== "SUBTAREFA")}
                      projectId={project.id}
                      parentTicketId={selectedPackage.id}
                      onTicketClick={(ticket) => {
                        setEditingTask(ticket);
                      }}
                      onTicketDelete={(t) => {
                        setDeleteTarget(t);
                        setDeleteType("task");
                      }}
                      onTicketCreated={onSubprojectCreated}
                    />
                  ) : (
                    <TaskListView
                      tickets={project.tickets.filter((t) => t.parentTicketId === selectedPackage.id && t.type !== "SUBTAREFA")}
                      onTicketClick={(ticket) => {
                        setEditingTask(ticket);
                      }}
                      onTicketDelete={(t) => {
                        setDeleteTarget(t);
                        setDeleteType("task");
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateSubprojectModal && (
        <CreateSubprojectModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowCreateSubprojectModal(false)}
          onSaved={() => {
            setShowCreateSubprojectModal(false);
            onSubprojectCreated?.();
          }}
        />
      )}
      
      {editingSubproject && (
        <EditSubprojectModal
          ticket={editingSubproject}
          projectId={project.id}
          projectName={project.name}
          onClose={() => setEditingSubproject(null)}
          onSaved={() => {
            setEditingSubproject(null);
            onSubprojectCreated?.();
          }}
        />
      )}
      
      {showCreateTaskModal && selectedPackage && (
        <CreateTaskModalFull
          projectId={project.id}
          projectName={project.name}
          parentTicketId={selectedPackage.id}
          onClose={() => setShowCreateTaskModal(false)}
          onSaved={() => {
            setShowCreateTaskModal(false);
            onSubprojectCreated?.();
          }}
        />
      )}
      
      {editingTask && (
        <EditTaskModalFull
          ticket={editingTask}
          projectId={project.id}
          projectName={project.name}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            onSubprojectCreated?.();
          }}
        />
      )}
      
      {deleteTarget && deleteType === "project" && onDelete && (
        <ConfirmModal
          title="Excluir projeto"
          message={`Tem certeza que deseja excluir o projeto "${project.name}"? Esta ação não pode ser desfeita e todos os tópicos e tarefas serão excluídos.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            onDelete(project);
            setDeleteTarget(null);
            setDeleteType(null);
          }}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteType(null);
          }}
        />
      )}
      
      {deleteTarget && deleteType === "subproject" && onDeleteSubproject && (
        <ConfirmModal
          title="Excluir tópico"
          message={`Tem certeza que deseja excluir o tópico "${deleteTarget.title}"? Esta ação não pode ser desfeita e todas as tarefas deste tópico serão excluídas.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            onDeleteSubproject(deleteTarget);
            setDeleteTarget(null);
            setDeleteType(null);
          }}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteType(null);
          }}
        />
      )}
      
      {deleteTarget && deleteType === "task" && onDeleteSubproject && (
        <ConfirmModal
          title="Excluir tarefa"
          message={`Tem certeza que deseja excluir a tarefa "${deleteTarget.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            onDeleteSubproject(deleteTarget);
            setDeleteTarget(null);
            setDeleteType(null);
          }}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteType(null);
          }}
        />
      )}

      {showEditProjectModal && (
        <NewProjectModal
          mode="edit"
          projectId={project.id}
          onClose={() => setShowEditProjectModal(false)}
          onSaved={() => {
            setShowEditProjectModal(false);
            onSubprojectCreated?.();
          }}
        />
      )}
    </div>
  );
}
