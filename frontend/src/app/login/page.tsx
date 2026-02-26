"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const isLocalBackend = /localhost|127\.0\.0\.1/.test(BACKEND_URL);

  useEffect(() => {
    const base = BACKEND_URL.replace(/\/$/, "");
    fetch(`${base}/health`)
      .then((r) => setBackendOk(r.ok))
      .catch(() => setBackendOk(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      nextFieldErrors.email = "Preencha o e-mail.";
    }
    if (!password.trim()) {
      nextFieldErrors.password = "Preencha a senha.";
    }
    if (nextFieldErrors.email || nextFieldErrors.password) {
      setFieldErrors(nextFieldErrors);
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
          email: "E-mail ou senha inválidos.",
          password: "E-mail ou senha inválidos.",
        });
        setError(data.error || "Dados inválidos.");
        return;
      }
      setToken(data.token);
      setUser(data.user);
      if (data.user.mustChangePassword) {
        router.push("/trocar-senha");
      } else {
        const role = data.user.role;
        if (role === "CLIENTE") router.push("/cliente");
        else if (role === "ADMIN") router.push("/admin");
        else router.push("/consultor");
      }
      router.refresh();
    } catch {
      setError("Erro de conexão. Verifique se o backend está rodando.");
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-md p-8 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-100">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl font-bold shadow-md mb-3">
            F
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FLOWA</h1>
          <p className="text-gray-500 mt-1 text-sm">Gestão de projetos e apontamento de horas</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuário (E-mail)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
                setError("");
              }}
              className={`w-full px-4 py-2.5 rounded-lg bg-gray-50 border text-gray-900 focus:ring-2 focus:border-blue-500 focus:ring-blue-500 transition ${
                fieldErrors.email ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-blue-200"
              }`}
              placeholder="seu@email.com"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className={`w-full px-4 py-2.5 rounded-lg bg-gray-50 border text-gray-900 focus:ring-2 focus:border-blue-500 focus:ring-blue-500 transition ${
                fieldErrors.password
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-blue-200"
              }`}
              placeholder="••••••••"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <div className="text-gray-400" />
            <button
              type="button"
              onClick={() => {
                setShowForgot(true);
                setForgotEmail(email);
                setForgotError("");
                setForgotMessage("");
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Esqueci minha senha
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
          {backendOk === false && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <p className="font-medium">
                {isLocalBackend ? "API não está rodando (porta 4000)" : "Não foi possível conectar ao servidor"}
              </p>
              {isLocalBackend ? (
                <>
                  <p className="mt-1 text-amber-800">
                    Abra outro terminal na <strong>raiz do projeto</strong> e execute:
                  </p>
                  <code className="mt-2 block bg-amber-100 px-2 py-1.5 rounded text-xs font-mono">
                    npm run backend
                  </code>
                  <p className="mt-2 text-amber-700 text-xs">
                    Se der erro de permissão (tsx/esbuild), use: <code className="bg-amber-100 px-1 rounded">npm run backend:node</code>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-amber-800 text-xs">
                  Tente novamente em alguns instantes. Se o problema continuar, verifique o status do backend.
                </p>
              )}
              <p className="mt-1 text-xs text-amber-600">Backend: {BACKEND_URL}</p>
            </div>
          )}
          {backendOk === true && (
            <p className="text-green-600 text-sm">Backend conectado</p>
          )}
          <button
            type="submit"
            disabled={loading || backendOk === false}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition shadow-sm"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="text-gray-400 text-xs mt-4 text-center">
          Backend: {BACKEND_URL}
        </p>
      </div>

      {showForgot && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          onClick={() => {
            if (!forgotLoading) setShowForgot(false);
          }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-blue-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Recuperar senha
            </h2>
            <p className="text-xs text-slate-600 mb-4">
              Informe seu e-mail de acesso. Se ele existir em nossa base, você receberá um link para criar uma nova senha.
            </p>
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-50 border border-blue-200 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
                  disabled={forgotLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
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
