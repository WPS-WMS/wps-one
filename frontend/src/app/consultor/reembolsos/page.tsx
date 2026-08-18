"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ReembolsosClient } from "./ReembolsosClient";

export default function ReembolsosPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/admin")
      ? "/admin"
      : "/consultor";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("reembolsos")) {
      router.replace(basePath);
    }
  }, [user, loading, can, router, basePath]);

  if (loading || !user) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Reembolso</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            {user?.name ? `Olá, ${user.name}! ` : ""}
            Envie solicitações de reembolso e acompanhe o status.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ReembolsosClient mode={user.role === "SUPER_ADMIN" && basePath === "/admin" ? "admin" : "user"} />
        </div>
      </main>
    </div>
  );
}

