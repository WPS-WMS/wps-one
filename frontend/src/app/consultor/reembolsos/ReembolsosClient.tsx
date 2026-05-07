"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Loader2, Paperclip, Plus, X } from "lucide-react";

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

export function ReembolsosClient({ mode }: { mode: "user" | "admin" }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [types, setTypes] = useState<TypeLite[]>([]);
  const [myRequests, setMyRequests] = useState<Reimbursement[]>([]);

  const [projectOpen, setProjectOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);
  const typeAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [projectId, setProjectId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<IncomingAttachment[]>([]);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const canSubmit = useMemo(() => {
    return (
      projectId &&
      typeId &&
      (amountCents ?? 0) > 0 &&
      description.trim().length > 0 &&
      !submitting
    );
  }, [projectId, typeId, amountCents, description, submitting]);

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
      const r = await apiFetch(`/api/reimbursements/attachments/${att.id}/file`);
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
    <div className="space-y-4">
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
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Solicitar reembolso</h2>
            <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
              Preencha os dados e anexe comprovantes (JPG, PNG ou PDF).
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-[color:var(--muted-foreground)]">
            Projeto
            <div className="relative mt-1">
              <button
                type="button"
                ref={projectAnchorRef}
                onClick={() => {
                  setTypeOpen(false);
                  setProjectOpen((v) => !v);
                }}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={projectOpen}
              >
                <span className="truncate">
                  {projectId
                    ? (() => {
                        const p = projects.find((x) => x.id === projectId);
                        return p ? `${p.name}${p.client?.name ? ` — ${p.client.name}` : ""}` : "Selecione…";
                      })()
                    : "Selecione…"}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${projectOpen ? "rotate-180" : ""}`} />
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
                    Selecione…
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

          <label className="text-xs text-[color:var(--muted-foreground)]">
            Tipo de reembolso
            <div className="relative mt-1">
              <button
                type="button"
                ref={typeAnchorRef}
                onClick={() => {
                  setProjectOpen(false);
                  setTypeOpen((v) => !v);
                }}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={typeOpen}
              >
                <span className="truncate">
                  {typeId ? types.find((x) => x.id === typeId)?.name ?? "Selecione…" : "Selecione…"}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${typeOpen ? "rotate-180" : ""}`} />
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
                    Selecione…
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

          <label className="text-xs text-[color:var(--muted-foreground)]">
            Valor
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
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)]"
            />
          </label>

          <label className="text-xs text-[color:var(--muted-foreground)] md:col-span-2">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva brevemente o que foi realizado…"
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)]"
            />
          </label>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[color:var(--muted-foreground)]">Anexos</p>
              <label className="inline-flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 border border-[color:var(--border)] bg-[color:var(--background)]/40 hover:opacity-90 cursor-pointer">
                <Paperclip className="h-4 w-4" aria-hidden />
                Adicionar
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
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((a, idx) => (
                  <span
                    key={`${a.fileName}-${idx}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs"
                    title={a.fileName}
                  >
                    <span className="max-w-[220px] truncate text-[color:var(--foreground)]">{a.fileName}</span>
                    <button
                      type="button"
                      className="text-[color:var(--muted-foreground)] hover:opacity-80"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remover anexo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Enviar solicitação
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Minhas solicitações</h2>
        <div className="mt-3 space-y-2">
          {myRequests.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Você ainda não possui solicitações.</p>
          ) : (
            myRequests.map((r) => (
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
                    {new Date(r.createdAt).toLocaleDateString("pt-BR")}
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
