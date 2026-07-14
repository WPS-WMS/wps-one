"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Check, ChevronDown, Loader2, Plus, Receipt, X, Pencil, Save } from "lucide-react";
import { navigateBack } from "@/lib/navigateBack";
import {
  formModalBackdropClass,
  formModalInputClass,
  formModalLabelClass,
  formModalPanelNarrowClass,
} from "@/components/FormModalPrimitives";

type ProjectLite = { id: string; name: string; client?: { id: string; name: string } };
type TypeLite = {
  id: string;
  name: string;
  isActive: boolean;
  calcMode: "FIXO" | "POR_UNIDADE";
  unit?: string | null;
  attachmentRequired?: boolean;
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

function CalcModeCheckboxes({
  value,
  onChange,
  idPrefix,
}: {
  value: "FIXO" | "POR_UNIDADE";
  onChange: (mode: "FIXO" | "POR_UNIDADE") => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2 pt-3" role="group" aria-label="Modo de cálculo">
      <span className={formModalLabelClass}>Modo de cálculo</span>
      <div className="flex flex-col gap-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--foreground)]">
          <input
            id={`${idPrefix}-fixo`}
            type="checkbox"
            checked={value === "FIXO"}
            onChange={() => onChange("FIXO")}
            className="h-4 w-4 rounded border-[color:var(--border)]"
          />
          Preço fixo
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--foreground)]">
          <input
            id={`${idPrefix}-unidade`}
            type="checkbox"
            checked={value === "POR_UNIDADE"}
            onChange={() => onChange("POR_UNIDADE")}
            className="h-4 w-4 rounded border-[color:var(--border)]"
          />
          Unidade
        </label>
      </div>
    </div>
  );
}

