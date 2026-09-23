import { prisma } from "./prisma.js";
import { isKnownRole, type RoleId } from "./roles.js";
import {
  filterFeaturesByTenantModules,
  getTenantModules,
  isFeatureAllowedByTenantModules,
} from "./tenantModuleGate.js";

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
  /** Editar banco de horas (horas pagas e ajuste), como super admin. */
  "hora-banco.verTodos.editar",
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
  /** Ver taxa hora e valor total das horas no relatório Gestão de horas. */
  "relatorios.gestaoHoras.verValores",
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
  "configuracoes.geral",
  "configuracoes.cadastro",
  "configuracoes.financeiro",
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "configuracoes.perfisUsuario",
  "configuracoes.skills",
  "configuracoes.atividades",
  "configuracoes.emails",
  "configuracoes.sharepoint",
  "configuracoes.reembolso",
  "configuracoes.feriados",
  /** Assinatura WPS One do tenant (somente SUPER_ADMIN). */
  "configuracoes.assinatura",
  "financeiro",
  "financeiro.fornecedores",
  "financeiro.clientesFinanceiros",
  "financeiro.lancamentos",
  "financeiro.contasPagar",
  "financeiro.contasPagar.aprovar",
  "financeiro.contasReceber",
  /** Tela Financeiro > Aprovar reembolsos (aprovar/rejeitar solicitações). */
  "financeiro.aprovarReembolso",
  "configuracoes.financeiro.categorias",
  "configuracoes.financeiro.centrosCusto",
  "configuracoes.financeiro.planoContas",
  "financeiro.projetos",
  "financeiro.projetos.receitas",
  "financeiro.projetos.contratos",
  "financeiro.projetos.resultado",
  "financeiro.taxasPorProjeto",
  "configuracoes.financeiro.tiposCobranca",
  "configuracoes.financeiro.tiposContrato",
  "configuracoes.financeiro.impostos",
  "configuracoes.financeiro.empresa",
  "configuracoes.financeiro.focusNfe",
  "configuracoes.financeiro.categoriasFinanceiras",
  "portal.corporativo",
  "portal.corporativo.editar",
] as const;

export type FeatureId = (typeof FEATURES)[number];

/**
 * Acessos fixos do perfil Cliente (não editáveis na Gestão de perfis).
 * Impede burlar cobrança liberando outros módulos para CLIENTE.
 */
export const CLIENTE_FIXED_ALLOW_FEATURES = [
  "home",
  "chamados.criacao",
  "projeto.listaTarefas",
  "relatorios.gestaoHoras",
] as const satisfies readonly FeatureId[];

const CLIENTE_FIXED_ALLOW_SET = new Set<string>(CLIENTE_FIXED_ALLOW_FEATURES);

export function isClienteFixedAllowFeature(featureId: string): boolean {
  return CLIENTE_FIXED_ALLOW_SET.has(featureId);
}

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

export type PermissionsMatrix = Record<FeatureId, Record<string, PermissionState>>;

