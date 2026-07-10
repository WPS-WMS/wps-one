import { useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

/** Resolve o ID do projeto na rota estática (Firebase export usa placeholder "_"). */
export function resolveFinanceProjectId(
  projectId: string | undefined,
  pathnames: string[],
): string {
  if (projectId && projectId !== "_") return projectId;
  for (const pathname of pathnames) {
    if (!pathname) continue;
    const parts = pathname.split("/").filter(Boolean);
    const projetosIdx = parts.indexOf("projetos");
    const candidate = projetosIdx >= 0 ? parts[projetosIdx + 1] : undefined;
    if (candidate && candidate !== "_") {
      try {
        return decodeURIComponent(candidate);
      } catch {
        return candidate;
      }
    }
  }
  return "";
}

/**
 * Navegação com reload completo — necessária no export estático + Firebase Hosting
 * para rotas dinâmicas irmãs (`[projectId]/visualizar`, `[projectId]/dashboard`).
 */
export function hardNavigateFinanceProjectRoute(href: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(href);
  }
}

export function useFinanceProjectId(projectId: string | undefined): string {
  const pathname = usePathname();
  const [resolved, setResolved] = useState(() =>
    resolveFinanceProjectId(projectId, [pathname ?? ""]),
  );

  useLayoutEffect(() => {
    const windowPath = typeof window !== "undefined" ? window.location.pathname : "";
    setResolved(resolveFinanceProjectId(projectId, [windowPath, pathname ?? ""]));
  }, [projectId, pathname]);

  return useMemo(() => {
    if (projectId && projectId !== "_") return projectId;
    return resolved;
  }, [projectId, resolved]);
}
