"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Trash2, Upload } from "lucide-react";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";

export type PortalPdfItem = {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata?: unknown;
};

function assetUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("data:")) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/")) return `${API_BASE_URL}${p}`;
  return `${API_BASE_URL}/${p}`;
}

/** Itens exibidos nas telas de biblioteca: PDF em `content` ou link para .pdf. */
export function isPdfLibraryRow(item: PortalPdfItem): boolean {
  const t = String(item.type || "").toLowerCase();
  if (t === "inspiration" || t === "image") return false;
  const c = String(item.content || "").trim();
  if (!c) return false;
  if (t === "pdf" || t === "file") return true;
  if (t === "link" && /\.pdf(\?|$)/i.test(c)) return true;
  if (/\/uploads\/portal\/.+\.pdf(\?|$)/i.test(c)) return true;
  return false;
}

function clickOpenInNewTab(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function openPdfUrlInNewTab(rawUrl: string): boolean {
  const href = assetUrl(rawUrl);
  if (!href) return false;

  if (href.startsWith("data:application/pdf") || href.startsWith("data:application/octet-stream")) {
    try {
      const comma = href.indexOf(",");
      if (comma === -1) return false;
      const meta = href.slice(0, comma);
      const base64 = href.slice(comma + 1);
      const mime = meta.match(/^data:([^;]+);base64$/i)?.[1] || "application/pdf";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      clickOpenInNewTab(blobUrl);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return true;
    } catch {
      return false;
    }
  }

  clickOpenInNewTab(href);
  return true;
}

async function uploadPortalMedia(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Leitura do arquivo falhou."));
    r.readAsDataURL(file);
  });
  const res = await apiFetch("/api/portal/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileData: dataUrl,
      fileType: file.type || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload falhou.");
  const fileUrl = data?.fileUrl as string | undefined;
  if (!fileUrl) throw new Error("Resposta sem URL do arquivo.");
  return fileUrl;
}

type Props = {
  title: string;
  description?: string;
  sectionId: string | undefined;
  items: PortalPdfItem[];
  canEdit: boolean;
  onRefresh: () => void | Promise<void>;
};

export function PortalPdfLibrary({ title, description, sectionId, items, canEdit, onRefresh }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PortalPdfItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const pdfItems = useMemo(() => items.filter(isPdfLibraryRow), [items]);

  useEffect(() => {
    setTitleDrafts((prev) => {
      const next = { ...prev };
      const ids = new Set(pdfItems.map((i) => i.id));
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      for (const it of pdfItems) {
        if (next[it.id] === undefined) next[it.id] = String(it.title || "").trim();
      }
      return next;
    });
  }, [pdfItems]);

  const runRefresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const handleAddPdf = useCallback(async () => {
    if (!sectionId) {
      setError("Seção não encontrada.");
      return;
    }
    const name = newName.trim();
    if (!name) {
      setError("Informe o nome do documento.");
      return;
    }
    if (!newFile) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fileUrl = await uploadPortalMedia(newFile);
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title: name,
          content: fileUrl,
          type: "pdf",
          metadata: null,
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao criar item.");
      setNewName("");
      setNewFile(null);
      setModalOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await runRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }, [sectionId, newName, newFile, runRefresh]);

  const saveTitle = useCallback(
    async (item: PortalPdfItem) => {
      const t = (titleDrafts[item.id] ?? "").trim();
      if (!t) {
        setError("O nome não pode ficar vazio.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/portal/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t }),
        });
        const errBody = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar nome.");
        await runRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar.");
      } finally {
        setSaving(false);
      }
    },
    [titleDrafts, runRefresh],
  );

  const replacePdf = useCallback(
    async (item: PortalPdfItem, file: File) => {
      setSaving(true);
      setError(null);
      try {
        const fileUrl = await uploadPortalMedia(file);
        const res = await apiFetch(`/api/portal/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fileUrl, type: "pdf" }),
        });
        const errBody = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errBody?.error || "Erro ao substituir PDF.");
        setReplaceId(null);
        if (replaceInputRef.current) replaceInputRef.current.value = "";
        await runRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao substituir.");
      } finally {
        setSaving(false);
      }
    },
    [runRefresh],
  );

  const removeItem = useCallback(
    async (item: PortalPdfItem) => {
      setError(null);
      try {
        const res = await apiFetch(`/api/portal/items/${item.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || "Erro ao excluir.");
        }
        setConfirmDelete(null);
        await runRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao excluir.");
      }
    },
    [runRefresh],
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-sky-300" />
          <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h2>
        </div>
        {canEdit && sectionId && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-500/25 px-3 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/35"
          >
            <Plus className="h-3.5 w-3.5" />
            Anexar PDF
          </button>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">
        {description && <p className="mb-3 text-xs text-slate-400">{description}</p>}
        {!sectionId && (
          <p className="text-sm text-amber-200/90">Esta seção ainda não existe neste ambiente. Peça ao administrador para executar &quot;Criar seções padrão&quot;.</p>
        )}
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <input
          ref={replaceInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const id = replaceId;
            if (!f || !id) return;
            const it = pdfItems.find((x) => x.id === id);
            if (it) void replacePdf(it, f);
          }}
        />

        {pdfItems.length === 0 ? (
          <p className="text-center text-sm text-slate-500">Nenhum PDF publicado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {pdfItems.map((it) => (
              <li
                key={it.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  {canEdit ? (
                    <input
                      type="text"
                      value={titleDrafts[it.id] ?? it.title}
                      onChange={(e) => setTitleDrafts((p) => ({ ...p, [it.id]: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
                      placeholder="Nome do documento"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPdfUrlInNewTab(it.content)}
                      className="w-full text-left text-sm font-medium text-sky-200 underline-offset-2 hover:text-white hover:underline"
                    >
                      {it.title || "Documento"}
                    </button>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveTitle(it)}
                      className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      Salvar nome
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setReplaceId(it.id);
                        replaceInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      <Upload className="h-3 w-3" />
                      Substituir PDF
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setConfirmDelete(it)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Excluir
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && canEdit && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModalOpen(false);
              setError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            role="dialog"
            aria-modal
            aria-labelledby="pdf-lib-modal-title"
          >
            <h3 id="pdf-lib-modal-title" className="mb-3 text-lg font-bold text-white">
              Anexar PDF
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome exibido na lista"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleAddPdf()}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setModalOpen(false);
                    setNewName("");
                    setNewFile(null);
                    setError(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir documento"
          message={`Excluir permanentemente "${confirmDelete.title}"? O arquivo será removido do servidor.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => void removeItem(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </section>
  );
}
