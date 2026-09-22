"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

const PURPLE = "#5c00e1";

type PublicPlan = {
  id: string;
  name: string;
  code: string | null;
  priceCentsPerUser: number;
  pricePerUserFormatted: string;
  moduleLabels: string[];
  addonLabels?: string[];
  addons?: {
    id: string;
    label: string;
    priceCentsPerUser: number;
    pricePerUserFormatted: string;
  }[];
  allFeatureLabels?: string[];
  sortOrder: number;
};

type LandingPlansSectionProps = {
  isDark: boolean;
  surface: string;
  mutedBody: string;
  onTalkAboutPlan: (planName: string) => void;
};

export function LandingPlansSection({
  isDark,
  surface,
  mutedBody,
  onTalkAboutPlan,
}: LandingPlansSectionProps) {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/plans`);
        const body = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(body?.plans)) {
          throw new Error(typeof body?.error === "string" ? body.error : "Não foi possível carregar os planos.");
        }
        if (!cancelled) {
          setPlans(body.plans as PublicPlan[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar planos.");
          setPlans([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featuredId = useMemo(() => {
    if (plans.length === 0) return null;
    if (plans.length === 1) return plans[0]!.id;
    // Destaca o plano do meio (ou o de maior preço se houver empate de ordenação).
    const byPrice = [...plans].sort((a, b) => b.priceCentsPerUser - a.priceCentsPerUser);
    if (plans.length === 2) return byPrice[0]!.id;
    return plans[Math.floor(plans.length / 2)]!.id;
  }, [plans]);

  return (
    <section
      id="planos"
      className="scroll-mt-24 mx-auto w-full max-w-6xl px-6 py-8 md:py-10"
      aria-labelledby="planos-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: PURPLE }}>
        Planos
      </p>
      <h2
        id="planos-heading"
        className="mt-3 max-w-2xl text-2xl font-bold leading-tight md:text-3xl"
        style={{
          color: isDark ? "#fff" : "#0b0b12",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        }}
      >
        Escolha o plano que acompanha o ritmo da sua operação
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: mutedBody }}>
        Preços por usuário ativo, com os módulos que você precisa. Fale com a gente para implantar no seu time.
      </p>

      {loading ? (
        <div className="mt-12 flex items-center gap-2 text-sm" style={{ color: mutedBody }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando planos…
        </div>
      ) : error ? (
        <p className="mt-12 text-sm text-red-600">{error}</p>
      ) : plans.length === 0 ? (
        <p className="mt-12 text-sm" style={{ color: mutedBody }}>
          Nenhum plano disponível no momento. Entre em contato para uma proposta personalizada.
        </p>
      ) : (
        <div
          className={`mt-12 grid gap-5 ${
            plans.length === 1
              ? "mx-auto max-w-md grid-cols-1"
              : plans.length === 2
                ? "mx-auto max-w-3xl grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {plans.map((plan, index) => {
            const featured = plan.id === featuredId;
            return (
              <article
                key={plan.id}
                className="relative flex flex-col rounded-3xl p-6 md:p-7 transition-transform duration-300 hover:-translate-y-1"
                style={{
                  background: featured
                    ? isDark
                      ? "linear-gradient(165deg, rgba(92,0,225,0.28) 0%, rgba(12,8,18,0.92) 48%)"
                      : "linear-gradient(165deg, rgba(92,0,225,0.08) 0%, #ffffff 42%)"
                    : surface,
                  border: featured
                    ? `1.5px solid ${PURPLE}`
                    : `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                  boxShadow: featured
                    ? isDark
                      ? "0 18px 40px rgba(0,0,0,0.35)"
                      : "0 18px 40px rgba(17,24,39,0.08)"
                    : undefined,
                  animationDelay: `${index * 60}ms`,
                }}
              >
                {featured ? (
                  <span
                    className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ background: PURPLE }}
                  >
                    Mais escolhido
                  </span>
                ) : null}

                <h3
                  className="text-lg font-bold tracking-tight md:text-xl"
                  style={{
                    color: isDark ? "#fff" : "#0b0b12",
                    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                  }}
                >
                  {plan.name}
                </h3>

                <div className="mt-5 flex items-end gap-1.5">
                  <span
                    className="text-3xl font-bold tabular-nums tracking-tight md:text-4xl"
                    style={{ color: isDark ? "#fff" : "#0b0b12" }}
                  >
                    {plan.pricePerUserFormatted}
                  </span>
                  <span className="pb-1 text-xs font-medium" style={{ color: mutedBody }}>
                    / usuário / mês
                  </span>
                </div>

                <div className="mt-6 flex-1 space-y-5">
                  <div>
                    <p
                      className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: mutedBody }}
                    >
                      Módulos
                    </p>
                    {plan.moduleLabels.length > 0 ? (
                      <ul className="space-y-2.5">
                        {plan.moduleLabels.map((label) => (
                          <li
                            key={label}
                            className="flex items-start gap-2.5 text-sm"
                            style={{ color: mutedBody }}
                          >
                            <span
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                              style={{ background: `${PURPLE}18`, color: PURPLE }}
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                            {label}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm" style={{ color: mutedBody }}>
                        Módulos sob consulta
                      </p>
                    )}
                  </div>

                  {(plan.addons?.length ?? plan.addonLabels?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl px-3.5 py-3.5"
                      style={{
                        background: featured
                          ? isDark
                            ? "rgba(92,0,225,0.18)"
                            : "rgba(92,0,225,0.06)"
                          : isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(17,24,39,0.03)",
                        border: `1px solid ${
                          featured
                            ? `${PURPLE}40`
                            : isDark
                              ? "rgba(255,255,255,0.10)"
                              : "rgba(17,24,39,0.08)"
                        }`,
                      }}
                    >
                      <p
                        className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: PURPLE }}
                      >
                        Addons
                      </p>
                      <ul className="space-y-2.5">
                        {(plan.addons?.length
                          ? plan.addons.map((addon) => ({
                              key: addon.id,
                              label: addon.label,
                              price:
                                addon.priceCentsPerUser > 0
                                  ? `+${addon.pricePerUserFormatted}/usuário`
                                  : null,
                            }))
                          : (plan.addonLabels ?? []).map((label) => ({
                              key: label,
                              label,
                              price: null as string | null,
                            }))
                        ).map((item) => (
                          <li
                            key={item.key}
                            className="flex items-start gap-2.5 text-sm"
                            style={{ color: isDark ? "rgba(244,242,255,0.88)" : "rgba(17,24,39,0.78)" }}
                          >
                            <span
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                              style={{ background: PURPLE, color: "#fff" }}
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                            <span>
                              {item.label}
                              {item.price ? (
                                <span className="mt-0.5 block text-[11px]" style={{ color: mutedBody }}>
                                  {item.price}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onTalkAboutPlan(plan.name)}
                  className="mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-95"
                  style={
                    featured
                      ? { background: PURPLE, color: "#fff" }
                      : {
                          background: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)",
                          color: isDark ? "#fff" : "#0b0b12",
                          border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.14)"}`,
                        }
                  }
                >
                  Falar sobre este plano
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
