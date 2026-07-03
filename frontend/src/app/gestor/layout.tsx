"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, Settings, PlusCircle, LayoutDashboard, BarChart3, Receipt, Wallet } from "lucide-react";
import {
  buildFinanceiroNavChildren,
  buildRelatoriosNavChildren,
  canSeeConfiguracoesMenu,
  canSeeFinanceiroMenu,
  canSeeProjetosMenu,
  canSeeRelatoriosMenu,
} from "@/lib/featureNav";

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) items.push({ href: "/gestor", label: "Home", icon: Home });
    if (can("chamados.criacao")) items.push({ href: "/gestor/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (canSeeProjetosMenu(can)) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/gestor/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/gestor/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
          ...(can("projeto.listaTarefas")
            ? [{ href: "/gestor/projetos/lista-tarefas", label: "Lista de Tarefas" }]
            : []),
          ...(can("projeto.gestaoTm") ? [{ href: "/gestor/projetos/gestao-tm", label: "Gestão T&M" }] : []),
        ],
      });
    }
    if (can("apontamentos")) items.push({ href: "/gestor/apontamento", label: "Apontamento", icon: Clock });
    if (can("reembolsos")) items.push({ href: "/gestor/reembolsos", label: "Solicitar Reembolso", icon: Receipt });
    if (can("hora-banco")) items.push({ href: "/gestor/banco-horas", label: "Banco de horas", icon: Banknote });
    if (can("portal.corporativo")) {
      items.push({ href: "/portal", label: "Portal colaborativo", icon: LayoutDashboard });
    }
    if (canSeeRelatoriosMenu(can)) {
      items.push({
        label: "Relatórios",
        icon: BarChart3,
        children: buildRelatoriosNavChildren("/gestor", can),
      });
    }
    if (canSeeFinanceiroMenu(can)) {
      items.push({
        label: "Financeiro",
        icon: Wallet,
        children: buildFinanceiroNavChildren("/gestor", can),
      });
    }
    if (canSeeConfiguracoesMenu(can)) items.push({ href: "/gestor/configuracoes", label: "Configurações", icon: Settings });
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
    if (user.role !== "GESTOR_PROJETOS") {
      router.replace("/");
      return;
    }
    if (!can("home") && pathname === "/gestor") {
      const fallback =
        (can("projeto.lista") && "/gestor/projetos") ||
        (can("apontamentos") && "/gestor/apontamento") ||
        (can("hora-banco") && "/gestor/banco-horas") ||
        (canSeeConfiguracoesMenu(can) && "/gestor/configuracoes") ||
        (canSeeRelatoriosMenu(can) && "/gestor/relatorios") ||
        (can("financeiro.fornecedores") && "/gestor/financeiro/fornecedores") ||
        (can("financeiro.clientesFinanceiros") && "/gestor/financeiro/clientes-financeiros") ||
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

