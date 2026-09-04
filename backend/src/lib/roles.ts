export const ROLE_IDS = [
  "SUPER_ADMIN",
  "ADMIN_PORTAL",
  "GESTOR_PROJETOS",
  "CONSULTOR",
  "CONSULTOR_ONDEMAND",
  "CLIENTE",
  "ADMINISTRATIVO",
  "FINANCEIRO",
  "DIRETORIA",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

/** Perfis editáveis na Gestão de perfis (SUPER_ADMIN tem regras fixas). */
export const CONFIGURABLE_ROLE_IDS = [
  "ADMIN_PORTAL",
  "GESTOR_PROJETOS",
  "CONSULTOR",
  "CONSULTOR_ONDEMAND",
  "CLIENTE",
  "ADMINISTRATIVO",
  "FINANCEIRO",
  "DIRETORIA",
] as const;

export type ConfigurableRoleId = (typeof CONFIGURABLE_ROLE_IDS)[number];

export const ROLE_LABELS: Record<RoleId, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN_PORTAL: "Administrador do portal",
  GESTOR_PROJETOS: "Gestor de Projetos",
  CONSULTOR: "Consultor",
  CONSULTOR_ONDEMAND: "Consultor OnDemand",
  CLIENTE: "Cliente",
  ADMINISTRATIVO: "Administrativo",
  FINANCEIRO: "Financeiro",
  DIRETORIA: "Diretoria",
};

/** Perfis que não entram no seletor/listagem de banco de horas. */
export const HOUR_BANK_EXCLUDED_ROLES = ["CLIENTE", "CONSULTOR_ONDEMAND", "DIRETORIA"] as const;

export function isKnownRole(role: unknown): role is RoleId {
  return typeof role === "string" && (ROLE_IDS as readonly string[]).includes(role);
}

export function isConfigurableRole(role: unknown): role is ConfigurableRoleId {
  return typeof role === "string" && (CONFIGURABLE_ROLE_IDS as readonly string[]).includes(role);
}

/** Shell /consultor: equipe interna que não é gestor, cliente nem super admin. */
export function isInternalStaffLayoutRole(role: string | undefined | null): boolean {
  return (
    role === "CONSULTOR" ||
    role === "CONSULTOR_ONDEMAND" ||
    role === "ADMIN_PORTAL" ||
    role === "ADMINISTRATIVO" ||
    role === "FINANCEIRO" ||
    role === "DIRETORIA"
  );
}

/** Perfis que precisam de data de início e limites de apontamento no cadastro. */
export function roleRequiresTimeEntryConfig(role: string): boolean {
  if (
    role === "CLIENTE" ||
    role === "ADMINISTRATIVO" ||
    role === "FINANCEIRO" ||
    role === "DIRETORIA"
  ) {
    return false;
  }
  return true;
}

export function resolvePostLoginPath(role: string, hasPortal: boolean): string {
  if (role === "CLIENTE") return "/cliente";
  if (hasPortal) return "/portal";
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  return "/consultor";
}
