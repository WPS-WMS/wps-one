"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken, hasAuthSession } from "@/lib/api";
import { clearSessionActivity, IDLE_LOGIN_QUERY, isSessionIdle } from "@/lib/idleSession";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import {
  isFeatureAllowedByTenantModules,
  type TenantModulesState,
} from "@/lib/tenantModules";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  layoutShell?: string | null;
  avatarUrl?: string;
  updatedAt?: string;
  tenantId?: string;
  allowedFeatures?: string[];
  tenantModules?: TenantModulesState | null;
  platformAdmin?: boolean;
  cargo?: string;
  cargaHorariaSemanal?: number;
  limiteHorasDiarias?: number;
  limiteHorasPorDia?: string;
  permitirMaisHoras?: boolean;
  permitirFimDeSemana?: boolean;
  permitirOutroPeriodo?: boolean;
  violacaoApontamentoModo?: string;
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
  /** Admin da plataforma WPS (vê todos os tenants). */
  isPlatformAdmin: boolean;
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
      if (!token && !hasAuthSession()) {
        // Página pública / sessão inexistente: não chama `/auth/me` para evitar 401 no console.
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      if (isSessionIdle()) {
        clearToken();
        clearSessionActivity();
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        if (typeof window !== "undefined") {
          window.location.replace(`${window.location.origin}/login?${IDLE_LOGIN_QUERY}`);
        }
        return;
      }
      try {
        const r = await apiFetch("/api/auth/me");
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json();
          setUser(data);
        } else if (r.status === 502 && !retry) {
          skipFirstFinally = true;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (!cancelled) loadUser(true);
        } else if (r.status === 403) {
          const body = await r.json().catch(() => ({}));
          const code = String((body as { code?: string })?.code ?? "");
          const msg = String((body as { error?: string })?.error ?? "");
          if (code === "SUBSCRIPTION_LOCKED") {
            clearToken();
            clearSessionActivity();
            if (typeof window !== "undefined") {
              window.location.replace(
                `${window.location.origin}/login?locked=1`,
              );
            }
          } else if (msg.includes("administrador")) {
            clearToken();
            clearSessionActivity();
            if (typeof window !== "undefined") {
              window.location.replace(`${window.location.origin}/login?inativo=1`);
            }
          }
          setUser(null);
        } else {
          if (r.status === 401) {
            clearToken();
            clearSessionActivity();
          }
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
    if (!getToken() && !hasAuthSession()) return;
    try {
      const r = await apiFetch("/api/auth/me");
      if (r.ok) {
        const data = await r.json();
        setUser(data);
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
      window.location.replace(`${window.location.origin}/login?${IDLE_LOGIN_QUERY}`);
    } else {
      router.replace(`/login?${IDLE_LOGIN_QUERY}`);
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
    if (!isFeatureAllowedByTenantModules(user.tenantModules, featureId)) {
      return false;
    }
    const list = user.allowedFeatures;
    // Preferir a lista do servidor (já filtra módulos do plano, inclusive SUPER_ADMIN).
    if (Array.isArray(list)) {
      return list.includes(featureId);
    }
    if (String(user.role ?? "").toUpperCase() === "SUPER_ADMIN") {
      return featureId !== "chamados.criacao";
    }
    return false;
  }, [user]);

  const permissionsReady = !!user && Array.isArray(user.allowedFeatures);
  const isPlatformAdmin = Boolean(user?.platformAdmin);
  const value = useMemo(
    () => ({ user, loading, setUser, logout, can, permissionsReady, isPlatformAdmin, refreshSession }),
    [user, loading, logout, can, permissionsReady, isPlatformAdmin, refreshSession],
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
