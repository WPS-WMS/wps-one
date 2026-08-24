"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Mail, Save, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { navigateBack } from "@/lib/navigateBack";
import {
  EmailRecipientRoleCell,
  EmailRecipientRoleLegend,
  type EmailRecipientRole,
} from "@/components/EmailRecipientRoleCell";

const PROJECT_TYPES = ["INTERNO", "CUSTOS_OPERACIONAIS", "FIXED_PRICE", "TIME_MATERIAL", "AMS"] as const;
const TRIGGERS = [
  "CRIACAO",
  "STATUS_CHANGE",
  "COMENTARIO",
  "ORCAMENTO",
  "RESPOSTA_ORCAMENTO",
  "MODIFICACAO",
  "LIMITE_DIARIO_EXCEDIDO",
  "APONTAMENTO",
  "REEMBOLSOS",
] as const;

const RECIPIENT_ROLES: EmailRecipientRole[] = ["RESPONSAVEL", "MEMBRO", "CLIENTE"];

const PROJECT_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  INTERNO: "Projeto Interno",
  CUSTOS_OPERACIONAIS: "Custos Operacionais",
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
  APONTAMENTO: "Apontamentos",
  REEMBOLSOS: "Reembolsos",
};

type RuleRow = {
  projectType: (typeof PROJECT_TYPES)[number];
  trigger: (typeof TRIGGERS)[number];
  recipientRoles: EmailRecipientRole[];
};

function parseRoles(raw: unknown): EmailRecipientRole[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter((v): v is EmailRecipientRole => RECIPIENT_ROLES.includes(v as EmailRecipientRole));
}

export default function ConfiguracoesEmailsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { user, loading, can, permissionsReady } = useAuth();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mailStatus, setMailStatus] = useState<{
    ready: boolean;
    provider: string;
    hint: string;
    from: string | null;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadMailStatus = useCallback(async () => {
    const res = await apiFetch("/api/email-notification-rules/admin/status");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return;
    setMailStatus({
      ready: Boolean(data.ready),
      provider: String(data.provider ?? "none"),
      hint: String(data.hint ?? ""),
      from: typeof data.from === "string" && data.from.includes("@") ? data.from : null,
    });
  }, []);

  async function sendTestEmail() {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/email-notification-rules/admin/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : typeof data?.status?.hint === "string"
              ? data.status.hint
              : "Não foi possível enviar o e-mail de teste.",
        );
      }
      const from = typeof data.from === "string" ? data.from : mailStatus?.from;
      setSuccess(
        `O Graph aceitou o envio para ${data.to ?? "seu usuário"}${from ? ` (remetente ${from})` : ""}. ` +
          "Isso não garante entrega: confira spam, Promoções e Social. " +
          "Se não chegar, veja Itens enviados e a caixa de entrada da caixa Microsoft 365 do remetente (pode ter relatório de não entrega).",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro no teste de e-mail");
    } finally {
      setTesting(false);
      void loadMailStatus();
    }
  }

  const load = useCallback(async () => {
    setLoadingRules(true);
    setError(null);
    try {
      const res = await apiFetch("/api/email-notification-rules/admin");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Erro ao carregar");
      const rows = Array.isArray(data) ? data : [];
      setRules(
        rows.map((r: { projectType?: string; trigger?: string; recipientRoles?: unknown }) => ({
          projectType: r.projectType as RuleRow["projectType"],
          trigger: r.trigger as RuleRow["trigger"],
          recipientRoles: parseRoles(r.recipientRoles),
        })),
      );
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
    void loadMailStatus();
  }, [loading, user, permissionsReady, can, load, loadMailStatus]);

  const matrix = useMemo(() => {
    const m = new Map<string, EmailRecipientRole[]>();
    for (const r of rules) {
      m.set(`${r.projectType}:${r.trigger}`, r.recipientRoles);
    }
    return m;
  }, [rules]);

  function getRoles(pt: (typeof PROJECT_TYPES)[number], tr: (typeof TRIGGERS)[number]): EmailRecipientRole[] {
    return matrix.get(`${pt}:${tr}`) ?? [];
  }

  function setCellRoles(
    pt: (typeof PROJECT_TYPES)[number],
    tr: (typeof TRIGGERS)[number],
    roles: EmailRecipientRole[],
  ) {
    setRules((prev) =>
      prev.map((r) => (r.projectType === pt && r.trigger === tr ? { ...r, recipientRoles: roles } : r)),
    );
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
      void load();
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
        onClick={() => navigateBack(router, basePath)}
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
            Clique em uma célula para escolher quem recebe cada e-mail. Célula vazia = não envia.
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

          {mailStatus && (
            <div
              className="rounded-xl border px-3 py-2 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              style={{
                borderColor: mailStatus.ready ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.45)",
                background: mailStatus.ready ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.10)",
              }}
            >
              <p>
                Provedor: <b>{mailStatus.provider}</b>
                {mailStatus.ready ? " — pronto para enviar." : " — não consegue enviar neste servidor."}{" "}
                {mailStatus.from ? (
                  <>
                    Remetente: <b>{mailStatus.from}</b>.{" "}
                  </>
                ) : null}
                <span className="text-[color:var(--muted-foreground)]">{mailStatus.hint}</span>
              </p>
              <button
                type="button"
                disabled={testing}
                onClick={() => void sendTestEmail()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                <Send className="h-3.5 w-3.5" />
                {testing ? "Enviando..." : "Enviar e-mail de teste"}
              </button>
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

            <EmailRecipientRoleLegend />

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-3 py-2.5 text-left font-semibold w-[168px]">Gatilho</th>
                    {PROJECT_TYPES.map((pt) => (
                      <th key={pt} className="px-1.5 py-2.5 text-center font-semibold min-w-[88px]">
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
                        <td className="px-3 py-2 align-middle">
                          <div className="text-sm font-medium text-[color:var(--foreground)] leading-tight">
                            {TRIGGER_LABELS[tr]}
                          </div>
                        </td>
                        {PROJECT_TYPES.map((pt) => {
                          const roles = getRoles(pt, tr);
                          return (
                            <td key={`${pt}-${tr}`} className="px-1 py-1.5 align-middle">
                              <EmailRecipientRoleCell
                                id={`email-rule-${pt}-${tr}`}
                                values={roles}
                                disabled={saving}
                                onChange={(next) => setCellRoles(pt, tr, next)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="px-4 py-2.5 text-[11px] text-[color:var(--muted-foreground)] border-t" style={{ borderColor: "var(--border)" }}>
              Clicar numa célula abre o seletor de papéis. Célula vazia = não envia.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