type ConfigurableRole = Exclude<RoleId, "SUPER_ADMIN" | "PLATFORM_ADMIN">;

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
    DIRETORIA: "deny",
  };
  return { SUPER_ADMIN: superAdmin, PLATFORM_ADMIN: "deny", ...base, ...overrides };
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
          DIRETORIA: "allow",
        });
        break;
      case "projeto":
      case "projeto.verDetalhes":
      case "projeto.lista":
      case "projeto.dashboardDaily":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "projeto.listaTarefas":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
          DIRETORIA: "allow",
          CLIENTE: "allow",
        });
        break;
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
      case "hora-banco.verTodos.editar":
        initial[feature] = row("allow");
        break;
      case "projeto.verTodos":
      case "tarefa.verTodos":
        initial[feature] = row("allow", {
          DIRETORIA: "allow",
        });
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
          DIRETORIA: "allow",
        });
        break;
      case "relatorios.gestaoHoras":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
          DIRETORIA: "allow",
          CLIENTE: "allow",
        });
        break;
      case "relatorios.horas":
      case "relatorios.utilizacao":
      case "relatorios.chamados":
      case "relatorios.exportacao":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "relatorios.gestaoHorasVerTodos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "relatorios.gestaoHoras.gerarContasPagar":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          ADMIN_PORTAL: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "relatorios.gestaoHoras.verValores":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "relatorios.reembolsos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "relatorios.reembolsosVerTodos":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          FINANCEIRO: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "configuracoes":
        initial[feature] = row("allow", {
          GESTOR_PROJETOS: "allow",
          ADMINISTRATIVO: "allow",
          FINANCEIRO: "allow",
        });
        break;
      case "configuracoes.geral":
      case "configuracoes.cadastro":
        initial[feature] = row("allow", { ADMINISTRATIVO: "allow" });
        break;
      case "configuracoes.financeiro":
        initial[feature] = row("allow", { FINANCEIRO: "allow" });
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
      case "configuracoes.perfisUsuario":
      case "configuracoes.skills":
      case "configuracoes.atividades":
      case "configuracoes.emails":
      case "configuracoes.sharepoint":
      case "configuracoes.feriados":
        initial[feature] = row("allow", { ADMINISTRATIVO: "allow" });
        break;
      case "configuracoes.assinatura":
        // Somente SUPER_ADMIN gerencia a assinatura do tenant.
        initial[feature] = row("allow");
        break;
      case "configuracoes.reembolso":
        initial[feature] = row("allow", { FINANCEIRO: "allow" });
        break;
      case "financeiro.aprovarReembolso":
        initial[feature] = row("allow", {
          FINANCEIRO: "allow",
          GESTOR_PROJETOS: "allow",
        });
        break;
      case "financeiro":
      case "financeiro.fornecedores":
      case "financeiro.clientesFinanceiros":
      case "financeiro.lancamentos":
      case "financeiro.projetos":
      case "financeiro.projetos.receitas":
      case "financeiro.projetos.contratos":
      case "financeiro.projetos.resultado":
      case "financeiro.taxasPorProjeto":
      case "configuracoes.financeiro.categorias":
      case "configuracoes.financeiro.centrosCusto":
      case "configuracoes.financeiro.planoContas":
      case "configuracoes.financeiro.tiposCobranca":
      case "configuracoes.financeiro.tiposContrato":
      case "configuracoes.financeiro.impostos":
      case "configuracoes.financeiro.empresa":
      case "configuracoes.financeiro.focusNfe":
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
        initial[feature] = row("allow", {
          FINANCEIRO: "allow",
          ADMINISTRATIVO: "allow",
          DIRETORIA: "allow",
        });
        break;
      case "portal.corporativo":
        initial[feature] = row("allow", {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CONSULTOR_ONDEMAND: "allow",
          DIRETORIA: "allow",
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
  const { listTenantUserProfiles } = await import("./tenantUserProfiles.js");
  const profiles = await listTenantUserProfiles(tenantId, { configurableOnly: true });
  for (const feature of FEATURES) {
    if (!base[feature]) continue;
    for (const p of profiles) {
      if (!(p.code in base[feature])) {
        base[feature][p.code] = "deny";
      }
    }
  }
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
    const role = r.role;
    const state = r.state === "deny" ? "deny" : "allow";
    if (FEATURES.includes(feature) && base[feature]) {
      base[feature][role] = state;
    }
  }
  return base;
}

/** Features das telas em Configurações (acesso "allow" = CRUD completo no módulo, como super admin). */
export const CONFIG_SCREEN_FEATURE_IDS = [
  "configuracoes.geral",
  "configuracoes.cadastro",
  "configuracoes.financeiro",
  "configuracoes.usuarios",
  "configuracoes.permissoes",
  "configuracoes.clientes",
  "configuracoes.gestaoPerfis",
  "configuracoes.perfisUsuario",
  "configuracoes.skills",
  "configuracoes.atividades",
  "configuracoes.emails",
  "configuracoes.sharepoint",
  "configuracoes.reembolso",
  "configuracoes.feriados",
  "configuracoes.assinatura",
  "configuracoes.financeiro.categorias",
  "configuracoes.financeiro.centrosCusto",
  "configuracoes.financeiro.planoContas",
  "configuracoes.financeiro.tiposCobranca",
  "configuracoes.financeiro.tiposContrato",
  "configuracoes.financeiro.impostos",
  "configuracoes.financeiro.empresa",
  "configuracoes.financeiro.focusNfe",
  "configuracoes.financeiro.categoriasFinanceiras",
] as const satisfies readonly FeatureId[];

export type ConfigScreenFeatureId = (typeof CONFIG_SCREEN_FEATURE_IDS)[number];

/** Acesso total ao módulo de configuração (equivalente a SUPER_ADMIN naquela tela). */
export async function hasConfigScreenAdminAccess(params: {
  tenantId: string;
  role: string;
  featureId: ConfigScreenFeatureId;
}): Promise<boolean> {
  return isFeatureAllowed(params);
}

/** Visão global (todos usuários/projetos/etc.), equivalente ao super admin para leitura. */
export async function hasGlobalViewAccess(params: {
  tenantId: string;
  role: string;
  featureId: FeatureId;
}): Promise<boolean> {
  return isFeatureAllowed(params);
}

