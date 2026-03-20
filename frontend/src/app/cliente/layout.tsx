"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, PlusCircle, FolderKanban, Settings } from "lucide-react";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();

  const nav: NavItem[] = (() => {
    const items: NavItem[] = [];
    if (can("home")) {
      items.push({ href: "/cliente", label: "Home", icon: Home });
    }
    items.push({ href: "/cliente/abrir-chamado", label: "Abrir chamado", icon: PlusCircle });
    if (can("projeto")) {
      items.push({
        label: "Projetos",
        icon: FolderKanban,
        children: [
          ...(can("projeto.lista") ? [{ href: "/cliente/projetos", label: "Lista de Projetos" }] : []),
          ...(can("projeto.dashboardDaily")
            ? [{ href: "/cliente/projetos/dashboard-daily", label: "Dashboard Daily" }]
            : []),
        ],
      });
    }
    if (can("configuracoes")) {
      items.push({ href: "/cliente/configuracoes", label: "Configurações", icon: Settings });
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
    if (user.role !== "CLIENTE") {
      router.replace("/");
    }
  }, [user, loading, router]);

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

