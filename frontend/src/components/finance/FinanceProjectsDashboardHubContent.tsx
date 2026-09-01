"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  fetchFinanceProjectsForSelect,
  formatFinanceProjectLabel,
} from "@/lib/financeProjectSelect";
import { FinancePageHeader, financeListPageShellClass } from "@/components/finance/FinancePageHeader";
import { FinanceProjectDashboardPageContent } from "@/components/finance/FinanceProjectDashboardPageContent";

type ProjectOption = {
  projectId: string;
  projectName: string;
  arquivado?: boolean;
  clientName: string;
};

export function FinanceProjectsDashboardHubContent() {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.projetos.receitas"),
    [can],
  );

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(() => searchParams.get("projectId") ?? "");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectMenuRect, setProjectMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const rows = await fetchFinanceProjectsForSelect();
      setProjects(
        rows
          .filter((p) => !p.parentProjectId)
          .map((p) => ({
            projectId: p.id,
            projectName: p.name,
            arquivado: p.arquivado,
            clientName: p.clientName?.trim() || "—",
          })),
      );
    } catch {
      setProjects([]);
      setError("Erro ao carregar projetos.");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void loadProjects();
  }, [permissionsReady, canAccess, loadProjects]);

  useEffect(() => {
    const fromUrl = searchParams.get("projectId") ?? "";
    setSelectedProjectId(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const update = () => {
      const el = projectAnchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setProjectMenuRect({
        left: rect.left,
        top: rect.bottom + 6,
        width: Math.max(rect.width, 280),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projectAnchorRef.current?.contains(t)) return;
      if ((t as HTMLElement)?.closest?.("#finance-project-dashboard-menu")) return;
      setProjectMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [projectMenuOpen]);

  function selectProject(id: string) {
    setSelectedProjectId(id);
    setProjectMenuOpen(false);
    const qs = id ? `?projectId=${encodeURIComponent(id)}` : "";
    router.replace(`${basePath}/financeiro/dashboard-projetos${qs}`);
  }

  const selectedLabel = useMemo(() => {
    if (!selectedProjectId) return "Selecione um projeto...";
    const p = projects.find((x) => x.projectId === selectedProjectId);
    return p
      ? `${p.clientName} · ${formatFinanceProjectLabel(p.projectName, p.arquivado)}`
      : "Projeto";
  }, [projects, selectedProjectId]);

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;
  }

  return (
    <div className={financeListPageShellClass}>
      <FinancePageHeader
        title="Resultado de projeto"
        subtitle="Selecione um projeto para ver o resultado completo ou mensal (receita, despesa, impostos e margem)."
        chip="Projetos"
      />

      <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-full md:w-[min(100%,420px)]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  ref={projectAnchorRef}
                  disabled={loadingProjects}
                  className="w-full px-4 py-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] flex items-center gap-2 text-left disabled:opacity-60"
                  aria-haspopup="listbox"
                  aria-expanded={projectMenuOpen}
                >
                  <span className="truncate">{selectedLabel}</span>
                  <span className="ml-auto text-[color:var(--muted-foreground)]">▾</span>
                </button>
                {typeof document !== "undefined" && projectMenuOpen && projectMenuRect
                  ? createPortal(
                      <div
                        id="finance-project-dashboard-menu"
                        role="listbox"
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-xl overflow-hidden"
                        style={{
                          position: "fixed",
                          left: projectMenuRect.left,
                          top: projectMenuRect.top,
                          width: projectMenuRect.width,
                          zIndex: 80,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => selectProject("")}
                          className="w-full px-4 py-3 text-left text-sm hover:bg-black/5 text-[color:var(--muted-foreground)]"
                        >
                          Selecione um projeto...
                        </button>
                        <div className="py-2 border-t border-[color:var(--border)]">
                          <div className="px-4 py-2 text-xs font-semibold tracking-wide uppercase text-[color:var(--muted-foreground)]">
                            Projetos
                          </div>
                          <div className="max-h-[320px] overflow-auto">
                            {projects.map((p) => {
                              const active = selectedProjectId === p.projectId;
                              return (
                                <button
                                  key={p.projectId}
                                  type="button"
                                  onClick={() => selectProject(p.projectId)}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-black/5 ${
                                    active ? "bg-black/5 font-semibold" : ""
                                  }`}
                                >
                                  <span className="truncate block">
                                    {p.clientName} · {formatFinanceProjectLabel(p.projectName, p.arquivado)}
                                  </span>
                                </button>
                              );
                            })}
                            {projects.length === 0 && (
                              <p className="px-4 py-3 text-sm text-[color:var(--muted-foreground)]">
                                Nenhum projeto encontrado.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
            {loadingProjects && (
              <span className="inline-flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando projetos…
              </span>
            )}
          </div>

          {error && (
            <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>
          )}

          {selectedProjectId ? (
            <FinanceProjectDashboardPageContent projectId={selectedProjectId} embedded />
          ) : (
            <div className="rounded-2xl border border-dashed px-6 py-16 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Selecione um projeto para visualizar o resultado financeiro.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