export async function isFeatureAllowed(params: {
  tenantId: string;
  role: string;
  featureId: FeatureId;
  /** Evita 2ª chamada a getTenantModules no mesmo request (ex.: requireFeature). */
  modules?: Awaited<ReturnType<typeof getTenantModules>> | null;
}): Promise<boolean> {
  const { tenantId, role, featureId } = params;

  if (role === "PLATFORM_ADMIN") return false;

  const { findTenantUserProfile } = await import("./tenantUserProfiles.js");
  const isSystemKnown = isKnownRole(role);
  const profile = isSystemKnown ? null : await findTenantUserProfile(tenantId, role);
  if (!isSystemKnown && !profile) return false;
  if (profile && !profile.isActive) return false;

  const modules = params.modules ?? (await getTenantModules(tenantId));
  if (!isFeatureAllowedByTenantModules(modules, featureId)) return false;

  if (role === "SUPER_ADMIN") {
    if (featureId === "chamados.criacao") return false;
    return true;
  }

  // Cliente: whitelist fixa (não depende da Gestão de perfis / overrides no banco).
  if (role === "CLIENTE" || profile?.requiresClientLink) {
    if (featureId === "tarefa.editar") return false;
    if (role === "CLIENTE") {
      return isClienteFixedAllowFeature(featureId);
    }
  }

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
    if (!isSystemKnown) return false;
    const defaults = buildDefaultPermissions();
    return defaults[featureId]?.[role] !== "deny";
  }
  return rowDb.state !== "deny";
}

/** Uma query (em lote) em vez de N findUnique sequenciais em requireAnyFeature. */
export async function isAnyFeatureAllowed(params: {
  tenantId: string;
  role: string;
  featureIds: FeatureId[];
  modules?: Awaited<ReturnType<typeof getTenantModules>> | null;
}): Promise<boolean> {
  const { tenantId, role, featureIds } = params;
  if (!featureIds.length) return false;
  if (role === "PLATFORM_ADMIN") return false;

  const { findTenantUserProfile } = await import("./tenantUserProfiles.js");
  const isSystemKnown = isKnownRole(role);
  if (!isSystemKnown) {
    const profile = await findTenantUserProfile(tenantId, role);
    if (!profile?.isActive) return false;
  }

  const modules = params.modules ?? (await getTenantModules(tenantId));
  const gated = filterFeaturesByTenantModules(modules, featureIds);
  if (!gated.length) return false;

  if (role === "SUPER_ADMIN") {
    return gated.some((f) => f !== "chamados.criacao");
  }

  if (role === "CLIENTE") {
    return gated.some((f) => isClienteFixedAllowFeature(f));
  }

  const candidates = gated.filter((f) => !(role === "CLIENTE" && f === "tarefa.editar"));
  if (!candidates.length) return false;

  const rows = await prisma.tenantFeaturePermission.findMany({
    where: { tenantId, role, featureId: { in: candidates } },
    select: { featureId: true, state: true },
  });
  const byFeature = new Map(rows.map((r) => [r.featureId, r.state]));
  const defaults = buildDefaultPermissions();

  for (const featureId of candidates) {
    const state = byFeature.get(featureId);
    if (state != null) {
      if (state !== "deny") return true;
      continue;
    }
    if (featureId === "relatorios.reembolsosVerTodos" || featureId === "relatorios.gestaoHorasVerTodos") {
      // Mantém fallback legado via caminho unitário (raro nestas rotas).
      if (await isFeatureAllowed({ tenantId, role, featureId })) return true;
      continue;
    }
    if (!isSystemKnown) continue;
    if (defaults[featureId]?.[role] !== "deny") return true;
  }
  return false;
}

export async function getAllowedFeaturesForUser(params: { tenantId: string; role: string }): Promise<FeatureId[]> {
  const { tenantId, role } = params;
  if (role === "PLATFORM_ADMIN") {
    return [];
  }
  if (!isKnownRole(role)) {
    const { findTenantUserProfile } = await import("./tenantUserProfiles.js");
    const profile = await findTenantUserProfile(tenantId, role);
    if (!profile?.isActive) return [];
  }

  const modules = await getTenantModules(tenantId);
  if (modules.locked) return [];

  if (role === "SUPER_ADMIN") {
    return filterFeaturesByTenantModules(
      modules,
      FEATURES.filter((f) => f !== "chamados.criacao"),
    );
  }

  if (role === "CLIENTE") {
    return filterFeaturesByTenantModules(modules, [...CLIENTE_FIXED_ALLOW_FEATURES]);
  }

  const matrix = await getTenantPermissionsMatrix(tenantId);
  return filterFeaturesByTenantModules(
    modules,
    FEATURES.filter((f) => matrix[f][role] !== "deny"),
  );
}
