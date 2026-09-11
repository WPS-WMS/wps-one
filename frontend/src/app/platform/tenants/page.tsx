"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  usage: {
    usersActive: number;
    usersTotal: number;
    clients: number;
    projects: number;
    tickets: number;
    reimbursements: number;
    storageFormatted: string;
    lastActivityAt: string | null;
  };
  subscription: { label: string; status: string };
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

export default function PlatformTenantsPage() {
  const [items, setItems] = useState<TenantRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await apiFetch("/api/platform/tenants");
      const body = await r.json().catch(() => null);
      if (cancelled) return;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao carregar clientes.");
        setLoading(false);
        return;
      }
      setItems(Array.isArray(body?.items) ? body.items : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (t) => t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term),
    );
  }, [items, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
            Plataforma
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Clientes cadastrados</h2>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Utilização por tenant · assinatura em breve
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou slug…"
            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
          />
        </div>
      </div>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr
                className="text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]"
                style={{ background: "color-mix(in srgb, var(--wps-purple-600) 4%, var(--surface))" }}
              >
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Usuários</th>
                <th className="px-4 py-3">Projetos</th>
                <th className="px-4 py-3">Tickets</th>
                <th className="px-4 py-3">Storage</th>
                <th className="px-4 py-3">Última atividade</th>
                <th className="px-4 py-3">Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t hover:bg-black/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/platform/tenants/${row.id}`} className="block min-w-0">
                        <p className="font-semibold text-[color:var(--foreground)] hover:text-[color:var(--primary)]">
                          {row.name}
                        </p>
                        <p className="text-xs text-[color:var(--muted-foreground)]">{row.slug}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.usage.usersActive}
                      <span className="text-[color:var(--muted-foreground)]">/{row.usage.usersTotal}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.usage.projects}</td>
                    <td className="px-4 py-3 tabular-nums">{row.usage.tickets}</td>
                    <td className="px-4 py-3 tabular-nums">{row.usage.storageFormatted}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {fmtDate(row.usage.lastActivityAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--primary)]">
                        {row.subscription.label}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
