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

/**
 * Popula categorias, centros de custo e plano de contas padrão para um tenant.
 * Idempotente: não duplica registros existentes (por nome).
 */
export async function seedFinanceiroDefaultsForTenant(tenantId: string): Promise<void> {
  for (const name of DEFAULT_SUPPLIER_CATEGORIES) {
    await prisma.supplierCategory.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, isActive: true },
      update: {},
    });
  }

  for (const name of DEFAULT_COST_CENTERS) {
    await prisma.costCenter.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, isActive: true },
      update: {},
    });
  }

  for (const name of DEFAULT_REVENUE_ACCOUNTS) {
    await prisma.financialAccount.upsert({
      where: { tenantId_name_type: { tenantId, name, type: "RECEITA" } },
      create: { tenantId, name, type: "RECEITA", isActive: true },
      update: {},
    });
  }

  for (const name of DEFAULT_EXPENSE_ACCOUNTS) {
    await prisma.financialAccount.upsert({
      where: { tenantId_name_type: { tenantId, name, type: "DESPESA" } },
      create: { tenantId, name, type: "DESPESA", isActive: true },
      update: {},
    });
  }
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
