-- Agrupamento manual de CR (parcelas) e CP.

CREATE TABLE IF NOT EXISTS "receivable_billing_groups" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivable_billing_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "receivable_billing_groups_tenant_idx"
  ON "receivable_billing_groups"("tenantId");

ALTER TABLE "receivable_billing_groups"
  ADD CONSTRAINT "receivable_billing_groups_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receivable_installments"
  ADD COLUMN IF NOT EXISTS "billingGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "receivable_installments_billing_group_idx"
  ON "receivable_installments"("billingGroupId");

ALTER TABLE "receivable_installments"
  ADD CONSTRAINT "receivable_installments_billingGroupId_fkey"
  FOREIGN KEY ("billingGroupId") REFERENCES "receivable_billing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payable_billing_groups" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "financialAccountId" TEXT NOT NULL,
  "professionalUserId" TEXT,
  "supplierId" TEXT,
  "payeeName" TEXT,
  "costCenterId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payable_billing_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payable_billing_groups_tenant_idx"
  ON "payable_billing_groups"("tenantId");

ALTER TABLE "payable_billing_groups"
  ADD CONSTRAINT "payable_billing_groups_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payables"
  ADD COLUMN IF NOT EXISTS "billingGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "payables_billing_group_idx"
  ON "payables"("billingGroupId");

ALTER TABLE "payables"
  ADD CONSTRAINT "payables_billingGroupId_fkey"
  FOREIGN KEY ("billingGroupId") REFERENCES "payable_billing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
