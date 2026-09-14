"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "@/components/Link";
import { usePathname } from "next/navigation";

type PlanOption = {
  id: string;
  label: string;
  priceCentsPerUser: number;
  pricePerUserFormatted: string;
};

type PaymentMethodOption = {
  id: string;
  label: string;
};

type SubscriptionPayload = {
  plan: string | null;
  planLabel: string;
  status: string;
  label: string;
  note?: string;
  pricePerUserFormatted: string | null;
  monthlyAmountFormatted: string;
  startedAt: string | null;
  nextPaymentAt: string | null;
  paymentMethod: string | null;
  paymentMethodLabel: string | null;
};

type ResponseBody = {
  tenant: { id: string; name: string; slug: string };
  usage: {
    usersTotal: number;
    usersActive: number;
    billableUsersActive: number;
  };
  subscription: SubscriptionPayload;
  plans?: PlanOption[];
  paymentMethods?: PaymentMethodOption[];
};

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "PIX", label: "Pix" },
  { id: "BOLETO", label: "Boleto" },
  { id: "CARTAO_CREDITO", label: "Cartão de crédito" },
];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function basePathFromPathname(pathname: string): "/admin" | "/gestor" | "/consultor" {
  if (pathname.startsWith("/gestor")) return "/gestor";
  if (pathname.startsWith("/consultor")) return "/consultor";
  return "/admin";
}

export function MySubscriptionPageContent() {
  const { user, loading: authLoading, can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = basePathFromPathname(pathname);

  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const allowed = permissionsReady && can("configuracoes.assinatura");

  useEffect(() => {
    if (authLoading || !permissionsReady) return;
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await apiFetch("/api/tenants/me/subscription");
      const body = await r.json().catch(() => null);
      if (cancelled) return;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao carregar assinatura.");
        setLoading(false);
        return;
      }
      const row = body as ResponseBody;
      setData(row);
      setPlan(row.subscription.plan ?? "");
      setPaymentMethod(row.subscription.paymentMethod ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, permissionsReady, allowed]);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    const r = await apiFetch("/api/tenants/me/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: plan || null,
        paymentMethod: plan ? paymentMethod || null : null,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    const row = body as ResponseBody;
    setData((prev) =>
      prev
        ? {
            ...prev,
            usage: row.usage,
            subscription: row.subscription,
            tenant: row.tenant,
          }
        : row,
    );
    setPlan(row.subscription.plan ?? "");
    setPaymentMethod(row.subscription.paymentMethod ?? "");
    setSaveMsg("Assinatura atualizada.");
  }

  if (authLoading || !permissionsReady || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[color:var(--muted-foreground)]">
        Carregando…
      </div>
    );
  }

  if (!user || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Apenas o Super administrador pode gerenciar a assinatura WPS One.
        </p>
        <Link href={basePath} className="mt-4 inline-block text-sm text-[color:var(--primary)]">
          Voltar
        </Link>
      </div>
    );
  }

  const plans = data?.plans ?? [
    { id: "STANDARD", label: "Standard", priceCentsPerUser: 4900, pricePerUserFormatted: "R$ 49,00" },
    { id: "PREMIUM", label: "Premium", priceCentsPerUser: 9900, pricePerUserFormatted: "R$ 99,00" },
  ];
  const paymentMethods = data?.paymentMethods ?? DEFAULT_PAYMENT_METHODS;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
          Configurações
        </p>
        <div className="mt-1 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[color:var(--primary)]" />
          <h1 className="text-xl font-semibold tracking-tight">Minha Assinatura</h1>
        </div>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          {data?.tenant.name ?? "Sua empresa"} · cobrança por usuário ativo
        </p>
      </div>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm text-red-700"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Plano atual",
            value: data?.subscription.label ?? "—",
          },
          {
            label: "Mensalidade",
            value: data?.subscription.monthlyAmountFormatted ?? "—",
          },
          {
            label: "Usuários cobráveis",
            value: data
              ? `${data.usage.billableUsersActive}/${data.usage.usersTotal}`
              : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border bg-[color:var(--surface)] p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-xs text-[color:var(--muted-foreground)]">{card.label}</p>
            <p className="mt-2 text-lg font-semibold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      <section
        className="rounded-2xl border bg-[color:var(--surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-sm font-semibold">Detalhes da assinatura</h2>
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          Standard R$&nbsp;49 e Premium R$&nbsp;99 por usuário ativo. Inativos não entram na cobrança.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Tipo de plano</label>
            <select
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={plan}
              onChange={(e) => {
                const next = e.target.value;
                setPlan(next);
                if (!next) setPaymentMethod("");
              }}
            >
              <option value="">Não configurado</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.pricePerUserFormatted} / usuário
                </option>
              ))}
            </select>
          </div>

          {plan ? (
            <div>
              <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">Forma de pagamento</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {paymentMethods.map((method) => {
                  const selected = paymentMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors"
                      style={{
                        borderColor: selected ? "var(--primary)" : "var(--border)",
                        background: selected ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        className="accent-[color:var(--primary)]"
                        checked={selected}
                        onChange={() => setPaymentMethod(method.id)}
                      />
                      <span className="font-medium">{method.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">
                O checkout com a forma escolhida será disponibilizado em breve.
              </p>
            </div>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Data de aquisição</dt>
            <dd className="mt-1 font-medium">{fmtDate(data?.subscription.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Próxima parcela</dt>
            <dd className="mt-1 font-medium">{fmtDate(data?.subscription.nextPaymentAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Preço por usuário</dt>
            <dd className="mt-1 font-medium">
              {data?.subscription.pricePerUserFormatted ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Status</dt>
            <dd className="mt-1 font-medium">
              {data?.subscription.status === "active" ? "Ativa" : "Não configurada"}
            </dd>
          </div>
          {data?.subscription.paymentMethodLabel ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[color:var(--muted-foreground)]">Pagamento salvo</dt>
              <dd className="mt-1 font-medium">{data.subscription.paymentMethodLabel}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </button>
          {saveMsg ? <span className="text-xs text-emerald-700">{saveMsg}</span> : null}
        </div>
      </section>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        <Link href={basePath} className="text-[color:var(--primary)] hover:underline">
          ← Voltar
        </Link>
      </p>
    </div>
  );
}
