"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Hub de cards removido: redireciona para a home do perfil. */
export default function ConsultorConfiguracoesPage() {
  const router = useRouter();
  const { loading, permissionsReady } = useAuth();

  useEffect(() => {
    if (loading || !permissionsReady) return;
    router.replace("/consultor");
  }, [loading, permissionsReady, router]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando...</p>
    </div>
  );
}
