"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";

type PlanModules = {
  projetos: boolean;
  financeiro: boolean;
  portal: boolean;
  sharepoint: boolean;
};

type PlatformPlan = {
  id: string;
  name: string;
  code: string | null;
  label: string;
  priceCentsPerUser: number;
  pricePerUserFormatted: string;
  modules: PlanModules;
  moduleLabels: string[];
  active: boolean;
  sortOrder: number;
};

type PlanForm = {
  name: string;
  code: string;
  priceReais: string;
  moduleProjetos: boolean;
  moduleFinanceiro: boolean;
  modulePortal: boolean;
  moduleSharepoint: boolean;
  active: boolean;
};

const EMPTY_FORM: PlanForm = {
  name: "",
  code: "",
  priceReais: "",
  moduleProjetos: true,
  moduleFinanceiro: true,
  modulePortal: true,
  moduleSharepoint: false,
  active: true,
};

function reaisToCents(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToReaisInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/platform/plans");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar planos.");
      setPlans([]);
      setLoading(false);
      return;
    }
    setPlans(Array.isArray(body?.plans) ? body.plans : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(plan: PlatformPlan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      code: plan.code ?? "",
      priceReais: centsToReaisInput(plan.priceCentsPerUser),
      moduleProjetos: plan.modules.projetos,
      moduleFinanceiro: plan.modules.financeiro,
      modulePortal: plan.modules.portal,
      moduleSharepoint: plan.modules.sharepoint,
      active: plan.active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Informe o nome do plano.");
      return;
    }
    const priceCents = reaisToCents(form.priceReais);
    if (priceCents == null) {
      setFormError("Informe um preço válido por usuário.");
      return;
    }
    if (!form.moduleProjetos && !form.moduleFinanceiro && !form.modulePortal && !form.moduleSharepoint) {
      setFormError("Selecione ao menos um módulo.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const payload = {
      name,
      code: form.code.trim() || null,
      priceCentsPerUser: priceCents,
      moduleProjetos: form.moduleProjetos,
      moduleFinanceiro: form.moduleFinanceiro,
      modulePortal: form.modulePortal,
      moduleSharepoint: form.moduleSharepoint,
      active: form.active,
    };
    const r = await apiFetch(editing ? `/api/platform/plans/${editing.id}` : "/api/platform/plans", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setFormError(typeof body?.error === "string" ? body.error : "Erro ao salvar plano.");
      return;
    }
    setModalOpen(false);
    await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await apiFetch(`/api/platform/plans/${deleteTarget.id}`, { method: "DELETE" });
    const body = await r.json().catch(() => null);
    setDeleting(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao remover plano.");
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
            Comercial
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Tags className="h-5 w-5 text-[color:var(--primary)]" />
            <h2 className="text-xl font-semibold tracking-tight">Planos</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted-foreground)]">
            Crie tipos de plano e escolha os módulos inclusos. Clientes sem um módulo no plano
            não acessam essa área — inclusive o Super administrador.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95"
        >
          <Plus className="h-4 w-4" />
          Novo plano
        </button>
      </div>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm text-red-700"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-[color:var(--muted-foreground)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando planos…
        </div>
      ) : plans.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed bg-[color:var(--surface)] px-6 py-16 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm font-medium">Nenhum plano cadastrado</p>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            Crie o primeiro plano para liberar a assinatura das empresas.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-[color:var(--surface-2)] text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
              <tr>
                <th className="px-4 py-3 font-semibold">Plano</th>
                <th className="px-4 py-3 font-semibold">Preço / usuário</th>
                <th className="px-4 py-3 font-semibold">Módulos</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{plan.name}</p>
                    {plan.code ? (
                      <p className="text-[11px] text-[color:var(--muted-foreground)]">{plan.code}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{plan.pricePerUserFormatted}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {plan.moduleLabels.length ? (
                        plan.moduleLabels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--primary)]"
                          >
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[color:var(--muted-foreground)]">Nenhum</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        plan.active
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-slate-500/10 text-slate-600"
                      }`}
                    >
                      {plan.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(plan)}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(plan)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => !saving && setModalOpen(false)}
        >
          <form
            onSubmit={(e) => void savePlan(e)}
            className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl"
            style={{ borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{editing ? "Editar plano" : "Novo plano"}</h3>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Defina preço e módulos inclusos neste plano.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="Ex.: Empresarial"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Código (opcional)
                  </label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm uppercase"
                    style={{ borderColor: "var(--border)" }}
                    placeholder="Ex.: PRO"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Preço por usuário (R$)
                  </label>
                  <input
                    value={form.priceReais}
                    onChange={(e) => setForm((f) => ({ ...f, priceReais: e.target.value }))}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                    placeholder="49,00"
                    required
                  />
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-xs text-[color:var(--muted-foreground)]">Módulos</legend>
                <div className="space-y-2">
                  {(
                    [
                      ["moduleProjetos", "Gestão de projetos"],
                      ["moduleFinanceiro", "Financeiro"],
                      ["modulePortal", "Portal Colaborativo"],
                      ["moduleSharepoint", "SharePoint"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                        className="accent-[color:var(--primary)]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="accent-[color:var(--primary)]"
                />
                Plano ativo (disponível para assinatura)
              </label>
            </div>

            {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Remover plano?"
          message={
            deleting
              ? "Removendo…"
              : `Se o plano "${deleteTarget.name}" estiver em uso por alguma empresa, ele será apenas desativado.`
          }
          confirmLabel="Remover"
          cancelLabel="Voltar"
          variant="danger"
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
