"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { History, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type BillingTypeOption = { id: string; code: string; name: string; isActive: boolean };

type RevenueRow = {
  id: string;
  projectId: string;
  title: string | null;
  billingTypeId: string | null;
  billingTypeName: string | null;
  contractedValue: number | null;
  expectedRevenue: number | null;
  realizedRevenue: number | null;
  installmentCount: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isAdditive: boolean;
  historyCount: number;
};

type ChildProjectRow = {
  id: string;
  name: string;
  statusInicial: string;
  dataInicio: string;
  dataFimPrevista: string | null;
  createdAt: string;
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

const STATUS_OPTIONS = [
  { value: "NEGOCIACAO", label: "Negociação" },
  { value: "ATIVO", label: "Ativo" },
  { value: "FINALIZADO", label: "Finalizado" },
  { value: "CANCELADO", label: "Cancelado" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

type RevenueFormState = {
  title: string;
  billingTypeId: string;
  contractedValue: string;
  expectedRevenue: string;
  realizedRevenue: string;
  installmentCount: string;
  startDate: string;
  endDate: string;
  status: string;
  isAdditive: boolean;
};

const emptyForm = (): RevenueFormState => ({
  title: "",
  billingTypeId: "",
  contractedValue: "",
  expectedRevenue: "",
  realizedRevenue: "",
  installmentCount: "",
  startDate: "",
  endDate: "",
  status: "NEGOCIACAO",
  isAdditive: false,
});

type ProjectRevenuesSectionProps = {
  projectId: string;
};

export function ProjectRevenuesSection({ projectId }: ProjectRevenuesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.projetos.receitas"), [can]);
  const canCreateProject = useMemo(() => can("projeto.novo"), [can]);

  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [children, setChildren] = useState<ChildProjectRow[]>([]);
  const [billingTypes, setBillingTypes] = useState<BillingTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RevenueFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [crName, setCrName] = useState("");
  const [crSaving, setCrSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [revRes, childRes, btRes] = await Promise.all([
        apiFetch(`/api/project-revenues?projectId=${encodeURIComponent(projectId)}`),
        apiFetch(`/api/projects/${projectId}/child-projects`),
        apiFetch("/api/project-billing-types"),
      ]);
      const revBody = await revRes.json().catch(() => null);
      const childBody = await childRes.json().catch(() => null);
      const btBody = await btRes.json().catch(() => null);
      if (!revRes.ok) {
        throw new Error(typeof revBody?.error === "string" ? revBody.error : "Erro ao carregar receitas.");
      }
      setRevenues(Array.isArray(revBody) ? revBody : []);
      setChildren(childRes.ok && Array.isArray(childBody) ? childBody : []);
      setBillingTypes(
        btRes.ok && Array.isArray(btBody)
          ? btBody.filter((b: BillingTypeOption) => b.isActive)
          : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados financeiros.");
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

  function openEditModal(row: RevenueRow) {
    setEditingId(row.id);
    setForm({
      title: row.title ?? "",
      billingTypeId: row.billingTypeId ?? "",
      contractedValue: row.contractedValue != null ? String(row.contractedValue) : "",
      expectedRevenue: row.expectedRevenue != null ? String(row.expectedRevenue) : "",
      realizedRevenue: row.realizedRevenue != null ? String(row.realizedRevenue) : "",
      installmentCount: row.installmentCount != null ? String(row.installmentCount) : "",
      startDate: row.startDate ? row.startDate.slice(0, 10) : "",
      endDate: row.endDate ? row.endDate.slice(0, 10) : "",
      status: row.status,
      isAdditive: row.isAdditive,
    });
    setModalOpen(true);
  }

  async function saveRevenue() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      title: form.title.trim() || null,
      billingTypeId: form.billingTypeId || null,
      contractedValue: form.contractedValue !== "" ? Number(form.contractedValue) : null,
      expectedRevenue: form.expectedRevenue !== "" ? Number(form.expectedRevenue) : null,
      realizedRevenue: form.realizedRevenue !== "" ? Number(form.realizedRevenue) : null,
      installmentCount: form.installmentCount !== "" ? Number(form.installmentCount) : null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      isAdditive: form.isAdditive,
    };
    const url = editingId ? `/api/project-revenues/${editingId}` : "/api/project-revenues";
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
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar receita.");
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function deleteRevenue(id: string) {
    if (!window.confirm("Excluir esta receita?")) return;
    const r = await apiFetch(`/api/project-revenues/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir receita.");
      return;
    }
    await load();
  }

  async function openHistory(revenueId: string) {
    setHistoryOpen(revenueId);
    setHistoryLoading(true);
    const r = await apiFetch(`/api/project-revenues/${revenueId}/history`);
    const body = await r.json().catch(() => null);
    setHistoryRows(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  async function createChangeRequest() {
    const name = crName.trim();
    if (!name) {
      setError("Nome do change request é obrigatório.");
      return;
    }
    setCrSaving(true);
    setError(null);
    const r = await apiFetch(`/api/projects/${projectId}/child-projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dataInicio: new Date().toISOString() }),
    });
    const body = await r.json().catch(() => null);
    setCrSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar change request.");
      return;
    }
    setCrModalOpen(false);
    setCrName("");
    await load();
  }

  const totals = useMemo(() => {
    const contracted = revenues.reduce((s, r) => s + (r.contractedValue ?? 0), 0);
    const expected = revenues.reduce((s, r) => s + (r.expectedRevenue ?? 0), 0);
    const realized = revenues.reduce((s, r) => s + (r.realizedRevenue ?? 0), 0);
    return { contracted, expected, realized };
  }, [revenues]);

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
              Receitas do projeto
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Múltiplas receitas por tipo de cobrança, com valores contratados e realizados.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Nova receita
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs text-[color:var(--muted-foreground)]">Valor contratado (total)</p>
            <p className="mt-1 text-sm font-semibold">{formatarMoeda(totals.contracted)}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs text-[color:var(--muted-foreground)]">Receita prevista (total)</p>
            <p className="mt-1 text-sm font-semibold">{formatarMoeda(totals.expected)}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs text-[color:var(--muted-foreground)]">Receita realizada (total)</p>
            <p className="mt-1 text-sm font-semibold">{formatarMoeda(totals.realized)}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Carregando receitas...</p>
        ) : revenues.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Nenhuma receita cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Título</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-right font-semibold">Contratado</th>
                  <th className="px-3 py-2 text-right font-semibold">Previsto</th>
                  <th className="px-3 py-2 text-right font-semibold">Realizado</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {revenues.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      {row.title || "—"}
                      {row.isAdditive && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Aditivo</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.billingTypeName ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(row.contractedValue)}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(row.expectedRevenue)}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(row.realizedRevenue)}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[row.status] ?? row.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openEditModal(row)} className="text-[color:var(--primary)] hover:underline">
                          <Pencil className="h-3.5 w-3.5 inline" />
                        </button>
                        <button type="button" onClick={() => void openHistory(row.id)} className="text-[color:var(--muted-foreground)] hover:underline">
                          <History className="h-3.5 w-3.5 inline" />
                        </button>
                        <button type="button" onClick={() => void deleteRevenue(row.id)} className="text-red-600 hover:underline">
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

      <section
        className="rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Change requests (projetos filhos)
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Projetos vinculados a este escopo para aditivos e extensões.
            </p>
          </div>
          {canCreateProject && (
            <button
              type="button"
              onClick={() => setCrModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-4 w-4" />
              Novo change request
            </button>
          )}
        </div>
        {children.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Nenhum projeto filho vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold">Início</th>
                  <th className="px-3 py-2 text-left font-semibold">Término previsto</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {children.map((child) => (
                  <tr
                    key={child.id}
                    className="border-t cursor-pointer hover:bg-black/5"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => router.push(`${basePath}/projetos/${child.id}`)}
                  >
                    <td className="px-3 py-2 font-medium text-[color:var(--primary)]">{child.name}</td>
                    <td className="px-3 py-2">{formatarData(child.dataInicio)}</td>
                    <td className="px-3 py-2">{formatarData(child.dataFimPrevista)}</td>
                    <td className="px-3 py-2">{child.statusInicial}</td>
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
              <h3 className="text-sm font-semibold">{editingId ? "Editar receita" : "Nova receita"}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Título</label>
                <input className={formModalInputClass()} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Tipo de cobrança</label>
                <select className={formModalInputClass()} value={form.billingTypeId} onChange={(e) => setForm((f) => ({ ...f, billingTypeId: e.target.value }))}>
                  <option value="">—</option>
                  {billingTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>{bt.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Valor contratado</label>
                  <input type="number" step="0.01" className={formModalInputClass()} value={form.contractedValue} onChange={(e) => setForm((f) => ({ ...f, contractedValue: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Receita prevista</label>
                  <input type="number" step="0.01" className={formModalInputClass()} value={form.expectedRevenue} onChange={(e) => setForm((f) => ({ ...f, expectedRevenue: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Receita realizada</label>
                  <input type="number" step="0.01" className={formModalInputClass()} value={form.realizedRevenue} onChange={(e) => setForm((f) => ({ ...f, realizedRevenue: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Parcelas</label>
                  <input type="number" className={formModalInputClass()} value={form.installmentCount} onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Início</label>
                  <input type="date" className={formModalInputClass()} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Término</label>
                  <input type="date" className={formModalInputClass()} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Status</label>
                <select className={formModalInputClass()} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isAdditive} onChange={(e) => setForm((f) => ({ ...f, isAdditive: e.target.checked }))} />
                Receita aditiva (change request)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Cancelar</button>
              <button type="button" onClick={() => void saveRevenue()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {crModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Novo change request</h3>
              <button type="button" onClick={() => setCrModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4">
              <label className={formModalLabelClass}>Nome do projeto filho</label>
              <input className={formModalInputClass()} value={crName} onChange={(e) => setCrName(e.target.value)} placeholder="Ex: CR — Módulo relatórios" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCrModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Cancelar</button>
              <button type="button" onClick={() => void createChangeRequest()} disabled={crSaving} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {crSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Histórico da receita</h3>
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
    </>
  );
}
