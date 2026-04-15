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

type AbrirChamadoContentProps = {
  afterCreateHref: string;
};

export function AbrirChamadoContent({ afterCreateHref }: AbrirChamadoContentProps) {
  const { user, can } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<
    Array<{
      id: string;
      name: string;
      tipoProjeto?: string;
      clientId?: string;
      client?: { id: string; name?: string };
    }>
  >([]);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [ticketName, setTicketName] = useState("");
  const [description, setDescription] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [tipo, setTipo] = useState("");
  const [tipoOptions, setTipoOptions] = useState<Array<{ id: string; name: string }>>([]);
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
  const submitInFlightRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const isCliente = user?.role === "CLIENTE";
  const canUseForm = can("chamados.criacao") && (isCliente || can("projeto"));

  // Perfis sem acesso à funcionalidade (ex.: SUPER_ADMIN) não devem nem ver a tela.
  useEffect(() => {
    if (!user) return;
    if (canUseForm) return;
    const basePath =
      user.role === "CLIENTE"
        ? "/cliente"
        : user.role === "GESTOR_PROJETOS"
          ? "/gestor"
          : "/consultor";
    router.replace(basePath);
  }, [user, canUseForm, router]);

  useEffect(() => {
    if (!can("chamados.criacao")) {
      setClients([]);
      setClientId("");
      return;
    }

    if (isCliente) {
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

    // Para consultor/gestor/admin: empresa é derivada do projeto; não precisa carregar lista de clientes.
    setClients([]);
    setClientId("");
  }, [can, isCliente]);

  useEffect(() => {
    if (!can("chamados.criacao")) {
      setProjects([]);
      return;
    }

    if (isCliente) {
      apiFetch("/api/auth/client-home-summary")
        .then(async (r) => {
          if (!r.ok) return null;
          return r.json().catch(() => null);
        })
        .then((data: { projects?: Array<{ id: string; name: string; tipoProjeto?: string; clientId?: string }> } | null) => {
          const list = Array.isArray(data?.projects) ? data!.projects : [];
          setProjects(list);
        })
        .catch(() => setProjects([]));
      return;
    }

    if (!can("projeto")) {
      setProjects([]);
      return;
    }

    apiFetch("/api/projects?light=true")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json().catch(() => []);
        return Array.isArray(data) ? data : [];
      })
      .then((list: Array<{ id: string; name: string; tipoProjeto?: string; client?: { id: string; name?: string } }>) => {
        setProjects(list);
      })
      .catch(() => setProjects([]));
  }, [can, isCliente]);

  const filteredProjects = useMemo(() => {
    const list = projects.filter((p) => {
      const tipoProjeto = String((p as { tipoProjeto?: string }).tipoProjeto || "");
      return tipoProjeto === "AMS" || tipoProjeto === "TIME_MATERIAL";
    });

    if (!isCliente) return list;
    if (!clientId) return [];
    return list.filter((p) => (p.clientId || p.client?.id) === clientId);
  }, [projects, isCliente, clientId]);

  useEffect(() => {
    if (isCliente) {
      if (!clientId) {
        setProjectId("");
        return;
      }
      if (projectId && !filteredProjects.some((p) => p.id === projectId)) {
        setProjectId("");
        return;
      }
      if (!projectId && filteredProjects.length === 1) setProjectId(filteredProjects[0].id);
      return;
    }
    // Não-cliente: não depende de empresa.
    if (projectId && !filteredProjects.some((p) => p.id === projectId)) setProjectId("");
  }, [isCliente, clientId, filteredProjects, projectId]);

  useEffect(() => {
    setProjectDetail(null);
    setTopicId("");
    setPrioridade("");
    setTipo("");
    setTipoOptions([]);
    if (!projectId) return;
    let cancelled = false;
    // Cliente pode não ter acesso a /api/projects/:id (permissões).
    // Para montar tópicos e validar AMS, usamos /api/tickets + dados do select de projetos.
    if (isCliente) {
      const proj = filteredProjects.find((p) => p.id === projectId);
      apiFetch(`/api/tickets?projectId=${projectId}&light=true`)
        .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
        .then((tickets) => {
          if (cancelled) return;
          const list = Array.isArray(tickets) ? tickets : [];
          setProjectDetail({
            id: projectId,
            tipoProjeto: (proj as any)?.tipoProjeto ?? null,
            slaRespostaBaixa: null,
            slaSolucaoBaixa: null,
            slaRespostaMedia: null,
            slaSolucaoMedia: null,
            slaRespostaAlta: null,
            slaSolucaoAlta: null,
            slaRespostaCritica: null,
            slaSolucaoCritica: null,
            tickets: list,
          });
        })
        .catch(() => {});
    } else {
      apiFetch(`/api/projects/${projectId}`)
        .then(async (r) => (r.ok ? r.json().catch(() => null) : null))
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
    }
    return () => {
      cancelled = true;
    };
  }, [projectId, isCliente, filteredProjects]);

  useEffect(() => {
    if (!projectId) {
      setTipoOptions([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/activities/for-ticket-type?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setTipoOptions(
          list
            .filter((x) => x && typeof x.name === "string")
            .map((x) => ({ id: String((x as any).id ?? x.name), name: String((x as any).name) })),
        );
      })
      .catch(() => setTipoOptions([]));
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

    return topicos
      .map((t) => ({ id: t.id, title: t.title, status: getTopicStatus(t.id) }))
      .filter((t) => t.status !== "CONCLUIDO")
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [projectDetail?.tickets]);

  const slaForPrioridade = useMemo(() => {
    if (!prioridade || projectDetail?.tipoProjeto !== "AMS") return null;
    const p = prioridade.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    if (p === "BAIXA") return { resposta: projectDetail.slaRespostaBaixa ?? null, solucao: projectDetail.slaSolucaoBaixa ?? null };
    if (p === "MEDIA") return { resposta: projectDetail.slaRespostaMedia ?? null, solucao: projectDetail.slaSolucaoMedia ?? null };
    if (p === "ALTA") return { resposta: projectDetail.slaRespostaAlta ?? null, solucao: projectDetail.slaSolucaoAlta ?? null };
    if (p === "URGENTE") return { resposta: projectDetail.slaRespostaCritica ?? null, solucao: projectDetail.slaSolucaoCritica ?? null };
    return null;
  }, [prioridade, projectDetail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    setError("");
    setSubmitAttempted(true);

    if (!projectId || !ticketName.trim() || !tipo || !description.trim()) {
      setError("Preencha os campos obrigatórios destacados em vermelho.");
      return;
    }
    if (projectDetail?.tipoProjeto === "AMS" && !prioridade.trim()) {
      setError("Em projetos AMS, a prioridade é obrigatória: ela define o SLA (resposta + solução) a partir da abertura do chamado.");
      return;
    }
    submitInFlightRef.current = true;
    setSaving(true);
    try {
      let ticketId = createdTicketId;
      if (!ticketId) {
        const effectiveTopicId = topicId;
        const res = await apiFetch("/api/tickets", {
          method: "POST",
          body: JSON.stringify(
            effectiveTopicId
              ? {
                  projectId,
                  parentTicketId: effectiveTopicId,
                  title: ticketName.trim(),
                  description: description.trim(),
                  type: tipo,
                  criticidade: prioridade.trim() || undefined,
                }
              : {
                  projectId,
                  title: ticketName.trim(),
                  description: description.trim(),
                  type: tipo,
                  criticidade: prioridade.trim() || undefined,
                  implicitTopic: true,
                },
          ),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error || "Erro ao criar chamado");
          return;
        }
        ticketId = String(data.id);
        setCreatedTicketId(ticketId);
      }

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

      router.push(afterCreateHref);
      router.refresh();
    } catch {
      setError("Erro de conexão");
    } finally {
      submitInFlightRef.current = false;
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

    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const clientName = clients.find((c) => c.id === clientId)?.name || (clients.length === 1 ? clients[0].name : "");
  const selectedProject = filteredProjects.find((p) => p.id === projectId);
  const selectedProjectName = selectedProject?.name || "";
  const pendingUploads = attachments.filter((a) => !a.uploaded).length;
  const prioridadeObrigatoriaAms =
    projectDetail?.tipoProjeto === "AMS" || String(selectedProject?.tipoProjeto || "") === "AMS";
  const canSubmit =
    Boolean(
      projectId &&
        ticketName.trim() &&
        tipo &&
        description.trim() &&
        (!prioridadeObrigatoriaAms || prioridade.trim()),
    ) && !saving;
  const primaryLabel = saving
    ? "Salvando..."
    : createdTicketId
      ? pendingUploads > 0
        ? "Enviar anexos e finalizar"
        : "Finalizar"
      : "Criar chamado";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[color:var(--background)]">
      <header
        className="flex-shrink-0 text-[color:var(--primary-foreground)]"
        style={{
          background:
            "radial-gradient(900px 420px at 78% 30%, rgba(92,0,225,0.38), transparent 55%), radial-gradient(700px 380px at 30% 60%, rgba(87,66,118,0.28), transparent 60%), linear-gradient(135deg, rgba(7,5,12,0.98), rgba(18,12,28,0.90))",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Abrir chamado</h1>
              <p className="mt-1 text-sm md:text-base text-[color:var(--primary-foreground)]/75">
                Descreva sua necessidade e anexe arquivos para ajudar no atendimento.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-[color:var(--primary-foreground)]/90">
                  <Building2 className="h-4 w-4" />
                  {isCliente ? (clientName || "Empresa") : (selectedProject?.client?.name ?? "Empresa")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-[color:var(--primary-foreground)]/90">
                  <FolderKanban className="h-4 w-4" />
                  {selectedProjectName || "Projeto"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-[color:var(--primary-foreground)]/90">
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
            <div className="rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[color:var(--foreground)] font-medium">
                <Info className="h-5 w-5" style={{ color: "var(--primary)" }} />
                Como acelerar seu atendimento
              </div>
              <ul className="mt-3 space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <li className="flex gap-2">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full text-xs font-semibold grid place-items-center"
                    style={{ background: "rgba(92,0,225,0.12)", color: "var(--primary)" }}
                  >
                    1
                  </span>
                  Selecione o <span className="font-medium text-[color:var(--foreground)]">projeto</span> correto.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full text-xs font-semibold grid place-items-center"
                    style={{ background: "rgba(92,0,225,0.12)", color: "var(--primary)" }}
                  >
                    2
                  </span>
                  Descreva o contexto e o resultado esperado.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full text-xs font-semibold grid place-items-center"
                    style={{ background: "rgba(92,0,225,0.12)", color: "var(--primary)" }}
                  >
                    3
                  </span>
                  Anexe prints/PDFs (até {MAX_FILES} arquivos, 10MB cada).
                </li>
              </ul>
            </div>
            {createdTicketId && (
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)" }}
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 mt-0.5" style={{ color: "rgb(16 185 129)" }} />
                  <div className="text-sm text-[color:var(--foreground)]">
                    Chamado criado. Se algum anexo falhar, você pode clicar em <span className="font-semibold">Salvar</span> novamente para reenviar.
                  </div>
                </div>
              </div>
            )}
          </aside>

          <section className="lg:col-span-2">
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border)] shadow-sm overflow-hidden"
            >
              <div className="p-6 md:p-8 space-y-6">
                {error && (
                  <div className="rounded-xl border p-4" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 mt-0.5" style={{ color: "rgb(239 68 68)" }} />
                      <p className="text-sm text-[color:var(--foreground)]">{error}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[color:var(--foreground)] uppercase tracking-wide">Seleção</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    {isCliente && (
                      <div>
                        <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Empresa</label>
                        <select
                          value={clientId}
                          onChange={() => {}}
                          disabled
                          className="w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface-2)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 opacity-80 cursor-not-allowed"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <option value={clientId}>{clientName || "Empresa"}</option>
                        </select>
                      </div>
                    )}

                    <div className={isCliente ? "" : "md:col-span-2"}>
                      <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Projeto</label>
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface-2)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 ${
                          submitAttempted && !projectId ? "border-rose-400" : ""
                        }`}
                        style={{ borderColor: submitAttempted && !projectId ? "rgba(244,63,94,0.55)" : "var(--border)" }}
                        required
                        disabled={filteredProjects.length === 0}
                      >
                        <option value="">{filteredProjects.length === 0 ? "Nenhum projeto disponível" : "Selecione"}</option>
                        {filteredProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {(p.client as { name?: string } | undefined)?.name ? `${(p.client as { name?: string }).name} · ` : ""}{p.name}
                          </option>
                        ))}
                      </select>
                      {submitAttempted && !projectId && (
                        <p className="mt-2 text-xs text-rose-600">Projeto é obrigatório.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[color:var(--foreground)] uppercase tracking-wide">Detalhes</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Nome <span className="text-rose-600">*</span></label>
                      <input
                        value={ticketName}
                        onChange={(e) => setTicketName(e.target.value.slice(0, 120))}
                        placeholder="Ex.: Erro ao emitir nota fiscal"
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 ${
                          submitAttempted && !ticketName.trim() ? "border-rose-400" : ""
                        }`}
                        style={{ borderColor: submitAttempted && !ticketName.trim() ? "rgba(244,63,94,0.55)" : "var(--border)" }}
                        required
                      />
                      {submitAttempted && !ticketName.trim() && (
                        <p className="mt-2 text-xs text-rose-600">Nome é obrigatório.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Tipo</label>
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface-2)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 ${
                          submitAttempted && !tipo ? "border-rose-400" : ""
                        }`}
                        style={{ borderColor: submitAttempted && !tipo ? "rgba(244,63,94,0.55)" : "var(--border)" }}
                        required
                        disabled={!projectId || tipoOptions.length === 0}
                      >
                        <option value="">
                          {!projectId
                            ? "Selecione o projeto"
                            : tipoOptions.length === 0
                              ? "Nenhuma atividade configurada para este projeto"
                              : "Selecione"}
                        </option>
                        {tipoOptions.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      {submitAttempted && !tipo && <p className="mt-2 text-xs text-rose-600">Tipo é obrigatório.</p>}
                      {projectId && tipoOptions.length === 0 && (
                        <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                          Nenhuma atividade foi habilitada para este projeto. Peça ao Super Admin para configurar em{" "}
                          <span className="font-semibold">Configurações → Atividades</span>.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Prioridade
                        {prioridadeObrigatoriaAms ? (
                          <span className="text-rose-600"> *</span>
                        ) : (
                          <span className="text-slate-400 font-normal"> (opcional)</span>
                        )}
                      </label>
                      <select
                        value={prioridade}
                        onChange={(e) => setPrioridade(e.target.value)}
                        className={`w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface-2)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 ${
                          submitAttempted && prioridadeObrigatoriaAms && !prioridade.trim()
                            ? "border-rose-400"
                            : ""
                        }`}
                        style={{
                          borderColor:
                            submitAttempted && prioridadeObrigatoriaAms && !prioridade.trim()
                              ? "rgba(244,63,94,0.55)"
                              : "var(--border)",
                        }}
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
                      {submitAttempted && prioridadeObrigatoriaAms && !prioridade.trim() && (
                        <p className="mt-2 text-xs text-rose-600">Prioridade é obrigatória em projetos AMS.</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Tópico (opcional)</label>
                      <select
                        value={topicId}
                        onChange={(e) => setTopicId(e.target.value)}
                        disabled={!projectId || topicsForSelect.length === 0}
                        className="w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface-2)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 disabled:opacity-70"
                        style={{ borderColor: "var(--border)" }}
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
                      <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5">Descrição</label>
                      <span className="text-xs text-[color:var(--muted-foreground)]">{description.length}/2000</span>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                      rows={6}
                      placeholder="Explique o que aconteceu, o que você esperava e (se possível) passos para reproduzir."
                      className={`w-full rounded-xl border px-4 py-3 text-sm bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 ${
                        submitAttempted && !description.trim() ? "border-rose-400" : ""
                      }`}
                      style={{ borderColor: submitAttempted && !description.trim() ? "rgba(244,63,94,0.55)" : "var(--border)" }}
                      required
                    />
                    {submitAttempted && !description.trim() && (
                      <p className="mt-2 text-xs text-rose-600">Descrição é obrigatória.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[color:var(--foreground)] uppercase tracking-wide">Anexos</h2>

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
                      dragging ? "border-[color:var(--primary)] bg-[color:var(--surface)]/60" : "border-[color:var(--border)] bg-[color:var(--surface-2)]"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] text-[color:var(--foreground)]">
                          <Paperclip className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[color:var(--foreground)]">Arraste e solte aqui</p>
                          <p className="text-xs text-[color:var(--muted-foreground)]">
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
                          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-95"
                          style={{
                            borderColor: "rgba(92,0,225,0.35)",
                            background: "rgba(0,0,0,0.02)",
                            color: "var(--foreground)",
                          }}
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
                            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                              <div className="h-12 w-12 shrink-0 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] overflow-hidden grid place-items-center">
                                {isImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={a.fileData} alt={a.fileName} className="h-full w-full object-cover" />
                                ) : a.fileType === "application/pdf" ? (
                                  <FileText className="h-6 w-6 text-[color:var(--muted-foreground)]" />
                                ) : (
                                  <ImageIcon className="h-6 w-6 text-[color:var(--muted-foreground)]" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-[color:var(--foreground)] truncate" title={a.fileName}>
                                  {a.fileName}
                                </div>
                                <div className="text-xs text-[color:var(--muted-foreground)]">
                                  {(a.fileSize / (1024 * 1024)).toFixed(1)} MB{a.uploaded ? " • enviado" : ""}
                                </div>
                              </div>
                              {!a.uploaded ? (
                                <button
                                  type="button"
                                  onClick={() => setAttachments((prev) => prev.filter((p) => p.id !== a.id))}
                                  className="rounded-lg px-3 py-1 text-sm font-semibold transition hover:opacity-90"
                                  style={{ color: "rgb(239 68 68)", background: "transparent" }}
                                >
                                  Remover
                                </button>
                              ) : (
                                <span
                                  className="text-xs font-semibold rounded-full px-2 py-1 border"
                                  style={{ color: "rgb(16 185 129)", borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)" }}
                                >
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

              <div className="border-t px-6 md:px-8 py-4 bg-[color:var(--surface)]/70 backdrop-blur" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-90"
                    style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit || !canUseForm}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-50 transition"
                    style={{ background: "var(--primary)" }}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {primaryLabel}
                  </button>
                </div>
                {!canUseForm && (
                  <p className="mt-2 text-xs" style={{ color: "rgb(245 158 11)" }}>
                    Sem acesso para abrir chamado neste perfil.
                  </p>
                )}
                {createdTicketId && pendingUploads > 0 && (
                  <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
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

