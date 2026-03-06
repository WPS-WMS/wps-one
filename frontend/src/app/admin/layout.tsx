"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote, BarChart3, Settings } from "lucide-react";

const NAV: NavItem[] = [
  { href: "/admin", label: "Home", icon: Home },
  {
    label: "Projetos",
    icon: FolderKanban,
    children: [
      { href: "/admin/projetos", label: "Lista de Projetos" },
      { href: "/admin/projetos/dashboard-daily", label: "Dashboard Daily" },
    ],
  },
  { href: "/admin/apontamento", label: "Apontamento", icon: Clock },
  { href: "/admin/banco-horas", label: "Banco de horas", icon: Banknote },
  {
    label: "Relatórios",
    icon: BarChart3,
    children: [
      { href: "/admin/relatorios", label: "Visão geral" },
      { href: "/admin/relatorios/horas", label: "Horas (período/projeto/cliente)" },
      { href: "/admin/relatorios/utilizacao", label: "Utilização" },
      { href: "/admin/relatorios/chamados", label: "Chamados" },
      { href: "/admin/relatorios/exportacao", label: "Exportar faturamento" },
    ],
  },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
    if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
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
      <Sidebar items={NAV} user={user} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

