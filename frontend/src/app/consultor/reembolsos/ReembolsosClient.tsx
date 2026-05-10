"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Loader2, Paperclip, Plus, X, RotateCcw } from "lucide-react";

type ProjectLite = { id: string; name: string; client?: { id: string; name: string } };
type TypeLite = { id: string; name: string; isActive?: boolean };
type AttachmentLite = { id: string; filename: string; fileType: string; fileSize: number; createdAt: string };

type ReimbursementStatus = "IN_PROGRESS" | "REJECTED" | "PAID";

type Reimbursement = {
  id: string;
  projectId: string;
  typeId: string;
  amountCents: number;
  description: string;
  status: ReimbursementStatus;
  rejectionReason?: string | null;
  expenseDate?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  paidAt?: string | null;
  user?: { id: string; name: string; email: string };
  project?: ProjectLite;
  type?: { id: string; name: string };
  attachments?: AttachmentLite[];
};

type IncomingAttachment = {
  fileName: string;
  fileData: string;
  fileType: string;
  fileSize: number;
};

function formatBrlFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function centsFromMaskedInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function maskBrlInputFromCents(cents: number | null): string {
  if (cents == null) return "";
  return formatBrlFromCents(cents);
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Falha ao ler arquivo."));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
}

function statusLabel(s: ReimbursementStatus) {
  if (s === "IN_PROGRESS") return "Em andamento";
  if (s === "REJECTED") return "Rejeitado";
  return "Pago";
}

