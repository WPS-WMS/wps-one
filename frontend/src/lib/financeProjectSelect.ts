import { apiFetch } from "@/lib/api";

export const FINANCE_PROJECTS_SELECT_PATH = "/api/projects/for-finance-select";

export type FinanceProjectOption = {
  id: string;
  name: string;
  clientId?: string | null;
  clientName?: string | null;
  parentProjectId?: string | null;
  arquivado?: boolean;
};

export function formatFinanceProjectLabel(name: string, arquivado?: boolean): string {
  const base = name.trim() || "Projeto";
  return arquivado ? `${base} (Arquivado)` : base;
}

export function mapFinanceProjectFromApi(raw: {
  id?: string;
  name?: string;
  clientId?: string | null;
  client?: { id?: string | null; name?: string | null } | null;
  parentProjectId?: string | null;
  arquivado?: boolean;
}): FinanceProjectOption {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "").trim() || "Projeto",
    clientId: raw.clientId ?? raw.client?.id ?? null,
    clientName: raw.client?.name ?? null,
    parentProjectId: raw.parentProjectId ?? null,
    arquivado: Boolean(raw.arquivado),
  };
}

export async function fetchFinanceProjectsForSelect(): Promise<FinanceProjectOption[]> {
  const res = await apiFetch(FINANCE_PROJECTS_SELECT_PATH);
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) return [];
  return body.map(mapFinanceProjectFromApi).filter((p) => p.id);
}

export function financeProjectToSelectOption(
  project: FinanceProjectOption,
): { value: string; label: string } {
  return {
    value: project.id,
    label: formatFinanceProjectLabel(project.name, project.arquivado),
  };
}
