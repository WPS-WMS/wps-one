-- Planos comerciais configuráveis + status de cancelamento/lockout.

CREATE TABLE IF NOT EXISTS "platform_plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "priceCentsPerUser" INTEGER NOT NULL,
  "moduleProjetos" BOOLEAN NOT NULL DEFAULT true,
  "moduleFinanceiro" BOOLEAN NOT NULL DEFAULT true,
  "modulePortal" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_plans_code_key" ON "platform_plans"("code");
CREATE INDEX IF NOT EXISTS "platform_plans_active_sortOrder_idx" ON "platform_plans"("active", "sortOrder");

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionPlanId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionCanceledAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionAccessUntil" TIMESTAMP(3);

-- Seed dos planos legados (todos os módulos ligados).
INSERT INTO "platform_plans" ("id", "name", "code", "priceCentsPerUser", "moduleProjetos", "moduleFinanceiro", "modulePortal", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'plan_standard_legacy', 'Standard', 'STANDARD', 4900, true, true, true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "platform_plans" WHERE "code" = 'STANDARD');

INSERT INTO "platform_plans" ("id", "name", "code", "priceCentsPerUser", "moduleProjetos", "moduleFinanceiro", "modulePortal", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'plan_premium_legacy', 'Premium', 'PREMIUM', 9900, true, true, true, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "platform_plans" WHERE "code" = 'PREMIUM');

UPDATE "Tenant" t
SET
  "subscriptionPlanId" = p."id",
  "subscriptionStatus" = CASE
    WHEN t."subscriptionPlan" IS NOT NULL AND btrim(t."subscriptionPlan") <> '' THEN 'active'
    ELSE COALESCE(t."subscriptionStatus", 'none')
  END
FROM "platform_plans" p
WHERE t."subscriptionPlanId" IS NULL
  AND t."subscriptionPlan" IS NOT NULL
  AND upper(t."subscriptionPlan") = p."code";

UPDATE "Tenant"
SET "subscriptionStatus" = 'none'
WHERE "subscriptionStatus" IS NULL
  AND ("subscriptionPlanId" IS NULL AND ("subscriptionPlan" IS NULL OR btrim("subscriptionPlan") = ''));

UPDATE "Tenant"
SET "subscriptionStatus" = 'active'
WHERE "subscriptionStatus" IS NULL
  AND "subscriptionPlanId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Tenant_subscriptionPlanId_fkey'
  ) THEN
    ALTER TABLE "Tenant"
      ADD CONSTRAINT "Tenant_subscriptionPlanId_fkey"
      FOREIGN KEY ("subscriptionPlanId") REFERENCES "platform_plans"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Tenant_subscriptionPlanId_idx" ON "Tenant"("subscriptionPlanId");
