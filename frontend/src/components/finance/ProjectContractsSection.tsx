"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, History, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { formatarData } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ContractTypeOption = { id: string; name: string; isActive: boolean };

type ContractRow = {
  id: string;
  projectId: string;
  title: string;
  contractTypeId: string | null;
  contractTypeName: string | null;
  vigencyStart: string | null;
  vigencyEnd: string | null;
  slaDays: number | null;
  readjustmentMonths: number | null;
  attachmentsCount: number;
  historyCount: number;
};

type HistoryRow = {
  id: string;
  action: string;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type AttachmentRow = {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type ContractFormState = {
  title: string;
  contractTypeId: string;
  vigencyStart: string;
  vigencyEnd: string;
  slaDays: string;
  readjustmentMonths: string;
};

const emptyForm = (): ContractFormState => ({
  title: "",
  contractTypeId: "",
  vigencyStart: "",
  vigencyEnd: "",
  slaDays: "",
  readjustmentMonths: "",
});

type ProjectContractsSectionProps = {
  projectId: string;
};

export function ProjectContractsSection({ projectId }: ProjectContractsSectionProps) {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.projetos.contratos"), [can]);

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ctRes, cRes] = await Promise.all([
        apiFetch("/api/contract-types"),
        apiFetch(`/api/project-contracts?projectId=${encodeURIComponent(projectId)}`),
      ]);
      const ctBody = await ctRes.json().catch(() => null);
      const cBody = await cRes.json().catch(() => null);
      if (!cRes.ok) {
        throw new Error(typeof cBody?.error === "string" ? cBody.error : "Erro ao carregar contratos.");
      }
      setContracts(Array.isArray(cBody) ? cBody : []);
      setContractTypes(
        ctRes.ok && Array.isArray(ctBody) ? ctBody.filter((t: ContractTypeOption) => t.isActive) : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar contratos.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditModal(row: ContractRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      contractTypeId: row.contractTypeId ?? "",
      vigencyStart: row.vigencyStart ? row.vigencyStart.slice(0, 10) : "",
      vigencyEnd: row.vigencyEnd ? row.vigencyEnd.slice(0, 10) : "",
      slaDays: row.slaDays != null ? String(row.slaDays) : "",
      readjustmentMonths: row.readjustmentMonths != null ? String(row.readjustmentMonths) : "",
    });
    setModalOpen(true);
  }

  async function saveContract() {
    if (!form.title.trim()) {
      setError("Título do contrato é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      contractTypeId: form.contractTypeId || null,
      vigencyStart: form.vigencyStart || null,
      vigencyEnd: form.vigencyEnd || null,
      slaDays: form.slaDays !== "" ? Number(form.slaDays) : null,
      readjustmentMonths: form.readjustmentMonths !== "" ? Number(form.readjustmentMonths) : null,
    };
    const url = editingId ? `/api/project-contracts/${editingId}` : "/api/project-contracts";
    const method = editingId ? "PATCH" : "POST";
    if (!editingId) payload.projectId = projectId;
    const r = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar contrato.");
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function deleteContract(id: string) {
    if (!window.confirm("Excluir este contrato?")) return;
    const r = await apiFetch(`/api/project-contracts/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir contrato.");
      return;
    }
    await load();
  }

  async function openHistory(contractId: string) {
    setHistoryOpen(contractId);
    setHistoryLoading(true);
    const r = await apiFetch(`/api/project-contracts/${contractId}/history`);
    const body = await r.json().catch(() => null);
    setHistoryRows(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  async function openAttachments(contractId: string) {
    setAttachmentsOpen(contractId);
    setAttachmentsLoading(true);
    const r = await apiFetch(`/api/project-contracts/${contractId}/attachments`);
    const body = await r.json().catch(() => null);
    setAttachments(r.ok && Array.isArray(body) ? body : []);
    setAttachmentsLoading(false);
  }

  async function handleUpload(file: File) {
    if (!attachmentsOpen) return;
    setUploading(true);
    setError(null);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const r = await apiFetch(`/api/project-contracts/${attachmentsOpen}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileData,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro no upload.");
      }
      await openAttachments(attachmentsOpen);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(att: AttachmentRow) {
    if (!attachmentsOpen) return;
    const res = await apiFetchBlob(
      `/api/project-contracts/${attachmentsOpen}/attachments/${att.id}/file`,
    );
    if (!res.ok) {
      setError("Não foi possível baixar o anexo.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeAttachment(att: AttachmentRow) {
    if (!attachmentsOpen) return;
    if (!window.confirm(`Remover anexo "${att.filename}"?`)) return;
    const r = await apiFetch(
      `/api/project-contracts/${attachmentsOpen}/attachments/${att.id}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao remover anexo.");
      return;
    }
    await openAttachments(attachmentsOpen);
    await load();
  }

  if (!permissionsReady) return null;
  if (!canAccess) return null;

  return (
    <>
      <section
        className="rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Contratos do projeto
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Vigência, SLA, reajuste e anexos dos contratos vinculados ao projeto.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Novo contrato
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Carregando contratos...</p>
        ) : contracts.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Nenhum contrato cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Título</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold">Vigência</th>
                  <th className="px-3 py-2 text-right font-semibold">SLA (dias)</th>
                  <th className="px-3 py-2 text-right font-semibold">Reajuste (meses)</th>
                  <th className="px-3 py-2 text-center font-semibold">Anexos</th>
                  <th className="px-3 py-2 text-left font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2">{row.contractTypeName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {formatarData(row.vigencyStart)} — {formatarData(row.vigencyEnd)}
                    </td>
                    <td className="px-3 py-2 text-right">{row.slaDays ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{row.readjustmentMonths ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => void openAttachments(row.id)}
                        className="inline-flex items-center gap-1 text-[color:var(--primary)] hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {row.attachmentsCount}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openEditModal(row)} className="text-[color:var(--primary)] hover:underline">
                          <Pencil className="h-3.5 w-3.5 inline" />
                        </button>
                        <button type="button" onClick={() => void openHistory(row.id)} className="text-[color:var(--muted-foreground)] hover:underline">
                          <History className="h-3.5 w-3.5 inline" />
                        </button>
                        <button type="button" onClick={() => void deleteContract(row.id)} className="text-red-600 hover:underline">
                          <Trash2 className="h-3.5 w-3.5 inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editingId ? "Editar contrato" : "Novo contrato"}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Título</label>
                <input className={formModalInputClass()} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Tipo de contrato</label>
                <select className={formModalInputClass()} value={form.contractTypeId} onChange={(e) => setForm((f) => ({ ...f, contractTypeId: e.target.value }))}>
                  <option value="">—</option>
                  {contractTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Início da vigência</label>
                  <input type="date" className={formModalInputClass()} value={form.vigencyStart} onChange={(e) => setForm((f) => ({ ...f, vigencyStart: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Fim da vigência</label>
                  <input type="date" className={formModalInputClass()} value={form.vigencyEnd} onChange={(e) => setForm((f) => ({ ...f, vigencyEnd: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>SLA (dias)</label>
                  <input type="number" min={0} className={formModalInputClass()} value={form.slaDays} onChange={(e) => setForm((f) => ({ ...f, slaDays: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Reajuste (meses)</label>
                  <input type="number" min={0} className={formModalInputClass()} value={form.readjustmentMonths} onChange={(e) => setForm((f) => ({ ...f, readjustmentMonths: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Cancelar</button>
              <button type="button" onClick={() => void saveContract()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Histórico do contrato</h3>
              <button type="button" onClick={() => setHistoryOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            {historyLoading ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Carregando...</p>
            ) : historyRows.length === 0 ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Sem registros.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {historyRows.map((h) => (
                  <li key={h.id} className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                    <p className="font-medium">{h.user.name} · {formatarData(h.createdAt)}</p>
                    {h.details && <p className="mt-1 text-[color:var(--muted-foreground)]">{h.details}</p>}
                    {h.fieldLabel && (
                      <p className="mt-1">
                        {h.fieldLabel}: {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {attachmentsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Anexos do contrato</h3>
              <button type="button" onClick={() => setAttachmentsOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
                style={{ borderColor: "var(--border)" }}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Enviar anexo
              </button>
            </div>
            {attachmentsLoading ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Carregando...</p>
            ) : attachments.length === 0 ? (
              <p className="mt-4 text-xs text-[color:var(--muted-foreground)]">Nenhum anexo.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {attachments.map((att) => (
                  <li key={att.id} className="flex items-center justify-between rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <p className="font-medium">{att.filename}</p>
                      <p className="text-[color:var(--muted-foreground)]">{att.user.name} · {formatarData(att.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void downloadAttachment(att)} className="text-[color:var(--primary)] hover:underline">
                        <Download className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void removeAttachment(att)} className="text-red-600 hover:underline">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
