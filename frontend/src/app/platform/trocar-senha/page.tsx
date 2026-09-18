"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/passwordPolicy";

export default function PlatformTrocarSenhaPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);

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
      const res = await apiFetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const apiError = String(data.error || "Erro ao trocar senha");
        if (/senha atual/i.test(apiError)) {
          setCurrentPasswordError("Senha atual incorreta");
        } else if (/maiúscula|mínimo 8|caractere especial|número/i.test(apiError)) {
          setNewPasswordError(apiError);
        } else {
          setError(apiError);
        }
        return;
      }
      setSuccess("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erro ao trocar senha");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none transition focus:ring-2 focus:ring-[color:var(--primary)]/35";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
          Plataforma
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <KeyRound className="h-6 w-6 text-[color:var(--primary)]" />
          Trocar senha
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Informe a senha atual e escolha uma nova senha forte.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4 rounded-2xl border bg-[color:var(--surface)] p-5 shadow-sm"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Senha atual
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              if (currentPasswordError) setCurrentPasswordError(null);
            }}
            className={inputClass}
            style={{
              borderColor: currentPasswordError ? "#ef4444" : "var(--border)",
              background: "var(--input-bg, transparent)",
              color: "var(--input-fg, inherit)",
            }}
            required
            aria-invalid={Boolean(currentPasswordError)}
          />
          {currentPasswordError ? (
            <p className="text-xs text-red-600">{currentPasswordError}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Nova senha
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (newPasswordError) setNewPasswordError(null);
            }}
            className={inputClass}
            style={{
              borderColor: newPasswordError ? "#ef4444" : "var(--border)",
              background: "var(--input-bg, transparent)",
              color: "var(--input-fg, inherit)",
            }}
            required
            minLength={8}
            aria-invalid={Boolean(newPasswordError)}
          />
          {newPasswordError ? (
            <p className="text-xs text-red-600">{newPasswordError}</p>
          ) : (
            <p className="text-[11px] text-[color:var(--muted-foreground)]">{PASSWORD_POLICY_HINT}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Confirmar nova senha
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (confirmPasswordError) setConfirmPasswordError(null);
            }}
            className={inputClass}
            style={{
              borderColor: confirmPasswordError ? "#ef4444" : "var(--border)",
              background: "var(--input-bg, transparent)",
              color: "var(--input-fg, inherit)",
            }}
            required
            minLength={8}
            aria-invalid={Boolean(confirmPasswordError)}
          />
          {confirmPasswordError ? (
            <p className="text-xs text-red-600">{confirmPasswordError}</p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[color:var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Trocar senha"}
        </button>
      </form>
    </div>
  );
}
