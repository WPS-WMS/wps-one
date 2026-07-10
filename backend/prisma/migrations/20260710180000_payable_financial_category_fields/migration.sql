-- Categorias financeiras de contas a pagar
CREATE TABLE IF NOT EXISTS "financial_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_categories_tenant_name_uq" ON "financial_categories"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "financial_categories_tenant_active_name_idx" ON "financial_categories"("tenantId", "isActive", "name");

ALTER TABLE "financial_categories"
    ADD CONSTRAINT "financial_categories_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campos adicionais em contas a pagar
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "professionalUserId" TEXT;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "payeeName" TEXT;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "financialCategoryId" TEXT;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "contractTypeId" TEXT;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "hourRateCents" INTEGER;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "benefitCents" INTEGER;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "reimbursementCents" INTEGER;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "complementaryHours" DOUBLE PRECISION;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "interestFineCents" INTEGER;

DO $$ BEGIN
    ALTER TABLE "payables"
        ADD CONSTRAINT "payables_professionalUserId_fkey"
        FOREIGN KEY ("professionalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "payables"
        ADD CONSTRAINT "payables_financialCategoryId_fkey"
        FOREIGN KEY ("financialCategoryId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "payables"
        ADD CONSTRAINT "payables_contractTypeId_fkey"
        FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
