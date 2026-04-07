"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { X, Users, Calendar, FileText, Settings, CheckCircle2 } from "lucide-react";

export type UserOption = { id: string; name: string; email?: string };
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
      missingFields.push("Responsáveis");
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

  const getInputClass = (hasError: boolean) => {
    const baseClass = "w-full px-4 py-2.5 rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:shadow-sm";
    const errorClass = hasError 
      ? "border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50/50" 
      : "border-slate-200 hover:border-slate-300 focus:ring-blue-500 focus:border-blue-500";
    return `${baseClass} ${errorClass}`;
  };
  const labelClass = "block text-xs font-semibold text-slate-700 mb-2";

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-6 pb-5 border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-slate-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{isEdit ? "Editar Projeto" : "Novo Projeto"}</h2>
              </div>
              <p className="text-sm text-slate-600 ml-[52px]">
                Preencha as informações para criar um novo projeto. Campos marcados com <span className="text-red-500 font-semibold">*</span> são obrigatórios.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col bg-slate-50">
            {loadingProject && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <p className="text-sm text-slate-600">Carregando informações do projeto...</p>
              </div>
            )}
            {error && (
            <div className="px-8 pt-4 pb-0 bg-white">
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm text-red-800 font-medium flex items-center gap-2">
                  <span className="text-red-500">⚠</span>
                  {error}
                </p>
              </div>
            </div>
          )}
          <div className="p-8 space-y-8 flex-1 overflow-y-auto">
          {/* Obrigatórios */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 w-1 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Informações Principais
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-6">
              <div className="space-y-5">
                <div>
                  <label className={labelClass}>
                    Nome do projeto <span className="text-red-500">*</span>
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
                    className={getInputClass(!!fieldErrors.name)}
                    placeholder="Ex: Implementação SAP"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Cliente <span className="text-red-500">*</span>
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
                      className={getInputClass(!!fieldErrors.clientId) + " appearance-none pr-10 cursor-pointer"}
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

              <div className={`space-y-3 bg-white rounded-xl border-2 px-5 py-4 shadow-sm transition-colors ${
                !!fieldErrors.responsibleIds ? "border-red-300 bg-red-50/30" : "border-slate-200 hover:border-slate-300"
              }`}>
                <label className={labelClass}>
                  <Users className="inline h-4 w-4 mr-1.5 text-slate-500" />
                  Responsáveis <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
                  {selectedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100/50 pl-1.5 pr-2.5 py-1.5 border border-blue-200 shadow-sm hover:shadow transition-all"
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white text-xs font-bold shadow-sm"
                        title={u.name}
                      >
                        {getIniciais(u.name)}
                      </span>
                      <span className="text-xs font-medium text-slate-700 max-w-[120px] truncate">{u.name}</span>
                      <button
                        type="button"
                        onClick={() => removeResponsible(u.id)}
                        className="ml-0.5 text-slate-400 hover:text-red-600 p-0.5 rounded transition-colors"
                        aria-label="Remover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowUserPicker(!showUserPicker)}
                      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Adicionar
                    </button>
                    {showUserPicker && (
                      <div className="absolute left-0 top-full mt-2 z-30 w-72 rounded-xl border border-slate-200 bg-white shadow-xl py-2 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {availableToAdd.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-slate-500 text-center">Todos os usuários já foram adicionados</p>
                        ) : (
                          availableToAdd.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => addResponsible(u.id)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-blue-50 transition-colors"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                                {getIniciais(u.name)}
                              </span>
                              <span className="flex-1">{u.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="text-blue-500">ℹ</span>
                  Selecione ao menos um responsável pelo projeto
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>
                  <Calendar className="inline h-3.5 w-3.5 mr-1.5 text-slate-500" />
                  Data de início <span className="text-red-500">*</span>
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
                  className={getInputClass(!!fieldErrors.dataInicio)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  <Calendar className="inline h-3.5 w-3.5 mr-1.5 text-slate-500" />
                  Data prevista de término
                </label>
                <input
                  type="date"
                  value={dataFimPrevista}
                  onChange={(e) => setDataFimPrevista(e.target.value)}
                  className={getInputClass(false)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5 text-slate-500" />
                  Status do projeto
                </label>
                <div className="relative">
                  <select
                    value={statusInicial}
                    onChange={(e) => setStatusInicial(e.target.value as any)}
                    className={getInputClass(false) + " appearance-none pr-10 cursor-pointer"}
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
                <p className="mt-1 text-[11px] text-slate-500">
                  Apenas <span className="font-semibold">Ativo</span> permite apontamento de horas.
                </p>
              </div>
            </div>
          </div>

          {/* Tipo de Projeto */}
          <div className="space-y-5 pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 w-1 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Tipo de Projeto
              </h3>
            </div>
            <div>
              <label className={labelClass}>
                <Settings className="inline h-3.5 w-3.5 mr-1.5 text-slate-500" />
                Tipo <span className="text-red-500">*</span>
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
                  className={getInputClass(false) + " appearance-none pr-10 cursor-pointer font-medium"}
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
              <div className="space-y-5 bg-gradient-to-br from-blue-50/80 to-blue-100/40 rounded-xl border-2 border-blue-200/60 p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Settings className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">Configurações Fixed Price</p>
                </div>
                <div>
                  <label className={labelClass}>Limite de horas do escopo</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={limiteHorasEscopo}
                    onChange={(e) => setLimiteHorasEscopo(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: 200"
                  />
                </div>
                <div>
                  <label className={labelClass}>Prioridade</label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className={getInputClass(false)}
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
                  <label className={labelClass}>Total de horas planejadas</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={totalHorasPlanejadas}
                    onChange={(e) => setTotalHorasPlanejadas(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: 120"
                  />
                </div>
                <div>
                  <label className={labelClass}>Escopo inicial</label>
                  <textarea
                    value={escopoInicial}
                    onChange={(e) => setEscopoInicial(e.target.value.slice(0, 800))}
                    className={getInputClass(false) + " min-h-[80px] resize-y"}
                    maxLength={800}
                    rows={3}
                    placeholder="Descreva o escopo detalhado do projeto..."
                  />
                </div>
              </div>
            )}

            {/* Configurações AMS */}
            {tipoProjeto === "AMS" && (
              <div className="space-y-5 bg-gradient-to-br from-emerald-50/80 to-green-100/40 rounded-xl border-2 border-emerald-200/60 p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                    <Settings className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">Configurações AMS</p>
                </div>
                <div className="bg-white/60 rounded-lg p-4 border border-emerald-200/50">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold">Como funciona:</span> O AMS possui horas mínimas contratadas por mês. 
                    Horas não utilizadas acumulam no banco de horas. Se o cliente utilizar mais horas que o contratado, 
                    serão descontadas do banco de horas acumulado.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Horas mínimas contratadas por mês</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={horasMensaisAMS}
                      onChange={(e) => setHorasMensaisAMS(e.target.value)}
                      className={getInputClass(false)}
                      placeholder="Ex: 40"
                    />
                    <p className="text-xs text-slate-500 mt-1">Horas que o cliente deve contratar mensalmente</p>
                  </div>
                  <div>
                    <label className={labelClass}>Banco de horas inicial</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={bancoHorasInicial}
                      onChange={(e) => setBancoHorasInicial(e.target.value)}
                      className={getInputClass(false)}
                      placeholder="Ex: 0"
                    />
                    <p className="text-xs text-slate-500 mt-1">Horas iniciais no banco (opcional)</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Cadastro de SLA por prioridade (opcional)</p>
                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-slate-700">
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
                      <span className="text-sm text-slate-700">{row.label}</span>
                      <input
                        type="number"
                        min={0}
                        value={row.r}
                        onChange={(e) => row.setR(e.target.value)}
                        className={getInputClass(false)}
                        placeholder="Ex: 8"
                      />
                      <input
                        type="number"
                        min={0}
                        value={row.s}
                        onChange={(e) => row.setS(e.target.value)}
                        className={getInputClass(false)}
                        placeholder="Ex: 12"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Detalhes Adicionais (não exibir para Fixed Price) */}
          {tipoProjeto !== "FIXED_PRICE" && (
            <div className="space-y-5 pt-6 border-t-2 border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-1 w-1 rounded-full bg-blue-600"></div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Detalhes Adicionais
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Descrição do projeto</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                    className={getInputClass(false) + " min-h-[96px] resize-y"}
                    rows={3}
                    placeholder="Descreva o escopo, objetivos e principais entregas..."
                  />
                </div>
                {tipoProjeto !== "AMS" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Prioridade</label>
                      <select
                        value={prioridade}
                        onChange={(e) => setPrioridade(e.target.value)}
                        className={getInputClass(false)}
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
                      <label className={labelClass}>Total de horas planejadas</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={totalHorasPlanejadas}
                        onChange={(e) => setTotalHorasPlanejadas(e.target.value)}
                        className={getInputClass(false)}
                        placeholder="Ex: 120"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Checkboxes para campos obrigatórios nas tarefas */}
          <div className="space-y-4 pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 w-1 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Campos obrigatórios nas tarefas
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all">
                <input
                  type="checkbox"
                  checked={obrigatoriosHoras}
                  onChange={(e) => setObrigatoriosHoras(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-all"
                />
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                  Número de horas
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all">
                <input
                  type="checkbox"
                  checked={obrigatoriosDataEntrega}
                  onChange={(e) => setObrigatoriosDataEntrega(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-all"
                />
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                  Data de entrega
                </span>
              </label>
            </div>
          </div>

          {/* Anexo da proposta comercial */}
          <div className="space-y-4 pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 w-1 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Anexo da proposta comercial
              </h3>
            </div>
            <div>
              <label className={labelClass}>
                <FileText className="inline h-3.5 w-3.5 mr-1.5 text-slate-500" />
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
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  Escolher arquivo
                </button>
                {anexoNomeArquivo && (
                  <div className="flex items-center gap-3 text-sm bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg px-4 py-3 border-2 border-emerald-200 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    <span className="flex-1 truncate font-medium text-slate-700">{anexoNomeArquivo}</span>
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
                      className="text-red-600 hover:text-red-700 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      disabled={uploadingAnexo || saving}
                    >
                      Remover
                    </button>
                  </div>
                )}
                {anexoUrl && !anexoArquivo && (
                  <div className="text-xs text-slate-600">
                    Arquivo atual:{" "}
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      abrir
                    </a>
                  </div>
                )}
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="text-blue-500">ℹ</span>
                  Formatos aceitos: PDF e DOCX. Tamanho máximo: 10MB.
                </p>
              </div>
            </div>
          </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-slate-200 px-8 py-5 bg-white flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
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
