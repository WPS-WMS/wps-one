"use client";

import { HomeDashboard } from "@/components/HomeDashboard";

export default function GestorHomePage() {
  // Reutiliza o mesmo dashboard da home de admin/consultor
  return <HomeDashboard basePath="/gestor" />;
}

