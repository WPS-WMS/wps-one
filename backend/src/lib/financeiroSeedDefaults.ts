import { prisma } from "./prisma.js";
import { syncExpenseAccountsFromCategories } from "./syncExpenseAccountsFromCategories.js";

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
export const DEFAULT_REVENUE_ACCOUNTS: Array<{
  name: string;
  dreSubcategory: "FATURAMENTO" | "OUTRAS_RECEITAS";
}> = [
  { name: "Receita de projeto fechado", dreSubcategory: "FATURAMENTO" },
  { name: "Receita T&M", dreSubcategory: "FATURAMENTO" },
  { name: "Receita de suporte AMS", dreSubcategory: "FATURAMENTO" },
  { name: "Receita consultoria", dreSubcategory: "FATURAMENTO" },
  { name: "Receita desenvolvimento", dreSubcategory: "FATURAMENTO" },
  { name: "Reembolso", dreSubcategory: "OUTRAS_RECEITAS" },
  { name: "Juros/Multa", dreSubcategory: "OUTRAS_RECEITAS" },
];

type ExpenseAccountSeed = {
  name: string;
  dreSubcategory?: string | null;
  enableHourRate?: boolean;
  enableAmount?: boolean;
  enableBenefit?: boolean;
  enableReimbursement?: boolean;
  enableDiscount?: boolean;
  enableComplementaryHours?: boolean;
  enableInterestFine?: boolean;
};

/** Contas de despesa padrão (editáveis por tenant) — inclui metadados ex-categoria. */
export const DEFAULT_EXPENSE_ACCOUNTS: ExpenseAccountSeed[] = [
  {
    name: "Folha",
    dreSubcategory: "CUSTO",
    enableHourRate: true,
    enableAmount: true,
    enableDiscount: true,
    enableComplementaryHours: true,
  },
  { name: "Custo", dreSubcategory: "CUSTO", enableAmount: true },
  { name: "Marketing", dreSubcategory: "CUSTO", enableAmount: true },
  { name: "Infraestrutura", dreSubcategory: "CUSTO", enableAmount: true },
  { name: "Software", dreSubcategory: "CUSTO", enableAmount: true },
  { name: "Viagens", dreSubcategory: "CUSTO", enableAmount: true },
  {
    name: "Reembolsos",
    dreSubcategory: "REEMBOLSOS",
    enableAmount: true,
    enableReimbursement: true,
  },
  {
    name: "Impostos",
    dreSubcategory: "IMPOSTO",
    enableAmount: true,
    enableInterestFine: true,
  },
  { name: "Parceiros", dreSubcategory: "CUSTO", enableAmount: true },
  { name: "Terceiros", dreSubcategory: "CUSTO", enableAmount: true },
  {
    name: "Cartão de crédito",
    dreSubcategory: "CUSTO",
    enableAmount: true,
    enableInterestFine: true,
  },
];

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

/** @deprecated Preferir contas DESPESA do plano. Mantido para compatibilidade legada. */
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
  const [ccCount, accountCount] = await Promise.all([
    prisma.costCenter.count({ where: { tenantId } }),
    prisma.financialAccount.count({ where: { tenantId } }),
  ]);
  // Tenant já provisionado: ainda sincroniza Category→Account (barato) e retorna.
  if (
    ccCount >= DEFAULT_COST_CENTERS.length &&
    accountCount >= DEFAULT_REVENUE_ACCOUNTS.length + DEFAULT_EXPENSE_ACCOUNTS.length
  ) {
    await syncExpenseAccountsFromCategories(prisma, tenantId);
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
    ...DEFAULT_REVENUE_ACCOUNTS.map((acc) =>
      prisma.financialAccount.upsert({
        where: { tenantId_name_type: { tenantId, name: acc.name, type: "RECEITA" } },
        create: {
          tenantId,
          name: acc.name,
          type: "RECEITA",
          isActive: true,
          dreSubcategory: acc.dreSubcategory,
        },
        update: {
          dreSubcategory: acc.dreSubcategory,
        },
      }),
    ),
    ...DEFAULT_EXPENSE_ACCOUNTS.map((acc) =>
      prisma.financialAccount.upsert({
        where: { tenantId_name_type: { tenantId, name: acc.name, type: "DESPESA" } },
        create: {
          tenantId,
          name: acc.name,
          type: "DESPESA",
          isActive: true,
          dreSubcategory: acc.dreSubcategory ?? null,
          enableHourRate: acc.enableHourRate ?? false,
          enableAmount: acc.enableAmount ?? true,
          enableBenefit: acc.enableBenefit ?? false,
          enableReimbursement: acc.enableReimbursement ?? false,
          enableDiscount: acc.enableDiscount ?? false,
          enableComplementaryHours: acc.enableComplementaryHours ?? false,
          enableInterestFine: acc.enableInterestFine ?? false,
        },
        update: {
          dreSubcategory: acc.dreSubcategory ?? undefined,
          enableHourRate: acc.enableHourRate ?? undefined,
          enableAmount: acc.enableAmount ?? undefined,
          enableBenefit: acc.enableBenefit ?? undefined,
          enableReimbursement: acc.enableReimbursement ?? undefined,
          enableDiscount: acc.enableDiscount ?? undefined,
          enableComplementaryHours: acc.enableComplementaryHours ?? undefined,
          enableInterestFine: acc.enableInterestFine ?? undefined,
        },
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
    // Legado: ainda cria categorias mínimas para FKs antigas até drop na fase 2.
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
            : name === "Folha"
              ? {
                  dreSubcategory: "CUSTO",
                  enableHourRate: true,
                  enableAmount: true,
                  enableDiscount: true,
                  enableComplementaryHours: true,
                }
              : { dreSubcategory: "CUSTO", enableAmount: true }),
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

  await syncExpenseAccountsFromCategories(prisma, tenantId);
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
