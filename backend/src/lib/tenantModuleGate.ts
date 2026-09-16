import type { FeatureId } from "./permissions.js";
import { FINANCEIRO_MODULE_FEATURE_IDS } from "./financeiroModuleGate.js";
import { prisma } from "./prisma.js";
import {
  normalizeSubscriptionStatus,
  planModulesFromRecord,
  type PlanModuleId,
  type PlatformPlanRecord,
} from "./platformPlans.js";

/** Features do módulo Gestão de projetos. */
export const PROJETOS_MODULE_FEATURE_IDS: FeatureId[] = [
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
  "projeto.verTodos",
  "tarefa.editar",
  "tarefa.verTodos",
  "apontamentos",
  "hora-banco",
  "hora-banco.verTodos",
  "hora-banco.verTodos.editar",
  "chamados.criacao",
  "relatorios.gestaoHoras",
  "relatorios.gestaoHorasVerTodos",
  "relatorios.gestaoHoras.gerarContasPagar",
  "relatorios.gestaoHoras.verValores",
  "relatorios.horas",
  "relatorios.utilizacao",
  "relatorios.chamados",
];

export const PORTAL_MODULE_FEATURE_IDS: FeatureId[] = [
  "portal.corporativo",
  "portal.corporativo.editar",
];

const PROJETOS_SET = new Set<string>(PROJETOS_MODULE_FEATURE_IDS);
const FINANCEIRO_SET = new Set<string>(FINANCEIRO_MODULE_FEATURE_IDS);
const PORTAL_SET = new Set<string>(PORTAL_MODULE_FEATURE_IDS);

export function featureModule(featureId: string): PlanModuleId | null {
  if (PROJETOS_SET.has(featureId) || featureId.startsWith("projeto.")) return "projetos";
  if (FINANCEIRO_SET.has(featureId) || featureId.startsWith("financeiro.") || featureId.startsWith("relatorios.financeiro") || featureId.startsWith("configuracoes.financeiro")) {
    return "financeiro";
  }
  if (PORTAL_SET.has(featureId) || featureId.startsWith("portal.")) return "portal";
  return null;
}

export type TenantModules = {
  projetos: boolean;
  financeiro: boolean;
  portal: boolean;
  /** Assinatura encerrada — bloqueia o tenant inteiro. */
  locked: boolean;
  status: string;
  accessUntil: string | null;
  plan: PlatformPlanRecord | null;
};

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Resolve módulos do plano do tenant e aplica lockout após cancelamento.
 * Lazy: se canceling e já passou accessUntil, marca locked no banco.
 */
export async function getTenantModules(tenantId: string): Promise<TenantModules> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      subscriptionAccessUntil: true,
      subscriptionPlanId: true,
      platformPlan: true,
    },
  });

  if (!tenant) {
    return {
      projetos: false,
      financeiro: false,
      portal: false,
      locked: true,
      status: "locked",
      accessUntil: null,
      plan: null,
    };
  }

  let status = normalizeSubscriptionStatus(tenant.subscriptionStatus);
  let accessUntil = tenant.subscriptionAccessUntil;

  if (status === "canceling" && accessUntil) {
    const limit = endOfUtcDay(accessUntil);
    if (Date.now() > limit.getTime()) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: "locked" },
      });
      status = "locked";
    }
  }

  if (status === "locked") {
    return {
      projetos: false,
      financeiro: false,
      portal: false,
      locked: true,
      status: "locked",
      accessUntil: accessUntil ? accessUntil.toISOString() : null,
      plan: (tenant.platformPlan as PlatformPlanRecord | null) ?? null,
    };
  }

  const plan = (tenant.platformPlan as PlatformPlanRecord | null) ?? null;
  const modules = planModulesFromRecord(plan);

  return {
    ...modules,
    locked: false,
    status,
    accessUntil: accessUntil ? accessUntil.toISOString() : null,
    plan,
  };
}

export function tenantHasModule(modules: TenantModules, moduleId: PlanModuleId): boolean {
  if (modules.locked) return false;
  return modules[moduleId];
}

export function isFeatureAllowedByTenantModules(
  modules: TenantModules,
  featureId: string,
): boolean {
  if (modules.locked) return false;
  const mod = featureModule(featureId);
  if (!mod) return true;
  return modules[mod];
}

export function filterFeaturesByTenantModules<T extends string>(
  modules: TenantModules,
  featureIds: T[],
): T[] {
  if (modules.locked) return [];
  return featureIds.filter((id) => isFeatureAllowedByTenantModules(modules, id));
}
