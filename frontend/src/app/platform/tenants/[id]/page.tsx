"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";

type Detail = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt?: string;
  portalModuleEnabled?: boolean;
  sharepointModuleEnabled?: boolean;
  hasSubscriptionPlan?: boolean;
  planModules?: {
    portal?: boolean;
    sharepoint?: boolean;
  };
  usage: {
    usersTotal: number;
    usersActive: number;
    billableUsersActive: number;
    projects: number;
    storageBytes: number;
    storageFormatted: string;
    lastActivityAt: string | null;
  };
  subscription: {
    plan: string | null;
    planLabel: string;
    status: string;
    label: string;
    note?: string;
    priceCentsPerUser: number | null;
    pricePerUserFormatted: string | null;
    monthlyAmountCents: number;
    monthlyAmountFormatted: string;
    startedAt: string | null;
    nextPaymentAt: string | null;
    paymentMethod?: string | null;
    paymentMethodLabel?: string | null;
  };
  primaryAdmin: {
    id: string;
    name: string;
    email: string;
    role: string;
    ativo: boolean;
  } | null;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    ativo: boolean;
    updatedAt: string;
  }>;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateLong(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function PlatformTenantDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const id = useMemo(() => {
    const fromParams = String(params?.id ?? "").trim();
    if (fromParams && fromParams !== "_") return fromParams;
    const parts = pathname.split("/").filter(Boolean);
    const fromPath = parts[parts.length - 1] ?? "";
    return fromPath && fromPath !== "_" ? fromPath : "";
  }, [params?.id, pathname]);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [portalModuleEnabled, setPortalModuleEnabled] = useState(true);
  const [sharepointModuleEnabled, setSharepointModuleEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Tenant inválido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await apiFetch(`/api/platform/tenants/${encodeURIComponent(id)}`);
      const body = await r.json().catch(() => null);
      if (cancelled) return;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
        setLoading(false);
        return;
      }
      const next = body as Detail;
      setDetail(next);
      setCompanyName(next.name ?? "");
      setAdminName(next.primaryAdmin?.name ?? "");
      setAdminEmail(next.primaryAdmin?.email ?? "");
      setPortalModuleEnabled(next.portalModuleEnabled !== false);
      setSharepointModuleEnabled(next.sharepointModuleEnabled === true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const payload: Record<string, string | boolean> = {
      companyName: companyName.trim(),
      portalModuleEnabled,
      sharepointModuleEnabled,
    };
    if (detail?.primaryAdmin) {
      payload.adminName = adminName.trim();
      payload.adminEmail = adminEmail.trim().toLowerCase();
    }
    const r = await apiFetch(`/api/platform/tenants/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setSaveError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    const next = body as Detail;
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            name: next.name,
            slug: next.slug,
            updatedAt: next.updatedAt,
            portalModuleEnabled: next.portalModuleEnabled,
            sharepointModuleEnabled: next.sharepointModuleEnabled,
            hasSubscriptionPlan: next.hasSubscriptionPlan ?? prev.hasSubscriptionPlan,
            planModules: next.planModules ?? prev.planModules,
            primaryAdmin: next.primaryAdmin ?? prev.primaryAdmin,
            usage: next.usage ?? prev.usage,
            subscription: next.subscription ?? prev.subscription,
          }
        : prev,
    );
    setCompanyName(next.name ?? companyName);
    setAdminName(next.primaryAdmin?.name ?? adminName);
    setAdminEmail(next.primaryAdmin?.email ?? adminEmail);
    setPortalModuleEnabled(next.portalModuleEnabled !== false);
    setSharepointModuleEnabled(next.sharepointModuleEnabled === true);
    setSaveOk(true);
  }

  if (loading) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Carregando…</p>;
  }
  if (error || !detail) {
    return (
      <div className="space-y-3">
        <Link href="/platform/tenants" className="inline-flex items-center gap-1 text-sm text-[color:var(--primary)]">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <p className="text-sm text-red-600">{error || "Tenant não encontrado."}</p>
      </div>
    );
  }

  const metrics = [
    {
      label: "Usuários cobráveis",
      value: `${detail.usage.billableUsersActive}/${detail.usage.usersTotal}`,
    },
    { label: "Mensalidade", value: detail.subscription.monthlyAmountFormatted },
    {
      label: "Preço / usuário",
      value: detail.subscription.pricePerUserFormatted ?? "—",
    },
    { label: "Projetos", value: detail.usage.projects },
    { label: "Storage", value: detail.usage.storageFormatted },
  ];

  const dirty =
    companyName.trim() !== detail.name ||
    portalModuleEnabled !== (detail.portalModuleEnabled !== false) ||
    sharepointModuleEnabled !== (detail.sharepointModuleEnabled === true) ||
    (detail.primaryAdmin
      ? adminName.trim() !== detail.primaryAdmin.name ||
        adminEmail.trim().toLowerCase() !== detail.primaryAdmin.email
      : false);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform/tenants"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--primary)]"
        >
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{detail.name}</h2>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {detail.slug} · criado em {fmtDate(detail.createdAt)} · última atividade{" "}
              {fmtDate(detail.usage.lastActivityAt)}
            </p>
          </div>
          <span className="inline-flex rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--primary)]">
            {detail.subscription.label}
          </span>
        </div>
      </div>

      <section
        className="rounded-2xl border bg-[color:var(--surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold">Dados da empresa</h3>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Nome do tenant e e-mail do SUPER_ADMIN criado pela plataforma. Esse usuário não aparece
          na lista de usuários do cliente.
        </p>

        <form onSubmit={handleSave} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Nome da empresa
            </label>
            <input
              required
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                setSaveOk(false);
              }}
            />
          </div>
          {detail.primaryAdmin ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  Nome do SUPER_ADMIN
                </label>
                <input
                  required
                  className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                  value={adminName}
                  onChange={(e) => {
                    setAdminName(e.target.value);
                    setSaveOk(false);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  E-mail do SUPER_ADMIN
                </label>
                <input
                  required
                  type="email"
                  className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    setSaveOk(false);
                  }}
                />
              </div>
            </>
          ) : (
            <p className="sm:col-span-2 text-sm text-amber-700">
              Nenhum SUPER_ADMIN provisionado pela plataforma encontrado neste tenant.
            </p>
          )}

          <div className="sm:col-span-2 space-y-2 rounded-xl border px-3 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold text-[color:var(--muted-foreground)]">
              Módulos adicionais (ativação por empresa)
            </p>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-[color:var(--primary)]"
                checked={portalModuleEnabled}
                onChange={(e) => {
                  setPortalModuleEnabled(e.target.checked);
                  setSaveOk(false);
                }}
              />
              <span>
                <span className="font-medium">Portal Colaborativo</span>
                <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">
                  Libera a tela do portal nesta empresa
                  {detail.hasSubscriptionPlan && detail.planModules?.portal === false
                    ? " (o plano atual não inclui este módulo)"
                    : !detail.hasSubscriptionPlan
                      ? " (empresa sem plano: basta esta chave)"
                      : ""}
                  .
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-[color:var(--primary)]"
                checked={sharepointModuleEnabled}
                onChange={(e) => {
                  setSharepointModuleEnabled(e.target.checked);
                  setSaveOk(false);
                }}
              />
              <span>
                <span className="font-medium">Sincronizador Cloud2Cloud / Integrações</span>
                <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">
                  Libera a tela de Integrações (Sincronizador Cloud2Cloud/Teams)
                  {detail.hasSubscriptionPlan && detail.planModules?.sharepoint === false
                    ? " (o plano atual não inclui este módulo)"
                    : !detail.hasSubscriptionPlan
                      ? " (empresa sem plano: basta esta chave)"
                      : ""}
                  .
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar alterações
            </button>
            {saveOk ? (
              <span className="text-sm text-emerald-700">Salvo.</span>
            ) : null}
            {saveError ? <span className="text-sm text-red-600">{saveError}</span> : null}
          </div>
        </form>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border bg-[color:var(--surface)] p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-xs text-[color:var(--muted-foreground)]">{m.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      <section
        className="rounded-2xl border bg-[color:var(--surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold">Assinatura</h3>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Somente visual. A empresa define o plano em Minha Assinatura. Os planos e módulos são
          configurados na aba Planos do painel.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Tipo do plano</dt>
            <dd className="mt-1 text-base font-semibold">
              {detail.subscription.plan
                ? `${detail.subscription.planLabel}${
                    detail.subscription.pricePerUserFormatted
                      ? ` — ${detail.subscription.pricePerUserFormatted}`
                      : ""
                  }`
                : "Não configurado"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Data de aquisição</dt>
            <dd className="mt-1 text-base font-semibold">{fmtDateLong(detail.subscription.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Próxima parcela</dt>
            <dd className="mt-1 text-base font-semibold">
              {fmtDateLong(detail.subscription.nextPaymentAt)}
            </dd>
          </div>
        </dl>

        <dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Mensalidade calculada</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {detail.subscription.monthlyAmountFormatted}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Usuários cobráveis</dt>
            <dd className="mt-1 font-medium tabular-nums">{detail.usage.billableUsersActive}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Status</dt>
            <dd className="mt-1 font-medium">
              {detail.subscription.status === "active" ? "Ativa" : "Não configurada"}
            </dd>
          </div>
          {detail.subscription.paymentMethodLabel ? (
            <div>
              <dt className="text-xs text-[color:var(--muted-foreground)]">Forma de pagamento</dt>
              <dd className="mt-1 font-medium">{detail.subscription.paymentMethodLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold">Usuários recentes</h3>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Sem o SUPER_ADMIN provisionado pela plataforma (editável acima).
          </p>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {detail.recentUsers.length === 0 ? (
            <li className="px-5 py-6 text-sm text-[color:var(--muted-foreground)]">Nenhum usuário.</li>
          ) : (
            detail.recentUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.name}
                    {!u.ativo ? (
                      <span className="ml-2 text-[10px] uppercase text-red-600">inativo</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                    {u.email} · {u.role}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-[color:var(--muted-foreground)]">
                  {fmtDate(u.updatedAt)}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
