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
  /** Permite visualizar o banco de horas de qualquer usuário (seletor de colaborador). */
  "hora-banco.verTodos",
  /** Lista e detalhe de todos os projetos do tenant (como super admin). */
  "projeto.verTodos",
  /** Lista e detalhe de todas as tarefas do tenant (como super admin). */
  "tarefa.verTodos",
  "reembolsos",
  "hora-banco",
  "chamados.criacao",
  "relatorios",
  "relatorios.gestaoHoras",
  /** Relatório Gestão de horas de todos os usuários (filtro global, como super admin). */
  "relatorios.gestaoHorasVerTodos",
  /** Gerar conta a pagar a partir da Gestão de horas (Consultor OnDemand). */
  "relatorios.gestaoHoras.gerarContasPagar",
  "relatorios.horas",
  "relatorios.utilizacao",
  "relatorios.chamados",
  "relatorios.exportacao",
  "relatorios.financeiroCentroCusto",
  "relatorios.financeiroDashboard",
  "relatorios.financeiroDre",
  "relatorios.financeiroFluxoCaixa",
  "relatorios.financeiroAnalises",
  "relatorios.financeiroMedicaoHoras",
  "relatorios.reembolsos",
  /** Relatório de reembolsos de todos os usuários (filtro global, como super admin). */
  "relatorios.reembolsosVerTodos",
  "configuracoes",
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "configuracoes.atividades",
  "configuracoes.emails",
  "configuracoes.sharepoint",
  "configuracoes.reembolso",
  "configuracoes.feriados",
  "financeiro",
  "financeiro.fornecedores",
  "financeiro.clientesFinanceiros",
  "financeiro.lancamentos",
  "financeiro.contasPagar",
  "financeiro.contasPagar.aprovar",
  "financeiro.contasReceber",
  "configuracoes.financeiro.categorias",
  "configuracoes.financeiro.centrosCusto",
  "configuracoes.financeiro.planoContas",
  "financeiro.projetos",
  "financeiro.projetos.receitas",
  "financeiro.projetos.contratos",
  "financeiro.projetos.resultado",
  "configuracoes.financeiro.tiposCobranca",
  "configuracoes.financeiro.tiposContrato",
  "configuracoes.financeiro.tiposDespesa",
  "configuracoes.financeiro.tiposReceita",
  "configuracoes.financeiro.impostos",
  "configuracoes.financeiro.categoriasFinanceiras",
  "portal.corporativo",
  "portal.corporativo.editar",
] as const;

export type FeatureId = (typeof FEATURES)[number];

