"use client";

import { Link } from "@/components/Link";
import { useAuth } from "@/contexts/AuthContext";
import { Users, ShieldCheck, Building2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ConfiguracoesPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!can("configuracoes")) {
      router.replace("/admin");
    }
  }, [loading, user, can, router]);
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Configurações</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie usuários, permissões, clientes e perfis do sistema.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {can("configuracoes.usuarios") && (
              <Link
                href="/admin/usuarios"
                className="flex items-center gap-3 p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all"
              >
                <Users className="h-8 w-8 text-blue-600" />
                <span className="text-slate-900 font-medium">Usuários</span>
              </Link>
            )}
            {can("configuracoes.permissoes") && (
              <Link
                href="/admin/permissoes"
                className="flex items-center gap-3 p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all"
              >
                <ShieldCheck className="h-8 w-8 text-blue-600" />
                <span className="text-slate-900 font-medium">Permissões</span>
              </Link>
            )}
            {can("configuracoes.clientes") && (
              <Link
                href="/admin/clientes"
                className="flex items-center gap-3 p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all"
              >
                <Building2 className="h-8 w-8 text-blue-600" />
                <span className="text-slate-900 font-medium">Clientes</span>
              </Link>
            )}
            {can("configuracoes.gestaoPerfis") && (
              <Link
                href="/admin/gestao-perfis"
                className="flex items-center gap-3 p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all"
              >
                <UserCog className="h-8 w-8 text-blue-600" />
                <span className="text-slate-900 font-medium">Gestão de Perfis</span>
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
