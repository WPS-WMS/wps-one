"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { X, Users, Calendar, FileText, Settings, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  FormModalSection,
  formModalBackdropClass,
  formModalInputClass,
  formModalLabelClass,
  formModalPanelWideClass,
} from "@/components/FormModalPrimitives";

export type UserOption = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};
export type ClientOption = { id: string; name: string };

type NewProjectModalProps = {
  onClose: () => void;
  onSaved: () => void;
  mode?: "create" | "edit";
  projectId?: string;
};

const PRIORIDADE_OPCOES = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
  { value: "URGENTE", label: "Urgente" },
];

const STATUS_PROJETO_OPCOES = [
  { value: "ATIVO", label: "Ativo" },
  { value: "EM_ESPERA", label: "Em espera" },
  { value: "ENCERRADO", label: "Encerrado" },
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

type ProjectForEdit = {
  id: string;
  name: string;
  clientId: string;
  description?: string | null;
  dataInicio?: string | null;
  dataFimPrevista?: string | null;
  prioridade?: string | null;
  totalHorasPlanejadas?: number | null;
  statusInicial?: string | null;
  obrigatoriosHoras?: boolean | null;
  obrigatoriosDataEntrega?: boolean | null;
  tipoProjeto?: "INTERNO" | "FIXED_PRICE" | "AMS" | "TIME_MATERIAL" | null;
  // Fixed Price
  valorContrato?: number | null;
  escopoInicial?: string | null;
  limiteHorasEscopo?: number | null;
  // AMS
  horasMensaisAMS?: number | null;
  bancoHorasInicial?: number | null;
  slaAMS?: number | null;
  slaRespostaBaixa?: number | null;
  slaSolucaoBaixa?: number | null;
  slaRespostaMedia?: number | null;
  slaSolucaoMedia?: number | null;
  slaRespostaAlta?: number | null;
  slaSolucaoAlta?: number | null;
  slaRespostaCritica?: number | null;
  slaSolucaoCritica?: number | null;
  // Anexo
  anexoNomeArquivo?: string | null;
  anexoUrl?: string | null;
  anexoTipo?: string | null;
  anexoTamanho?: number | null;
  responsibles?: Array<{ user: { id: string } }>;
};

function formatDateForInput(value?: string | null): string {
  if (!value) return "";
  // Tratar como data "pura" (YYYY-MM-DD), ignorando fuso horário/local
  // Ex.: "2026-03-02T00:00:00.000Z" -> "2026-03-02"
  const iso = String(value);
  const datePart = iso.slice(0, 10);
  // Validação simples de formato
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
}

export function NewProjectModal({ onClose, onSaved, mode = "create", projectId }: NewProjectModalProps) {
  const isEdit = mode === "edit" && !!projectId;
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [description, setDescription] = useState("");
  const [dataFimPrevista, setDataFimPrevista] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [statusInicial, setStatusInicial] = useState<"ATIVO" | "EM_ESPERA" | "ENCERRADO">("ATIVO");
  const [totalHorasPlanejadas, setTotalHorasPlanejadas] = useState("");
  const [obrigatoriosHoras, setObrigatoriosHoras] = useState(false);
  const [obrigatoriosDataEntrega, setObrigatoriosDataEntrega] = useState(false);
  const [tipoProjeto, setTipoProjeto] =
    useState<"INTERNO" | "FIXED_PRICE" | "AMS" | "TIME_MATERIAL">("INTERNO");
  // Fixed Price
  const [valorContrato, setValorContrato] = useState("");
  const [escopoInicial, setEscopoInicial] = useState("");
  const [limiteHorasEscopo, setLimiteHorasEscopo] = useState("");
  // AMS
  const [horasMensaisAMS, setHorasMensaisAMS] = useState("");
  const [bancoHorasInicial, setBancoHorasInicial] = useState("");
  const [slaRespostaBaixa, setSlaRespostaBaixa] = useState("");
  const [slaSolucaoBaixa, setSlaSolucaoBaixa] = useState("");
  const [slaRespostaMedia, setSlaRespostaMedia] = useState("");
  const [slaSolucaoMedia, setSlaSolucaoMedia] = useState("");
  const [slaRespostaAlta, setSlaRespostaAlta] = useState("");
  const [slaSolucaoAlta, setSlaSolucaoAlta] = useState("");
  const [slaRespostaCritica, setSlaRespostaCritica] = useState("");
  const [slaSolucaoCritica, setSlaSolucaoCritica] = useState("");
  // Anexo
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);
  const [anexoNomeArquivo, setAnexoNomeArquivo] = useState("");
  const [anexoUrl, setAnexoUrl] = useState("");
  const [anexoTipo, setAnexoTipo] = useState("");
  const [anexoTamanho, setAnexoTamanho] = useState(0);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [anexoRemoved, setAnexoRemoved] = useState(false);
  const attachmentUrl = anexoUrl ? `${API_BASE_URL}${anexoUrl}` : "";

  useEffect(() => {
    apiFetch("/api/clients/for-project-select")
      .then((r) => (r.ok ? r.json() : []))
      .then(setClients);
    apiFetch("/api/users/for-project-select")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers);
  }, []);

  useEffect(() => {
    if (!isEdit || !projectId) return;
    setLoadingProject(true);
    setError("");
    apiFetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error ?? "Erro ao carregar projeto");
        }
        return r.json();
      })
      .then((p: ProjectForEdit) => {
        setName(p.name ?? "");
        setClientId(p.clientId ?? "");
        setResponsibleIds((p.responsibles ?? []).map((x) => x.user.id));
        setDataInicio(formatDateForInput(p.dataInicio));
        setDescription(p.description ?? "");
        setDataFimPrevista(formatDateForInput(p.dataFimPrevista));
        // Compatibilidade: projetos antigos podem ter "CRITICA"; no UI usamos "URGENTE"
        setPrioridade(p.prioridade === "CRITICA" ? "URGENTE" : (p.prioridade ?? ""));
        // Status do projeto: legado -> novo
        const rawStatus = String(p.statusInicial ?? "").toUpperCase();
        const nextStatus =
          rawStatus === "ATIVO" || rawStatus === "EM_ESPERA" || rawStatus === "ENCERRADO"
            ? (rawStatus as any)
            : rawStatus === "EM_ANDAMENTO"
              ? "ATIVO"
              : rawStatus === "PLANEJADO"
                ? "EM_ESPERA"
                : rawStatus === "CONCLUIDO"
                  ? "ENCERRADO"
                  : "ATIVO";
        setStatusInicial(nextStatus);
        setTotalHorasPlanejadas(p.totalHorasPlanejadas != null ? String(p.totalHorasPlanejadas) : "");
        setObrigatoriosHoras(!!p.obrigatoriosHoras);
        setObrigatoriosDataEntrega(!!p.obrigatoriosDataEntrega);
        setTipoProjeto((p.tipoProjeto ?? "INTERNO") as typeof tipoProjeto);

        // Fixed Price
        setValorContrato(p.valorContrato != null ? String(p.valorContrato) : "");
        setEscopoInicial(p.escopoInicial ?? "");
        setLimiteHorasEscopo(
          p.limiteHorasEscopo != null ? String(p.limiteHorasEscopo) : "",
        );

        // AMS
        setHorasMensaisAMS(p.horasMensaisAMS != null ? String(p.horasMensaisAMS) : "");
        setBancoHorasInicial(p.bancoHorasInicial != null ? String(p.bancoHorasInicial) : "");
        setSlaRespostaBaixa(p.slaRespostaBaixa != null ? String(p.slaRespostaBaixa) : "");
        setSlaSolucaoBaixa(p.slaSolucaoBaixa != null ? String(p.slaSolucaoBaixa) : "");
        setSlaRespostaMedia(p.slaRespostaMedia != null ? String(p.slaRespostaMedia) : "");
        setSlaSolucaoMedia(p.slaSolucaoMedia != null ? String(p.slaSolucaoMedia) : "");
        setSlaRespostaAlta(p.slaRespostaAlta != null ? String(p.slaRespostaAlta) : "");
        setSlaSolucaoAlta(p.slaSolucaoAlta != null ? String(p.slaSolucaoAlta) : "");
        setSlaRespostaCritica(p.slaRespostaCritica != null ? String(p.slaRespostaCritica) : "");
        setSlaSolucaoCritica(p.slaSolucaoCritica != null ? String(p.slaSolucaoCritica) : "");

        // Anexo (arquivo existente)
        setAnexoArquivo(null);
        setAnexoRemoved(false);
        setAnexoNomeArquivo(p.anexoNomeArquivo ?? "");
        setAnexoUrl(p.anexoUrl ?? "");
        setAnexoTipo(p.anexoTipo ?? "");
        setAnexoTamanho(p.anexoTamanho ?? 0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      })
      .catch((err) => setError(err?.message ?? "Erro ao carregar projeto"))
      .finally(() => setLoadingProject(false));
  }, [isEdit, projectId]);

  const selectedUsers = users.filter((u) => responsibleIds.includes(u.id));
  const availableToAdd = users.filter((u) => !responsibleIds.includes(u.id));

  function addResponsible(userId: string) {
    if (!responsibleIds.includes(userId)) {
      setResponsibleIds((ids) => [...ids, userId]);
      if (fieldErrors.responsibleIds) {
        setFieldErrors((prev) => ({ ...prev, responsibleIds: false }));
      }
    }
    setShowUserPicker(false);
  }
  function removeResponsible(userId: string) {
    setResponsibleIds((ids) => {
      const newIds = ids.filter((id) => id !== userId);
      // Se ainda há responsáveis após remover, limpar o erro
      if (newIds.length > 0 && fieldErrors.responsibleIds) {
        setFieldErrors((prev) => ({ ...prev, responsibleIds: false }));
      }
      return newIds;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExtensions = [".pdf", ".docx"];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

    if (!allowedExtensions.includes(fileExtension)) {
      setError("Apenas arquivos PDF e DOCX são permitidos.");
      e.target.value = "";
      return;
    }

    // Validar tamanho (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError("O arquivo deve ter no máximo 10MB.");
      e.target.value = "";
      return;
    }

    setAnexoArquivo(file);
    setAnexoNomeArquivo(file.name);
    setAnexoTipo(file.type);
    setAnexoTamanho(file.size);
    setAnexoRemoved(false);
    setError("");
  }

  async function uploadAnexo(): Promise<{ fileName: string; fileUrl: string; fileType: string; fileSize: number } | null> {
    if (!anexoArquivo) return null;

    setUploadingAnexo(true);
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(anexoArquivo);
      });

      const fileData = await base64Promise;

      // Fazer upload
      const res = await apiFetch("/api/uploads/project-attachment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: anexoNomeArquivo,
          fileData: fileData,
          fileType: anexoTipo,
          fileSize: anexoTamanho,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao fazer upload do arquivo");
      }

      const data = await res.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer upload do arquivo");
      return null;
    } finally {
      setUploadingAnexo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    const errors: Record<string, boolean> = {};
    const missingFields: string[] = [];
    
    if (!name.trim()) {
      errors.name = true;
      missingFields.push("Nome do projeto");
    }
    if (!clientId) {
      errors.clientId = true;
      missingFields.push("Cliente");
    }
    if (responsibleIds.length === 0) {
      errors.responsibleIds = true;
      missingFields.push("Membros");
    }
    if (!dataInicio) {
      errors.dataInicio = true;
      missingFields.push("Data de início");
    }
    if (Object.keys(errors).length > 0) {
      const errorMessage = `Por favor, preencha os seguintes campos obrigatórios: ${missingFields.join(", ")}.`;
      // Atualizar estados - criar novo objeto para garantir re-render
      const newFieldErrors = { ...errors };
      setFieldErrors(newFieldErrors);
      setError(errorMessage);
      // Forçar re-render e scroll
      setTimeout(() => {
        const scrollContainer = document.querySelector('.overflow-y-auto');
        if (scrollContainer) {
          scrollContainer.scrollTop = 0;
        }
      }, 10);
      return;
    }
    
    // Limpar erros se passou na validação
    setError("");
    setFieldErrors({});
    setSaving(true);
    try {
      // Fazer upload do anexo se houver
      let anexoInfo = null;
      if (anexoArquivo) {
        anexoInfo = await uploadAnexo();
        if (!anexoInfo) {
          setSaving(false);
          return; // Erro já foi setado em uploadAnexo
        }
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        clientId,
        responsibleIds,
        // Enviar datas como YYYY-MM-DD; o backend converte para Date
        dataInicio,
        description: tipoProjeto === "FIXED_PRICE" ? undefined : description.trim() || undefined,
        dataFimPrevista: dataFimPrevista || undefined,
        prioridade: tipoProjeto === "AMS" ? undefined : prioridade || undefined,
        statusInicial,
        totalHorasPlanejadas:
          tipoProjeto === "AMS"
            ? undefined
            : totalHorasPlanejadas
              ? Number(totalHorasPlanejadas)
              : undefined,
        obrigatoriosHoras,
        obrigatoriosDataEntrega,
        tipoProjeto,
        // Fixed Price
        valorContrato:
          tipoProjeto === "FIXED_PRICE" && valorContrato
            ? Number(valorContrato)
            : undefined,
        escopoInicial:
          tipoProjeto === "FIXED_PRICE" && escopoInicial
            ? escopoInicial.trim()
            : undefined,
        limiteHorasEscopo:
          tipoProjeto === "FIXED_PRICE" && limiteHorasEscopo
            ? Number(limiteHorasEscopo)
            : undefined,
        // AMS
        horasMensaisAMS: tipoProjeto === "AMS" && horasMensaisAMS ? Number(horasMensaisAMS) : undefined,
        bancoHorasInicial: tipoProjeto === "AMS" && bancoHorasInicial ? Number(bancoHorasInicial) : undefined,
        slaRespostaBaixa: tipoProjeto === "AMS" && slaRespostaBaixa ? Number(slaRespostaBaixa) : undefined,
        slaSolucaoBaixa: tipoProjeto === "AMS" && slaSolucaoBaixa ? Number(slaSolucaoBaixa) : undefined,
        slaRespostaMedia: tipoProjeto === "AMS" && slaRespostaMedia ? Number(slaRespostaMedia) : undefined,
        slaSolucaoMedia: tipoProjeto === "AMS" && slaSolucaoMedia ? Number(slaSolucaoMedia) : undefined,
        slaRespostaAlta: tipoProjeto === "AMS" && slaRespostaAlta ? Number(slaRespostaAlta) : undefined,
        slaSolucaoAlta: tipoProjeto === "AMS" && slaSolucaoAlta ? Number(slaSolucaoAlta) : undefined,
        slaRespostaCritica: tipoProjeto === "AMS" && slaRespostaCritica ? Number(slaRespostaCritica) : undefined,
        slaSolucaoCritica: tipoProjeto === "AMS" && slaSolucaoCritica ? Number(slaSolucaoCritica) : undefined,
      };

      // Anexo
      if (anexoInfo) {
        body.anexoNomeArquivo = anexoInfo.fileName;
        body.anexoUrl = anexoInfo.fileUrl;
        body.anexoTipo = anexoInfo.fileType;
        body.anexoTamanho = anexoInfo.fileSize;
      } else if (isEdit && anexoRemoved) {
        body.anexoNomeArquivo = null;
        body.anexoUrl = null;
        body.anexoTipo = null;
        body.anexoTamanho = null;
      }

      const res = await apiFetch(isEdit ? `/api/projects/${projectId}` : "/api/projects", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEdit ? "Erro ao salvar projeto" : "Erro ao criar projeto"));
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const panelClass =
    formModalPanelWideClass.replace("max-w-3xl", "max-w-4xl") +
    " shadow-2xl";
  const sectionHintClass = "text-[11px] leading-relaxed text-[color:var(--muted-foreground)]";
  const requiredMark = <span className="text-red-500">*</span>;

  return (
    <div
      className={formModalBackdropClass + " animate-in fade-in duration-200"}
      onClick={onClose}
    >
      <div
        className={panelClass + " animate-in zoom-in-95 duration-200"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (sticky) */}
        <div
          className="sticky top-0 z-10 px-6 md:px-8 pt-5 pb-4 border-b bg-[color:var(--surface)]/92 backdrop-blur-xl"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm"
                  style={{
                    borderColor: "rgba(92, 0, 225, 0.35)",
                    background: "linear-gradient(135deg, rgba(92, 0, 225, 0.18), rgba(87, 66, 118, 0.18))",
                    boxShadow: "0 12px 26px rgba(92, 0, 225, 0.10)",
                  }}
                >
                  <FileText className="h-5 w-5" style={{ color: "var(--primary)" }} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[color:var(--foreground)]">
                    {isEdit ? "Editar projeto" : "Novo projeto"}
                  </h2>
                  <p className="text-xs md:text-sm text-[color:var(--muted-foreground)]">
                    Campos com {requiredMark} são obrigatórios.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border transition hover:opacity-90"
              style={{
                borderColor: "var(--border)",
                background: "rgba(0,0,0,0.06)",
                color: "var(--muted-foreground)",
              }}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col bg-[color:var(--background)]">
            {loadingProject && (
              <div className="px-6 md:px-8 pt-4">
                <div
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: "var(--border)",
                    background: "rgba(0,0,0,0.04)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Carregando informações do projeto...
                </div>
              </div>
            )}
            {error && (
            <div className="px-6 md:px-8 pt-4">
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.10)",
                  color: "var(--foreground)",
                }}
              >
                <span className="font-semibold">Atenção:</span>{" "}
                <span className="text-[color:var(--muted-foreground)]">{error}</span>
              </div>
            </div>
          )}
          <div className="px-6 md:px-8 py-6 space-y-6 flex-1 overflow-y-auto">
          <FormModalSection title="Informações principais">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-6">
              <div className="space-y-4">
                <div>
                  <label className={formModalLabelClass}>
                    Nome do projeto {requiredMark}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) {
                        setFieldErrors((prev) => ({ ...prev, name: false }));
                      }
                    }}
                    className={formModalInputClass(!!fieldErrors.name)}
                    placeholder="Ex: Implementação SAP"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>
                    Cliente {requiredMark}
                  </label>
                  <div className="relative">
                    <select
                      value={clientId}
                      onChange={(e) => {
                        setClientId(e.target.value);
                        if (fieldErrors.clientId) {
                          setFieldErrors((prev) => ({ ...prev, clientId: false }));
                        }
                      }}
                      className={formModalInputClass(!!fieldErrors.clientId) + " appearance-none pr-10 cursor-pointer"}
                    >
                      <option value="">Selecione o cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={`space-y-3 rounded-xl border px-4 py-4 transition-colors ${
                  !!fieldErrors.responsibleIds ? "" : ""
                }`}
                style={{
                  borderColor: fieldErrors.responsibleIds ? "rgba(239,68,68,0.45)" : "var(--border)",
                  background: fieldErrors.responsibleIds ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.03)",
                }}
              >
                <label className={formModalLabelClass}>
                  <Users className="inline h-4 w-4 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                  Membros {requiredMark}
                </label>
                <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
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
                        <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
                          {u.name}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowUserPicker(!showUserPicker)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:opacity-95"
                      style={{
                        borderColor: "rgba(92,0,225,0.35)",
                        color: "var(--foreground)",
                        background: "rgba(0,0,0,0.02)",
                      }}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Adicionar
                    </button>
                    {showUserPicker && (
                      <div
                        className="absolute left-0 top-full mt-2 z-30 w-72 rounded-xl border shadow-xl py-2 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 bg-[color:var(--surface)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {availableToAdd.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-[color:var(--muted-foreground)] text-center">
                            Todos os usuários já foram adicionados
                          </p>
                        ) : (
                          availableToAdd.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => addResponsible(u.id)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                              style={{ color: "var(--foreground)" }}
                            >
                              <Avatar
                                name={u.name}
                                email={u.email}
                                avatarUrl={u.avatarUrl ?? null}
                                avatarVersion={u.updatedAt}
                                size={32}
                                className="shadow-sm"
                                imgClassName="shadow-sm"
                                fallbackClassName="text-xs"
                              />
                              <span className="flex-1">{u.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className={sectionHintClass}>
                  Selecione ao menos um membro do projeto.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={formModalLabelClass}>
                  <Calendar className="inline h-3.5 w-3.5 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                  Data de início {requiredMark}
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.target.value);
                    if (fieldErrors.dataInicio) {
                      setFieldErrors((prev) => ({ ...prev, dataInicio: false }));
                    }
                  }}
                  className={formModalInputClass(!!fieldErrors.dataInicio)}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>
                  <Calendar className="inline h-3.5 w-3.5 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                  Data prevista de término
                </label>
                <input
                  type="date"
                  value={dataFimPrevista}
                  onChange={(e) => setDataFimPrevista(e.target.value)}
                  className={formModalInputClass(false)}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>
                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                  Status do projeto
                </label>
                <div className="relative">
                  <select
                    value={statusInicial}
                    onChange={(e) => setStatusInicial(e.target.value as any)}
                    className={formModalInputClass(false) + " appearance-none pr-10 cursor-pointer"}
                  >
                    {STATUS_PROJETO_OPCOES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </div>
                <p className={sectionHintClass}>Apenas “Ativo” permite apontamento de horas.</p>
              </div>
            </div>
          </FormModalSection>

          {/* Tipo de Projeto */}
          <FormModalSection
            title="Tipo de projeto"
            description="Escolha o tipo para exibir os campos específicos (as regras e o envio continuam iguais)."
          >
            <div>
              <label className={formModalLabelClass}>
                <Settings className="inline h-3.5 w-3.5 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                Tipo {requiredMark}
              </label>
              <div className="relative">
                <select
                  value={tipoProjeto}
                  onChange={(e) => {
                    const novo = e.target.value as typeof tipoProjeto;
                    setTipoProjeto(novo);
                    if (novo === "AMS") {
                      setPrioridade("");
                      setTotalHorasPlanejadas("");
                    }
                    if (novo === "FIXED_PRICE") {
                      setTotalHorasPlanejadas("");
                      setDescription("");
                    }
                    // Limpar campos específicos ao mudar tipo
                    setValorContrato("");
                    setEscopoInicial("");
                    setLimiteHorasEscopo("");
                    setHorasMensaisAMS("");
                    setBancoHorasInicial("");
                    setSlaRespostaBaixa("");
                    setSlaSolucaoBaixa("");
                    setSlaRespostaMedia("");
                    setSlaSolucaoMedia("");
                    setSlaRespostaAlta("");
                    setSlaSolucaoAlta("");
                    setSlaRespostaCritica("");
                    setSlaSolucaoCritica("");
                  }}
                  className={formModalInputClass(false) + " appearance-none pr-10 cursor-pointer font-medium"}
                >
                  <option value="INTERNO">Projetos Internos (ADM, RH, Gestão Executiva, Estágio)</option>
                  <option value="FIXED_PRICE">Projeto Fechado (Fixed Price)</option>
                  <option value="AMS">AMS (Application Management Services)</option>
                  <option value="TIME_MATERIAL">Time & Material (T&M)</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Configurações Fixed Price */}
            {tipoProjeto === "FIXED_PRICE" && (
              <div
                className="space-y-5 rounded-xl border p-5"
                style={{ borderColor: "rgba(92,0,225,0.22)", background: "rgba(92,0,225,0.06)" }}
              >
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Configurações Fixed Price</p>
                <div>
                  <label className={formModalLabelClass}>Limite de horas do escopo</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={limiteHorasEscopo}
                    onChange={(e) => setLimiteHorasEscopo(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex: 200"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Prioridade</label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className={formModalInputClass(false)}
                  >
                    <option value="">Selecione</option>
                    {PRIORIDADE_OPCOES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={formModalLabelClass}>Total de horas planejadas</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={totalHorasPlanejadas}
                    onChange={(e) => setTotalHorasPlanejadas(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex: 120"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Escopo inicial</label>
                  <textarea
                    value={escopoInicial}
                    onChange={(e) => setEscopoInicial(e.target.value.slice(0, 800))}
                    className={formModalInputClass(false) + " min-h-[80px] resize-y"}
                    maxLength={800}
                    rows={3}
                    placeholder="Descreva o escopo detalhado do projeto..."
                  />
                </div>
              </div>
            )}

            {/* Configurações AMS */}
            {tipoProjeto === "AMS" && (
              <div
                className="space-y-5 rounded-xl border p-5"
                style={{ borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)" }}
              >
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Configurações AMS</p>
                <div className="rounded-lg p-4 border" style={{ borderColor: "rgba(16,185,129,0.25)", background: "rgba(0,0,0,0.03)" }}>
                  <p className="text-xs text-[color:var(--muted-foreground)] leading-relaxed">
                    <span className="font-semibold">Como funciona:</span> O AMS possui horas mínimas contratadas por mês. 
                    Horas não utilizadas acumulam no banco de horas. Se o cliente utilizar mais horas que o contratado, 
                    serão descontadas do banco de horas acumulado.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={formModalLabelClass}>Horas mínimas contratadas por mês</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={horasMensaisAMS}
                      onChange={(e) => setHorasMensaisAMS(e.target.value)}
                      className={formModalInputClass(false)}
                      placeholder="Ex: 40"
                    />
                    <p className={sectionHintClass}>Horas que o cliente deve contratar mensalmente.</p>
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Banco de horas inicial</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={bancoHorasInicial}
                      onChange={(e) => setBancoHorasInicial(e.target.value)}
                      className={formModalInputClass(false)}
                      placeholder="Ex: 0"
                    />
                    <p className={sectionHintClass}>Horas iniciais no banco (opcional).</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[color:var(--foreground)]">SLA por prioridade (opcional)</p>
                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-[color:var(--muted-foreground)]">
                    <span>Prioridade</span>
                    <span>Tempo de resposta (h)</span>
                    <span>Tempo de solução (h)</span>
                  </div>
                  {[
                    { label: "Baixa", r: slaRespostaBaixa, s: slaSolucaoBaixa, setR: setSlaRespostaBaixa, setS: setSlaSolucaoBaixa },
                    { label: "Média", r: slaRespostaMedia, s: slaSolucaoMedia, setR: setSlaRespostaMedia, setS: setSlaSolucaoMedia },
                    { label: "Alta", r: slaRespostaAlta, s: slaSolucaoAlta, setR: setSlaRespostaAlta, setS: setSlaSolucaoAlta },
                    { label: "Urgente", r: slaRespostaCritica, s: slaSolucaoCritica, setR: setSlaRespostaCritica, setS: setSlaSolucaoCritica },
                  ].map((row) => (
                    <div key={row.label} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-sm text-[color:var(--foreground)]">{row.label}</span>
                      <input
                        type="number"
                        min={0}
                        value={row.r}
                        onChange={(e) => row.setR(e.target.value)}
                        className={formModalInputClass(false)}
                        placeholder="Ex: 8"
                      />
                      <input
                        type="number"
                        min={0}
                        value={row.s}
                        onChange={(e) => row.setS(e.target.value)}
                        className={formModalInputClass(false)}
                        placeholder="Ex: 12"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </FormModalSection>

          {/* Detalhes Adicionais (não exibir para Fixed Price) */}
          {tipoProjeto !== "FIXED_PRICE" && (
            <FormModalSection title="Detalhes adicionais">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-4">
                <div className="md:col-span-2">
                  <label className={formModalLabelClass}>Descrição do projeto</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                    className={formModalInputClass(false) + " min-h-[96px] resize-y"}
                    rows={3}
                    placeholder="Descreva o escopo, objetivos e principais entregas..."
                  />
                </div>
                {tipoProjeto !== "AMS" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={formModalLabelClass}>Prioridade</label>
                      <select
                        value={prioridade}
                        onChange={(e) => setPrioridade(e.target.value)}
                        className={formModalInputClass(false)}
                      >
                        <option value="">Selecione</option>
                        {PRIORIDADE_OPCOES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Total de horas planejadas</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={totalHorasPlanejadas}
                        onChange={(e) => setTotalHorasPlanejadas(e.target.value)}
                        className={formModalInputClass(false)}
                        placeholder="Ex: 120"
                      />
                    </div>
                  </div>
                )}
              </div>
            </FormModalSection>
          )}
          
          {/* Checkboxes para campos obrigatórios nas tarefas */}
          <FormModalSection
            title="Campos obrigatórios nas tarefas"
            description="Define se a criação/edição de tarefas exige horas e/ou data de entrega."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label
                className="flex items-center gap-3 cursor-pointer group p-3 rounded-xl border transition-all"
                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
              >
                <input
                  type="checkbox"
                  checked={obrigatoriosHoras}
                  onChange={(e) => setObrigatoriosHoras(e.target.checked)}
                  className="w-5 h-5 rounded border text-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:ring-offset-0 cursor-pointer transition-all"
                  style={{ borderColor: "var(--border)" }}
                />
                <span className="text-sm font-semibold text-[color:var(--foreground)]">
                  Número de horas
                </span>
              </label>
              <label
                className="flex items-center gap-3 cursor-pointer group p-3 rounded-xl border transition-all"
                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
              >
                <input
                  type="checkbox"
                  checked={obrigatoriosDataEntrega}
                  onChange={(e) => setObrigatoriosDataEntrega(e.target.checked)}
                  className="w-5 h-5 rounded border text-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:ring-offset-0 cursor-pointer transition-all"
                  style={{ borderColor: "var(--border)" }}
                />
                <span className="text-sm font-semibold text-[color:var(--foreground)]">
                  Data de entrega
                </span>
              </label>
            </div>
          </FormModalSection>

          {/* Anexo da proposta comercial */}
          <FormModalSection
            title="Proposta comercial"
            description="Anexe um arquivo PDF ou DOCX. Tamanho máximo: 10MB."
          >
            <div>
              <label className={formModalLabelClass}>
                <FileText className="inline h-3.5 w-3.5 mr-1.5" style={{ color: "var(--muted-foreground)" }} />
                Proposta comercial (PDF ou DOCX)
              </label>
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploadingAnexo || saving}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAnexo || saving}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-opacity hover:opacity-95"
                  style={{ background: "var(--primary)" }}
                >
                  Escolher arquivo
                </button>
                {anexoNomeArquivo && (
                  <div
                    className="flex items-center gap-3 text-sm rounded-xl px-4 py-3 border shadow-sm"
                    style={{ borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)" }}
                  >
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: "rgb(16 185 129)" }} />
                    <span className="flex-1 truncate font-semibold text-[color:var(--foreground)]">{anexoNomeArquivo}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAnexoArquivo(null);
                        setAnexoNomeArquivo("");
                        setAnexoUrl("");
                        setAnexoTipo("");
                        setAnexoTamanho(0);
                        if (isEdit) setAnexoRemoved(true);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="text-xs font-semibold px-2 py-1 rounded-lg transition hover:opacity-90"
                      style={{ color: "#ef4444" }}
                      disabled={uploadingAnexo || saving}
                    >
                      Remover
                    </button>
                  </div>
                )}
                {anexoUrl && !anexoArquivo && (
                  <div className="text-xs text-[color:var(--muted-foreground)]">
                    Arquivo atual:{" "}
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold hover:underline"
                      style={{ color: "var(--primary)" }}
                    >
                      abrir
                    </a>
                  </div>
                )}
              </div>
            </div>
          </FormModalSection>
          </div>

          {/* Footer */}
          <div
            className="sticky bottom-0 z-10 border-t px-6 md:px-8 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl flex justify-end gap-3 shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border text-sm font-semibold transition hover:opacity-90"
              style={{
                borderColor: "var(--border)",
                background: "transparent",
                color: "var(--foreground)",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-opacity hover:opacity-95 flex items-center gap-2"
              style={{ background: "var(--primary)" }}
            >
              {saving ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  {isEdit ? "Salvando..." : "Criando..."}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {isEdit ? "Salvar alterações" : "Criar Projeto"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
