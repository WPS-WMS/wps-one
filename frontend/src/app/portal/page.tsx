"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { PortalCollaborativeDashboard } from "@/components/PortalCollaborativeDashboard";

export default function PortalPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "CLIENTE") {
      router.replace("/cliente");
      return;
    }
    if (!can("portal.corporativo")) {
      if (user.role === "SUPER_ADMIN") router.replace("/admin");
      else if (user.role === "GESTOR_PROJETOS") router.replace("/gestor");
      else router.replace("/consultor");
    }
  }, [user, loading, router, can]);

  if (loading || !user || !can("portal.corporativo")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-[color:var(--muted-foreground)] text-sm">
        Carregando portal…
      </div>
    );
  }

  return <PortalCollaborativeDashboard />;
}
