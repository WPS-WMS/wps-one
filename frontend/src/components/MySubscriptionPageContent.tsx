"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, CreditCard, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "@/components/Link";
import { usePathname } from "next/navigation";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  buildWpsStaticPixBrCode,
  pixQrImageUrl,
  WPS_PIX_CNPJ_FORMATTED,
  WPS_PIX_CNPJ_KEY,
} from "@/lib/wpsPix";

type PlanAddon = {
  id: "sharepoint" | "comercial" | "rh";
  label: string;
  priceCentsPerUser: number;
  pricePerUserFormatted: string;
};

type PlanOption = {
  id: string;
  name?: string;
  label: string;
  priceCentsPerUser: number;
  pricePerUserFormatted: string;
  modules?: {
    projetos: boolean;
    financeiro: boolean;
    portal: boolean;
    sharepoint?: boolean;
    comercial?: boolean;
    rh?: boolean;
  };
  moduleLabels?: string[];
  addonLabels?: string[];
  addons?: PlanAddon[];
};

type PaymentMethodOption = {
  id: string;
  label: string;
};

type SubscriptionAddonRow = PlanAddon & {
  seats: number;
  monthlyCents: number;
  monthlyFormatted: string;
  users?: Array<{ id: string; name: string; email: string }>;
};

type SubscriptionPayload = {
  plan: string | null;
  planId?: string | null;
  planLabel: string;
  status: string;
  statusLabel?: string;
  label: string;
  note?: string;
  pricePerUserFormatted: string | null;
  monthlyAmountCents?: number;
  monthlyAmountFormatted: string;
  baseMonthlyAmountFormatted?: string;
  addonMonthlyAmountFormatted?: string;
  startedAt: string | null;
  nextPaymentAt: string | null;
  paymentMethod: string | null;
  paymentMethodLabel: string | null;
  canceledAt?: string | null;
  accessUntil?: string | null;
  moduleLabels?: string[];
  addonLabels?: string[];
  addonSeats?: {
    sharepoint: number;
    comercial: number;
    rh: number;
  };
  addons?: SubscriptionAddonRow[];
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
  message?: string;
};

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "PIX", label: "Pix" },
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
  const { user, loading: authLoading, can, permissionsReady, refreshSession } = useAuth();
  const pathname = usePathname();
  const basePath = basePathFromPathname(pathname);

  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pixCopied, setPixCopied] = useState<"key" | "brcode" | null>(null);

  const allowed = permissionsReady && can("configuracoes.assinatura");

  /** Valor do Pix = mensalidade deste tenant (plano + addons × usuários). */
  const pixAmountCents = useMemo(() => {
    if (!data) return null;
    const selected = (data.plans ?? []).find((p) => p.id === plan);
    if (selected) {
      const billable = data.usage.billableUsersActive;
      const base = billable * selected.priceCentsPerUser;
      const addonCents = (selected.addons ?? []).reduce((sum, a) => {
        const fromSub = data.subscription.addons?.find((s) => s.id === a.id);
        const seats = fromSub?.seats ?? 0;
        return sum + seats * a.priceCentsPerUser;
      }, 0);
      return base + addonCents;
    }
    return data.subscription.monthlyAmountCents ?? 0;
  }, [data, plan]);

  const pixAmountFormatted = useMemo(() => {
    if (pixAmountCents == null || pixAmountCents <= 0) return null;
    return (pixAmountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }, [pixAmountCents]);

  const pixBrCode = useMemo(
    () => buildWpsStaticPixBrCode({ amountCents: pixAmountCents }),
    [pixAmountCents],
  );
  const pixQrUrl = useMemo(() => pixQrImageUrl(pixBrCode, 200), [pixBrCode]);

  async function copyPix(text: string, kind: "key" | "brcode") {
    try {
      await navigator.clipboard.writeText(text);
      setPixCopied(kind);
      window.setTimeout(() => setPixCopied(null), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

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
      setPlan(row.subscription.planId ?? row.subscription.plan ?? "");
      const method = row.subscription.paymentMethod ?? "";
      setPaymentMethod(method === "BOLETO" ? "" : method);
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
        planId: plan || null,
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
    setPlan(row.subscription.planId ?? row.subscription.plan ?? "");
    const nextMethod = row.subscription.paymentMethod ?? "";
    setPaymentMethod(nextMethod === "BOLETO" ? "" : nextMethod);
    setSaveMsg("Assinatura atualizada.");
    await refreshSession?.();
    // Garante menus/rotas com os módulos do novo plano.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  async function cancelSubscription() {
    setCanceling(true);
    setError(null);
    setSaveMsg(null);
    const r = await apiFetch("/api/tenants/me/subscription/cancel", { method: "POST" });
    const body = await r.json().catch(() => null);
    setCanceling(false);
    setConfirmCancel(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar assinatura.");
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
    setSaveMsg(
      typeof body?.message === "string"
        ? body.message
        : "Cancelamento agendado. Você pode usar a plataforma até o fim do período.",
    );
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

  const plans = data?.plans ?? [];
  const paymentMethods = data?.paymentMethods ?? DEFAULT_PAYMENT_METHODS;
  const status = data?.subscription.status ?? "none";
  const isCanceling = status === "canceling";
  const isTrial = status === "trial";
  const isLocked = status === "locked";
  const hasPlan = Boolean(data?.subscription.planId ?? data?.subscription.plan);
  const accessUntilLabel = fmtDate(data?.subscription.accessUntil);
  const selectedPlan = plans.find((p) => p.id === plan) ?? null;
  const subscriptionAddons = data?.subscription.addons ?? [];
  const selectedPlanAddons = selectedPlan?.addons ?? [];
  /** Preferir addons da assinatura salva (com nomes); se o plano selecionado for outro, mostrar os do plano. */
  const addonRows: SubscriptionAddonRow[] =
    plan && data?.subscription.planId === plan && subscriptionAddons.length > 0
      ? subscriptionAddons
      : selectedPlanAddons.map((a) => {
          const fromSub = subscriptionAddons.find((s) => s.id === a.id);
          return {
            ...a,
            seats: fromSub?.seats ?? 0,
            monthlyCents: fromSub?.monthlyCents ?? 0,
            monthlyFormatted: fromSub?.monthlyFormatted ?? "R$ 0,00",
            users: fromSub?.users ?? [],
          };
        });

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

      {isTrial ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(92,0,225,0.35)",
            background: "rgba(92,0,225,0.10)",
            color: "var(--foreground)",
          }}
        >
          Você está no <strong>teste grátis</strong>
          {accessUntilLabel ? (
            <>
              {" "}
              até <strong>{accessUntilLabel}</strong>
            </>
          ) : null}
          . Escolha um plano abaixo e salve para continuar usando após o período. Sem assinatura, o
          acesso será bloqueado.
        </div>
      ) : null}

      {isCanceling ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm text-amber-900"
          style={{ borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.12)" }}
        >
          Cancelamento agendado. Você e sua equipe podem usar a plataforma até{" "}
          <strong>{accessUntilLabel}</strong>. Depois disso o acesso será bloqueado para todos,
          inclusive o Super administrador.
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
          Os planos e módulos são definidos no painel da plataforma. Inativos não entram na cobrança.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Tipo de plano</label>
            <PopoverSelect
              id="subscription-plan"
              value={plan}
              disabled={isCanceling || isLocked}
              placeholder="Não configurado"
              onChange={(next) => {
                setPlan(next);
                if (!next) setPaymentMethod("");
              }}
              options={[
                { value: "", label: "Não configurado" },
                ...plans.map((p) => ({
                  value: p.id,
                  label: `${p.label} — ${p.pricePerUserFormatted} / usuário`,
                })),
              ]}
            />
            {plans.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Nenhum plano ativo disponível. Peça ao time WPS One para cadastrar na aba Planos.
              </p>
            ) : null}
          </div>

          {plan && addonRows.length > 0 ? (
            <div>
              <p className="mb-1 text-xs text-[color:var(--muted-foreground)]">
                Addons em uso
              </p>
              <p className="mb-2 text-[11px] text-[color:var(--muted-foreground)]">
                Só leitura — atribua em{" "}
                <Link href={`${basePath}/usuarios`} className="text-[color:var(--primary)] hover:underline">
                  Usuários
                </Link>
                . Perfil Cliente não é cobrado.
              </p>
              <div className="space-y-2">
                {addonRows.map((addon) => {
                  const seats = addon.seats ?? 0;
                  const users = addon.users ?? [];
                  const namesPreview = users.map((u) => u.name).join(", ");
                  return (
                    <div
                      key={addon.id}
                      className="rounded-lg border px-3 py-2.5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{addon.label}</p>
                          <p className="text-[11px] text-[color:var(--muted-foreground)]">
                            +{addon.pricePerUserFormatted} / usuário
                            {seats > 0 ? ` · ${addon.monthlyFormatted}/mês` : ""}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm tabular-nums font-medium">
                          {seats} usuário{seats === 1 ? "" : "s"}
                        </p>
                      </div>
                      {seats > 0 && users.length > 0 ? (
                        <p
                          className="mt-2 text-xs text-[color:var(--muted-foreground)]"
                          title={namesPreview}
                        >
                          {namesPreview}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                          Nenhum usuário com este addon.{" "}
                          <Link
                            href={`${basePath}/usuarios`}
                            className="text-[color:var(--primary)] hover:underline"
                          >
                            Atribuir em Usuários
                          </Link>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : plan ? (
            <div>
              <p className="mb-1 text-xs text-[color:var(--muted-foreground)]">Addons em uso</p>
              <p className="text-[11px] text-[color:var(--muted-foreground)]">
                Este plano não inclui addons. Se precisar de Cloud2Cloud, Comercial ou RH, escolha um
                plano que os contenha ou peça ao time WPS One.
              </p>
            </div>
          ) : null}

          {plan ? (
            <div>
              <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">Forma de pagamento</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {paymentMethods.map((method) => {
                  const selected = paymentMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        isCanceling || isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                      style={{
                        borderColor: selected ? "var(--primary)" : "var(--border)",
                        background: selected
                          ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                          : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        className="accent-[color:var(--primary)]"
                        checked={selected}
                        disabled={isCanceling || isLocked}
                        onChange={() => setPaymentMethod(method.id)}
                      />
                      <span className="font-medium">{method.label}</span>
                    </label>
                  );
                })}
              </div>

              {paymentMethod === "PIX" ? (
                <div
                  className="mt-3 rounded-xl border p-4"
                  style={{
                    borderColor: "color-mix(in srgb, var(--primary) 30%, var(--border))",
                    background: "color-mix(in srgb, var(--primary) 5%, transparent)",
                  }}
                >
                  <p className="text-sm font-semibold">Pagar com Pix</p>
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Escaneie o QR Code ou use o Pix copia e cola. Chave: CNPJ {WPS_PIX_CNPJ_FORMATTED}.
                    {pixAmountFormatted
                      ? ` Valor já incluso: ${pixAmountFormatted}.`
                      : " O valor será informado no app do banco."}
                  </p>
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="mx-auto shrink-0 rounded-xl border bg-white p-2 sm:mx-0" style={{ borderColor: "var(--border)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pixQrUrl}
                        alt="QR Code Pix WPS One"
                        width={200}
                        height={200}
                        className="h-[200px] w-[200px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-[color:var(--muted-foreground)]">
                          Chave Pix (CNPJ)
                        </label>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={WPS_PIX_CNPJ_FORMATTED}
                            className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm tabular-nums"
                            style={{ borderColor: "var(--border)" }}
                          />
                          <button
                            type="button"
                            onClick={() => void copyPix(WPS_PIX_CNPJ_KEY, "key")}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-black/5"
                            style={{ borderColor: "var(--border)" }}
                          >
                            {pixCopied === "key" ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {pixCopied === "key" ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[color:var(--muted-foreground)]">
                          Pix copia e cola
                        </label>
                        <div className="flex gap-2">
                          <textarea
                            readOnly
                            rows={3}
                            value={pixBrCode}
                            className="min-w-0 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 font-mono text-[11px] leading-relaxed"
                            style={{ borderColor: "var(--border)" }}
                          />
                          <button
                            type="button"
                            onClick={() => void copyPix(pixBrCode, "brcode")}
                            className="inline-flex h-fit items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-black/5"
                            style={{ borderColor: "var(--border)" }}
                          >
                            {pixCopied === "brcode" ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {pixCopied === "brcode" ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : paymentMethod === "CARTAO_CREDITO" ? (
                <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">
                  O checkout com cartão será disponibilizado em breve.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">
                  Selecione a forma de pagamento.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <dl
          className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Data de aquisição</dt>
            <dd className="mt-1 font-medium">{fmtDate(data?.subscription.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">
              {isCanceling ? "Acesso até" : "Próxima mensalidade"}
            </dt>
            <dd className="mt-1 font-medium">
              {fmtDate(isCanceling ? data?.subscription.accessUntil : data?.subscription.nextPaymentAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Preço base / usuário</dt>
            <dd className="mt-1 font-medium">{data?.subscription.pricePerUserFormatted ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Status</dt>
            <dd className="mt-1 font-medium">
              {data?.subscription.statusLabel ??
                (status === "active"
                  ? "Ativa"
                  : status === "canceling"
                    ? "Cancelamento agendado"
                    : status === "locked"
                      ? "Encerrada"
                      : "Não configurada")}
            </dd>
          </div>
          {data?.subscription.baseMonthlyAmountFormatted ? (
            <div>
              <dt className="text-xs text-[color:var(--muted-foreground)]">Mensalidade (plano)</dt>
              <dd className="mt-1 font-medium">{data.subscription.baseMonthlyAmountFormatted}</dd>
            </div>
          ) : null}
          {(data?.subscription.addons?.some((a) => a.monthlyCents > 0) ?? false) ? (
            <div>
              <dt className="text-xs text-[color:var(--muted-foreground)]">Mensalidade (addons)</dt>
              <dd className="mt-1 font-medium">{data?.subscription.addonMonthlyAmountFormatted}</dd>
            </div>
          ) : null}
          {data?.subscription.moduleLabels?.length ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[color:var(--muted-foreground)]">Módulos do plano</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {data.subscription.moduleLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--primary)]"
                  >
                    {label}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {data?.subscription.addons?.length ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[color:var(--muted-foreground)]">Addons contratados</dt>
              <dd className="mt-1 space-y-1">
                {data.subscription.addons.map((addon) => (
                  <p key={addon.id} className="text-sm">
                    <span className="font-medium">{addon.label}</span>
                    <span className="text-[color:var(--muted-foreground)]">
                      {" "}
                      · {addon.seats} usuário{addon.seats === 1 ? "" : "s"} ·{" "}
                      {addon.monthlyFormatted}/mês
                    </span>
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
          {data?.subscription.paymentMethodLabel ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[color:var(--muted-foreground)]">Pagamento salvo</dt>
              <dd className="mt-1 font-medium">{data.subscription.paymentMethodLabel}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!isCanceling && !isLocked ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar alterações
            </button>
          ) : null}
          {hasPlan && !isCanceling && !isLocked ? (
            <button
              type="button"
              disabled={canceling}
              onClick={() => setConfirmCancel(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Cancelar assinatura
            </button>
          ) : null}
          {saveMsg ? <span className="text-xs text-emerald-700">{saveMsg}</span> : null}
        </div>
      </section>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        <Link href={basePath} className="text-[color:var(--primary)] hover:underline">
          ← Voltar
        </Link>
      </p>

      {confirmCancel ? (
        <ConfirmModal
          title="Cancelar assinatura?"
          message={`Ao confirmar, você poderá usar a plataforma até o dia da próxima parcela (${fmtDate(
            data?.subscription.nextPaymentAt ?? data?.subscription.accessUntil,
          )}). Depois disso o acesso será bloqueado para todos os usuários, inclusive o Super administrador.`}
          confirmLabel={canceling ? "Cancelando…" : "Confirmar cancelamento"}
          cancelLabel="Manter assinatura"
          variant="danger"
          onCancel={() => !canceling && setConfirmCancel(false)}
          onConfirm={() => void cancelSubscription()}
        />
      ) : null}
    </div>
  );
}
