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

export function LandingDemoModal({ open, onClose, isDark }: Props) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const overlayPointerDownRef = useRef(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

  const inputClass =
    "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2";
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.14)",
    color: isDark ? "#fff" : "#0b0b12",
    boxShadow: "none",
  } as const;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error ?? "Não foi possível enviar. Tente novamente." });
        return;
      }
      setFeedback({ type: "ok", text: "Solicitação enviada. Em breve entraremos em contato." });
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
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
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: isDark ? "#121018" : "#fff",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.10)"}`,
        }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6"
          style={{ borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.08)" }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: PURPLE }}>
              Demonstração
            </p>
            <h2
              id={titleId}
              className="mt-1 text-lg font-semibold"
              style={{ color: isDark ? "#fff" : "#0b0b12" }}
            >
              Agendar demonstração
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.58)" }}
            >
              Conte um pouco sobre você — retornamos para marcar o horário.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:opacity-80 disabled:opacity-50"
            style={{
              color: isDark ? "rgba(244,242,255,0.7)" : "rgba(17,24,39,0.55)",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)",
            }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <fieldset className="space-y-3">
            <legend
              className="text-sm font-medium"
              style={{ color: isDark ? "#fff" : "#0b0b12" }}
            >
              1. Qual seu nome e nome da empresa?
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)" }}
                >
                  Seu nome
                </span>
                <input
                  ref={firstFieldRef}
                  required
                  maxLength={160}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, ["--tw-ring-color" as string]: `${PURPLE}55` }}
                  placeholder="Nome completo"
                />
              </label>
              <label className="block space-y-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)" }}
                >
                  Empresa
                </span>
                <input
                  required
                  maxLength={200}
                  autoComplete="organization"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, ["--tw-ring-color" as string]: `${PURPLE}55` }}
                  placeholder="Nome da empresa"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend
              className="text-sm font-medium"
              style={{ color: isDark ? "#fff" : "#0b0b12" }}
            >
              2. Qual seu e-mail e telefone de contato?
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)" }}
                >
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
                  style={{ ...inputStyle, ["--tw-ring-color" as string]: `${PURPLE}55` }}
                  placeholder="voce@empresa.com"
                />
              </label>
              <label className="block space-y-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)" }}
                >
                  Telefone
                </span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatarTelefone(e.target.value))}
                  className={inputClass}
                  style={{ ...inputStyle, ["--tw-ring-color" as string]: `${PURPLE}55` }}
                  placeholder="(51) 99999-9999"
                />
              </label>
            </div>
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
              {submitting ? "Enviando…" : feedback?.type === "ok" ? "Enviado" : "Enviar solicitação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
