"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/passwordPolicy";

export function ResetSenhaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setNewPasswordError(null);
    setConfirmPasswordError(null);

    if (!token) {
      setError("Link inválido. Solicite novamente a recuperação de senha.");
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setNewPasswordError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Senhas não coincidem");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const apiError = String(data.error || "Não foi possível redefinir a senha.");
        if (/maiúscula|mínimo 8|caractere especial|número/i.test(apiError)) {
          setNewPasswordError(apiError);
        } else {
          setError(apiError);
        }
        return;
      }
      setMessage("Senha alterada com sucesso. Você já pode entrar com a nova senha.");
      setTimeout(() => router.replace("/login"), 1200);
    } catch {
      setError("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-md p-8 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-100">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl font-bold shadow-md mb-3">
            W
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Redefinir senha</h1>
          <p className="text-gray-500 mt-1 text-sm">Crie uma nova senha para sua conta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-red-600 text-sm rounded-lg border border-red-300 bg-red-50 px-3 py-2">
              {error}
            </p>
          )}
          {message && (
            <p className="text-green-700 text-sm rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              {message}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (newPasswordError) setNewPasswordError(null);
              }}
              className={`w-full px-4 py-2.5 rounded-lg bg-gray-50 border text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition ${
                newPasswordError ? "border-red-500" : "border-blue-200"
              }`}
              placeholder="••••••••"
              minLength={8}
              required
              aria-invalid={Boolean(newPasswordError)}
            />
            {newPasswordError ? (
              <p className="mt-1 text-xs text-red-600">{newPasswordError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">{PASSWORD_POLICY_HINT}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (confirmPasswordError) setConfirmPasswordError(null);
              }}
              className={`w-full px-4 py-2.5 rounded-lg bg-gray-50 border text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition ${
                confirmPasswordError ? "border-red-500" : "border-blue-200"
              }`}
              placeholder="••••••••"
              minLength={8}
              required
              aria-invalid={Boolean(confirmPasswordError)}
            />
            {confirmPasswordError && (
              <p className="mt-1 text-xs text-red-600">{confirmPasswordError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition shadow-sm"
          >
            {saving ? "Salvando..." : "Redefinir senha"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => router.replace("/login")}
            className="w-full py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 disabled:opacity-50 transition"
          >
            Voltar para o login
          </button>
        </form>
      </div>
    </div>
  );
}
