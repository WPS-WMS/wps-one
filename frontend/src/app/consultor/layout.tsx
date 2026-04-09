"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, Settings, PlusCircle, BarChart3, LayoutDashboard } from "lucide-react";

export default function ConsultorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) items.push({ href: "/consultor", label: "Home", icon: Home });
    if (can("chamados.criacao")) items.push({ href: "/consultor/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (can("projeto")) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/consultor/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/consultor/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
        ],
      });
    }
    if (can("apontamentos")) items.push({ href: "/consultor/apontamento", label: "Apontamento", icon: Clock });
    if (can("hora-banco")) items.push({ href: "/consultor/banco-horas", label: "Banco de horas", icon: Banknote });
    if (can("portal.corporativo")) {
      items.push({ href: "/portal", label: "Portal colaborativo", icon: LayoutDashboard });
    }
    if (can("relatorios")) {
      items.push({
        label: "Relatórios",
        icon: BarChart3,
        children: [
          ...(can("relatorios") ? [{ href: "/consultor/relatorios", label: "Visão geral" }] : []),
          ...(can("relatorios.horas") ? [{ href: "/consultor/relatorios/gestao-horas", label: "Gestão de horas" }] : []),
          ...(can("relatorios.horas") ? [{ href: "/consultor/relatorios/horas", label: "Horas (período/projeto/cliente)" }] : []),
          ...(can("relatorios.chamados") ? [{ href: "/consultor/relatorios/chamados", label: "Chamados" }] : []),
          ...(can("relatorios.exportacao") ? [{ href: "/consultor/relatorios/exportacao", label: "Exportar faturamento" }] : []),
        ],
      });
    }
    if (can("configuracoes")) {
      items.push({ href: "/consultor/configuracoes", label: "Configurações", icon: Settings });
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
    if (user.role !== "CONSULTOR" && user.role !== "ADMIN_PORTAL") {
      router.replace("/");
      return;
    }
    if (!can("home") && pathname === "/consultor") {
      const fallback =
        (can("projeto.lista") && "/consultor/projetos") ||
        (can("apontamentos") && "/consultor/apontamento") ||
        (can("hora-banco") && "/consultor/banco-horas") ||
        (can("configuracoes") && "/consultor/configuracoes") ||
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

