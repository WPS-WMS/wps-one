"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarDays, CreditCard, Loader2, Plus, Users, X } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";
import { formatarCnpj, formatarTelefone } from "@/lib/brFormatters";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

type Totals = {
  tenants: number;
  subscribedTenants: number;
  billableUsersActive: number;
  monthlyBillingCents: number;
  monthlyBillingFormatted: string;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  usage: {
    billableUsersActive: number;
    lastActivityAt: string | null;
  };
  subscription: {
    plan: string | null;
    label: string;
    monthlyAmountCents: number;
    monthlyAmountFormatted: string;
    startedAt: string | null;
    nextPaymentAt: string | null;
    pricePerUserFormatted: string | null;
  };
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PlatformHomePage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [items, setItems] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{
    companyName: string;
    email: string;
    temporaryPassword: string;
    tenantId: string;
  } | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    cnpj: "",
    phone: "",
    email: "",
    planId: "",
    portalModuleEnabled: true,
    sharepointModuleEnabled: false,
  });
  const [plans, setPlans] = useState<
    {
      id: string;
      label: string;
      pricePerUserFormatted: string;
      moduleLabels?: string[];
      modules?: { portal?: boolean; sharepoint?: boolean };
    }[]
  >([]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/platform/tenants");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
      setLoading(false);
      return;
    }
    setTotals(body?.totals ?? null);
    const list = Array.isArray(body?.items) ? (body.items as TenantRow[]) : [];
    setItems(
      [...list]
        .sort(
          (a, b) =>
            (b.subscription.monthlyAmountCents || 0) - (a.subscription.monthlyAmountCents || 0) ||
            b.usage.billableUsersActive - a.usage.billableUsersActive,
        )
        .slice(0, 8),
    );
    const planList = Array.isArray(body?.plans) ? body.plans : [];
    setPlans(
      planList.map(
        (p: {
          id: string;
          label?: string;
          name?: string;
          pricePerUserFormatted?: string;
          moduleLabels?: string[];
          modules?: { portal?: boolean; sharepoint?: boolean };
        }) => ({
          id: p.id,
          label: p.label || p.name || p.id,
          pricePerUserFormatted: p.pricePerUserFormatted || "—",
          moduleLabels: p.moduleLabels,
          modules: p.modules,
        }),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  async function openModal() {
    setFormError(null);
    setCreatedCreds(null);
    let available = plans;
    if (available.length === 0) {
      const r = await apiFetch("/api/platform/plans");
      const body = await r.json().catch(() => null);
      if (r.ok && Array.isArray(body?.plans)) {
        available = body.plans
          .filter((p: { active?: boolean }) => p.active !== false)
          .map(
            (p: {
              id: string;
              label?: string;
              name?: string;
              pricePerUserFormatted?: string;
              moduleLabels?: string[];
              modules?: { portal?: boolean; sharepoint?: boolean };
            }) => ({
              id: p.id,
              label: p.label || p.name || p.id,
              pricePerUserFormatted: p.pricePerUserFormatted || "—",
              moduleLabels: p.moduleLabels,
              modules: p.modules,
            }),
          );
        setPlans(available);
      }
    }
    const first = available[0];
    setForm({
      companyName: "",
      cnpj: "",
      phone: "",
      email: "",
      planId: first?.id ?? "",
      portalModuleEnabled: first?.modules?.portal !== false,
      sharepointModuleEnabled: first?.modules?.sharepoint === true,
    });
    setModalOpen(true);
  }

  async function submitCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!form.planId) {
      setFormError("Selecione o plano inicial da empresa.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const r = await apiFetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: form.companyName.trim(),
        cnpj: form.cnpj,
        phone: form.phone,
        email: form.email.trim(),
        planId: form.planId,
        portalModuleEnabled: form.portalModuleEnabled,
        sharepointModuleEnabled: form.sharepointModuleEnabled,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setFormError(typeof body?.error === "string" ? body.error : "Erro ao cadastrar.");
      return;
    }
    setCreatedCreds({
      companyName: String(body?.name ?? form.companyName),
      email: String(body?.admin?.email ?? form.email),
      temporaryPassword: String(body?.temporaryPassword ?? ""),
      tenantId: String(body?.id ?? ""),
    });
    await loadTenants();
  }

  const cards = [
    {
      label: "Faturamento mensal",
      value: totals?.monthlyBillingFormatted ?? "—",
      icon: CreditCard,
      hint: "Soma das assinaturas ativas",
    },
    {
      label: "Clientes assinantes",
      value: totals ? `${totals.subscribedTenants}/${totals.tenants}` : "—",
      icon: Building2,
      hint: "Com plano configurado",
    },
    {
      label: "Usuários cobráveis",
      value: totals?.billableUsersActive ?? "—",
      icon: Users,
      hint: "Ativos (exclui admin da plataforma)",
    },
  ];

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1"
          style={{
            background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 px-5 py-6 md:flex-row md:items-end md:justify-between md:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
              Assinaturas
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Controle comercial WPS One</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
              Acompanhe clientes assinantes, usuários ativos cobráveis e faturamento mensal.
              Planos configuráveis na aba Planos · cobrança por usuário ativo.
            </p>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Cadastrar empresa
          </button>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border bg-[color:var(--surface)] p-4 shadow-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{card.label}</p>
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: "rgba(92,0,225,0.10)", color: "var(--primary)" }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">
                {loading ? "…" : card.value}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <section
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h3 className="text-sm font-semibold">Valor por cliente</h3>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Mensalidade = usuários ativos × preço do plano
            </p>
          </div>
          <Link
            href="/platform/tenants"
            className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
          >
            Ver todos
          </Link>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-[color:var(--muted-foreground)]">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[color:var(--muted-foreground)]">
            Nenhum cliente cadastrado.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/platform/tenants/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-black/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                      {row.subscription.label}
                      {row.subscription.pricePerUserFormatted
                        ? ` · ${row.subscription.pricePerUserFormatted}/usuário`
                        : ""}
                      {" · "}
                      {row.usage.billableUsersActive}{" "}
                      {row.usage.billableUsersActive === 1 ? "usuário ativo" : "usuários ativos"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <p className="text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
                      {row.subscription.monthlyAmountFormatted}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[color:var(--muted-foreground)]">
                      <CalendarDays className="h-3 w-3" />
                      Início {fmtDate(row.subscription.startedAt)} · Próx.{" "}
                      {fmtDate(row.subscription.nextPaymentAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border bg-[color:var(--surface)] shadow-xl"
            style={{ borderColor: "var(--border)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cadastrar-empresa-title"
          >
            <div
              className="flex items-start justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h3 id="cadastrar-empresa-title" className="text-base font-semibold">
                  Cadastrar empresa
                </h3>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Cria o tenant e o usuário SUPER_ADMIN com o e-mail informado.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-[color:var(--muted-foreground)] hover:bg-black/5"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {createdCreds ? (
              <div className="space-y-4 px-5 py-4">
                <p className="text-sm text-emerald-700">
                  Empresa <strong>{createdCreds.companyName}</strong> criada com sucesso.
                </p>
                <div
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--border)", background: "rgba(92,0,225,0.04)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Acesso do SUPER_ADMIN
                  </p>
                  <p className="mt-2">
                    <span className="text-[color:var(--muted-foreground)]">E-mail:</span>{" "}
                    <span className="font-medium">{createdCreds.email}</span>
                  </p>
                  <p className="mt-1">
                    <span className="text-[color:var(--muted-foreground)]">Senha temporária:</span>{" "}
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                      {createdCreds.temporaryPassword}
                    </code>
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                    No primeiro login o usuário deverá trocar a senha. Compartilhe esses dados com o
                    cliente.
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {createdCreds.tenantId ? (
                    <Link
                      href={`/platform/tenants/${createdCreds.tenantId}`}
                      className="inline-flex h-9 items-center rounded-lg border px-3.5 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Ver empresa
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-3.5 text-sm font-medium text-white"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => void submitCompany(e)} className="space-y-3 px-5 py-4">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Nome da empresa
                  </label>
                  <input
                    required
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={form.companyName}
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    placeholder="Ex.: Acme Consultoria"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">CNPJ</label>
                  <input
                    required
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={form.cnpj}
                    onChange={(e) => setForm((f) => ({ ...f, cnpj: formatarCnpj(e.target.value) }))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Telefone
                  </label>
                  <input
                    required
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: formatarTelefone(e.target.value) }))
                    }
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    E-mail (SUPER_ADMIN)
                  </label>
                  <input
                    required
                    type="email"
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="admin@empresa.com"
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Este e-mail será o administrador do tenant e poderá cadastrar os demais usuários.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Plano inicial
                  </label>
                  <PopoverSelect
                    id="platform-create-tenant-plan"
                    value={form.planId}
                    onChange={(planId) => {
                      const selected = plans.find((p) => p.id === planId);
                      setForm((f) => ({
                        ...f,
                        planId,
                        portalModuleEnabled: selected?.modules?.portal !== false,
                        sharepointModuleEnabled: selected?.modules?.sharepoint === true,
                      }));
                    }}
                    placeholder="Selecione um plano"
                    options={[
                      { value: "", label: "Selecione um plano" },
                      ...plans.map((p) => ({
                        value: p.id,
                        label: `${p.label} — ${p.pricePerUserFormatted}/usuário${
                          p.moduleLabels?.length ? ` (${p.moduleLabels.join(", ")})` : ""
                        }`,
                      })),
                    ]}
                  />
                  {plans.length === 0 ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Cadastre um plano ativo na aba Planos antes de criar a empresa.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                      O cliente já entra com os módulos deste plano liberados.
                    </p>
                  )}
                </div>

                <div
                  className="space-y-2 rounded-lg border px-3 py-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p className="text-xs font-semibold text-[color:var(--muted-foreground)]">
                    Ativar nesta empresa
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[color:var(--primary)]"
                      checked={form.portalModuleEnabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, portalModuleEnabled: e.target.checked }))
                      }
                    />
                    Portal Colaborativo
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[color:var(--primary)]"
                      checked={form.sharepointModuleEnabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sharepointModuleEnabled: e.target.checked }))
                      }
                    />
                    Sincronizador Cloud2Cloud / Integrações
                  </label>
                </div>

                {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setModalOpen(false)}
                    className="inline-flex h-9 items-center rounded-lg border px-3.5 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Criar empresa
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
