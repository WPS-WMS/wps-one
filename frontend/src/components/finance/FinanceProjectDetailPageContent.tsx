"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectRevenuesSection } from "@/components/finance/ProjectRevenuesSection";
import { FinancePageHeader } from "@/components/finance/FinancePageHeader";

type FinanceProjectDetailPageContentProps = {
  projectId: string;
};

export function FinanceProjectDetailPageContent({ projectId }: FinanceProjectDetailPageContentProps) {
  const router = useRouter();
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const projectsHref = `${basePath}/financeiro/projetos`;

  const canAccess = useMemo(() => can("financeiro.projetos.receitas"), [can]);

  const canRevenues = useMemo(() => can("financeiro.projetos.receitas"), [can]);

  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const r = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}?light=1`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setProjectName(null);
      setError(typeof body?.error === "string" ? body.error : "Projeto não encontrado.");
      setLoading(false);
      return;
    }
    setProjectName(typeof body?.name === "string" ? body.name : "Projeto");
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
      <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
        <button
          type="button"
          onClick={() => router.push(projectsHref)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="p-6">
          <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push(projectsHref)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <FinancePageHeader
        variant="bar"
        eyebrow="Financeiro · Projetos"
        title={projectName ?? "Projeto"}
        subtitle="Composição de custos e parcelas de faturamento do projeto."
      />

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-5 md:px-6 md:pt-6">
        <div className="mx-auto max-w-6xl">
          {canRevenues && <ProjectRevenuesSection projectId={projectId} financeContext />}
        </div>
      </main>
    </div>
  );
}
