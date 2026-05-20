"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken } from "@/lib/api";
import { clearSessionActivity, touchSessionActivity } from "@/lib/idleSession";
import { useIdleLogout } from "@/hooks/useIdleLogout";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
  updatedAt?: string;
  tenantId?: string;
  allowedFeatures?: string[];
  cargo?: string;
  cargaHorariaSemanal?: number;
  limiteHorasDiarias?: number;
  limiteHorasPorDia?: string;
  permitirMaisHoras?: boolean;
  permitirFimDeSemana?: boolean;
  permitirOutroPeriodo?: boolean;
  diasPermitidos?: string;
  dataInicioAtividades?: string;
  mustChangePassword?: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => void;
  can: (featureId: string) => boolean;
  permissionsReady: boolean;
  /** Atualiza o utilizador a partir de `GET /api/auth/me` (ex.: após mudanças na matriz de permissões). */
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let skipFirstFinally = false;
    async function loadUser(retry = false) {
      if (retry) skipFirstFinally = false;
      const token = getToken();
      if (!token) {
        // Página pública / sessão inexistente: não chama `/auth/me` para evitar 401 no console.
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        const r = await apiFetch("/api/auth/me");
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json();
          setUser(data);
          touchSessionActivity();
        } else if (r.status === 502 && !retry) {
          skipFirstFinally = true;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (!cancelled) loadUser(true);
        } else if (r.status === 403) {
          const body = await r.json().catch(() => ({}));
          const msg = String((body as { error?: string })?.error ?? "");
          if (msg.includes("administrador")) {
            clearToken();
            clearSessionActivity();
            if (typeof window !== "undefined") {
              window.location.replace(`${window.location.origin}/login?inativo=1`);
            }
          }
          setUser(null);
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled && !skipFirstFinally) setLoading(false);
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, []);

  const refreshSession = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await apiFetch("/api/auth/me");
      if (r.ok) {
        const data = await r.json();
        setUser(data);
        touchSessionActivity();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const logoutToLogin = useCallback(() => {
    void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearToken();
    clearSessionActivity();
    setUser(null);
    if (typeof window !== "undefined") {
      window.location.replace(`${window.location.origin}/login`);
    } else {
      router.replace("/login");
    }
  }, [router]);

  const logout = useCallback(() => {
    void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearToken();
    clearSessionActivity();
    setUser(null);
    if (typeof window !== "undefined") {
      window.location.replace(window.location.origin + "/");
    } else {
      router.push("/");
    }
  }, [router]);

  useIdleLogout(Boolean(user) && !loading, logoutToLogin);

  const can = useCallback((featureId: string): boolean => {
    if (!user) return false;
    // SUPER_ADMIN: acesso total, independente de cache de allowedFeatures.
    // Isso evita “sumir menu” após deploy de novas features até o usuário recarregar a sessão.
    if (user.role === "SUPER_ADMIN") {
      return featureId !== "chamados.criacao";
    }
    const list = user.allowedFeatures;
    if (!Array.isArray(list)) return true; // compat: backend antigo (sem permissions)
    return list.includes(featureId);
  }, [user]);

  const permissionsReady = !!user && Array.isArray(user.allowedFeatures);
  const value = useMemo(
    () => ({ user, loading, setUser, logout, can, permissionsReady, refreshSession }),
    [user, loading, logout, can, permissionsReady, refreshSession],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
