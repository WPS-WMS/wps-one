import { prisma } from "./prisma.js";

/** Categorias padrão de fornecedor (editáveis por tenant). */
export const DEFAULT_SUPPLIER_CATEGORIES = [
  "Consultoria",
  "Prestador de serviço individual",
  "Marketing",
  "Infraestrutura",
  "Software",
  "Reembolso",
  "Administrativo",
] as const;

/** Centros de custo padrão (editáveis por tenant). */
export const DEFAULT_COST_CENTERS = [
  "Operação SAP",
  "Comercial",
  "Marketing",
  "Administrativo",
  "Variável",
  "Projetos internos",
  "Desenvolvimento WPS One",
] as const;

/** Contas de receita padrão (editáveis por tenant). */
export const DEFAULT_REVENUE_ACCOUNTS = [
  "Receita de projeto fechado",
  "Receita T&M",
  "Receita de suporte AMS",
  "Receita consultoria",
  "Receita desenvolvimento",
] as const;

/** Contas de despesa padrão (editáveis por tenant). */
export const DEFAULT_EXPENSE_ACCOUNTS = [
  "Folha",
  "Marketing",
  "Infraestrutura",
  "Software",
  "Viagens",
  "Reembolsos",
  "Impostos",
  "Parceiros",
  "Terceiros",
] as const;

/** Tipos de cobrança de projeto (editáveis por tenant). */
export const DEFAULT_PROJECT_BILLING_TYPES = [
  { code: "HORA", name: "Hora" },
  { code: "MENSAL", name: "Mensal" },
  { code: "FIXO", name: "Fixo" },
  { code: "MARCO", name: "Marco" },
  { code: "RECORRENTE", name: "Recorrente" },
] as const;

/** Tipos de contrato (editáveis por tenant). */
export const DEFAULT_CONTRACT_TYPES = [
  "Time & Material",
  "Fixed Price",
  "AMS / Suporte",
  "Consultoria",
  "Change Request",
  "Recorrente",
] as const;

/** Tipos de despesa corporativa (editáveis por tenant). */
export const DEFAULT_CORPORATE_EXPENSE_TYPES = [
  "Infraestrutura",
  "Software",
  "Marketing",
  "Viagens",
  "Eventos",
  "Administrativo",
] as const;

/** Categorias financeiras de contas a pagar (editáveis por tenant). */
export const DEFAULT_FINANCIAL_CATEGORIES = ["Folha", "Custo", "Reembolso"] as const;

/** Tipos de receita (editáveis por tenant). */
export const DEFAULT_REVENUE_TYPES = [
  "Projeto fechado",
  "T&M",
  "Suporte AMS",
  "Consultoria",
  "Desenvolvimento",
] as const;

/**
 * Popula categorias, centros de custo e plano de contas padrão para um tenant.
 * Idempotente: não duplica registros existentes (por nome).
 * Early-exit quando o tenant já tem seed mínimo (evita dezenas de upserts a cada GET).
 */
export async function seedFinanceiroDefaultsForTenant(tenantId: string): Promise<void> {
  const [ccCount, accountCount, categoryCount] = await Promise.all([
    prisma.costCenter.count({ where: { tenantId } }),
    prisma.financialAccount.count({ where: { tenantId } }),
    prisma.financialCategory.count({ where: { tenantId } }),
  ]);
  // Tenant já provisionado: pula o seed completo (idempotente, mas caro).
  if (
    ccCount >= DEFAULT_COST_CENTERS.length &&
    accountCount >= DEFAULT_REVENUE_ACCOUNTS.length + DEFAULT_EXPENSE_ACCOUNTS.length &&
    categoryCount >= DEFAULT_FINANCIAL_CATEGORIES.length
  ) {
    return;
  }

  await Promise.all([
    ...DEFAULT_SUPPLIER_CATEGORIES.map((name) =>
      prisma.supplierCategory.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_COST_CENTERS.map((name) =>
      prisma.costCenter.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_REVENUE_ACCOUNTS.map((name) =>
      prisma.financialAccount.upsert({
        where: { tenantId_name_type: { tenantId, name, type: "RECEITA" } },
        create: { tenantId, name, type: "RECEITA", isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_EXPENSE_ACCOUNTS.map((name) =>
      prisma.financialAccount.upsert({
        where: { tenantId_name_type: { tenantId, name, type: "DESPESA" } },
        create: { tenantId, name, type: "DESPESA", isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_PROJECT_BILLING_TYPES.map((bt) =>
      prisma.projectBillingType.upsert({
        where: { tenantId_code: { tenantId, code: bt.code } },
        create: { tenantId, code: bt.code, name: bt.name, isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_CONTRACT_TYPES.map((name) =>
      prisma.contractType.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_CORPORATE_EXPENSE_TYPES.map((name) =>
      prisma.corporateExpenseType.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, isActive: true },
        update: {},
      }),
    ),
    ...DEFAULT_FINANCIAL_CATEGORIES.map((name) =>
      prisma.financialCategory.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: {
          tenantId,
          name,
          isActive: true,
          ...(name === "Reembolso"
            ? {
                dreSubcategory: "REEMBOLSOS",
                enableAmount: true,
                enableReimbursement: true,
              }
            : {}),
        },
        update: {},
      }),
    ),
    ...DEFAULT_REVENUE_TYPES.map((name) =>
      prisma.revenueType.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, isActive: true },
        update: {},
      }),
    ),
  ]);
}

/**
 * Garante defaults para todos os tenants existentes (útil após deploy da Fase 1).
 */
export async function seedFinanceiroDefaultsForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    await seedFinanceiroDefaultsForTenant(t.id);
  }
}
