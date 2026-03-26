"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  Building2,
  FolderKanban,
  Paperclip,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";

const TIPOS = ["Suporte em PRD", "Melhoria", "Dúvida", "Bug", "Configuração", "Desenvolvimento"];
const PRIORIDADES = ["Baixa", "Média", "Alta", "Urgente"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (alinhado ao backend)
const MAX_FILES = 5;

type AttachmentDraft = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string; // data URL base64
  uploaded: boolean;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function AbrirChamadoPage() {
  const { user, can } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<
    Array<{
      id: string;
      name: string;
      tipoProjeto?: string;
      clientId?: string;
      client?: { id: string };
      responsibles?: Array<{ user?: { id: string; name: string } }>;
    }>
  >([]);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [ticketName, setTicketName] = useState("");
  const [description, setDescription] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [tipo, setTipo] = useState("");
  const [topicId, setTopicId] = useState("");
  const [projectDetail, setProjectDetail] = useState<null | {
    id: string;
    tipoProjeto?: string | null;
    slaRespostaBaixa?: number | null;
    slaSolucaoBaixa?: number | null;
    slaRespostaMedia?: number | null;
    slaSolucaoMedia?: number | null;
    slaRespostaAlta?: number | null;
    slaSolucaoAlta?: number | null;
    slaRespostaCritica?: number | null;
    slaSolucaoCritica?: number | null;
    tickets?: Array<{ id: string; title: string; type: string; status: string; parentTicketId?: string | null }>;
  }>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!can("chamados.criacao")) {
      setClients([]);
      setClientId("");
      return;
    }

    // Perfil CLIENTE: empresa vem automaticamente do vínculo user↔empresa (sem depender de permissão de cadastro).
    if (user?.role === "CLIENTE") {
      apiFetch("/api/auth/client-home-summary")
        .then(async (r) => {
          if (!r.ok) return null;
          return r.json().catch(() => null);
        })
        .then((data: { clients?: Array<{ id: string; name: string }> } | null) => {
          const list = Array.isArray(data?.clients) ? data!.clients : [];
          setClients(list);
          if (list.length >= 1) setClientId(list[0].id);
          if (list.length > 1) {
            setError("Seu usuário está vinculado a mais de uma empresa. Entre em contato com o administrador.");
          }
        })
        .catch(() => {
          setClients([]);
          setClientId("");
        });
      return;
    }

    // Outros perfis: usa lista de clientes (requer permissão).
    if (!can("configuracoes.clientes")) {
      setClients([]);
      setClientId("");
      return;
    }

    apiFetch("/api/clients")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json().catch(() => []);
        return Array.isArray(data) ? data : [];
      })
      .then((list: Array<{ id: string; name: string }>) => {
        setClients(list);
        if (list.length >= 1) setClientId(list[0].id);
      })
      .catch(() => {
        setClients([]);
        setClientId("");
      });
  }, [can]);

  useEffect(() => {
    if (!can("chamados.criacao")) {
      setProjects([]);
      return;
    }
    const canLoadProjects = user?.role === "CLIENTE" ? true : can("projeto");
    if (!canLoadProjects) {
      setProjects([]);
      return;
    }
    apiFetch("/api/projects?light=true")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json().catch(() => []);
        return Array.isArray(data) ? data : [];
      })
      .then((
        list: Array<{ id: string; name: string; tipoProjeto?: string; clientId?: string; client?: { id: string } }>
      ) => setProjects(list))
      .catch(() => setProjects([]));
  }, [can]);

  const filteredProjects = useMemo(() => {
    if (!clientId) return [];
    return projects.filter((p) => {
      const belongs = (p.clientId || p.client?.id) === clientId;
      const tipoProjeto = String(p.tipoProjeto || "");
      const isAllowed = tipoProjeto === "AMS" || tipoProjeto === "TIME_MATERIAL";
      const isMember =
        user?.role !== "CLIENTE"
          ? true
          : (p.responsibles ?? []).some((r) => r.user?.id && r.user.id === user.id);
      return belongs && isAllowed && isMember;
    });
  }, [clientId, projects, user?.id, user?.role]);

  useEffect(() => {
    // Se o cliente trocar (ou carregar), garante consistência do projeto selecionado
    if (!clientId) {
      setProjectId("");
      return;
    }
    if (projectId && !filteredProjects.some((p) => p.id === projectId)) {
      setProjectId("");
      return;
    }
    // Se (raramente) houver só 1 projeto permitido, já seleciona
    if (!projectId && filteredProjects.length === 1) {
      setProjectId(filteredProjects[0].id);
    }
  }, [clientId, filteredProjects, projectId]);

  useEffect(() => {
    setProjectDetail(null);
    setTopicId("");
    setPrioridade("");
    if (!projectId) return;
    let cancelled = false;
    apiFetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json().catch(() => null);
      })
      .then((p) => {
        if (cancelled) return;
        if (!p || typeof p !== "object") return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = p as any;
        setProjectDetail({
          id: String(obj.id),
          tipoProjeto: obj.tipoProjeto ?? null,
          slaRespostaBaixa: obj.slaRespostaBaixa ?? null,
          slaSolucaoBaixa: obj.slaSolucaoBaixa ?? null,
          slaRespostaMedia: obj.slaRespostaMedia ?? null,
          slaSolucaoMedia: obj.slaSolucaoMedia ?? null,
          slaRespostaAlta: obj.slaRespostaAlta ?? null,
          slaSolucaoAlta: obj.slaSolucaoAlta ?? null,
          slaRespostaCritica: obj.slaRespostaCritica ?? null,
          slaSolucaoCritica: obj.slaSolucaoCritica ?? null,
          tickets: Array.isArray(obj.tickets) ? obj.tickets : [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const topicsForSelect = useMemo(() => {
    const all = projectDetail?.tickets ?? [];
    const topicos = all.filter((t) => t.type === "SUBPROJETO");
    const tarefas = all.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA");
    const byParent = new Map<string, Array<{ status: string }>>();
    for (const task of tarefas) {
      const pid = task.parentTicketId;
      if (!pid) continue;
      const list = byParent.get(pid) ?? [];
      list.push({ status: task.status });
      byParent.set(pid, list);
    }

    const getTopicStatus = (topicId: string): "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" => {
      const tasks = byParent.get(topicId) ?? [];
      if (tasks.length === 0) return "ABERTO";
      const finalizadas = tasks.filter((t) => t.status === "ENCERRADO").length;
      if (finalizadas === tasks.length) return "CONCLUIDO";
      const emBacklog = tasks.filter((t) => t.status === "ABERTO").length;
      if (emBacklog === tasks.length) return "ABERTO";
      return "EM_ANDAMENTO";
    };

    // Requisito: só mostrar tópicos "em andamento". Na prática, evitamos apenas tópicos concluídos.
    return topicos
      .map((t) => ({ id: t.id, title: t.title, status: getTopicStatus(t.id) }))
      .filter((t) => t.status !== "CONCLUIDO")
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [projectDetail?.tickets]);

  const slaForPrioridade = useMemo(() => {
    if (!prioridade || projectDetail?.tipoProjeto !== "AMS") return null;
    const p = prioridade
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    if (p === "BAIXA") return { resposta: projectDetail.slaRespostaBaixa ?? null, solucao: projectDetail.slaSolucaoBaixa ?? null };
    if (p === "MEDIA") return { resposta: projectDetail.slaRespostaMedia ?? null, solucao: projectDetail.slaSolucaoMedia ?? null };
    if (p === "ALTA") return { resposta: projectDetail.slaRespostaAlta ?? null, solucao: projectDetail.slaSolucaoAlta ?? null };
    if (p === "URGENTE") return { resposta: projectDetail.slaRespostaCritica ?? null, solucao: projectDetail.slaSolucaoCritica ?? null };
    return null;
  }, [prioridade, projectDetail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitAttempted(true);

    if (!projectId || !ticketName.trim() || !tipo || !description.trim()) {
      setError("Preencha os campos obrigatórios destacados em vermelho.");
      return;
    }
    setSaving(true);
    try {
      let ticketId = createdTicketId;
      if (!ticketId) {
        // Garante um tópico pai. Se o cliente não selecionar (ou não houver tópicos), cria um genérico com o mesmo nome do chamado.
        let effectiveTopicId = topicId;
        if (!effectiveTopicId) {
          const topicRes = await apiFetch("/api/tickets", {
            method: "POST",
            body: JSON.stringify({
              projectId,
              title: ticketName.trim(),
              type: "SUBPROJETO",
            }),
          });
          const topicData = await topicRes.json().catch(() => ({}));
          if (!topicRes.ok) {
            setError(topicData?.error || "Erro ao criar tópico do chamado");
            return;
          }
          effectiveTopicId = String(topicData.id);
        }

        // Cria a tarefa do chamado dentro do tópico.
        const res = await apiFetch("/api/tickets", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            parentTicketId: effectiveTopicId,
            title: ticketName.trim(),
            description: description.trim(),
            type: tipo,
            criticidade: prioridade || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error || "Erro ao criar chamado");
          return;
        }
        ticketId = String(data.id);
        setCreatedTicketId(ticketId);
      }

      // Upload de anexos (se houver)
      const pending = attachments.filter((a) => !a.uploaded);
      for (const a of pending) {
        const up = await apiFetch("/api/ticket-attachments", {
          method: "POST",
          body: JSON.stringify({
            ticketId,
            fileName: a.fileName,
            fileData: a.fileData,
            fileType: a.fileType,
            fileSize: a.fileSize,
          }),
        });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) {
          setError(upData.error || `Chamado criado, mas falhou ao enviar o anexo "${a.fileName}".`);
          return;
        }
        setAttachments((prev) => prev.map((p) => (p.id === a.id ? { ...p, uploaded: true } : p)));
      }

      router.push("/cliente");
      router.refresh();
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const currentCount = attachments.length;
    if (currentCount >= MAX_FILES) {
      setError(`Máximo de ${MAX_FILES} anexos por chamado.`);
      return;
    }

    setError("");
    const selected = Array.from(files).slice(0, Math.max(0, MAX_FILES - currentCount));
    const next: AttachmentDraft[] = [];

    for (const f of selected) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`Arquivo "${f.name}" muito grande. Tamanho máximo: 10MB`);
        continue;
      }
      const isAllowed = f.type.startsWith("image/") || f.type === "application/pdf";
      if (!isAllowed) {
        setError(`Arquivo "${f.name}" inválido. Envie imagens ou PDF.`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(f);
      const id = `${f.name}-${f.size}-${f.lastModified}`;
      next.push({
        id,
        fileName: f.name,
        fileType: f.type,
        fileSize: f.size,
        fileData: dataUrl,
        uploaded: false,
      });
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const clientName =
    clients.find((c) => c.id === clientId)?.name ||
    (clients.length === 1 ? clients[0].name : "");
  const selectedProjectName = filteredProjects.find((p) => p.id === projectId)?.name || "";
  const pendingUploads = attachments.filter((a) => !a.uploaded).length;
  const canSubmit = Boolean(projectId && ticketName.trim() && tipo && description.trim()) && !saving;
  const hasProjectAccess = user?.role === "CLIENTE" ? true : can("projeto");
  const hasClientsAccess = user?.role === "CLIENTE" ? true : can("configuracoes.clientes");
  const canUseForm = can("chamados.criacao") && hasProjectAccess && hasClientsAccess;
  const primaryLabel = saving
    ? "Salvando..."
    : createdTicketId
      ? pendingUploads > 0
        ? "Enviar anexos e finalizar"
        : "Finalizar"
      : "Criar chamado";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
      <header className="flex-shrink-0 bg-gradient-to-br from-blue-700 to-blue-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Abrir chamado</h1>
              <p className="text-blue-100 mt-1 text-sm md:text-base">
                Descreva sua necessidade e anexe arquivos para ajudar no atendimento.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-50">
                  <Building2 className="h-4 w-4" />
                  {clientName || "Empresa"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-50">
                  <FolderKanban className="h-4 w-4" />
                  {selectedProjectName || "Projeto"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-50">
                  <Paperclip className="h-4 w-4" />
                  {attachments.length} anexo(s)
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto px-4 md:px-6 py-6 lg:py-8">
        <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-3">
          <aside className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-900 font-medium">
                <Info className="h-5 w-5 text-blue-600" />
                Como acelerar seu atendimento
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold grid place-items-center">1</span>
                  Selecione o <span className="font-medium text-slate-800">projeto</span> correto.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold grid place-items-center">2</span>
                  Descreva o contexto e o resultado esperado.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold grid place-items-center">3</span>
                  Anexe prints/PDFs (até {MAX_FILES} arquivos, 10MB cada).
                </li>
              </ul>
            </div>
            {createdTicketId && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
                  <div className="text-sm text-emerald-900">
                    Chamado criado. Se algum anexo falhar, você pode clicar em <span className="font-semibold">Salvar</span> novamente para reenviar.
                  </div>
                </div>
              </div>
            )}
          </aside>

          <section className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 md:p-8 space-y-6">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-700 mt-0.5" />
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Seleção</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Empresa</label>
                      <select
                        value={clientId}
                        onChange={(e) => {
                          if (user?.role !== "CLIENTE") {
                            setClientId(e.target.value);
                            setProjectId("");
                          }
                        }}
                        disabled={user?.role === "CLIENTE"}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                          user?.role === "CLIENTE"
                            ? "border-slate-200 opacity-80 cursor-not-allowed"
                            : "border-slate-200"
                        }`}
                      >
                        <option value="">Selecione</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Projeto</label>
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                          submitAttempted && !projectId ? "border-rose-400" : "border-slate-200"
                        }`}
                        required
                        disabled={!clientId || filteredProjects.length === 0}
                      >
                        <option value="">{!clientId ? "Selecione a empresa" : "Selecione"}</option>
                        {filteredProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {clientId && filteredProjects.length === 0 && (
                        <p className="mt-2 text-xs text-red-600">
                          Nenhum projeto AMS/T&amp;M disponível para abrir chamado (ou você não está como membro). Fale com o administrador.
                        </p>
                      )}
                      {submitAttempted && !projectId && (
                        <p className="mt-2 text-xs text-rose-600">Projeto é obrigatório.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Detalhes</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome <span className="text-rose-600">*</span></label>
                      <input
                        value={ticketName}
                        onChange={(e) => setTicketName(e.target.value.slice(0, 120))}
                        placeholder="Ex.: Erro ao emitir nota fiscal"
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                          submitAttempted && !ticketName.trim() ? "border-rose-400" : "border-slate-200"
                        }`}
                        required
                      />
                      {submitAttempted && !ticketName.trim() && (
                        <p className="mt-2 text-xs text-rose-600">Nome é obrigatório.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                          submitAttempted && !tipo ? "border-rose-400" : "border-slate-200"
                        }`}
                        required
                      >
                        <option value="">Selecione</option>
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {submitAttempted && !tipo && (
                        <p className="mt-2 text-xs text-rose-600">Tipo é obrigatório.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Prioridade (opcional)</label>
                      <select
                        value={prioridade}
                        onChange={(e) => setPrioridade(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        <option value="">Selecione</option>
                        {PRIORIDADES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      {slaForPrioridade && (
                        <p className="mt-2 text-xs text-slate-600">
                          SLA do projeto (AMS) — Resposta:{" "}
                          <span className="font-semibold">{slaForPrioridade.resposta != null ? `${slaForPrioridade.resposta}h` : "—"}</span>{" "}
                          · Solução:{" "}
                          <span className="font-semibold">{slaForPrioridade.solucao != null ? `${slaForPrioridade.solucao}h` : "—"}</span>
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Tópico (opcional)</label>
                      <select
                        value={topicId}
                        onChange={(e) => setTopicId(e.target.value)}
                        disabled={!projectId || topicsForSelect.length === 0}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-70"
                      >
                        <option value="">
                          {!projectId
                            ? "Selecione o projeto"
                            : topicsForSelect.length === 0
                              ? "Nenhum tópico disponível (será criado automaticamente)"
                              : "Selecione (ou deixe em branco para criar automaticamente)"}
                        </option>
                        {topicsForSelect.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição</label>
                      <span className="text-xs text-slate-500">{description.length}/2000</span>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                      rows={6}
                      placeholder="Explique o que aconteceu, o que você esperava e (se possível) passos para reproduzir."
                      className={`w-full rounded-xl border px-4 py-3 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                        submitAttempted && !description.trim() ? "border-rose-400" : "border-slate-200"
                      }`}
                      required
                    />
                    {submitAttempted && !description.trim() && (
                      <p className="mt-2 text-xs text-rose-600">Descrição é obrigatória.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Anexos</h2>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      void handleAddFiles(e.dataTransfer.files);
                    }}
                    className={`rounded-2xl border-2 border-dashed p-4 transition ${
                      dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700">
                          <Paperclip className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Arraste e solte aqui</p>
                          <p className="text-xs text-slate-600">
                            Imagens ou PDF • até {MAX_FILES} arquivos • 10MB cada
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => void handleAddFiles(e.target.files)}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm text-slate-800 hover:border-blue-300 hover:bg-blue-50"
                        >
                          <Paperclip className="h-4 w-4" />
                          Selecionar arquivos
                        </button>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {attachments.map((a) => {
                          const isImage = a.fileType.startsWith("image/");
                          return (
                            <div
                              key={a.id}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <div className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden grid place-items-center">
                                {isImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={a.fileData} alt={a.fileName} className="h-full w-full object-cover" />
                                ) : a.fileType === "application/pdf" ? (
                                  <FileText className="h-6 w-6 text-slate-600" />
                                ) : (
                                  <ImageIcon className="h-6 w-6 text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-900 truncate" title={a.fileName}>
                                  {a.fileName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {(a.fileSize / (1024 * 1024)).toFixed(1)} MB
                                  {a.uploaded ? " • enviado" : ""}
                                </div>
                              </div>
                              {!a.uploaded ? (
                                <button
                                  type="button"
                                  onClick={() => setAttachments((prev) => prev.filter((p) => p.id !== a.id))}
                                  className="rounded-lg px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Remover
                                </button>
                              ) : (
                                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1">
                                  ok
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-6 md:px-8 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit || !canUseForm}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {primaryLabel}
                  </button>
                </div>
                {!canUseForm && (
                  <p className="mt-2 text-xs text-amber-700">
                    Sem acesso aos dados necessários para abrir chamado neste perfil.
                  </p>
                )}
                {createdTicketId && pendingUploads > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    Dica: o chamado já foi criado. Ao salvar novamente, enviaremos apenas os anexos pendentes.
                  </p>
                )}
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
