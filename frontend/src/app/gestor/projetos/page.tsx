"use client";

import AdminProjectsPage from "@/app/admin/projetos/page";

// Lista de projetos do Gestor reutiliza exatamente a mesma tela de admin,
// apenas sob o prefixo /gestor.
export default function GestorProjectsPage() {
  return <AdminProjectsPage />;
}

