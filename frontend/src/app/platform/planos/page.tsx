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
  comercial: boolean;
  rh: boolean;
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
  addonLabels?: string[];
  addons?: {
    id: string;
    label: string;
    priceCentsPerUser: number;
    pricePerUserFormatted: string;
  }[];
  addonPrices?: {
    sharepoint: number;
    comercial: number;
    rh: number;
  };
  allFeatureLabels?: string[];
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
  moduleComercial: boolean;
  moduleRh: boolean;
  addonSharepointReais: string;
  addonComercialReais: string;
  addonRhReais: string;
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
  moduleComercial: false,
  moduleRh: false,
  addonSharepointReais: "",
  addonComercialReais: "",
  addonRhReais: "",
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
      moduleComercial: plan.modules.comercial === true,
      moduleRh: plan.modules.rh === true,
      addonSharepointReais: centsToReaisInput(plan.addonPrices?.sharepoint ?? 0),
      addonComercialReais: centsToReaisInput(plan.addonPrices?.comercial ?? 0),
      addonRhReais: centsToReaisInput(plan.addonPrices?.rh ?? 0),
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
    if (!form.moduleProjetos && !form.moduleFinanceiro && !form.modulePortal) {
      setFormError("Selecione ao menos um módulo principal.");
      return;
    }

    const parseAddonPrice = (enabled: boolean, raw: string, label: string): number | null => {
      if (!enabled) return 0;
      if (!raw.trim()) return 0;
      const cents = reaisToCents(raw);
      if (cents == null) {
        setFormError(`Preço inválido do addon ${label}.`);
        return null;
      }
      return cents;
    };

    const addonSharepointCents = parseAddonPrice(
      form.moduleSharepoint,
      form.addonSharepointReais,
      "Cloud2Cloud",
    );
    if (addonSharepointCents == null) return;
    const addonComercialCents = parseAddonPrice(
      form.moduleComercial,
      form.addonComercialReais,
      "Comercial",
    );
    if (addonComercialCents == null) return;
    const addonRhCents = parseAddonPrice(form.moduleRh, form.addonRhReais, "RH");
    if (addonRhCents == null) return;

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
      moduleComercial: form.moduleComercial,
      moduleRh: form.moduleRh,
      addonSharepointCentsPerUser: addonSharepointCents,
      addonComercialCentsPerUser: addonComercialCents,
      addonRhCentsPerUser: addonRhCents,
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
                <th className="px-4 py-3 font-semibold">Módulos / Addons</th>
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
                    <div className="flex flex-col gap-2">
                      {plan.moduleLabels.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {plan.moduleLabels.map((label) => (
                            <span
                              key={label}
                              className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--primary)]"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[color:var(--muted-foreground)]">Sem módulos</span>
                      )}
                      {(plan.addons?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {plan.addons!.map((addon) => (
                            <span
                              key={addon.id}
                              className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-[color:var(--foreground)]"
                              style={{
                                borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border))",
                                background: "color-mix(in srgb, var(--primary) 6%, transparent)",
                              }}
                            >
                              Addon · {addon.label}
                              {addon.priceCentsPerUser > 0
                                ? ` (+${addon.pricePerUserFormatted}/usuário)`
                                : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
              Defina preço base, módulos e o valor adicional por usuário de cada addon.
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

              <fieldset>
                <legend className="mb-2 text-xs text-[color:var(--muted-foreground)]">Addons</legend>
                <div className="space-y-2">
                  {(
                    [
                      [
                        "moduleComercial",
                        "addonComercialReais",
                        "Comercial",
                        "Módulo em breve — valor adicional por usuário",
                      ],
                      [
                        "moduleRh",
                        "addonRhReais",
                        "RH",
                        "Módulo em breve — valor adicional por usuário",
                      ],
                      [
                        "moduleSharepoint",
                        "addonSharepointReais",
                        "Sincronizador Cloud2Cloud",
                        "Libera Integrações (SharePoint/Teams) — valor adicional por usuário",
                      ],
                    ] as const
                  ).map(([enabledKey, priceKey, label, hint]) => (
                    <div
                      key={enabledKey}
                      className="rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form[enabledKey]}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [enabledKey]: e.target.checked }))
                          }
                          className="mt-0.5 accent-[color:var(--primary)]"
                        />
                        <span>
                          <span className="font-medium">{label}</span>
                          <span className="mt-0.5 block text-[11px] text-[color:var(--muted-foreground)]">
                            {hint}
                          </span>
                        </span>
                      </label>
                      {form[enabledKey] ? (
                        <div className="mt-2 pl-6">
                          <label className="mb-1 block text-[11px] text-[color:var(--muted-foreground)]">
                            Preço adicional / usuário (R$)
                          </label>
                          <input
                            value={form[priceKey]}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, [priceKey]: e.target.value }))
                            }
                            className="w-full max-w-[160px] rounded-lg border bg-transparent px-3 py-1.5 text-sm"
                            style={{ borderColor: "var(--border)" }}
                            placeholder="0,00"
                          />
                        </div>
                      ) : null}
                    </div>
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
