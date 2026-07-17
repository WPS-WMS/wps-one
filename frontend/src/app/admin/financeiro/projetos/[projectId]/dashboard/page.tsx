"use client";

import { useEffect } from "react";
import { use } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFinanceProjectId } from "@/lib/financeProjectRoute";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

/** Redireciona a URL antiga para o hub Dashboard projetos. */
export default function AdminFinanceiroProjetoDashboardRedirectPage({ params }: PageProps) {
  const { projectId } = use(params);
  const resolvedProjectId = useFinanceProjectId(projectId);
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  useEffect(() => {
    if (!resolvedProjectId) return;
    router.replace(
      `${basePath}/financeiro/dashboard-projetos?projectId=${encodeURIComponent(resolvedProjectId)}`,
    );
  }, [basePath, resolvedProjectId, router]);

  return (
    <p className="p-6 text-sm text-[color:var(--muted-foreground)]">Redirecionando…</p>
  );
}
