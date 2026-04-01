"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function TrocarSenhaPage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.mustChangePassword) {
      const path = user.role === "CLIENTE" ? "/cliente" : user.role === "SUPER_ADMIN" ? "/admin" : "/consultor";
      if (typeof window !== "undefined") window.location.replace(window.location.origin + path);
      else router.replace(path);
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmação não coincidem");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao alterar senha");
        return;
      }
      setUser({ ...user!, mustChangePassword: false });
      const path = user!.role === "CLIENTE" ? "/cliente" : user!.role === "SUPER_ADMIN" ? "/admin" : "/consultor";
      // Recarregamento completo para a home evita que o botão Sair fique inativo até dar F5
      if (typeof window !== "undefined") {
        window.location.replace(window.location.origin + path);
      } else {
        router.replace(path);
        router.refresh();
      }
    } catch (err) {
      setError("Não foi possível conectar ao servidor. Verifique se o backend está rodando em http://localhost:4000");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !user.mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <p className="text-blue-700">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-xl border border-blue-100">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-blue-700">Alterar senha</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Por segurança, altere sua senha no primeiro acesso.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-blue-200 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-blue-200 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-blue-200 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition"
          >
            {saving ? "Salvando..." : "Alterar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
