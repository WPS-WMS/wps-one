"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Loader2, Paperclip, Pencil, Plus, Trash2, X, RotateCcw } from "lucide-react";
import { ConfirmarExclusaoModal } from "@/components/ConfirmarExclusaoModal";

type ProjectLite = { id: string; name: string; client?: { id: string; name: string } };
type TypeLite = {
  id: string;
  name: string;
  isActive?: boolean;
  calcMode?: "FIXO" | "POR_UNIDADE";
  unit?: string | null;
  attachmentRequired?: boolean;
};
type AttachmentLite = { id: string; filename: string; fileType: string; fileSize: number; createdAt: string };

type ReimbursementStatus = "IN_PROGRESS" | "REJECTED" | "PAID";
type PaymentTo = "EMPRESA" | "CONSULTOR";

type Reimbursement = {
  id: string;
  projectId: string;
  typeId: string;
  amountCents: number;
  quantity?: string | number | null;
  unitValueCents?: number | null;
  description: string;
  paymentTo?: PaymentTo | null;
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

function isTypeAttachmentRequired(type: TypeLite | null | undefined): boolean {
  return type?.attachmentRequired === true;
}

function paymentToLabel(value: PaymentTo | string | null | undefined): string {
  if (value === "EMPRESA") return "Empresa";
  if (value === "CONSULTOR") return "Consultor";
  return "—";
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

/** Erros de política de limite: o aviso fica sob o campo Valor, não no banner superior. */
function shouldHideReimbursementTopError(message: string): boolean {
  const t = String(message || "").trim();
  if (!t) return false;
  return (
    /Este tipo está com limite zerado/i.test(t) ||
    /Este tipo ainda não está disponível para solicitação neste projeto/i.test(t) ||
    /^O valor ultrapassa o limite configurado/i.test(t)
  );
}

function todayYmdLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function firstOfMonthYmdLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Alinha com a API: mês calendário atual (fuso do navegador) e não posterior a hoje. */
function isExpenseYmdAllowed(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, mo, d] = ymd.split("-").map(Number);
  const n = new Date();
  const ty = n.getFullYear();
  const tm = n.getMonth() + 1;
  const td = n.getDate();
  if (y !== ty || mo !== tm) return false;
  const dim = new Date(ty, tm, 0).getDate();
  if (d < 1 || d > dim || d > td) return false;
  return true;
}

export function ReembolsosClient({ mode }: { mode: "user" | "admin" }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limitValueCents, setLimitValueCents] = useState<number | null>(null);
  const [maxUnitValueCents, setMaxUnitValueCents] = useState<number | null>(null);
  const [limitBlocked, setLimitBlocked] = useState(false);
  const [limitBlockReason, setLimitBlockReason] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [projectId, setProjectId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => todayYmdLocal());
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [unitValueCents, setUnitValueCents] = useState<number | null>(null);
  const [unitValueInput, setUnitValueInput] = useState("");
  const [description, setDescription] = useState("");
  const [paymentTo, setPaymentTo] = useState<PaymentTo | "">("");
  const [attachments, setAttachments] = useState<IncomingAttachment[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<AttachmentLite[]>([]);
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Reimbursement | null>(null);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);

  const attachmentPreviews = useMemo(() => {
    return attachments.map((a) => {
      const isImage = String(a.fileType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.fileName || "");
      return { ...a, isImage };
    });
  }, [attachments]);

  const isEditing = editingId != null;
  const formTitle = isEditing
    ? "Editar Reembolso"
    : mode === "admin"
      ? "Reembolso"
      : "Solicitar Reembolso";

  const selectedType = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const isUnitType = selectedType?.calcMode === "POR_UNIDADE";
  const attachmentRequiredForType = isTypeAttachmentRequired(selectedType);
  /** Taxa (R$/unidade) vem só de Limites por projeto; valor total = quantidade × taxa. */
  const projectUnitRateCents = isUnitType ? maxUnitValueCents : null;

  const computedTotalCents = useMemo(() => {
    if (!isUnitType) return amountCents;
    const q = quantity ?? 0;
    const rate = projectUnitRateCents ?? 0;
    if (q <= 0 || rate <= 0) return 0;
    return Math.round(q * rate);
  }, [isUnitType, quantity, projectUnitRateCents, amountCents]);

  const limitExceeded = useMemo(() => {
    if (isUnitType) return false;
    if (limitValueCents == null) return false;
    const v = amountCents ?? 0;
    return v > 0 && v > limitValueCents;
  }, [isUnitType, amountCents, limitValueCents]);

  const limitMessage = useMemo(() => {
    if (!limitExceeded) return null;
    if (!isUnitType && limitValueCents != null) {
      return `O valor ultrapassa o limite configurado (${formatBrlFromCents(limitValueCents)}).`;
    }
    return "O valor ultrapassa o limite configurado.";
  }, [limitExceeded, isUnitType, limitValueCents]);

  /** Limite FIXO = R$ 0,00 (bloqueado na API). */
  const zeroFixedLimitActive = useMemo(
    () => !isUnitType && limitBlocked && limitValueCents === 0,
    [isUnitType, limitBlocked, limitValueCents],
  );

  /** Sem linha de limite para o par projeto + tipo. */
  const noLimitRowActive = useMemo(
    () => !isUnitType && limitBlocked && limitValueCents == null && maxUnitValueCents == null,
    [isUnitType, limitBlocked, limitValueCents, maxUnitValueCents],
  );

  const noLimitRowUnitActive = useMemo(
    () => isUnitType && limitBlocked && limitValueCents == null && maxUnitValueCents == null,
    [isUnitType, limitBlocked, limitValueCents, maxUnitValueCents],
  );

  /** Limite por unidade = R$ 0,00. */
  const zeroUnitLimitActive = useMemo(
    () => isUnitType && limitBlocked && maxUnitValueCents === 0,
    [isUnitType, limitBlocked, maxUnitValueCents],
  );

  const totalAttachmentsCount = attachments.length + existingAttachments.length;

  const expenseDatePickerBounds = useMemo(() => {
    const n = new Date();
    return { min: firstOfMonthYmdLocal(n), max: todayYmdLocal() };
  }, []);

  const canSubmit = useMemo(() => {
    return (
      projectId &&
      typeId &&
      expenseDate &&
      isExpenseYmdAllowed(expenseDate) &&
      (isUnitType
        ? (quantity ?? 0) > 0 && projectUnitRateCents != null && projectUnitRateCents > 0
        : (amountCents ?? 0) > 0) &&
      description.trim().length > 0 &&
      (paymentTo === "EMPRESA" || paymentTo === "CONSULTOR") &&
      (!attachmentRequiredForType || totalAttachmentsCount > 0) &&
      !limitExceeded &&
      !limitBlocked &&
      !submitting
    );
  }, [
    projectId,
    typeId,
    expenseDate,
    isUnitType,
    quantity,
    projectUnitRateCents,
    amountCents,
    description,
    paymentTo,
    attachmentRequiredForType,
    totalAttachmentsCount,
    limitExceeded,
    limitBlocked,
    submitting,
  ]);

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

  const canReset = Boolean(
    projectId ||
      typeId ||
      (amountCents ?? 0) > 0 ||
      (expenseDate && expenseDate !== todayYmdLocal()) ||
      description.trim() ||
      attachments.length > 0 ||
      isEditing,
  );

  useEffect(() => {
    // Ao trocar tipo (fora de edição), limpa campos que não se aplicam.
    if (!typeId) return;
    if (isEditing) return;
    if (isUnitType) {
      setAmountCents(null);
      setAmountInput("");
    } else {
      setQuantity(null);
      setQuantityInput("");
      setUnitValueCents(null);
      setUnitValueInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, isUnitType, isEditing]);

  function resetForm() {
    setProjectId("");
    setTypeId("");
    setExpenseDate(todayYmdLocal());
    setAmountCents(null);
    setAmountInput("");
    setQuantityInput("");
    setQuantity(null);
    setUnitValueCents(null);
    setUnitValueInput("");
    setDescription("");
    setPaymentTo("");
    setAttachments([]);
    setError(null);
    setSuccess(null);
    setProjectOpen(false);
    setTypeOpen(false);
    setEditingId(null);
    setExistingAttachments([]);
    setRemoveAttachmentIds([]);
  }

  function startEdit(r: Reimbursement) {
    setError(null);
    setSuccess(null);
    setProjectId(r.projectId);
    setTypeId(r.typeId);
    setExpenseDate(r.expenseDate ? r.expenseDate.slice(0, 10) : "");
    setAmountCents(r.amountCents);
    setAmountInput(maskBrlInputFromCents(r.amountCents));
    const q = r.quantity == null ? null : Number(r.quantity);
    setQuantity(Number.isFinite(q as any) ? (q as number) : null);
    setQuantityInput(q == null || !Number.isFinite(q as any) ? "" : String(q));
    setUnitValueCents(typeof r.unitValueCents === "number" ? r.unitValueCents : null);
    setUnitValueInput(maskBrlInputFromCents(typeof r.unitValueCents === "number" ? r.unitValueCents : null));
    setDescription(r.description);
    const pt = r.paymentTo;
    setPaymentTo(pt === "EMPRESA" || pt === "CONSULTOR" ? pt : "");
    setAttachments([]);
    setExistingAttachments(r.attachments ?? []);
    setRemoveAttachmentIds([]);
    setEditingId(r.id);
    setProjectOpen(false);
    setTypeOpen(false);
    setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function cancelEdit() {
    resetForm();
  }

  function requestDelete(r: Reimbursement) {
    if (deletingId) return;
    setPendingDelete(r);
  }

  async function confirmDelete() {
    const r = pendingDelete;
    if (!r) return;
    setDeletingId(r.id);
    setError(null);
    setSuccess(null);
    try {
      const resp = await apiFetch(`/api/reimbursements/${encodeURIComponent(r.id)}`, { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || "Erro ao excluir solicitação.");
      }
      setSuccess("Solicitação excluída com sucesso.");
      if (editingId === r.id) resetForm();
      setPendingDelete(null);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Erro ao excluir solicitação.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    // Busca limite do projeto+tipo para validação client-side (valor unitário máximo)
    if (!projectId || !typeId) {
      setLimitValueCents(null);
      setMaxUnitValueCents(null);
      setLimitBlocked(false);
      setLimitBlockReason(null);
      return;
    }
    let cancelled = false;
    setLimitLoading(true);
    void apiFetch(`/api/reimbursements/limit?projectId=${encodeURIComponent(projectId)}&typeId=${encodeURIComponent(typeId)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          maxValueCents: number | null;
          maxUnitValueCents: number | null;
          solicitationBlocked?: boolean;
          blockReason?: string | null;
        };
      })
      .then((data) => {
        if (cancelled) return;
        setLimitValueCents(data?.maxValueCents ?? null);
        setMaxUnitValueCents(data?.maxUnitValueCents ?? null);
        setLimitBlocked(Boolean(data?.solicitationBlocked));
        setLimitBlockReason(data?.blockReason ?? null);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setLimitValueCents(null);
        setMaxUnitValueCents(null);
        setLimitBlocked(false);
        setLimitBlockReason(null);
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
      const typesRaw = await typesRes.json();
      setTypes(
        Array.isArray(typesRaw)
          ? typesRaw.map((t: TypeLite) => ({
              ...t,
              attachmentRequired: t?.attachmentRequired === true,
            }))
          : [],
      );
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
      const payloadBase: any = {
        projectId,
        typeId,
        expenseDate,
        description,
        paymentTo,
        attachments,
      };
      if (isUnitType) {
        payloadBase.quantity = quantity;
        payloadBase.unitValueCents = null;
        payloadBase.amountCents = computedTotalCents;
      } else {
        payloadBase.amountCents = amountCents;
      }

      if (editingId) {
        const r = await apiFetch(`/api/reimbursements/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadBase,
            removeAttachmentIds,
          }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string; details?: { message?: string; code?: string } } | null;
          const main = body?.error || "Erro ao atualizar solicitação.";
          const tech = [body?.details?.code, body?.details?.message].filter(Boolean).join(" — ");
          throw new Error(tech ? `${main} (${tech})` : main);
        }
        setSuccess("Solicitação atualizada com sucesso.");
      } else {
        const r = await apiFetch("/api/reimbursements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadBase),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string; details?: { message?: string; code?: string } } | null;
          const main = body?.error || "Erro ao enviar solicitação.";
          const tech = [body?.details?.code, body?.details?.message].filter(Boolean).join(" — ");
          throw new Error(tech ? `${main} (${tech})` : main);
        }
        setSuccess("Solicitação enviada com sucesso.");
      }
      resetForm();
      await reload();
    } catch (e: any) {
      const raw = String(e?.message || "").trim();
      const display = raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
      const isLimitPolicyError =
        /limite zerado/i.test(raw) ||
        /não está disponível para solicitação neste projeto/i.test(raw) ||
        /^O valor ultrapassa o limite configurado/i.test(raw);
      if (isLimitPolicyError) {
        setError(null);
      } else {
        setError(display || (editingId ? "Erro ao atualizar solicitação." : "Erro ao enviar solicitação."));
      }
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
      {error && !shouldHideReimbursementTopError(error) && (
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
      <div ref={formAnchorRef} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[color:var(--foreground)]">{formTitle}</h2>
              {isEditing && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                  Em edição
                </span>
              )}
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
              {isEditing
                ? "Altere os dados desta solicitação e clique em Salvar alterações."
                : attachmentRequiredForType
                  ? "Preencha os dados e anexe comprovantes (JPG, PNG ou PDF)."
                  : "Preencha os dados. Anexos são opcionais para este tipo (JPG, PNG ou PDF)."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
                title="Cancelar edição"
              >
                <X className="h-4 w-4" aria-hidden />
                Cancelar
              </button>
            )}
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
              min={expenseDatePickerBounds.min}
              max={expenseDatePickerBounds.max}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
            />
            <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">
              Apenas datas do mês atual, até hoje.
            </span>
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

          {!isUnitType ? (
            <label>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Valor</span>
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
              ) : zeroFixedLimitActive ? (
                <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">
                  O limite para este tipo neste projeto é R$ 0,00. Ajuste em Configurações → Reembolsos (Super Admin) ou entre em
                  contato com o administrador.
                </span>
              ) : noLimitRowActive && limitBlockReason ? (
                <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">{limitBlockReason}</span>
              ) : limitBlocked && limitBlockReason && !zeroFixedLimitActive ? (
                <span className="mt-1 block text-[11px] text-[color:var(--foreground)]">{limitBlockReason}</span>
              ) : limitValueCents != null ? (
                <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">Limite: {formatBrlFromCents(limitValueCents)}</span>
              ) : null}
            </label>
          ) : null}

          {isUnitType && (
            <>
              <label>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Quantidade</span>
                <input
                  value={quantityInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    setQuantityInput(next);
                    const normalized = next.trim().replace(",", ".");
                    const n = normalized ? Number(normalized) : NaN;
                    setQuantity(Number.isFinite(n) && n > 0 ? n : null);
                  }}
                  placeholder="Ex.: 120"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                />
              </label>
              <label>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Valor total</span>
                <input
                  value={maskBrlInputFromCents(computedTotalCents ?? 0)}
                  disabled
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-75"
                />
                {limitLoading ? (
                  <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">Verificando limite…</span>
                ) : limitMessage ? (
                  <span className="mt-1 block text-[11px] text-red-600 dark:text-red-300">{limitMessage}</span>
                ) : noLimitRowUnitActive && limitBlockReason ? (
                  <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">{limitBlockReason}</span>
                ) : zeroUnitLimitActive ? (
                  <span className="mt-1 block text-[11px] text-red-600 dark:text-red-300">
                    A taxa por unidade neste projeto está zerada (R$ 0,00). Ajuste em Configurações → Reembolsos ou entre em contato com
                    o administrador.
                  </span>
                ) : limitBlocked && limitBlockReason && !zeroUnitLimitActive ? (
                  <span className="mt-1 block text-[11px] text-[color:var(--foreground)]">{limitBlockReason}</span>
                ) : projectUnitRateCents != null && projectUnitRateCents > 0 ? (
                  <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]">
                    Usa a taxa configurada em Limites por projeto ({formatBrlFromCents(projectUnitRateCents)} por unidade) × quantidade.
                  </span>
                ) : (
                  <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-300">
                    Configure o valor por unidade em Limites por projeto (admin) para este projeto e tipo de reembolso.
                  </span>
                )}
              </label>
            </>
          )}

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


          <fieldset className="md:col-span-2">
            <legend className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-2">
              Pagamento para <span className="text-red-600">*</span>
            </legend>
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={paymentTo === "EMPRESA"}
                  onChange={() => setPaymentTo("EMPRESA")}
                  className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                />
                Empresa
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={paymentTo === "CONSULTOR"}
                  onChange={() => setPaymentTo("CONSULTOR")}
                  className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                />
                Consultor
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-[color:var(--muted-foreground)]">
              Indique quem receberá o pagamento deste reembolso (apenas uma opção).
            </p>
          </fieldset>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  {attachmentRequiredForType ? (
                    <>
                      Anexos <span className="text-red-600">*</span>
                    </>
                  ) : (
                    <span className="text-[color:var(--foreground)]">Anexos (opcional)</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)]">
                  {attachmentRequiredForType
                    ? "Comprovante obrigatório para este tipo (até 10 arquivos). JPG, PNG ou PDF."
                    : "Opcional para este tipo (até 10 arquivos). JPG, PNG ou PDF."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 border border-[color:var(--border)] bg-[color:var(--background)]/40 hover:opacity-90 cursor-pointer"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Anexar
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                onChange={(e) => {
                  const files = e.target.files;
                  void handleFiles(files);
                  if (e.target) e.target.value = "";
                }}
                className="sr-only"
                aria-hidden
                tabIndex={-1}
              />
            </div>

            {(existingAttachments.length > 0 || attachments.length > 0) && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {existingAttachments.map((a) => {
                  const isImage = String(a.fileType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.filename || "");
                  return (
                    <div
                      key={`existing-${a.id}`}
                      className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]"
                      title={a.filename}
                    >
                      <button
                        type="button"
                        onClick={() => void downloadAttachment(a)}
                        className="block w-full text-left"
                        title="Baixar anexo"
                      >
                        <div className="h-24 w-full flex items-center justify-center text-xs text-[color:var(--muted-foreground)] bg-[color:var(--background)]/40">
                          {isImage ? "Imagem" : "PDF"}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExistingAttachments((prev) => prev.filter((x) => x.id !== a.id));
                          setRemoveAttachmentIds((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
                        }}
                        aria-label="Remover anexo"
                        title="Remover"
                        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/55"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="px-2 py-1">
                        <p className="text-[11px] text-[color:var(--foreground)] truncate">{a.filename}</p>
                      </div>
                    </div>
                  );
                })}
                {attachmentPreviews.map((a, idx) => (
                  <div
                    key={`new-${a.fileName}-${idx}`}
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
            {totalAttachmentsCount === 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--background)]/20 px-4 py-5">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Nenhum anexo adicionado</p>
                {attachmentRequiredForType ? (
                  <>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      O anexo é obrigatório para este tipo. Clique em <span className="font-semibold">Anexar</span> para
                      adicionar comprovantes.
                    </p>
                    <p className="mt-2 text-[11px] text-red-600 dark:text-red-300">
                      Anexo é obrigatório para enviar a solicitação.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    Anexo opcional para este tipo. Você pode enviar sem comprovante ou clicar em{" "}
                    <span className="font-semibold">Anexar</span>.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-[color:var(--muted-foreground)]">
            {totalAttachmentsCount > 0 ? (
              <span>{totalAttachmentsCount} anexo(s) {isEditing ? "vinculado(s)" : "pronto(s) para envio"}.</span>
            ) : attachmentRequiredForType ? (
              <span>Adicione pelo menos 1 anexo para habilitar o envio.</span>
            ) : (
              <span>Nenhum anexo — você pode enviar assim para este tipo.</span>
            )}
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 w-full sm:w-auto"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isEditing ? "Salvar alterações" : "Enviar solicitação"}
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
            myRequestsThisMonth.map((r) => {
              const canModify = r.status === "IN_PROGRESS";
              const isBeingEdited = editingId === r.id;
              const isBeingDeleted = deletingId === r.id;
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 transition ${
                    isBeingEdited
                      ? "border-amber-300 bg-amber-50/60 dark:border-amber-700/60 dark:bg-amber-950/20"
                      : "border-[color:var(--border)] bg-[color:var(--background)]/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[color:var(--foreground)] truncate">
                        {r.type?.name || "Tipo"} • {formatBrlFromCents(r.amountCents)}
                      </p>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        {r.project?.name}{r.project?.client?.name ? ` — ${r.project.client.name}` : ""} • {statusLabel(r.status)}
                      </p>
                      <p className="text-xs text-[color:var(--foreground)]/85 mt-1">{r.description}</p>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        Pagamento para: {paymentToLabel(r.paymentTo)}
                      </p>
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
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--muted-foreground)]">
                        {formatExpenseDate(r.expenseDate) || new Date(r.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                      {canModify && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            disabled={submitting || isBeingDeleted}
                            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Editar solicitação"
                            aria-label="Editar solicitação"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(r)}
                            disabled={submitting || isBeingDeleted}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-800/60 px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Excluir solicitação"
                            aria-label="Excluir solicitação"
                          >
                            {isBeingDeleted ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmarExclusaoModal
          userName={`esta solicitação de ${formatBrlFromCents(pendingDelete.amountCents)} (${pendingDelete.type?.name || "reembolso"})`}
          onClose={() => {
            if (deletingId) return;
            setPendingDelete(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
