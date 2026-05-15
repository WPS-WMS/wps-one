"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, BarChart3, Settings, PlusCircle, LayoutDashboard, Receipt } from "lucide-react";
import { canSeeConfiguracoesMenu, canSeeRelatoriosMenu } from "@/lib/featureNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) items.push({ href: "/admin", label: "Home", icon: Home });
    if (can("chamados.criacao")) items.push({ href: "/admin/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (can("projeto")) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/admin/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/admin/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
          ...(can("projeto.listaTarefas")
            ? [{ href: "/admin/projetos/lista-tarefas", label: "Lista de Tarefas" }]
            : []),
          ...(can("projeto.lista") ? [{ href: "/admin/projetos/gestao-tm", label: "Gestão T&M" }] : []),
        ],
      });
    }
    if (can("apontamentos")) items.push({ href: "/admin/apontamento", label: "Apontamento", icon: Clock });
    if (can("reembolsos")) items.push({ href: "/admin/reembolsos", label: "Solicitar Reembolso", icon: Receipt });
    if (can("hora-banco")) items.push({ href: "/admin/banco-horas", label: "Banco de horas", icon: Banknote });
    if (can("portal.corporativo")) {
      items.push({ href: "/portal", label: "Portal colaborativo", icon: LayoutDashboard });
    }
    if (canSeeRelatoriosMenu(can)) {
      items.push({
        label: "Relatórios",
        icon: BarChart3,
        children: [
          ...(can("relatorios") ? [{ href: "/admin/relatorios", label: "Visão geral" }] : []),
          ...(can("relatorios.horas")
            ? [{ href: "/admin/relatorios/gestao-horas", label: "Gestão de horas" }]
            : []),
          ...(can("relatorios.horas")
            ? [{ href: "/admin/relatorios/horas", label: "Horas (período/projeto/cliente)" }]
            : []),
          ...(can("relatorios.reembolsos") ? [{ href: "/admin/relatorios/reembolsos", label: "Reembolsos" }] : []),
          ...(can("relatorios.utilizacao") ? [{ href: "/admin/relatorios/utilizacao", label: "Utilização" }] : []),
          ...(can("relatorios.chamados") ? [{ href: "/admin/relatorios/chamados", label: "Chamados" }] : []),
          ...(can("relatorios.exportacao")
            ? [{ href: "/admin/relatorios/exportacao", label: "Exportar faturamento" }]
            : []),
        ],
      });
    }
    if (canSeeConfiguracoesMenu(can)) items.push({ href: "/admin/configuracoes", label: "Configurações", icon: Settings });
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
    if (user.role !== "SUPER_ADMIN") {
      router.replace("/");
      return;
    }
    if (!can("home") && pathname === "/admin") {
      const fallback =
        (can("projeto.lista") && "/admin/projetos") ||
        (can("apontamentos") && "/admin/apontamento") ||
        (can("hora-banco") && "/admin/banco-horas") ||
        (canSeeRelatoriosMenu(can) && "/admin/relatorios") ||
        (can("configuracoes") && "/admin/configuracoes") ||
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

