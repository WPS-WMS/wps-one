import type { PrismaClient } from "@prisma/client";

/** Alias de nomes categoria ↔ conta DESPESA. */
export function expenseAccountNameCandidates(categoryName: string): string[] {
  const n = String(categoryName ?? "").trim();
  if (!n) return [];
  const lower = n.toLowerCase();
  if (lower === "reembolso" || lower === "reembolsos") {
    return ["Reembolsos", "Reembolso", n];
  }
  return [n];
}

function normalizeKey(name: string): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Garante que cada FinancialCategory tenha uma FinancialAccount DESPESA
 * correspondente (flags/DRE) — útil para tenants provisionados antes da unificação.
 */
export async function syncExpenseAccountsFromCategories(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const [categories, accounts] = await Promise.all([
    prisma.financialCategory.findMany({ where: { tenantId } }),
    prisma.financialAccount.findMany({ where: { tenantId, type: "DESPESA" } }),
  ]);
  if (categories.length === 0) return;

  const byKey = new Map(accounts.map((a) => [normalizeKey(a.name), a]));

  for (const cat of categories) {
    let account =
      expenseAccountNameCandidates(cat.name)
        .map((cand) => byKey.get(normalizeKey(cand)))
        .find(Boolean) ?? null;

    if (!account) {
      account = await prisma.financialAccount.create({
        data: {
          tenantId,
          name: cat.name,
          type: "DESPESA",
          isActive: cat.isActive,
          dreSubcategory: cat.dreSubcategory,
          enableHourRate: cat.enableHourRate,
          enableAmount:
            cat.enableAmount ||
            cat.enableHourRate ||
            cat.enableDiscount ||
            cat.enableComplementaryHours ||
            cat.enableInterestFine ||
            cat.enableBenefit ||
            cat.enableReimbursement
              ? cat.enableAmount
              : true,
          enableBenefit: cat.enableBenefit,
          enableReimbursement: cat.enableReimbursement,
          enableDiscount: cat.enableDiscount,
          enableComplementaryHours: cat.enableComplementaryHours,
          enableInterestFine: cat.enableInterestFine,
        },
      });
      byKey.set(normalizeKey(account.name), account);
      continue;
    }

    const needsUpdate =
      (cat.dreSubcategory && account.dreSubcategory !== cat.dreSubcategory) ||
      (cat.enableHourRate && !account.enableHourRate) ||
      (cat.enableAmount && !account.enableAmount) ||
      (cat.enableBenefit && !account.enableBenefit) ||
      (cat.enableReimbursement && !account.enableReimbursement) ||
      (cat.enableDiscount && !account.enableDiscount) ||
      (cat.enableComplementaryHours && !account.enableComplementaryHours) ||
      (cat.enableInterestFine && !account.enableInterestFine);

    if (needsUpdate) {
      const updated = await prisma.financialAccount.update({
        where: { id: account.id },
        data: {
          dreSubcategory: account.dreSubcategory ?? cat.dreSubcategory,
          enableHourRate: account.enableHourRate || cat.enableHourRate,
          enableAmount: account.enableAmount || cat.enableAmount,
          enableBenefit: account.enableBenefit || cat.enableBenefit,
          enableReimbursement: account.enableReimbursement || cat.enableReimbursement,
          enableDiscount: account.enableDiscount || cat.enableDiscount,
          enableComplementaryHours:
            account.enableComplementaryHours || cat.enableComplementaryHours,
          enableInterestFine: account.enableInterestFine || cat.enableInterestFine,
        },
      });
      byKey.set(normalizeKey(updated.name), updated);
    }
  }
}
