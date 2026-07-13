"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, Settings, PlusCircle, BarChart3, LayoutDashboard, Receipt, Wallet } from "lucide-react";
import {
  buildConfiguracoesNavChildren,
  buildFinanceiroNavChildren,
  buildRelatoriosNavChildren,
  canSeeConfiguracoesMenu,
  canSeeFinanceiroMenu,
  canSeeProjetosMenu,
  canSeeRelatoriosMenu,
} from "@/lib/featureNav";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import { isInternalStaffLayoutRole } from "@/lib/roles";

export default function ConsultorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) items.push({ href: "/consultor", label: "Home", icon: Home });
    if (can("chamados.criacao")) items.push({ href: "/consultor/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (canSeeProjetosMenu(can)) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/consultor/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/consultor/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
          ...(can("projeto.listaTarefas")
            ? [{ href: "/consultor/projetos/lista-tarefas", label: "Lista de Tarefas" }]
            : []),
          ...(can("projeto.gestaoTm") ? [{ href: "/consultor/projetos/gestao-tm", label: "Gestão T&M" }] : []),
          ...(can("configuracoes.permissoes")
            ? [{ href: "/consultor/permissoes", label: "Aprovações" }]
            : []),
        ],
      });
    }
    if (can("apontamentos")) items.push({ href: "/consultor/apontamento", label: "Apontamento", icon: Clock });
    if (can("reembolsos")) items.push({ href: "/consultor/reembolsos", label: "Solicitar Reembolso", icon: Receipt });
    if (can("hora-banco")) items.push({ href: "/consultor/banco-horas", label: "Banco de horas", icon: Banknote });
    if (can("portal.corporativo")) {
      items.push({ href: "/portal", label: "Portal colaborativo", icon: LayoutDashboard });
    }
    if (canSeeRelatoriosMenu(can)) {
      items.push({
        label: "Relatórios",
        icon: BarChart3,
        children: buildRelatoriosNavChildren("/consultor", can),
      });
    }
    if (canSeeFinanceiroMenu(can)) {
      items.push({
        label: "Financeiro",
        icon: Wallet,
        children: buildFinanceiroNavChildren("/consultor", can),
      });
    }
    if (canSeeConfiguracoesMenu(can)) {
      items.push({
        label: "Configurações",
        icon: Settings,
        children: buildConfiguracoesNavChildren("/consultor", can),
      });
    }
    return items
      .map((it) => (it.children ? { ...it, children: it.children.filter(Boolean) } : it))
      .filter((it) => !it.children || it.children.length > 0);
  })();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.mustChangePassword) {
      router.replace("/trocar-senha");
      return;
    }
    if (!isInternalStaffLayoutRole(user.role)) {
      router.replace("/");
      return;
    }
    if (!can("home") && pathname === "/consultor") {
      const fallback =
        (can("projeto.lista") && "/consultor/projetos") ||
        (can("apontamentos") && "/consultor/apontamento") ||
        (can("hora-banco") && "/consultor/banco-horas") ||
        (canSeeConfiguracoesMenu(can) && "/consultor/configuracoes") ||
        (canSeeRelatoriosMenu(can) && "/consultor/relatorios") ||
        (canFinanceFeature(can, "financeiro.fornecedores") && "/consultor/fornecedores") ||
        "/perfil";
      router.replace(fallback);
    }
  }, [user, loading, router, pathname, can]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
        <p className="text-[color:var(--foreground)]">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[color:var(--background)]">
      <Sidebar items={nav} user={user} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

