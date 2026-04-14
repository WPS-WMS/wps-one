"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://wps-one-backend.onrender.com";

const ONE_LOGO_SVG_SRC = "/WPS%20One.svg";
const WPS_ONE_ICON_SVG_SRC = "/WPS%20One%20%C3%ADcone.svg";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const missingEmail = !email.trim();
    const missingPassword = !password.trim();
    if (missingEmail || missingPassword) {
      setFieldErrors({
        email: missingEmail ? "missing" : undefined,
        password: missingPassword ? "missing" : undefined,
      });
      setError("O campo deve ser preenchido");
      return;
    }

    // Validação simples de formato de e-mail para evitar tooltip nativo do navegador
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailPattern.test(email.trim())) {
      setFieldErrors({ email: "invalid" });
      setError("Dados inválidos.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        setError(`Erro ao processar resposta do servidor. Status: ${res.status}`);
        return;
      }
      if (!res.ok) {
        setFieldErrors({
          email: "invalid",
          password: "invalid",
        });
        setError(data.error || "E-mail ou senha inválidos.");
        return;
      }
      setToken(data.token);
      setUser(data.user);
      if (data.user.mustChangePassword) {
        router.push("/trocar-senha");
        router.refresh();
      } else {
        const allowed: string[] | undefined = data.user.allowedFeatures;
        const hasPortal = Array.isArray(allowed) && allowed.includes("portal.corporativo");
        let path: string;
        if (data.user.role === "CLIENTE") path = "/cliente";
        else if (hasPortal) path = "/portal";
        else if (data.user.role === "SUPER_ADMIN") path = "/admin";
        else if (data.user.role === "GESTOR_PROJETOS") path = "/gestor";
        else path = "/consultor";

        if (typeof window !== "undefined") {
          window.location.replace(window.location.origin + path);
        } else {
          router.push(path);
          router.refresh();
        }
      }
    } catch {
      setError("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotMessage("");

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotError("Informe o e-mail.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotError(data.error || "Erro ao solicitar recuperação de senha.");
        return;
      }
      setForgotMessage(
        "Se o e-mail existir em nossa base, você receberá instruções para criar uma nova senha."
      );
    } catch {
      setForgotError("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)] px-4">
      <div className="w-full max-w-md p-8 rounded-2xl shadow-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/80 backdrop-blur-xl">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white"
            style={{
              boxShadow:
                "10px 10px 0 rgba(0,0,0,0.22), 0 10px 30px rgba(0,0,0,0.12)",
            }}
          >
            <img src={WPS_ONE_ICON_SVG_SRC} alt="" className="h-9 w-9 select-none" draggable={false} />
          </div>
          <h1 className="mx-auto w-fit text-[color:var(--foreground)]">
            <span className="inline-flex items-baseline whitespace-nowrap">
              <span className="font-quantify text-3xl font-semibold leading-none tracking-tight">WPS</span>
              <span className="ml-[0.08em] inline-flex items-baseline leading-none">
                <img
                  src={ONE_LOGO_SVG_SRC}
                  alt="One"
                  className="block h-[2.1em] w-auto shrink-0 select-none translate-y-[0.18em]"
                  draggable={false}
                />
              </span>
            </span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">Gestão de projetos e apontamento de horas</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-red-600 text-sm mb-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
              {error}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1">
              E-mail
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
                setError("");
              }}
              className={`w-full px-4 py-2.5 rounded-lg border bg-[color:var(--input-bg)] text-[color:var(--input-fg)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2 focus:ring-[color:var(--primary)] transition ${
                fieldErrors.email ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-[color:var(--border)]"
              }`}
              placeholder="seu@email.com"
            />
            {/* Erro de preenchimento é exibido apenas no topo */}
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
                setError("");
              }}
              className={`w-full px-4 py-2.5 rounded-lg border bg-[color:var(--input-bg)] text-[color:var(--input-fg)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2 focus:ring-[color:var(--primary)] transition ${
                fieldErrors.password
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-[color:var(--border)]"
              }`}
              placeholder="••••••••"
            />
            {/* Erro de preenchimento é exibido apenas no topo */}
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <div className="text-[color:var(--muted-foreground)]" />
            <button
              type="button"
              onClick={() => {
                setShowForgot(true);
                setForgotEmail(email);
                setForgotError("");
                setForgotMessage("");
              }}
              className="text-[color:var(--primary)] hover:opacity-90 font-medium"
            >
              Esqueci minha senha
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[color:var(--primary)] hover:opacity-90 text-[color:var(--primary-foreground)] font-semibold disabled:opacity-50 transition shadow-sm"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>

      {showForgot && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          onClick={() => {
            if (!forgotLoading) setShowForgot(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/90 backdrop-blur-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-1">
              Recuperar senha
            </h2>
            <p className="text-xs text-[color:var(--muted-foreground)] mb-4">
              Informe seu e-mail de acesso. Se ele existir em nossa base, você receberá um link para criar uma nova senha.
            </p>
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[color:var(--muted-foreground)] mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    setForgotError("");
                    setForgotMessage("");
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--input-bg)] text-[color:var(--input-fg)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2 focus:ring-[color:var(--primary)]"
                  placeholder="seu@email.com"
                />
              </div>
              {forgotError && (
                <p className="text-xs text-red-600">{forgotError}</p>
              )}
              {forgotMessage && (
                <p className="text-xs text-emerald-600">{forgotMessage}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!forgotLoading) setShowForgot(false);
                  }}
                  className="flex-1 py-2.5 rounded-lg border border-[color:var(--border)] text-[color:var(--foreground)] text-sm font-medium hover:opacity-90"
                  disabled={forgotLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-2.5 rounded-lg bg-[color:var(--primary)] hover:opacity-90 text-[color:var(--primary-foreground)] text-sm font-semibold disabled:opacity-50"
                >
                  {forgotLoading ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
