import { prisma } from "./prisma.js";

export type UserProfileLayoutShell = "admin" | "gestor" | "consultor" | "cliente";

export type SystemUserProfileSeed = {
  code: string;
  name: string;
  layoutShell: UserProfileLayoutShell;
  requiresClientLink: boolean;
  requiresTimeEntry: boolean;
  excludeFromHourBank: boolean;
  sortOrder: number;
  /** Aparece em Gestão de perfis (matriz de permissões). */
  configurable: boolean;
  /** Aparece no select de Usuários. */
  assignable: boolean;
};

/** Perfis de sistema provisionados por tenant. */
export const SYSTEM_USER_PROFILES: SystemUserProfileSeed[] = [
  {
    code: "SUPER_ADMIN",
    name: "Super administrador",
    layoutShell: "admin",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 10,
    configurable: false,
    /** Um por empresa (provisionado); não aparece no select de Usuários nem se cria como perfil. */
    assignable: false,
  },
  {
    code: "ADMIN_PORTAL",
    name: "Administrador do portal",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 20,
    configurable: true,
    assignable: true,
  },
  {
    code: "GESTOR_PROJETOS",
    name: "Gestor de Projetos",
    layoutShell: "gestor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 30,
    configurable: true,
    assignable: true,
  },
  {
    code: "CONSULTOR",
    name: "Consultor",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 40,
    configurable: true,
    assignable: true,
  },
  {
    code: "CONSULTOR_ONDEMAND",
    name: "Consultor OnDemand",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: true,
    sortOrder: 50,
    configurable: true,
    assignable: true,
  },
  {
    code: "ADMINISTRATIVO",
    name: "Administrativo",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 60,
    configurable: true,
    assignable: true,
  },
  {
    code: "FINANCEIRO",
    name: "Financeiro",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: false,
    sortOrder: 70,
    configurable: true,
    assignable: true,
  },
  {
    code: "DIRETORIA",
    name: "Diretoria",
    layoutShell: "consultor",
    requiresClientLink: false,
    requiresTimeEntry: true,
    excludeFromHourBank: true,
    sortOrder: 80,
    configurable: true,
    assignable: true,
  },
  {
    code: "CLIENTE",
    name: "Cliente",
    layoutShell: "cliente",
    requiresClientLink: true,
    requiresTimeEntry: false,
    excludeFromHourBank: true,
    sortOrder: 90,
    configurable: false,
    assignable: true,
  },
];

export function slugifyUserProfileCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || `PERFIL_${Date.now().toString(36).toUpperCase()}`;
}

export function isValidLayoutShell(value: unknown): value is UserProfileLayoutShell {
  return value === "admin" || value === "gestor" || value === "consultor" || value === "cliente";
}

/** Garante que os perfis de sistema existam no tenant (idempotente). */
export async function ensureTenantUserProfiles(tenantId: string): Promise<void> {
  const existing = await prisma.tenantUserProfile.findMany({
    where: { tenantId, isSystem: true },
    select: { code: true },
  });
  const have = new Set(existing.map((r) => r.code));
  const missing = SYSTEM_USER_PROFILES.filter((p) => !have.has(p.code));
  if (missing.length === 0) return;
  await prisma.tenantUserProfile.createMany({
    data: missing.map((p) => ({
      tenantId,
      code: p.code,
      name: p.name,
      isActive: true,
      isSystem: true,
      layoutShell: p.layoutShell,
      requiresClientLink: p.requiresClientLink,
      requiresTimeEntry: p.requiresTimeEntry,
      excludeFromHourBank: p.excludeFromHourBank,
      sortOrder: p.sortOrder,
    })),
    skipDuplicates: true,
  });
}

export async function listTenantUserProfiles(
  tenantId: string,
  opts?: {
    activeOnly?: boolean;
    assignableOnly?: boolean;
    configurableOnly?: boolean;
    /** Inclui SUPER_ADMIN na lista (padrão: oculto — um por empresa, não gerenciável aqui). */
    includeSuperAdmin?: boolean;
  },
) {
  await ensureTenantUserProfiles(tenantId);
  const rows = await prisma.tenantUserProfile.findMany({
    where: {
      tenantId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
      ...(opts?.includeSuperAdmin ? {} : { NOT: { code: "SUPER_ADMIN" } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const systemMeta = new Map(SYSTEM_USER_PROFILES.map((p) => [p.code, p]));
  return rows
    .map((r) => {
      const meta = systemMeta.get(r.code);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        isActive: r.isActive,
        isSystem: r.isSystem,
        layoutShell: r.layoutShell,
        requiresClientLink: r.requiresClientLink,
        requiresTimeEntry: r.requiresTimeEntry,
        excludeFromHourBank: r.excludeFromHourBank,
        sortOrder: r.sortOrder,
        assignable: meta ? meta.assignable : true,
        configurable: meta ? meta.configurable : true,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    })
    .filter((r) => {
      if (opts?.assignableOnly && !r.assignable) return false;
      if (opts?.configurableOnly && !r.configurable) return false;
      return true;
    });
}

export async function findTenantUserProfile(tenantId: string, code: string) {
  await ensureTenantUserProfiles(tenantId);
  return prisma.tenantUserProfile.findFirst({
    where: { tenantId, code },
  });
}

export async function isAssignableTenantRole(tenantId: string, code: string): Promise<boolean> {
  if (code === "SUPER_ADMIN" || code === "PLATFORM_ADMIN") return false;
  const profile = await findTenantUserProfile(tenantId, code);
  if (!profile || !profile.isActive) return false;
  const meta = SYSTEM_USER_PROFILES.find((p) => p.code === code);
  if (meta && !meta.assignable) return false;
  return true;
}

export async function isConfigurableTenantRole(tenantId: string, code: string): Promise<boolean> {
  if (code === "SUPER_ADMIN" || code === "PLATFORM_ADMIN") return false;
  const profile = await findTenantUserProfile(tenantId, code);
  if (!profile || !profile.isActive) return false;
  const meta = SYSTEM_USER_PROFILES.find((p) => p.code === code);
  if (meta && !meta.configurable) return false;
  return true;
}
