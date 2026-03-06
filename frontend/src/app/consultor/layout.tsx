"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { Home, FolderKanban, Clock, Banknote } from "lucide-react";

const NAV: NavItem[] = [
  { href: "/consultor", label: "Home", icon: Home },
  {
    label: "Projetos",
    icon: FolderKanban,
    children: [
      { href: "/consultor/projetos", label: "Lista de Projetos" },
      { href: "/consultor/projetos/arquivados", label: "Projetos Arquivados" },
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
    if (user.role !== "CONSULTOR") {
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

