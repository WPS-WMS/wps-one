"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Rocket, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ProductUpdate = {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  createdAt?: string;
};

function formatWhen(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlatformProductUpdatesPage() {
  const [items, setItems] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/product-updates?limit=100");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar.");
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(Array.isArray(body?.items) ? body.items : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setFormError("Informe o título da atualização.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const r = await apiFetch("/api/product-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, content: content.trim() }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setFormError(typeof body?.error === "string" ? body.error : "Erro ao publicar.");
      return;
    }
    setTitle("");
    setContent("");
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir esta atualização? Ela some do portal de todos os tenants.")) return;
    setDeletingId(id);
    const r = await apiFetch(`/api/product-updates/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir.");
      return;
    }
    await load();
  }

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
        <div className="relative px-5 py-6 md:px-7">
          <div className="flex items-center gap-2 text-[color:var(--primary)]">
            <Rocket className="h-4 w-4" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Produto</p>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Atualizações do WPS One</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
            Publicações globais exibidas no portal colaborativo de todos os tenants. Somente a
            plataforma edita este conteúdo.
          </p>
        </div>
      </section>

      <form
        onSubmit={(e) => void publish(e)}
        className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
      >
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Nova atualização</h3>
        <label className="block text-[11px] text-[color:var(--muted-foreground)]">
          Título
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Novo fluxo de assinatura"
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]"
          />
        </label>
        <label className="block text-[11px] text-[color:var(--muted-foreground)]">
          Descrição
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="O que mudou e para quem..."
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]"
          />
        </label>
        {formError ? <p className="text-xs text-red-500">{formError}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? "Publicando…" : "Publicar para todos os tenants"}
        </button>
      </form>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}
        >
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[color:var(--foreground)]">Publicadas</h3>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma atualização ainda.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[color:var(--foreground)]">{item.title}</h4>
                    <time className="shrink-0 text-[11px] text-[color:var(--primary)]">
                      {formatWhen(item.publishedAt)}
                    </time>
                  </div>
                  {item.content?.trim() ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                      {item.content}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={deletingId === item.id}
                  onClick={() => void remove(item.id)}
                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                  aria-label="Excluir atualização"
                >
                  {deletingId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
