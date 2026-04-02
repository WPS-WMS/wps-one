"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Camera, CloudUpload } from "lucide-react";
import { Avatar } from "@/components/Avatar";

type AvatarPreview = {
  url: string;
  name: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://127.0.0.1:4000";

export default function PerfilPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<AvatarPreview | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
    }
  }, [user]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      setError(null);
      setSuccess(null);
      setSavingProfile(true);
      const res = await apiFetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao salvar dados do perfil");
        return;
      }
      setUser(data);
      setSuccess("Dados do perfil atualizados com sucesso.");
    } catch {
      setError("Erro ao salvar dados do perfil");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    try {
      setError(null);
      setSuccess(null);
      setSavingPassword(true);
      const res = await apiFetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao trocar senha");
        return;
      }
      setSuccess("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erro ao trocar senha");
    } finally {
      setSavingPassword(false);
    }
  }

  function onSelectAvatarClick() {
    fileInputRef.current?.click();
  }

  async function uploadAvatarFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem válida.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Imagem muito grande. Tamanho máximo: 5MB.");
      return;
    }
    try {
      setError(null);
      setSuccess(null);
      setAvatarUploading(true);
      const reader = new FileReader();
      const fileData: string = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch("/api/uploads/user-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileData,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar imagem");
        return;
      }
      setAvatarPreview({ url: data.fileUrl, name: file.name });
      // Persistir avatar no usuário (não basta fazer upload do arquivo)
      const saveRes = await apiFetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: data.fileUrl }),
      });
      const saved = await saveRes.json().catch(() => null);
      if (!saveRes.ok) {
        setError(saved?.error || "Upload feito, mas não foi possível salvar a foto no perfil.");
        return;
      }
      setUser(saved);
      setSuccess("Foto de perfil atualizada.");
      setAvatarModalOpen(false);
    } catch {
      setError("Erro ao enviar imagem");
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    await uploadAvatarFile(file);
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <p className="text-blue-700">Carregando...</p>
      </div>
    );
  }

  const avatarPath = avatarPreview?.url || user.avatarUrl || "";
  const displayAvatar = avatarPath
    ? `${API_BASE_URL}${avatarPath.startsWith("/") ? avatarPath : `/${avatarPath}`}`
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar</span>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Configurações do usuário</h1>
              <p className="text-sm text-slate-500">
                Atualize suas informações básicas, senha e foto de perfil.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAvatarModalOpen(true)}
              className="relative group h-14 w-14 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-2 focus:ring-offset-white"
            >
              <Avatar
                name={user.name}
                email={user.email}
                avatarUrl={avatarPreview?.url || user.avatarUrl}
                size={56}
                fallbackClassName="text-lg"
                className="border border-blue-400/60"
                imgClassName="border border-blue-400/60"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
                <Camera className="h-6 w-6 text-white/90" />
              </div>
            </button>
            <div>
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
        </div>

        {(error || success) && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || success}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Dados básicos</h2>
              <p className="text-xs text-slate-500">Atualize como seu nome aparece no sistema.</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">E-mail</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {savingProfile ? "Salvando..." : "Salvar dados"}
              </button>
            </div>
          </form>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Trocar senha</h2>
              <p className="text-xs text-slate-500">
                Para sua segurança, informe a senha atual e repita a nova senha.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {savingPassword ? "Trocando senha..." : "Trocar senha"}
              </button>
            </div>
          </form>
        </div>

        {avatarModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Alterar foto do perfil</h2>
                  <p className="text-xs text-slate-500">
                    Arraste uma imagem para enviar ou escolha um arquivo. Até 5MB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(false)}
                  className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center hover:bg-slate-100 text-sm"
                >
                  ✕
                </button>
              </div>

              <div
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  isDragging
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-300 bg-slate-50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0] ?? null;
                  await uploadAvatarFile(file);
                }}
              >
                <div className="mb-4 rounded-full bg-blue-100 p-3">
                  <CloudUpload className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  Arraste e solte suas imagens aqui
                </p>
                <p className="mt-1 text-xs text-slate-500">ou</p>
                <button
                  type="button"
                  onClick={onSelectAvatarClick}
                  disabled={avatarUploading}
                  className="mt-3 inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  {avatarUploading ? "Enviando..." : "Carregar uma foto"}
                </button>
                {avatarPreview && (
                  <p className="mt-2 text-xs text-slate-500 truncate max-w-[220px]">
                    {avatarPreview.name}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSelectAvatarClick}
                  disabled={avatarUploading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Carregar
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </div>
    </div>
  );
}

