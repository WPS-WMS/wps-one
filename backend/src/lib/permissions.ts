import { prisma } from "./prisma.js";
import { isKnownRole, type RoleId } from "./roles.js";

export type { RoleId } from "./roles.js";
export type PermissionState = "allow" | "deny";

export const FEATURES = [
  "home",
  "projeto",
  "projeto.verDetalhes",
  "projeto.lista",
  "projeto.dashboardDaily",
  "projeto.listaTarefas",
  "projeto.gestaoTm",
  "projeto.novo",
  "projeto.editar",
  "projeto.arquivar",
  "projeto.excluir",
  "tarefa.editar",
  "apontamentos",
  "reembolsos",
  "hora-banco",
  "chamados.criacao",
  "relatorios",
  "relatorios.gestaoHoras",
  "relatorios.horas",
  "relatorios.utilizacao",
  "relatorios.chamados",
  "relatorios.exportacao",
  "relatorios.reembolsos",
  "configuracoes",
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "configuracoes.atividades",
  "configuracoes.emails",
  "configuracoes.reembolso",
  "configuracoes.feriados",
  "portal.corporativo",
  "portal.corporativo.editar",
] as const;

export type FeatureId = (typeof FEATURES)[number];

export type PermissionsMatrix = Record<FeatureId, Record<RoleId, PermissionState>>;

type ConfigurableRole = Exclude<RoleId, "SUPER_ADMIN">;

function row(
  superAdmin: PermissionState,
  overrides: Partial<Record<ConfigurableRole, PermissionState>> = {},
): Record<RoleId, PermissionState> {
  const base: Record<ConfigurableRole, PermissionState> = {
    ADMIN_PORTAL: "deny",
    GESTOR_PROJETOS: "deny",
    CONSULTOR: "deny",
    CLIENTE: "deny",
    ADMINISTRATIVO: "deny",
    FINANCEIRO: "deny",
  };
  return { SUPER_ADMIN: superAdmin, ...base, ...overrides };
}

export function buildDefaultPermissions(): PermissionsMatrix {
  const initial = {} as PermissionsMatrix;
  for (const feature of FEATURES) {
    switch (feature) {
      case "home":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "allow",
          ADMINISTRATIVO: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "projeto":
      case "projeto.verDetalhes":
      case "projeto.lista":
      case "projeto.dashboardDaily":
      case "projeto.listaTarefas":
      case "projeto.gestaoTm":
      case "projeto.novo":
      case "projeto.editar":
      case "projeto.arquivar":
      case "projeto.excluir":
      case "tarefa.editar":
      case "apontamentos":
      case "hora-banco":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
        });
        break;
      case "reembolsos":
        initial[feature] = row("allow");
        break;
      case "relatorios":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "relatorios.gestaoHoras":
      case "relatorios.horas":
      case "relatorios.utilizacao":
      case "relatorios.chamados":
      case "relatorios.exportacao":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "relatorios.reembolsos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "configuracoes":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          ADMINISTRATIVO: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "configuracoes.permissoes":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
        });
        break;
      case "chamados.criacao":
        initial[feature] = row("deny", { CLIENTE: "allow" });
        break;
      case "configuracoes.usuarios":
      case "configuracoes.clientes":
      case "configuracoes.gestaoPerfis":
      case "configuracoes.atividades":
      case "configuracoes.emails":
      case "configuracoes.feriados":
        initial[feature] = row("allow", { ADMINISTRATIVO: "allow" });
        break;
      case "configuracoes.reembolso":
        initial[feature] = row("allow", { FINANCEIRO: "allow" });
        break;
      case "portal.corporativo":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
        });
        break;
      case "portal.corporativo.editar":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
        });
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
  role: string;
  featureId: FeatureId;
}): Promise<boolean> {
  const { tenantId, role, featureId } = params;

  if (!isKnownRole(role)) return false;

  if (role === "SUPER_ADMIN") {
    if (featureId === "chamados.criacao") return false;
    return true;
  }

  if (role === "CLIENTE" && featureId === "tarefa.editar") return false;

  const rowDb = await prisma.tenantFeaturePermission.findUnique({
    where: { tenantId_featureId_role: { tenantId, featureId, role } },
    select: { state: true },
  });
  if (!rowDb) {
    const defaults = buildDefaultPermissions();
    return defaults[featureId]?.[role] !== "deny";
  }
  return rowDb.state !== "deny";
}

export async function getAllowedFeaturesForUser(params: { tenantId: string; role: string }): Promise<FeatureId[]> {
  const { tenantId, role } = params;
  if (!isKnownRole(role)) return [];
  if (role === "SUPER_ADMIN") {
    return FEATURES.filter((f) => f !== "chamados.criacao");
  }

  const matrix = await getTenantPermissionsMatrix(tenantId);
  return FEATURES.filter((f) => {
    if (role === "CLIENTE" && f === "tarefa.editar") return false;
    return matrix[f][role] !== "deny";
  });
}
