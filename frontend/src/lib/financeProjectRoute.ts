import { useMemo } from "react";
import { usePathname } from "next/navigation";

/** Resolve o ID do projeto na rota estática (Firebase export usa placeholder "_"). */
export function resolveFinanceProjectId(projectId: string | undefined, pathname: string): string {
  if (projectId && projectId !== "_") return projectId;
  const parts = pathname.split("/").filter(Boolean);
  const projetosIdx = parts.indexOf("projetos");
  const candidate = projetosIdx >= 0 ? parts[projetosIdx + 1] : undefined;
  return candidate && candidate !== "_" ? candidate : "";
}

export function useFinanceProjectId(projectId: string | undefined): string {
  const pathname = usePathname();
  return useMemo(() => resolveFinanceProjectId(projectId, pathname), [projectId, pathname]);
}
