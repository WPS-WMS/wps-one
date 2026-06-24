"use client";

import { Link } from "@/components/Link";
import { ConfiguracoesCardsGrid } from "@/components/ConfiguracoesCardsGrid";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeConfiguracoesMenu } from "@/lib/featureNav";
import { useEffect } from "react";

export default function ConfiguracoesPage() {
  const { user, loading, can, permissionsReady, refreshSession } = useAuth();

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    );
  }

  if (!canSeeConfiguracoesMenu(can)) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 tracking-wider">403</div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Acesso negado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Você não tem permissão para acessar esta funcionalidade.
          </p>
          <div className="mt-5">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Configurações</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Cadastros, parâmetros e preferências da revenda.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ConfiguracoesCardsGrid basePath="/admin" can={can} />
        </div>
      </main>
    </div>
  );
}
