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
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
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

  async function setAvatarFilePreview(file: File | null) {
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
      setSelectedAvatarFile(file);
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      setAvatarPreview({ url: dataUrl, name: file.name });
    } catch {
      setError("Erro ao ler imagem");
    }
  }

  async function saveSelectedAvatar() {
    const file = selectedAvatarFile;
    if (!file) {
      setError("Selecione uma imagem antes de salvar.");
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
        body: JSON.stringify({ avatarUrl: String(data.fileUrl).split("?")[0] }),
      });
      const saved = await saveRes.json().catch(() => null);
      if (!saveRes.ok) {
        setError(saved?.error || "Upload feito, mas não foi possível salvar a foto no perfil.");
        return;
      }
      setUser(saved);
      setSuccess("Foto de perfil atualizada.");
      setAvatarModalOpen(false);
      setSelectedAvatarFile(null);
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
    await setAvatarFilePreview(file);
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[color:var(--background)]">
      <div className="w-full max-w-4xl rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)]/80 backdrop-blur-xl shadow-2xl p-6 md:p-8 space-y-6">
        <div
          className="-mx-6 -mt-6 rounded-t-3xl px-6 pt-6 pb-5 md:-mx-8 md:-mt-8 md:px-8 md:pt-8 md:pb-6"
          style={{
            background:
              "radial-gradient(900px 420px at 20% 0%, rgba(92,0,225,0.16), transparent 55%), radial-gradient(720px 360px at 85% 30%, rgba(87,66,118,0.14), transparent 55%)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="Voltar"
                title="Voltar"
                className="inline-flex h-10 w-10 -ml-2 md:ml-0 items-center justify-center rounded-xl border transition hover:opacity-90"
                style={{
                  borderColor: "var(--border)",
                  background: "rgba(255,255,255,0.10)",
                  color: "var(--foreground)",
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-[color:var(--foreground)] md:text-2xl">
                Configurações do usuário
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAvatarModalOpen(true)}
              className="relative group h-14 w-14 rounded-full focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/60 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              <Avatar
                name={user.name}
                email={user.email}
                avatarUrl={avatarPreview?.url || user.avatarUrl}
                size={56}
                fallbackClassName="text-lg"
                className="border"
                imgClassName="border"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
                <Camera className="h-6 w-6 text-white/90" />
              </div>
            </button>
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">{user.name}</p>
              <p className="text-xs text-[color:var(--muted-foreground)]">{user.email}</p>
            </div>
          </div>
          </div>
        </div>

        {(error || success) && (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: error ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)",
              background: error ? "rgba(239,68,68,0.10)" : "rgba(16,185,129,0.10)",
              color: "var(--foreground)",
            }}
          >
            <span className="font-medium">{error ? "Atenção:" : "Pronto:"}</span>{" "}
            <span style={{ color: "var(--muted-foreground)" }}>{error || success}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border p-5 md:p-6"
            style={{
              borderColor: "var(--border)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Dados básicos</h2>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Atualize como seu nome aparece no sistema.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-1">
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[color:var(--primary)]/35"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--input-bg)",
                    color: "var(--input-fg)",
                  }}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">E-mail</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="h-11 w-full rounded-xl border px-3 text-sm"
                  style={{
                    borderColor: "var(--border)",
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--muted-foreground)",
                    opacity: 0.9,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60 hover:opacity-95"
                style={{ background: "var(--primary)" }}
              >
                {savingProfile ? "Salvando..." : "Salvar dados"}
              </button>
            </div>
          </form>

          <form
            onSubmit={handleChangePassword}
            className="rounded-2xl border p-5 md:p-6"
            style={{
              borderColor: "var(--border)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
            }}
          >
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Segurança</h2>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Para sua segurança, informe a senha atual e repita a nova senha.
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[color:var(--primary)]/35"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--input-bg)",
                    color: "var(--input-fg)",
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">Nova senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[color:var(--primary)]/35"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--input-bg)",
                      color: "var(--input-fg)",
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
                    Confirmar nova senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[color:var(--primary)]/35"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--input-bg)",
                      color: "var(--input-fg)",
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex h-11 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition disabled:opacity-60 hover:opacity-95"
                  style={{
                    borderColor: "rgba(92,0,225,0.55)",
                    color: "#ffffff",
                    background:
                      "linear-gradient(90deg, rgba(92,0,225,0.95), rgba(87,66,118,0.75))",
                    boxShadow: "0 14px 30px rgba(92,0,225,0.18)",
                  }}
                >
                  {savingPassword ? "Trocando senha..." : "Trocar senha"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {avatarModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-6 bg-[color:var(--surface)]/90 backdrop-blur-xl" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[color:var(--foreground)]">Alterar foto do perfil</h2>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Escolha uma imagem e clique em Salvar. Até 5MB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarModalOpen(false);
                    setSelectedAvatarFile(null);
                    setAvatarPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="h-9 w-9 rounded-xl border flex items-center justify-center text-sm transition hover:opacity-90"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                    background: "rgba(0,0,0,0.06)",
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition"
                style={{
                  borderColor: isDragging ? "rgba(92,0,225,0.70)" : "var(--border)",
                  background: isDragging ? "rgba(92,0,225,0.10)" : "rgba(0,0,0,0.06)",
                }}
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
                  await setAvatarFilePreview(file);
                }}
              >
                <div className="mb-4 rounded-2xl p-3" style={{ background: "rgba(92,0,225,0.14)" }}>
                  <CloudUpload className="h-8 w-8" style={{ color: "var(--primary)" }} />
                </div>
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  Arraste e solte suas imagens aqui
                </p>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">ou</p>
                <button
                  type="button"
                  onClick={onSelectAvatarClick}
                  disabled={avatarUploading}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold border transition disabled:opacity-60 hover:opacity-95"
                  style={{
                    borderColor: "rgba(92,0,225,0.45)",
                    color: "var(--foreground)",
                    background: "rgba(92,0,225,0.10)",
                  }}
                >
                  {avatarUploading ? "Enviando..." : "Escolher uma foto"}
                </button>
                {avatarPreview && (
                  <p className="mt-2 text-xs truncate max-w-[220px] text-[color:var(--muted-foreground)]">
                    {avatarPreview.name}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarModalOpen(false);
                    setSelectedAvatarFile(null);
                    setAvatarPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-xl border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                    background: "transparent",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveSelectedAvatar}
                  disabled={avatarUploading || !selectedAvatarFile}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-60 hover:opacity-95"
                  style={{ background: "var(--primary)" }}
                >
                  Salvar
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

