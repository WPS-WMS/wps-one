"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { formatarTelefone } from "@/lib/brFormatters";

const PURPLE = "#5c00e1";

type Props = {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
};

export function LandingCreateAccountModal({ open, onClose, isDark }: Props) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const overlayPointerDownRef = useRef(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [employees, setEmployees] = useState("");
  const [need, setNeed] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const muted = isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)";
  const labelColor = isDark ? "#fff" : "#0b0b12";
  const inputClass =
    "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2";
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.14)",
    color: labelColor,
    ["--tw-ring-color" as string]: `${PURPLE}55`,
  };

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setEmployees("");
    setNeed("");
    setPassword("");
    setPasswordConfirm("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (password !== passwordConfirm) {
      setFeedback({ type: "err", text: "A confirmação de senha não confere." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          company: company.trim(),
          employees: employees.trim(),
          need: need.trim(),
          password,
          passwordConfirm,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        trialDays?: number;
      };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error ?? "Não foi possível criar a conta." });
        return;
      }
      setFeedback({
        type: "ok",
        text:
          data.message ??
          `Conta criada com ${data.trialDays ?? 7} dias de teste. Faça login e escolha um plano em Minha Assinatura antes do fim do período.`,
      });
      resetForm();
    } catch {
      setFeedback({
        type: "err",
        text: "Erro de rede. Verifique sua conexão ou tente mais tarde.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
      role="presentation"
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && overlayPointerDownRef.current && !submitting) {
          onClose();
        }
        overlayPointerDownRef.current = false;
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl shadow-2xl"
        style={{
          background: isDark ? "#121018" : "#fff",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.10)"}`,
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.08)",
            background: isDark ? "#121018" : "#fff",
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: PURPLE }}>
              Conta
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold" style={{ color: labelColor }}>
              Criar conta
            </h2>
            <p className="mt-1 text-sm" style={{ color: muted }}>
              7 dias de teste grátis. Depois, assine em Configurações → Minha Assinatura para manter o
              acesso.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:opacity-80 disabled:opacity-50"
            style={{
              color: muted,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)",
            }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium" style={{ color: labelColor }}>
              1. Qual o seu nome?
            </legend>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium" style={{ color: muted }}>
                Nome
              </span>
              <input
                ref={firstFieldRef}
                required
                maxLength={160}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Seu nome completo"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: muted }}>
                  E-mail
                </span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="voce@empresa.com"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: muted }}>
                  Número de contato
                </span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatarTelefone(e.target.value))}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="(51) 99999-9999"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium" style={{ color: labelColor }}>
              2. Qual o nome da sua empresa?
            </legend>
            <input
              required
              maxLength={200}
              autoComplete="organization"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="Nome da empresa"
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium" style={{ color: labelColor }}>
              3. Quantos colaboradores tem a sua empresa?
            </legend>
            <input
              required
              maxLength={80}
              value={employees}
              onChange={(e) => setEmployees(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="Ex.: 1–10, 11–50, 50+"
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium" style={{ color: labelColor }}>
              4. Qual sua necessidade atual?
            </legend>
            <textarea
              required
              rows={3}
              maxLength={2000}
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              className={`${inputClass} resize-y min-h-[88px]`}
              style={inputStyle}
              placeholder="Ex.: Gestão de projetos, financeiro, previsibilidade de margem…"
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium" style={{ color: labelColor }}>
              5. Senha de acesso
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: muted }}>
                  Senha
                </span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Mín. 8 caracteres"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: muted }}>
                  Confirmar senha
                </span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Repita a senha"
                />
              </label>
            </div>
            <p className="text-xs" style={{ color: muted }}>
              Use no mínimo 8 caracteres, com 1 maiúscula, 1 número e 1 caractere especial.
            </p>
          </fieldset>

          {feedback ? (
            <p
              className="text-sm"
              style={{
                color:
                  feedback.type === "ok"
                    ? isDark
                      ? "#86efac"
                      : "#15803d"
                    : isDark
                      ? "#fca5a5"
                      : "#b91c1c",
              }}
              role="status"
            >
              {feedback.text}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
              style={{
                color: isDark ? "rgba(244,242,255,0.85)" : "rgba(17,24,39,0.75)",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)"}`,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || feedback?.type === "ok"}
              className="inline-flex h-10 items-center rounded-full px-6 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
              style={{ background: PURPLE }}
            >
              {submitting ? "Criando…" : feedback?.type === "ok" ? "Conta criada" : "Criar conta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
