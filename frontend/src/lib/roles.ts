export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN_PORTAL: "Administrador do portal",
  GESTOR_PROJETOS: "Gestor de Projetos",
  CONSULTOR: "Consultor",
  CLIENTE: "Cliente",
  ADMINISTRATIVO: "Administrativo",
  FINANCEIRO: "Financeiro",
};

export const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super administrador" },
  { value: "ADMIN_PORTAL", label: "Administrador do portal" },
  { value: "GESTOR_PROJETOS", label: "Gestor de Projetos" },
  { value: "CONSULTOR", label: "Consultor" },
  { value: "ADMINISTRATIVO", label: "Administrativo" },
  { value: "FINANCEIRO", label: "Financeiro" },
  { value: "CLIENTE", label: "Cliente" },
] as const;

export const GESTAO_PERFIS_ROLES = [
  { id: "ADMIN_PORTAL" as const, label: "Administrador do portal" },
  { id: "GESTOR_PROJETOS" as const, label: "Gestor de Projetos" },
  { id: "CONSULTOR" as const, label: "Consultor" },
  { id: "CLIENTE" as const, label: "Cliente" },
  { id: "ADMINISTRATIVO" as const, label: "Administrativo" },
  { id: "FINANCEIRO" as const, label: "Financeiro" },
];

export type GestaoPerfisRoleId = (typeof GESTAO_PERFIS_ROLES)[number]["id"];

export function isInternalStaffLayoutRole(role: string | undefined | null): boolean {
  return role === "CONSULTOR" || role === "ADMIN_PORTAL" || role === "ADMINISTRATIVO" || role === "FINANCEIRO";
}

/** Visão operacional de projetos/apontamentos (consultor e admin portal). */
export function isConsultantLikeRole(role: string | undefined | null): boolean {
  return role === "CONSULTOR" || role === "ADMIN_PORTAL";
}

export function resolvePostLoginPath(role: string, hasPortal: boolean): string {
  if (role === "CLIENTE") return "/cliente";
  if (hasPortal) return "/portal";
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  return "/consultor";
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
