"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Cliente: tarefas em Kanban/Dashboard Daily não são expostas; usar apenas a Lista de Tarefas. */
export default function DashboardDailyClienteRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/cliente/projetos/lista-tarefas");
  }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-[color:var(--muted-foreground)] text-sm">
      A redirecionar para a lista de tarefas…
    </div>
  );
}
