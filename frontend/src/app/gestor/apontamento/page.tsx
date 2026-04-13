"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ApontamentoClient } from "../../consultor/apontamento/ApontamentoClient";

export default function GestorApontamentoPage() {
  const { user } = useAuth();
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Apontamento</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
            {user?.name ? `Olá, ${user.name}! ` : ""}
            Gerencie apontamentos de horas dos usuários.
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
