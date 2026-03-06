"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote } from "lucide-react";

const BASE_NAV: NavItem[] = [
  { href: "/consultor", label: "Home", icon: Home },
  {
    label: "Projetos",
    icon: FolderKanban,
    children: [
      { href: "/consultor/projetos", label: "Lista de Projetos" },
      // O href de \"Dashboard Daily\" pode ser ajustado por papel (CONSULTOR x GESTOR)
      { href: "/consultor/projetos/dashboard-daily", label: "Dashboard Daily" },
    ],
  },
  { href: "/consultor/apontamento", label: "Apontamento", icon: Clock },
  { href: "/consultor/banco-horas", label: "Banco de horas", icon: Banknote },
];

export default function ConsultorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

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
    if (user.role !== "CONSULTOR" && user.role !== "GESTOR_PROJETOS" && user.role !== "ADMIN") {
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

  const navItems = useMemo<NavItem[]>(() => {
    const isGestor = user.role === "GESTOR_PROJETOS";
    if (!isGestor) return BASE_NAV;
    // Para Gestor de Projetos, o Dashboard Daily aponta para a versão de admin
    return BASE_NAV.map((item) => {
      if (item.label !== "Projetos" || !item.children) return item;
      return {
        ...item,
        children: item.children.map((child) =>
          child.label === "Dashboard Daily"
            ? { ...child, href: "/admin/projetos/dashboard-daily" }
            : child
        ),
      };
    });
  }, [user.role]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar items={navItems} user={user} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

