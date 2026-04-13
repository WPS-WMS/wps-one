"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ApontamentoClient } from "../../consultor/apontamento/ApontamentoClient";

export default function GestorApontamentoPage() {
  const { user } = useAuth();
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/70 backdrop-blur px-5 py-4">
            <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">Apontamento</h1>
            <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">
              Gerencie apontamentos de horas dos usuários.
            </p>
            <div className="wps-apontamento-headerline mt-4 h-px w-full" aria-hidden />
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ApontamentoClient />
        </div>
      </main>
    </div>
  );
}