/** Sub-permissões de Projetos (basta uma para o middleware base de /api/projects). */
export const PROJETO_FEATURE_IDS: FeatureId[] = [
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
];

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
    CONSULTOR_ONDEMAND: "deny",
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
          CONSULTOR_ONDEMAND: "allow",
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
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
        });
        break;
      case "hora-banco":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
        });
        break;
      case "hora-banco.verTodos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          ADMIN_PORTAL: "allow",
        });
        break;
      case "projeto.verTodos":
      case "tarefa.verTodos":
        initial[feature] = row("allow");
        break;
      case "reembolsos":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
        });
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
      case "relatorios.gestaoHorasVerTodos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
        });
        break;
      case "relatorios.gestaoHoras.gerarContasPagar":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          ADMIN_PORTAL: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "relatorios.reembolsos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "relatorios.reembolsosVerTodos":
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
      case "configuracoes.sharepoint":
      case "configuracoes.feriados":
        initial[feature] = row("allow", { ADMINISTRATIVO: "allow" });
        break;
      case "configuracoes.reembolso":
        initial[feature] = row("allow", { FINANCEIRO: "allow" });
        break;
      case "financeiro":
      case "financeiro.fornecedores":
      case "financeiro.clientesFinanceiros":
      case "financeiro.lancamentos":
      case "financeiro.projetos":
      case "financeiro.projetos.receitas":
      case "financeiro.projetos.contratos":
      case "financeiro.projetos.resultado":
      case "configuracoes.financeiro.categorias":
      case "configuracoes.financeiro.centrosCusto":
      case "configuracoes.financeiro.planoContas":
      case "configuracoes.financeiro.tiposCobranca":
      case "configuracoes.financeiro.tiposContrato":
      case "configuracoes.financeiro.tiposDespesa":
      case "configuracoes.financeiro.tiposReceita":
      case "configuracoes.financeiro.impostos":
      case "configuracoes.financeiro.categoriasFinanceiras":
      case "financeiro.contasPagar":
      case "financeiro.contasPagar.aprovar":
      case "financeiro.contasReceber":
        initial[feature] = row("allow");
        break;
      case "relatorios.financeiroCentroCusto":
      case "relatorios.financeiroDashboard":
      case "relatorios.financeiroDre":
      case "relatorios.financeiroFluxoCaixa":
      case "relatorios.financeiroAnalises":
      case "relatorios.financeiroMedicaoHoras":
        initial[feature] = row("allow", { FINANCEIRO: "allow", ADMINISTRATIVO: "allow" });
        break;
      case "portal.corporativo":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
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
    let feature = r.featureId as FeatureId | "reembolsos.verTodos" | "horas.verTodos";
    if (feature === "reembolsos.verTodos") {
      feature = "relatorios.reembolsosVerTodos";
    }
    if (feature === "horas.verTodos") {
      feature = "relatorios.gestaoHorasVerTodos";
    }
    const role = r.role as RoleId;
    const state = r.state === "deny" ? "deny" : "allow";
    if (FEATURES.includes(feature) && base[feature] && role in base[feature]) {
      base[feature][role] = state;
    }
  }
  return base;
}

/** Features das telas em Configurações (acesso "allow" = CRUD completo no módulo, como super admin). */
export const CONFIG_SCREEN_FEATURE_IDS = [
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "configuracoes.atividades",
  "configuracoes.emails",
  "configuracoes.sharepoint",
  "configuracoes.reembolso",
  "configuracoes.feriados",
  "configuracoes.financeiro.categorias",
  "configuracoes.financeiro.centrosCusto",
  "configuracoes.financeiro.planoContas",
  "configuracoes.financeiro.tiposCobranca",
  "configuracoes.financeiro.tiposContrato",
  "configuracoes.financeiro.tiposDespesa",
  "configuracoes.financeiro.tiposReceita",
  "configuracoes.financeiro.impostos",
  "configuracoes.financeiro.categoriasFinanceiras",
] as const satisfies readonly FeatureId[];

export type ConfigScreenFeatureId = (typeof CONFIG_SCREEN_FEATURE_IDS)[number];

/** Acesso total ao módulo de configuração (equivalente a SUPER_ADMIN naquela tela). */
export async function hasConfigScreenAdminAccess(params: {
  tenantId: string;
  role: string;
  featureId: ConfigScreenFeatureId;
}): Promise<boolean> {
  const role = String(params.role ?? "").toUpperCase();
  if (role === "SUPER_ADMIN") return true;
  return isFeatureAllowed(params);
}

/** Visão global (todos usuários/projetos/etc.), equivalente ao super admin para leitura. */
export async function hasGlobalViewAccess(params: {
  tenantId: string;
  role: string;
  featureId: FeatureId;
}): Promise<boolean> {
  const role = String(params.role ?? "").toUpperCase();
  if (role === "SUPER_ADMIN") return true;
  return isFeatureAllowed(params);
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
  if (!rowDb && featureId === "relatorios.reembolsosVerTodos") {
    const legacy = await prisma.tenantFeaturePermission.findUnique({
      where: {
        tenantId_featureId_role: { tenantId, featureId: "reembolsos.verTodos", role },
      },
      select: { state: true },
    });
    if (legacy) return legacy.state !== "deny";
  }
  if (!rowDb && featureId === "relatorios.gestaoHorasVerTodos") {
    const legacy = await prisma.tenantFeaturePermission.findUnique({
      where: {
        tenantId_featureId_role: { tenantId, featureId: "horas.verTodos", role },
      },
      select: { state: true },
    });
    if (legacy) return legacy.state !== "deny";
  }
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