function formatExpenseDate(value?: string | null): string {
  if (!value) return "";
  const ymd = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

export function ReembolsosClient({ mode }: { mode: "user" | "admin" }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limitCents, setLimitCents] = useState<number | null>(null);
  const [limitLoading, setLimitLoading] = useState(false);

  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [types, setTypes] = useState<TypeLite[]>([]);
  const [myRequests, setMyRequests] = useState<Reimbursement[]>([]);

  const myRequestsThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return myRequests.filter((r) => {
      const d = new Date(r.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [myRequests]);

  const [projectOpen, setProjectOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);
  const typeAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [projectId, setProjectId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<IncomingAttachment[]>([]);

  const attachmentPreviews = useMemo(() => {
    return attachments.map((a) => {
      const isImage = String(a.fileType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.fileName || "");
      return { ...a, isImage };
    });
  }, [attachments]);

  const formTitle = mode === "admin" ? "Reembolso" : "Solicitar Reembolso";

  const limitExceeded = useMemo(() => {
    if (limitCents == null) return false;
    const v = amountCents ?? 0;
    return v > 0 && v > limitCents;
  }, [amountCents, limitCents]);

  const limitMessage = useMemo(() => {
    if (!limitExceeded || limitCents == null) return null;
    return `O valor ultrapassa o limite configurado (${formatBrlFromCents(limitCents)}).`;
  }, [limitExceeded, limitCents]);

  const canSubmit = useMemo(() => {
    return (
      projectId &&
      typeId &&
      expenseDate &&
      (amountCents ?? 0) > 0 &&
      description.trim().length > 0 &&
      attachments.length > 0 &&
      !limitExceeded &&
      !submitting
    );
  }, [projectId, typeId, expenseDate, amountCents, description, attachments.length, limitExceeded, submitting]);

  const projectLabel = useMemo(() => {
    if (!projectId) return "Selecione um projeto…";
    const p = projects.find((x) => x.id === projectId);
    if (!p) return "Selecione um projeto…";
    return `${p.name}${p.client?.name ? ` — ${p.client.name}` : ""}`;
  }, [projectId, projects]);

  const typeLabel = useMemo(() => {
    if (!typeId) return "Selecione um tipo…";
    const t = types.find((x) => x.id === typeId);
    return t?.name ?? "Selecione um tipo…";
  }, [typeId, types]);

  const canReset = Boolean(projectId || typeId || (amountCents ?? 0) > 0 || description.trim() || attachments.length > 0);

  function resetForm() {
    setProjectId("");
    setTypeId("");
    setExpenseDate("");
    setAmountCents(null);
    setAmountInput("");
    setDescription("");
    setAttachments([]);
    setError(null);
    setSuccess(null);
    setProjectOpen(false);
    setTypeOpen(false);
  }

  useEffect(() => {
    // Busca limite do projeto+tipo para validação client-side
    if (!projectId || !typeId) {
      setLimitCents(null);
      return;
    }
    let cancelled = false;
    setLimitLoading(true);
    void apiFetch(`/api/reimbursements/limit?projectId=${encodeURIComponent(projectId)}&typeId=${encodeURIComponent(typeId)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { maxValueCents: number | null };
      })
      .then((data) => {
        if (cancelled) return;
        setLimitCents(data?.maxValueCents ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLimitCents(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLimitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, typeId]);

  async function reload() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const [typesRes, projRes, myRes] = await Promise.all([
        apiFetch("/api/reimbursements/types"),
        apiFetch("/api/reimbursements/eligible-projects"),
        apiFetch("/api/reimbursements/my"),
      ]);
      if (!typesRes.ok) throw new Error("Falha ao carregar tipos.");
      if (!projRes.ok) throw new Error("Falha ao carregar projetos.");
      if (!myRes.ok) throw new Error("Falha ao carregar solicitações.");
      setTypes(await typesRes.json());
      setProjects(await projRes.json());
      setMyRequests(await myRes.json());
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const p = projectAnchorRef.current?.parentElement;
      const t = typeAnchorRef.current?.parentElement;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (p && p.contains(target)) return;
      if (t && t.contains(target)) return;
      setProjectOpen(false);
      setTypeOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setProjectOpen(false);
      setTypeOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files).slice(0, 10);
    try {
      const mapped = await Promise.all(
        list.map(async (f) => ({
          fileName: f.name,
          fileData: await fileToDataUrl(f),
          fileType: f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : ""),
          fileSize: f.size,
        })),
      );
      setAttachments((prev) => [...prev, ...mapped].slice(0, 10));
    } catch {
      setError("Não foi possível anexar um ou mais arquivos.");
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await apiFetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          typeId,
          expenseDate,
          amountCents,
          description,
          attachments,
        }),
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => null);
        throw new Error(msg?.error || "Erro ao enviar solicitação.");
      }
      setSuccess("Solicitação enviada com sucesso.");
      setProjectId("");
      setTypeId("");
      setExpenseDate("");
      setAmountCents(null);
      setAmountInput("");
      setDescription("");
      setAttachments([]);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Erro ao enviar solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadAttachment(att: AttachmentLite) {
    try {
      const r = await apiFetchBlob(`/api/reimbursements/attachments/${att.id}/file`);
      if (!r.ok) throw new Error("Falha ao baixar anexo.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename || "anexo";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Não foi possível baixar o anexo.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] py-10">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {error && (
        <div className="wps-apontamento-consultor-error rounded-xl border px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {success}
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[color:var(--foreground)]">{formTitle}</h2>
            <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
              Preencha os dados e anexe comprovantes (JPG, PNG ou PDF).
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            disabled={!canReset || submitting}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
            title="Limpar formulário"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Limpar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
              Projeto
            </span>
            <div className="relative">
              <button
                type="button"
                ref={projectAnchorRef}
                onClick={() => {
                  setTypeOpen(false);
                  setProjectOpen((v) => !v);
                }}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-3 pr-10 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={projectOpen}
                title={projectLabel}
              >
                <span className="truncate">{projectLabel}</span>
                <ChevronDown
                  className={`absolute right-3 h-4 w-4 transition-transform ${projectOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--muted-foreground)" }}
                  aria-hidden
                />
              </button>
              {projectOpen && (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-[color:var(--sidebar-item-hover)]"
                    onClick={() => {
                      setProjectId("");
                      setProjectOpen(false);
                    }}
                  >
                    Selecione um projeto…
                  </button>
                  <div className="max-h-72 overflow-auto">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-[color:var(--sidebar-item-hover)]"
                        onClick={() => {
                          setProjectId(p.id);
                          setProjectOpen(false);
                        }}
                        title={p.name}
                      >
                        {p.name}
                        {p.client?.name ? (
                          <span className="text-[color:var(--muted-foreground)]">{` — ${p.client.name}`}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </label>

          <label>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
              Data da despesa
            </span>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
            />
          </label>

          <label>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
              Tipo de reembolso
            </span>
            <div className="relative">
              <button
                type="button"
                ref={typeAnchorRef}
                onClick={() => {
                  setProjectOpen(false);
                  setTypeOpen((v) => !v);
                }}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-3 pr-10 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={typeOpen}
                title={typeLabel}
              >
                <span className="truncate">{typeLabel}</span>
                <ChevronDown
                  className={`absolute right-3 h-4 w-4 transition-transform ${typeOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--muted-foreground)" }}
                  aria-hidden
                />
              </button>
              {typeOpen && (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-[color:var(--sidebar-item-hover)]"
                    onClick={() => {
                      setTypeId("");
                      setTypeOpen(false);
                    }}
                  >
                    Selecione um tipo…
                  </button>
                  <div className="max-h-72 overflow-auto">
                    {types.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-[color:var(--sidebar-item-hover)]"
                        onClick={() => {
                          setTypeId(t.id);
                          setTypeOpen(false);
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </label>

          <label>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
              Valor
            </span>
            <input
              value={amountInput}
              onChange={(e) => {
                const next = e.target.value;
                const cents = centsFromMaskedInput(next);
                setAmountCents(cents);
                setAmountInput(maskBrlInputFromCents(cents));
              }}
              placeholder="R$ 0,00"
              inputMode="numeric"
              className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
            />
            {limitLoading ? (
              <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">Verificando limite…</span>
            ) : limitMessage ? (
              <span className="mt-1 block text-[11px] text-red-600 dark:text-red-300">{limitMessage}</span>
            ) : limitCents != null ? (
              <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">
                Limite: {formatBrlFromCents(limitCents)}
              </span>
            ) : null}
          </label>

          <label className="md:col-span-2">
            <span className="flex items-center justify-between gap-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                Descrição
              </span>
              <span className="text-[11px] text-[color:var(--muted-foreground)]">
                {description.trim().length > 0 ? `${description.trim().length}/200` : ""}
              </span>
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do reembolso..."
              maxLength={200}
              className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
            />
          </label>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Anexos <span className="text-red-600">*</span>
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)]">
                  Envie comprovantes (até 10 arquivos). JPG, PNG ou PDF.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 border border-[color:var(--border)] bg-[color:var(--background)]/40 hover:opacity-90 cursor-pointer">
                <Paperclip className="h-4 w-4" aria-hidden />
                Anexar
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {attachmentPreviews.map((a, idx) => (
                  <div
                    key={`${a.fileName}-${idx}`}
                    className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]"
                    title={a.fileName}
                  >
                    {a.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.fileData}
                        alt={a.fileName}
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="h-24 w-full flex items-center justify-center text-xs text-[color:var(--muted-foreground)]">
                        PDF
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remover anexo"
                      title="Remover"
                      className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/55"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="px-2 py-1">
                      <p className="text-[11px] text-[color:var(--foreground)] truncate">{a.fileName}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {attachments.length === 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--background)]/20 px-4 py-5">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Nenhum anexo adicionado</p>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  O anexo é obrigatório. Clique em <span className="font-semibold">Anexar</span> para adicionar comprovantes.
                </p>
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-300">Anexo é obrigatório para enviar a solicitação.</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-[color:var(--muted-foreground)]">
            {attachments.length > 0 ? (
              <span>{attachments.length} anexo(s) pronto(s) para envio.</span>
            ) : (
              <span>Adicione pelo menos 1 anexo para habilitar o envio.</span>
            )}
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 w-full sm:w-auto"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Enviar solicitação
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[color:var(--foreground)]">Minhas solicitações</h2>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs font-semibold rounded-xl px-3 py-2 border border-[color:var(--border)] hover:opacity-90"
            style={{ background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
            title="Atualizar"
          >
            Atualizar
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {myRequestsThisMonth.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Você ainda não possui solicitações.</p>
          ) : (
            myRequestsThisMonth.map((r) => (
              <div key={r.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/20 p-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[color:var(--foreground)] truncate">
                      {r.type?.name || "Tipo"} • {formatBrlFromCents(r.amountCents)}
                    </p>
                    <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                      {r.project?.name}{r.project?.client?.name ? ` — ${r.project.client.name}` : ""} • {statusLabel(r.status)}
                    </p>
                    <p className="text-xs text-[color:var(--foreground)]/85 mt-1">{r.description}</p>
                    {r.status === "REJECTED" && r.rejectionReason && (
                      <p className="text-xs text-red-600 dark:text-red-300 mt-1">Motivo: {r.rejectionReason}</p>
                    )}
                    {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.attachments.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => void downloadAttachment(a)}
                            className="text-xs rounded-lg border border-[color:var(--border)] px-2 py-1 hover:opacity-90"
                            title="Baixar anexo"
                          >
                            {a.filename}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--muted-foreground)] shrink-0">
                    {formatExpenseDate(r.expenseDate) || new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
