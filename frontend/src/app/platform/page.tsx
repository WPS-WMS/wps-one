"use client";

import { useEffect, useState } from "react";
import { Building2, Database, FolderKanban, HardDrive, Users } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";

type Totals = {
  tenants: number;
  usersActive: number;
  projects: number;
  storageBytes: number;
  storageFormatted: string;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  usage: {
    usersActive: number;
    projects: number;
    storageFormatted: string;
    lastActivityAt: string | null;
  };
  subscription: { label: string };
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await apiFetch("/api/platform/tenants");
      const body = await r.json().catch(() => null);
      if (cancelled) return;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
        setLoading(false);
        return;
      }
      setTotals(body?.totals ?? null);
      setItems(Array.isArray(body?.items) ? body.items.slice(0, 5) : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    {
      label: "Clientes (tenants)",
      value: totals?.tenants ?? "—",
      icon: Building2,
    },
    {
      label: "Usuários ativos",
      value: totals?.usersActive ?? "—",
      icon: Users,
    },
    {
      label: "Projetos",
      value: totals?.projects ?? "—",
      icon: FolderKanban,
    },
    {
      label: "Storage (anexos)",
      value: totals?.storageFormatted ?? "—",
      icon: HardDrive,
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
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.12]"
          style={{ background: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative px-5 py-6 md:px-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
            Operações
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Controle de utilização</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
            Visão cross-tenant dos clientes WPS One. Planos e preços entram depois; por enquanto
            acompanhe cadastro e uso.
          </p>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          );
        })}
      </div>

      <section
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[color:var(--muted-foreground)]" />
            <h3 className="text-sm font-semibold">Clientes recentes</h3>
          </div>
          <Link href="/platform/tenants" className="text-xs font-semibold text-[color:var(--primary)] hover:underline">
            Ver todos
          </Link>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-[color:var(--muted-foreground)]">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[color:var(--muted-foreground)]">Nenhum tenant cadastrado.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/platform/tenants/${row.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-black/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                      {row.slug} · criado {fmtDate(row.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-[color:var(--muted-foreground)]">
                    <p>
                      {row.usage.usersActive} usuários · {row.usage.projects} projetos
                    </p>
                    <p>{row.usage.storageFormatted}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
