"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ApontamentoClient } from "@/app/consultor/apontamento/ApontamentoClient";

export default function GestorApontamentoPage() {
  const { user } = useAuth();
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Apontamento</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie apontamentos de horas dos usuários.
          </p>
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
