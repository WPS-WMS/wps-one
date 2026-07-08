"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectRevenuesSection } from "@/components/finance/ProjectRevenuesSection";

type FinanceProjectDetailPageContentProps = {
  projectId: string;
};

export function FinanceProjectDetailPageContent({ projectId }: FinanceProjectDetailPageContentProps) {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () =>
      can("financeiro.projetos") ||
      can("financeiro.projetos.receitas") ||
      can("financeiro.projetos.contratos") ||
      can("financeiro.projetos.resultado"),
    [can],
  );

  const canRevenues = useMemo(() => can("financeiro.projetos.receitas"), [can]);

  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const r = await apiFetch(`/api/project-financial-result?projectId=${encodeURIComponent(projectId)}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setProjectName(null);
      setError(typeof body?.error === "string" ? body.error : "Projeto não encontrado.");
      setLoading(false);
      return;
    }
    setProjectName(typeof body?.projectName === "string" ? body.projectName : "Projeto");
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess || !projectId) return;
    void load();
  }, [permissionsReady, canAccess, projectId, load]);

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[color:var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando projeto…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Link
          href={`${basePath}/financeiro/projetos`}
          className="inline-flex items-center gap-2 text-sm text-[color:var(--primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para projetos
        </Link>
        <div className="wps-finance-alert-error mt-4 rounded-lg border px-4 py-3 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${basePath}/financeiro/projetos`}
          className="inline-flex w-fit items-center gap-2 text-sm text-[color:var(--primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para projetos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{projectName}</h1>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Composição de custos e faturamento por parcelas.
            </p>
          </div>
          {can("financeiro.projetos.resultado") && (
            <Link
              href={`${basePath}/financeiro/projetos/${projectId}/dashboard`}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[color:var(--muted)]/30"
              style={{ borderColor: "var(--border)" }}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          )}
        </div>
      </div>

      {canRevenues && <ProjectRevenuesSection projectId={projectId} financeContext />}
    </div>
  );
}
