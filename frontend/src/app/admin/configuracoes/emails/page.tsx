"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Mail, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const PROJECT_TYPES = ["INTERNO", "FIXED_PRICE", "TIME_MATERIAL", "AMS"] as const;
const TRIGGERS = [
  "CRIACAO",
  "STATUS_CHANGE",
  "COMENTARIO",
  "ORCAMENTO",
  "RESPOSTA_ORCAMENTO",
  "MODIFICACAO",
  "LIMITE_DIARIO_EXCEDIDO",
] as const;

const PROJECT_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  INTERNO: "Projeto Interno",
  FIXED_PRICE: "Projeto Fechado",
  TIME_MATERIAL: "Time & Material",
  AMS: "AMS",
};

const TRIGGER_LABELS: Record<(typeof TRIGGERS)[number], string> = {
  CRIACAO: "Criação",
  STATUS_CHANGE: "Mudança de status",
  COMENTARIO: "Comentário",
  ORCAMENTO: "Orçamento",
  RESPOSTA_ORCAMENTO: "Resposta de orçamento",
  MODIFICACAO: "Modificação",
  LIMITE_DIARIO_EXCEDIDO: "Limite diário de apontamento",
};

type RuleRow = {
  projectType: (typeof PROJECT_TYPES)[number];
  trigger: (typeof TRIGGERS)[number];
  isActive: boolean;
};

export default function ConfiguracoesEmailsPage() {
  const router = useRouter();
  const { user, loading, can, permissionsReady } = useAuth();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRules(true);
    setError(null);
    try {
      const res = await apiFetch("/api/email-notification-rules/admin");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Erro ao carregar");
      setRules(Array.isArray(data) ? data : []);
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user || !permissionsReady) return;
    if (!can("configuracoes.emails")) return;
    void load();
  }, [loading, user, permissionsReady, can, load]);

  const matrix = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of rules) {
      m.set(`${r.projectType}:${r.trigger}`, r.isActive);
    }
    return m;
  }, [rules]);

  function isOn(pt: (typeof PROJECT_TYPES)[number], tr: (typeof TRIGGERS)[number]) {
    return matrix.get(`${pt}:${tr}`) ?? true;
  }

  function setCell(pt: (typeof PROJECT_TYPES)[number], tr: (typeof TRIGGERS)[number], isActive: boolean) {
    setRules((prev) => {
      const next = prev.map((r) =>
        r.projectType === pt && r.trigger === tr ? { ...r, isActive } : r,
      );
      return next;
    });
    setDirty(true);
    setSuccess(null);
  }

  async function saveAll() {
    if (rules.length !== PROJECT_TYPES.length * TRIGGERS.length) {
      setError("Matriz incompleta. Recarregue a página.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/email-notification-rules/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string })?.error ?? "Erro ao salvar");
      setSuccess("Configurações salvas.");
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      </div>
    );
  }

  if (!can("configuracoes.emails")) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh] px-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Acesso negado.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push("/admin/configuracoes")}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header
        className="flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--foreground)] flex items-center gap-2">
            <Mail className="h-6 w-6 shrink-0" style={{ color: "var(--primary)" }} />
            E-mails
          </h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 leading-relaxed max-w-2xl">
            Defina quais e-mails são enviados (chamados e apontamentos), por tipo de projeto e gatilho.
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {(error || success) && (
            <div
              className="rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: error ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)",
                background: error ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                color: "var(--foreground)",
              }}
            >
              {error ?? success}
            </div>
          )}

          <div className="rounded-2xl border bg-[color:var(--surface)] shadow-sm overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-b"
              style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
            >
              <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Regras de envio</h2>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void saveAll()}
                className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-95"
                style={{ background: "var(--primary)" }}
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-3 py-3 text-left font-semibold w-[220px]">Gatilho</th>
                    {PROJECT_TYPES.map((pt) => (
                      <th key={pt} className="px-2 py-3 text-center font-semibold">
                        {PROJECT_LABELS[pt]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingRules ? (
                    <tr>
                      <td colSpan={1 + PROJECT_TYPES.length} className="px-4 py-10 text-center text-[color:var(--muted-foreground)]">
                        Carregando...
                      </td>
                    </tr>
                  ) : (
                    TRIGGERS.map((tr) => (
                      <tr key={tr} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-3 align-middle">
                          <div className="font-medium text-[color:var(--foreground)]">{TRIGGER_LABELS[tr]}</div>
                        </td>
                        {PROJECT_TYPES.map((pt) => (
                          <td key={`${pt}-${tr}`} className="px-2 py-3 text-center align-middle">
                            <input
                              type="checkbox"
                              className="h-5 w-5 cursor-pointer"
                              checked={isOn(pt, tr)}
                              disabled={saving}
                              onChange={(e) => setCell(pt, tr, e.target.checked)}
                              aria-label={`${TRIGGER_LABELS[tr]} — ${PROJECT_LABELS[pt]}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