export default function ConfigReembolsosPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [types, setTypes] = useState<TypeLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [limits, setLimits] = useState<Record<string, number | null>>({});
  const [draftLimits, setDraftLimits] = useState<Record<string, number | null>>({});
  const [initialLimits, setInitialLimits] = useState<Record<string, number | null>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectOpen, setProjectOpen] = useState(false);

  const [typeNameDrafts, setTypeNameDrafts] = useState<Record<string, string>>({});
  const [typeCalcModeDrafts, setTypeCalcModeDrafts] = useState<Record<string, "FIXO" | "POR_UNIDADE">>({});
  const [typeAttachmentRequiredDrafts, setTypeAttachmentRequiredDrafts] = useState<Record<string, boolean>>({});
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [addTypeName, setAddTypeName] = useState("");
  const [addTypeCalcMode, setAddTypeCalcMode] = useState<"FIXO" | "POR_UNIDADE">("FIXO");
  const [addTypeAttachmentRequired, setAddTypeAttachmentRequired] = useState(false);
  const [addTypeError, setAddTypeError] = useState<string | null>(null);

  const canManageReimbursementSettings = can("configuracoes.reembolso");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("configuracoes")) {
      router.replace(`${basePath}`);
      return;
    }
    if (!canManageReimbursementSettings) {
      router.replace(basePath);
      return;
    }
  }, [loading, user, can, router, basePath, canManageReimbursementSettings]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [tRes, pRes, lRes] = await Promise.all([
        apiFetch("/api/reimbursements/admin/types"),
        apiFetch("/api/reimbursements/admin/projects"),
        apiFetch("/api/reimbursements/admin/limits"),
      ]);
      if (!tRes.ok || !pRes.ok || !lRes.ok) throw new Error("Falha ao carregar configurações de reembolso.");
      const t = await tRes.json();
      const p = await pRes.json();
      const l = await lRes.json();
      setTypes(Array.isArray(t) ? t : []);
      setProjects(Array.isArray(p) ? p : []);
      const next: Record<string, number | null> = {};
      for (const row of Array.isArray(l) ? l : []) {
        const type = (Array.isArray(t) ? t : []).find((x: any) => x?.id === row.typeId);
        const isUnit = type?.calcMode === "POR_UNIDADE";
        const key = `${row.projectId}:${row.typeId}`;
        next[key] = (isUnit ? row.maxUnitValueCents : row.maxValueCents) as number | null;
      }
      for (const proj of Array.isArray(p) ? p : []) {
        for (const it of Array.isArray(t) ? t : []) {
          if (!it.isActive) continue;
          const key = `${proj.id}:${it.id}`;
          if (!(key in next)) next[key] = 0;
        }
      }
      setLimits(next);
      const nextDraft: Record<string, number | null> = { ...next };
      setDraftLimits(nextDraft);
      setInitialLimits({ ...nextDraft });
      setTypeNameDrafts((prev) => {
        const n: Record<string, string> = { ...prev };
        for (const it of Array.isArray(t) ? t : []) n[it.id] = String(it.name || "");
        return n;
      });
      setTypeCalcModeDrafts((prev) => {
        const n: Record<string, "FIXO" | "POR_UNIDADE"> = { ...prev };
        for (const it of Array.isArray(t) ? t : []) n[it.id] = (it.calcMode === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO") as any;
        return n;
      });
      setTypeAttachmentRequiredDrafts((prev) => {
        const n: Record<string, boolean> = { ...prev };
        for (const it of Array.isArray(t) ? t : []) n[it.id] = Boolean(it.attachmentRequired);
        return n;
      });
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar configurações.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && user && canManageReimbursementSettings) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canManageReimbursementSettings]);

  useEffect(() => {
    if (!addTypeOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddTypeOpen(false);
        setAddTypeName("");
        setAddTypeCalcMode("FIXO");
        setAddTypeAttachmentRequired(false);
        setAddTypeError(null);
        return;
      }
      if (e.key === "Enter" && document.activeElement?.tagName?.toLowerCase() === "input") {
        e.preventDefault();
        void confirmAddType();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTypeOpen, addTypeName]);

  const activeTypes = useMemo(() => types.filter((t) => t.isActive), [types]);
  const unitTypes = useMemo(() => activeTypes.filter((t) => t.calcMode === "POR_UNIDADE"), [activeTypes]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const projectLabel = useMemo(() => {
    if (!selectedProject) return "Selecione um projeto…";
    return `${selectedProject.name}${selectedProject.client?.name ? ` — ${selectedProject.client.name}` : ""}`;
  }, [selectedProject]);

  const dirtyLimitItems = useMemo(() => {
    const items: Array<{ projectId: string; typeId: string; maxValueCents: number | null; maxUnitValueCents: number | null }> = [];
    if (!selectedProjectId) return items;
    for (const t of activeTypes) {
      const key = `${selectedProjectId}:${t.id}`;
      const next = key in draftLimits ? draftLimits[key] : 0;
      const prev = key in initialLimits ? initialLimits[key] : 0;
      if (next !== prev) {
        if (t.calcMode === "POR_UNIDADE") {
          items.push({ projectId: selectedProjectId, typeId: t.id, maxValueCents: null, maxUnitValueCents: next });
        } else {
          items.push({ projectId: selectedProjectId, typeId: t.id, maxValueCents: next, maxUnitValueCents: null });
        }
      }
    }
    return items;
  }, [activeTypes, draftLimits, initialLimits, selectedProjectId]);

  const hasUnsavedChanges = dirtyLimitItems.length > 0;

  function openAddType() {
    setAddTypeOpen(true);
    setAddTypeName("");
    setAddTypeCalcMode("FIXO");
    setAddTypeAttachmentRequired(false);
    setAddTypeError(null);
  }

  async function confirmAddType() {
    const name = addTypeName.trim();
    if (!name) {
      setAddTypeError("Informe o nome do tipo.");
      return;
    }
    if (name.length > 60) {
      setAddTypeError("Use um nome com até 60 caracteres.");
      return;
    }
    setSaving(true);
    setAddTypeError(null);
    try {
      const r = await apiFetch("/api/reimbursements/admin/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          calcMode: addTypeCalcMode,
          unit: null,
          attachmentRequired: addTypeAttachmentRequired,
        }),
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => null);
        setAddTypeError(msg?.error || "Não foi possível criar o tipo.");
        return;
      }
      setAddTypeOpen(false);
      setAddTypeName("");
      setAddTypeCalcMode("FIXO");
      setAddTypeAttachmentRequired(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleType(t: TypeLite) {
    const r = await apiFetch(`/api/reimbursements/admin/types/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (!r.ok) return;
    await load();
  }

  async function saveLimits() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const items = dirtyLimitItems.map((x) => ({
        projectId: x.projectId,
        typeId: x.typeId,
        maxValueCents: x.maxValueCents,
        maxUnitValueCents: x.maxUnitValueCents,
      }));
      const r = await apiFetch("/api/reimbursements/admin/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => null);
        throw new Error(msg?.error || "Erro ao salvar limites.");
      }
      setMessage("Configurações salvas com sucesso.");
      setTimeout(() => setMessage(null), 2500);
      // Recarrega para refletir estado persistido
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveType(typeId: string) {
    const name = String(typeNameDrafts[typeId] || "").trim();
    if (!name) {
      setError("Nome do tipo é obrigatório.");
      return;
    }
    const calcMode = (typeCalcModeDrafts[typeId] ?? "FIXO") as "FIXO" | "POR_UNIDADE";
    const attachmentRequired = Boolean(typeAttachmentRequiredDrafts[typeId]);
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reimbursements/admin/types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, calcMode, unit: null, attachmentRequired }),
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => null);
        throw new Error(msg?.error || "Erro ao salvar tipo.");
      }
      setEditingTypeId(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar tipo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => navigateBack(router, basePath)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-[color:var(--muted-foreground)]">
            <Receipt className="h-5 w-5 shrink-0 text-[color:var(--primary)]" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Configurações</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)] mt-0.5">Reembolsos</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Configure tipos e limites por projeto (projeto + tipo da despesa + valor limite).
          </p>
        </div>
      </header>

      {addTypeOpen && (
        <div
          className={formModalBackdropClass}
          role="dialog"
          aria-modal="true"
          aria-label="Adicionar tipo de reembolso"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAddTypeOpen(false);
              setAddTypeName("");
              setAddTypeCalcMode("FIXO");
              setAddTypeAttachmentRequired(false);
              setAddTypeError(null);
            }
          }}
        >
          <div className={formModalPanelNarrowClass}>
            <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-start justify-between gap-3 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[color:var(--foreground)]">Novo tipo</h2>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                  Crie um tipo de reembolso (ex.: Almoço, Combustível).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddTypeOpen(false);
                  setAddTypeName("");
                  setAddTypeCalcMode("FIXO");
                  setAddTypeAttachmentRequired(false);
                  setAddTypeError(null);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] hover:opacity-90"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 flex-1 overflow-auto">
              <label>
                <span className={formModalLabelClass}>Nome do tipo</span>
                <input
                  autoFocus
                  value={addTypeName}
                  onChange={(e) => {
                    setAddTypeName(e.target.value);
                    setAddTypeError(null);
                  }}
                  placeholder="Ex.: Almoço"
                  className={formModalInputClass(Boolean(addTypeError))}
                  maxLength={60}
                />
              </label>
              <CalcModeCheckboxes
                idPrefix="novo-tipo"
                value={addTypeCalcMode}
                onChange={(mode) => {
                  setAddTypeCalcMode(mode);
                  setAddTypeError(null);
                }}
              />
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--foreground)] pt-1">
                <input
                  type="checkbox"
                  checked={addTypeAttachmentRequired}
                  onChange={(e) => setAddTypeAttachmentRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--border)]"
                />
                Anexo obrigatório na solicitação
              </label>
              {addTypeError ? <p className="text-xs text-red-600 dark:text-red-300">{addTypeError}</p> : null}
            </div>

            <div className="px-5 py-4 border-t border-[color:var(--border)] flex items-center justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAddTypeOpen(false);
                  setAddTypeName("");
                  setAddTypeCalcMode("FIXO");
                  setAddTypeAttachmentRequired(false);
                  setAddTypeError(null);
                }}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold border hover:opacity-90"
                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmAddType()}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving || !addTypeName.trim()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="rounded-xl border px-4 py-3 text-sm text-red-700 dark:text-red-200" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
              {message}
            </div>
          )}

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Tipos de reembolso</h2>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                  Cadastre os tipos e controle quais ficam disponíveis para solicitação.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border border-[color:var(--border)] hover:opacity-90"
                onClick={openAddType}
              >
                <Plus className="h-4 w-4" />
                Novo tipo
              </button>
            </div>

            {types.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/20 p-4 text-sm text-[color:var(--muted-foreground)]">
                Nenhum tipo cadastrado.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--border)]">
                <div className="divide-y divide-[color:var(--border)]">
                  {types.map((t) => {
                    const isEditing = editingTypeId === t.id;
                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-[color:var(--surface)]">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="space-y-2 max-w-[520px]">
                              <input
                                value={typeNameDrafts[t.id] ?? t.name}
                                onChange={(e) => setTypeNameDrafts((p) => ({ ...p, [t.id]: e.target.value }))}
                                className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-2 py-2 text-sm"
                              />
                              <CalcModeCheckboxes
                                idPrefix={`tipo-${t.id}`}
                                value={(typeCalcModeDrafts[t.id] ?? t.calcMode ?? "FIXO") as "FIXO" | "POR_UNIDADE"}
                                onChange={(mode) => setTypeCalcModeDrafts((p) => ({ ...p, [t.id]: mode }))}
                              />
                              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--foreground)]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(typeAttachmentRequiredDrafts[t.id])}
                                  onChange={(e) =>
                                    setTypeAttachmentRequiredDrafts((p) => ({ ...p, [t.id]: e.target.checked }))
                                  }
                                  className="h-4 w-4 rounded border-[color:var(--border)]"
                                />
                                Anexo obrigatório na solicitação
                              </label>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-[color:var(--foreground)] truncate">{t.name}</p>
                              <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--background)]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                                {t.calcMode === "POR_UNIDADE" ? "Unidade" : "Preço fixo"}
                              </span>
                              {t.attachmentRequired ? (
                                <span className="wps-reembolso-tipo-anexo-badge inline-flex items-center rounded-full border border-amber-300/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  Anexo obrigatório
                                </span>
                              ) : null}
                            </div>
                          )}
                          <p
                            className={`text-[11px] ${
                              t.isActive ? "wps-reembolso-tipo-label-ativo" : "text-[color:var(--muted-foreground)]"
                            }`}
                          >
                            {t.isActive ? "Ativo" : "Inativo"}
                          </p>
                        </div>

                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveType(t.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              Salvar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setEditingTypeId(null);
                                setTypeNameDrafts((p) => ({ ...p, [t.id]: t.name }));
                                setTypeCalcModeDrafts((p) => ({ ...p, [t.id]: t.calcMode === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO" }));
                                setTypeAttachmentRequiredDrafts((p) => ({ ...p, [t.id]: Boolean(t.attachmentRequired) }));
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTypeId(t.id);
                                setTypeNameDrafts((p) => ({ ...p, [t.id]: t.name }));
                                setTypeCalcModeDrafts((p) => ({ ...p, [t.id]: t.calcMode === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO" }));
                                setTypeAttachmentRequiredDrafts((p) => ({ ...p, [t.id]: Boolean(t.attachmentRequired) }));
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2 text-xs font-semibold hover:opacity-90"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleType(t)}
                              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-90 ${
                                t.isActive
                                  ? "wps-reembolso-tipo-ativo-btn border-emerald-300/60 bg-emerald-500/10"
                                  : "border-[color:var(--border)] bg-[color:var(--background)]/20 text-[color:var(--muted-foreground)]"
                              }`}
                              title="Ativar/desativar"
                            >
                              {t.isActive ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                              {t.isActive ? "Ativo" : "Inativo"}
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Limites por projeto</h2>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                  Preço fixo: limite do <span className="font-semibold">valor total</span> do reembolso. Por unidade: teto em{" "}
                  <span className="font-semibold">reais por unidade</span> (ex.: até R$ 1,30 por km); na solicitação entra só a{" "}
                  <span className="font-semibold">quantidade</span> (km rodados) e o <span className="font-semibold">R$/unidade</span>.
                </p>
              </div>
              <button
                type="button"
                disabled={saving || !hasUnsavedChanges}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-50"
                onClick={() => void saveLimits()}
              >
                {saving ? "Salvando…" : hasUnsavedChanges ? "Salvar alterações" : "Salvo"}
              </button>
            </div>

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : projects.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/20 p-4 text-sm text-[color:var(--muted-foreground)]">
                Nenhum projeto encontrado.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-[color:var(--muted-foreground)]">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Projeto
                  </span>
                  <div className="relative w-full max-w-[560px]">
                    <button
                      type="button"
                      onClick={() => setProjectOpen((v) => !v)}
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
                      <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-2xl" role="listbox">
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-[color:var(--sidebar-item-hover)]"
                          onClick={() => {
                            setSelectedProjectId("");
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
                                setSelectedProjectId(p.id);
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

                {selectedProjectId ? (
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[color:var(--foreground)] truncate">{projectLabel}</p>
                        <p className="text-[11px] text-[color:var(--muted-foreground)]">
                          Por unidade, o valor é em <span className="font-semibold">R$ por km, litro etc.</span> Ative “Sem limite”
                          para remover o teto.
                        </p>
                      </div>
                      {hasUnsavedChanges ? (
                        <span className="text-[11px] font-semibold text-fuchsia-600">Alterações não salvas</span>
                      ) : (
                        <span className="text-[11px] text-[color:var(--muted-foreground)]">Salvo</span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeTypes.length === 0 ? (
                        <div className="text-sm text-[color:var(--muted-foreground)]">Nenhum tipo ativo.</div>
                      ) : (
                        activeTypes.map((t) => {
                          const key = `${selectedProjectId}:${t.id}`;
                          const v = key in draftLimits ? draftLimits[key] : 0;
                          const display = typeof v === "number" ? formatBrlFromCents(v) : "";
                          const noLimit = v === null;
                          const isUnit = t.calcMode === "POR_UNIDADE";
                          const suffix = isUnit && t.unit ? `/${t.unit}` : "";
                          return (
                            <div
                              key={t.id}
                              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[color:var(--foreground)] truncate">{t.name}</p>
                                  <p className="text-[11px] text-[color:var(--muted-foreground)]">
                                    {noLimit ? (
                                      "Sem limite"
                                    ) : isUnit ? (
                                      `Teto máx. (R$${suffix}): ${formatBrlFromCents(v as number)}`
                                    ) : (
                                      `Limite: ${formatBrlFromCents(v as number)}`
                                    )}
                                  </p>
                                  {isUnit && t.unit ? (
                                    <p className="text-[11px] text-[color:var(--muted-foreground)]">Unidade: {t.unit}</p>
                                  ) : null}
                                </div>
                                <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-[color:var(--muted-foreground)]">
                                  <input
                                    type="checkbox"
                                    checked={noLimit}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setDraftLimits((prev) => ({ ...prev, [key]: checked ? null : 0 }));
                                    }}
                                  />
                                  Sem limite
                                </label>
                              </div>

                              <div className="mt-2">
                                <input
                                  value={display}
                                  disabled={noLimit}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    const c = centsFromMaskedInput(next);
                                    setDraftLimits((prev) => ({ ...prev, [key]: c == null ? 0 : c }));
                                  }}
                                  placeholder={isUnit ? `R$ 0,00${suffix}` : "R$ 0,00"}
                                  className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2 text-sm disabled:opacity-60"
                                  inputMode="numeric"
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/20 p-4 text-sm text-[color:var(--muted-foreground)]">
                    Selecione um projeto para editar os limites.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

