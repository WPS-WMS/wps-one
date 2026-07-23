"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectRevenuesSection } from "@/components/finance/ProjectRevenuesSection";

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
      <header
        className="relative flex-shrink-0 overflow-hidden border-b bg-[color:var(--surface)] px-4 py-5 md:px-6 md:py-6"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
          style={{ background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full opacity-[0.1]"
          style={{ background: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
            Financeiro · Projetos
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--foreground)] md:text-2xl">
            {projectName}
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--muted-foreground)]">
            Composição de custos e parcelas de faturamento do projeto.
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-6 md:px-6 md:pt-8">
        <div className="mx-auto max-w-6xl">
          {canRevenues && <ProjectRevenuesSection projectId={projectId} financeContext />}
        </div>
      </main>
    </div>
  );
}
