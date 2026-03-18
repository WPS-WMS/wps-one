"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken } from "@/lib/api";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
  allowedFeatures?: string[];
  cargo?: string;
  cargaHorariaSemanal?: number;
  limiteHorasDiarias?: number;
  limiteHorasPorDia?: string;
  permitirMaisHoras?: boolean;
  permitirFimDeSemana?: boolean;
  permitirOutroPeriodo?: boolean;
  diasPermitidos?: string;
  mustChangePassword?: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => void;
  can: (featureId: string) => boolean;
  permissionsReady: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let skipFirstFinally = false;
    async function loadUser(retry = false) {
      if (retry) skipFirstFinally = false;
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

  function logout() {
    clearToken();
    setUser(null);
    // Navegação completa garante que o estado da app seja resetado (evita falha do Sair para usuários novos / export estático)
    if (typeof window !== "undefined") {
      window.location.replace(window.location.origin + "/login");
    } else {
      router.push("/login");
    }
  }

  function can(featureId: string): boolean {
    if (!user) return false;
    const list = user.allowedFeatures;
    if (!Array.isArray(list)) return true; // compat: backend antigo (sem permissions)
    return list.includes(featureId);
  }

  const permissionsReady = !!user && Array.isArray(user.allowedFeatures);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, can, permissionsReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
