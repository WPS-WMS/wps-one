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
  };
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

function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [plan, setPlan] = useState<string>("");
  const [startedAt, setStartedAt] = useState("");
  const [nextPaymentAt, setNextPaymentAt] = useState("");

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
      const row = body as Detail;
      setDetail(row);
      setPlan(row.subscription.plan ?? "");
      setStartedAt(toDateInput(row.subscription.startedAt));
      setNextPaymentAt(toDateInput(row.subscription.nextPaymentAt));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveSubscription() {
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const r = await apiFetch(`/api/platform/tenants/${encodeURIComponent(id)}/subscription`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: plan || null,
        startedAt: startedAt || null,
        nextPaymentAt: nextPaymentAt || null,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setSaveError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            usage: body.usage ?? prev.usage,
            subscription: body.subscription,
          }
        : prev,
    );
    setPlan(body.subscription?.plan ?? "");
    setStartedAt(toDateInput(body.subscription?.startedAt));
    setNextPaymentAt(toDateInput(body.subscription?.nextPaymentAt));
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
    { label: "Início assinatura", value: fmtDate(detail.subscription.startedAt) },
    { label: "Próxima parcela", value: fmtDate(detail.subscription.nextPaymentAt) },
  ];

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
          Cobrança apenas por usuário ativo. Standard R$&nbsp;49 · Premium R$&nbsp;99.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Plano</label>
            <select
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">Não configurado</option>
              <option value="STANDARD">Standard — R$ 49,00 / usuário</option>
              <option value="PREMIUM">Premium — R$ 99,00 / usuário</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Início da assinatura
            </label>
            <input
              type="date"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Próxima parcela mensal
            </label>
            <input
              type="date"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={nextPaymentAt}
              onChange={(e) => setNextPaymentAt(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSubscription()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar assinatura
          </button>
          {saveOk ? (
            <span className="text-xs text-emerald-700">Assinatura atualizada.</span>
          ) : null}
          {saveError ? <span className="text-xs text-red-600">{saveError}</span> : null}
        </div>

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
            <dd className="mt-1 font-medium">{detail.subscription.status === "active" ? "Ativa" : "Não configurada"}</dd>
          </div>
        </dl>
      </section>

      <section
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold">Usuários recentes</h3>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Apenas usuários do tenant (admin da plataforma não entra na cobrança).
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
