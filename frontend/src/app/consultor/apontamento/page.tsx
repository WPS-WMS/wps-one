"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ApontamentoClient } from "./ApontamentoClient";

export default function ApontamentoPage() {
  const { user } = useAuth();
  const isAdminPortal = user?.role === "ADMIN_PORTAL";
  const title = isAdminPortal ? "Apontamento" : "Apontamento de horas";
  const subtitle = isAdminPortal
    ? "Gerencie apontamentos de horas dos usuários do portal."
    : "Registre suas horas trabalhadas por projeto e tarefa.";
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">{title}</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            {user?.name ? `Olá, ${user.name}! ` : ""}
            {subtitle}
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ApontamentoClient consultorVisualRefresh />
        </div>
      </main>
    </div>
  );
}
