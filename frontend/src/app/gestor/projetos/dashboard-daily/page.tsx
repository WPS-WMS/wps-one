"use client";

import DashboardDailyAdminPage from "@/app/admin/projetos/dashboard-daily/page";

// Para Gestor de Projetos, reutilizamos a mesma tela de Dashboard Daily do admin,
// apenas sob o prefixo /gestor para deixar a URL coerente com o perfil.
export default function DashboardDailyGestorPage() {
  return <DashboardDailyAdminPage />;
}

