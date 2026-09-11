"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    clients: number;
    projects: number;
    tickets: number;
    timeEntries: number;
    reimbursements: number;
    payables: number;
    receivables: number;
    storageBytes: number;
    storageFormatted: string;
    lastActivityAt: string | null;
  };
  subscription: {
    plan: string | null;
    status: string;
    label: string;
    note?: string;
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
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlatformTenantDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
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
      setDetail(body as Detail);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
    { label: "Usuários ativos", value: `${detail.usage.usersActive}/${detail.usage.usersTotal}` },
    { label: "Clientes", value: detail.usage.clients },
    { label: "Projetos", value: detail.usage.projects },
    { label: "Tickets", value: detail.usage.tickets },
    { label: "Apontamentos", value: detail.usage.timeEntries },
    { label: "Reembolsos", value: detail.usage.reimbursements },
    { label: "Contas a pagar", value: detail.usage.payables },
    { label: "Contas a receber", value: detail.usage.receivables },
    { label: "Storage", value: detail.usage.storageFormatted },
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
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          {detail.subscription.note || "Planos e preços ainda não configurados."}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Plano</dt>
            <dd className="mt-1 font-medium">{detail.subscription.plan || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Status</dt>
            <dd className="mt-1 font-medium">{detail.subscription.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--muted-foreground)]">Storage</dt>
            <dd className="mt-1 font-medium tabular-nums">{detail.usage.storageFormatted}</dd>
          </div>
        </dl>
      </section>

      <section
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold">Usuários recentes</h3>
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
