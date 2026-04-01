"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, Settings, PlusCircle, LayoutDashboard } from "lucide-react";

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) items.push({ href: "/gestor", label: "Home", icon: Home });
    if (can("chamados.criacao")) items.push({ href: "/gestor/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (can("projeto")) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/gestor/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/gestor/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
        ],
      });
    }
    if (can("apontamentos")) items.push({ href: "/gestor/apontamento", label: "Apontamento", icon: Clock });
    if (can("hora-banco")) items.push({ href: "/gestor/banco-horas", label: "Banco de horas", icon: Banknote });
    if (can("portal.corporativo")) {
      items.push({ href: "/portal", label: "Portal colaborativo", icon: LayoutDashboard });
    }
    if (can("configuracoes")) items.push({ href: "/gestor/configuracoes", label: "Configurações", icon: Settings });
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
        (can("configuracoes") && "/gestor/configuracoes") ||
        "/perfil";
      router.replace(fallback);
    }
  }, [user, loading, router, pathname, can]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <p className="text-blue-700">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar items={nav} user={user} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

