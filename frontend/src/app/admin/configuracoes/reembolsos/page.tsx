"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Check, Loader2, Plus, Receipt, X } from "lucide-react";

type ProjectLite = { id: string; name: string; client?: { id: string; name: string } };
type TypeLite = { id: string; name: string; isActive: boolean };

function formatBrlFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function centsFromMaskedInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export default function ConfigReembolsosPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [types, setTypes] = useState<TypeLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("configuracoes")) {
      router.replace(`${basePath}`);
      return;
    }
    // Configuração de reembolsos: somente SUPER_ADMIN
    if (!isSuperAdmin) {
      router.replace(`${basePath}/configuracoes`);
      return;
    }
  }, [loading, user, can, router, basePath, isSuperAdmin]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [tRes, pRes, lRes] = await Promise.all([
        apiFetch("/api/reimbursements/admin/types"),
        apiFetch("/api/reimbursements/admin/projects"),
        apiFetch("/api/reimbursements/admin/limits"),
      ]);
      if (!tRes.ok || !pRes.ok || !lRes.ok) throw new Error("Falha ao carregar configurações de reembolso.");
      const t = await tRes.json();
      const p = await pRes.json();
      const l = await lRes.json();
      setTypes(Array.isArray(t) ? t : []);
      setProjects(Array.isArray(p) ? p : []);
      const next: Record<string, number> = {};
      for (const row of Array.isArray(l) ? l : []) {
        next[`${row.projectId}:${row.typeId}`] = row.maxValueCents;
      }
      setLimits(next);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar configurações.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && user && isSuperAdmin) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isSuperAdmin]);

  const activeTypes = useMemo(() => types.filter((t) => t.isActive), [types]);

  async function addType() {
    const name = window.prompt("Nome do tipo de reembolso:");
    if (!name) return;
    const r = await apiFetch("/api/reimbursements/admin/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) return;
    await load();
  }

  async function toggleType(t: TypeLite) {
    const r = await apiFetch(`/api/reimbursements/admin/types/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (!r.ok) return;
    await load();
  }

  async function saveLimits() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const items: Array<{ projectId: string; typeId: string; maxValueCents: number }> = [];
      for (const k of Object.keys(limits)) {
        const [projectId, typeId] = k.split(":");
        const v = limits[k];
        if (!projectId || !typeId) continue;
        if (!Number.isFinite(v) || v < 0) continue;
        items.push({ projectId, typeId, maxValueCents: Math.round(v) });
      }
      const r = await apiFetch("/api/reimbursements/admin/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) {
        const msg = await r.json().catch(() => null);
        throw new Error(msg?.error || "Erro ao salvar limites.");
      }
      setMessage("Configurações salvas com sucesso.");
      setTimeout(() => setMessage(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push(`${basePath}/configuracoes`)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-[color:var(--muted-foreground)]">
            <Receipt className="h-5 w-5 shrink-0 text-[color:var(--primary)]" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Configurações</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)] mt-0.5">Reembolsos</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            Configure tipos e limites por projeto (projeto + tipo da despesa + valor limite).
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="rounded-xl border px-4 py-3 text-sm text-red-700 dark:text-red-200" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
              {message}
            </div>
          )}

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Tipos de reembolso</h2>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border border-[color:var(--border)] hover:opacity-90"
                onClick={() => void addType()}
              >
                <Plus className="h-4 w-4" />
                Novo tipo
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void toggleType(t)}
                  className={`text-xs rounded-xl px-3 py-2 border hover:opacity-90 ${
                    t.isActive
                      ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      : "border-[color:var(--border)] bg-[color:var(--background)]/20 text-[color:var(--muted-foreground)]"
                  }`}
                  title="Clique para ativar/desativar"
                >
                  {t.isActive ? <Check className="inline h-3.5 w-3.5 mr-1" aria-hidden /> : <X className="inline h-3.5 w-3.5 mr-1" aria-hidden />}
                  {t.name}
                </button>
              ))}
              {types.length === 0 && <p className="text-sm text-[color:var(--muted-foreground)]">Nenhum tipo cadastrado.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Limites por projeto</h2>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                  Defina o limite em reais por projeto e tipo.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-50"
                onClick={() => void saveLimits()}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : (
              <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-[color:var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[color:var(--surface)] border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-3 py-2 whitespace-nowrap">Projeto</th>
                      {activeTypes.map((t) => (
                        <th key={t.id} className="px-3 py-2 whitespace-nowrap">
                          {t.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id} className="border-t border-[color:var(--border)]/60">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.name}{p.client?.name ? ` — ${p.client.name}` : ""}
                        </td>
                        {activeTypes.map((t) => {
                          const key = `${p.id}:${t.id}`;
                          const cents = limits[key];
                          const display = cents == null ? "" : formatBrlFromCents(cents);
                          return (
                            <td key={t.id} className="px-3 py-2">
                              <input
                                value={display}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  const c = centsFromMaskedInput(next);
                                  setLimits((prev) => {
                                    const cp = { ...prev };
                                    if (c == null) delete cp[key];
                                    else cp[key] = c;
                                    return cp;
                                  });
                                }}
                                placeholder="—"
                                className="w-[140px] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-2 text-xs"
                                inputMode="numeric"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {projects.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[color:var(--muted-foreground)]" colSpan={1 + activeTypes.length}>
                          Nenhum projeto encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

