"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarClock, Loader2, UserPlus } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";

type MetricsResponse = {
  totals: {
    landingSignups: number;
    demoRequests: number;
    contactRequests: number;
    trialsActive: number;
    trialsLocked: number;
  };
  landingSignups: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    employeeCountLabel: string | null;
    companyNeed: string | null;
    adminName: string | null;
    adminEmail: string | null;
  }>;
  demoRequests: Array<{
    id: string;
    name: string;
    company: string | null;
    email: string;
    phone: string | null;
    createdAt: string;
  }>;
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

function statusLabel(status: string | null) {
  if (status === "trial") return "Teste grátis";
  if (status === "active") return "Assinante";
  if (status === "locked") return "Bloqueado";
  if (status === "canceling") return "Cancelando";
  return status || "—";
}

export default function PlatformMetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/platform/metrics");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar métricas.");
      setLoading(false);
      return;
    }
    setData(body as MetricsResponse);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando métricas…
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-600">{error || "Sem dados."}</p>;
  }

  const cards = [
    {
      label: "Contas novas (landing)",
      value: data.totals.landingSignups,
      icon: UserPlus,
      hint: "Cadastros pelo botão Criar conta",
    },
    {
      label: "Demonstrações",
      value: data.totals.demoRequests,
      icon: CalendarClock,
      hint: "Solicitações de agendamento",
    },
    {
      label: "Em teste grátis",
      value: data.totals.trialsActive,
      icon: BarChart3,
      hint: "Ainda no período de 7 dias",
    },
    {
      label: "Bloqueados pós-teste",
      value: data.totals.trialsLocked,
      icon: BarChart3,
      hint: "Teste expirou sem assinatura",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Métricas</h2>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Acompanhamento de cadastros e demonstrações vindos da landing do WPS One.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-2xl border bg-[color:var(--surface)] p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[color:var(--muted-foreground)]">{c.label}</p>
                <Icon className="h-4 w-4 text-[color:var(--primary)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
              <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">{c.hint}</p>
            </div>
          );
        })}
      </div>

      <section
        className="rounded-2xl border bg-[color:var(--surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold">Contas criadas na landing</h3>
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          Últimos cadastros (até 100). Abra o cliente para ver colaboradores e necessidade.
        </p>
        {data.landingSignups.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">Nenhuma conta ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-[color:var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                  <th className="pb-2 pr-3 font-medium">Empresa</th>
                  <th className="pb-2 pr-3 font-medium">Admin</th>
                  <th className="pb-2 pr-3 font-medium">Colaboradores</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {data.landingSignups.map((row) => (
                  <tr key={row.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/platform/tenants/${row.id}`}
                        className="font-medium text-[color:var(--primary)] hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.companyNeed ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-[color:var(--muted-foreground)]">
                          {row.companyNeed}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-[color:var(--muted-foreground)]">
                      <span className="block text-[color:var(--foreground)]">{row.adminName || "—"}</span>
                      <span className="text-xs">{row.adminEmail || ""}</span>
                    </td>
                    <td className="py-2.5 pr-3">{row.employeeCountLabel || "—"}</td>
                    <td className="py-2.5 pr-3">
                      {statusLabel(row.subscriptionStatus)}
                      {row.trialEndsAt && row.subscriptionStatus === "trial" ? (
                        <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">
                          até {fmtDate(row.trialEndsAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border bg-[color:var(--surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold">Agendamentos de demonstração</h3>
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          Últimas solicitações do botão Agendar demonstração (até 50).
        </p>
        {data.demoRequests.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">Nenhuma solicitação ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-[color:var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                  <th className="pb-2 pr-3 font-medium">Nome</th>
                  <th className="pb-2 pr-3 font-medium">Empresa</th>
                  <th className="pb-2 pr-3 font-medium">Contato</th>
                  <th className="pb-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {data.demoRequests.map((row) => (
                  <tr key={row.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                    <td className="py-2.5 pr-3">{row.company || "—"}</td>
                    <td className="py-2.5 pr-3 text-[color:var(--muted-foreground)]">
                      <span className="block text-[color:var(--foreground)]">{row.email}</span>
                      <span className="text-xs">{row.phone || ""}</span>
                    </td>
                    <td className="py-2.5">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
