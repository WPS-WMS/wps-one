"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, Settings, PlusCircle } from "lucide-react";

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
    if (user.role !== "CONSULTOR") {
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

