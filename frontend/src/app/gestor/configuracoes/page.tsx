"use client";

import { ConfiguracoesCardsGrid } from "@/components/ConfiguracoesCardsGrid";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeConfiguracoesMenu } from "@/lib/featureNav";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GestorConfiguracoesPage() {
  const { can, loading, user, permissionsReady, refreshSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (loading || !user?.id || !permissionsReady) return;
    if (!canSeeConfiguracoesMenu(can)) {
      router.replace("/gestor");
    }
  }, [loading, user?.id, permissionsReady, can, router]);

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Configurações</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">Carregando permissões…</p>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-500">Aguarde um instante.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Configurações</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Cadastros, parâmetros e preferências disponíveis para o seu perfil.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ConfiguracoesCardsGrid basePath="/gestor" can={can} />
        </div>
      </main>
    </div>
  );
}
