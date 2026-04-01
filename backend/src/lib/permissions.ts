import { prisma } from "./prisma.js";

export type RoleId = "SUPER_ADMIN" | "ADMIN_PORTAL" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE";
export type PermissionState = "allow" | "deny";

export const FEATURES = [
  "home",
  "projeto",
  "projeto.lista",
  "projeto.dashboardDaily",
  "projeto.novo",
  "projeto.editar",
  "projeto.excluir",
  "apontamentos",
  "hora-banco",
  "chamados.criacao",
  "relatorios",
  "relatorios.horas",
  "relatorios.utilizacao",
  "relatorios.chamados",
  "relatorios.exportacao",
  "configuracoes",
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "portal.corporativo",
  "portal.corporativo.editar",
] as const;

export type FeatureId = (typeof FEATURES)[number];

export type PermissionsMatrix = Record<FeatureId, Record<RoleId, PermissionState>>;

export function buildDefaultPermissions(): PermissionsMatrix {
  const initial = {} as PermissionsMatrix;
  for (const feature of FEATURES) {
    switch (feature) {
      case "home":
        initial[feature] = {
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "allow",
        };
        break;
      case "projeto":
      case "projeto.lista":
      case "projeto.dashboardDaily":
      case "projeto.novo":
      case "projeto.editar":
      case "projeto.excluir":
      case "apontamentos":
      case "hora-banco":
        initial[feature] = {
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "deny",
        };
        break;
      case "relatorios":
      case "relatorios.horas":
      case "relatorios.utilizacao":
      case "relatorios.chamados":
      case "relatorios.exportacao":
      case "configuracoes":
      case "configuracoes.permissoes":
        initial[feature] = {
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      case "chamados.criacao":
        initial[feature] = {
          SUPER_ADMIN: "deny",
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "allow",
        };
        break;
      case "configuracoes.usuarios":
      case "configuracoes.clientes":
      case "configuracoes.gestaoPerfis":
      case "portal.corporativo":
      case "portal.corporativo.editar":
        initial[feature] = {
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
    }
  }
  return initial;
}

export async function getTenantPermissionsMatrix(tenantId: string): Promise<PermissionsMatrix> {
  const base = buildDefaultPermissions();
  const rows = await prisma.tenantFeaturePermission.findMany({
    where: { tenantId },
    select: { featureId: true, role: true, state: true },
  });
  for (const r of rows) {
    const feature = r.featureId as FeatureId;
    const role = r.role as RoleId;
    const state = r.state === "deny" ? "deny" : "allow";
    if (FEATURES.includes(feature) && base[feature] && role in base[feature]) {
      base[feature][role] = state;
    }
  }
  return base;
}

export async function isFeatureAllowed(params: {
  tenantId: string;
  role: RoleId;
  featureId: FeatureId;
}): Promise<boolean> {
  const { tenantId, role, featureId } = params;

  // SUPER_ADMIN: acesso total a todas as features, exceto abertura de chamados
  if (role === "SUPER_ADMIN") {
    if (featureId === "chamados.criacao") return false;
    return true;
  }

  const row = await prisma.tenantFeaturePermission.findUnique({
    where: { tenantId_featureId_role: { tenantId, featureId, role } },
    select: { state: true },
  });
  if (!row) {
    const defaults = buildDefaultPermissions();
    return defaults[featureId]?.[role] !== "deny";
  }
  return row.state !== "deny";
}

export async function getAllowedFeaturesForUser(params: { tenantId: string; role: RoleId }): Promise<FeatureId[]> {
  const { tenantId, role } = params;
  // SUPER_ADMIN: acesso amplo fixo (independe da matriz), exceto abertura de chamados
  if (role === "SUPER_ADMIN") {
    return FEATURES.filter((f) => f !== "chamados.criacao");
  }

  const matrix = await getTenantPermissionsMatrix(tenantId);
  return FEATURES.filter((f) => matrix[f][role] !== "deny");
}

