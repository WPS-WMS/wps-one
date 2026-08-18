-- Reparo idempotente: recria objetos de contas a pagar e contas a receber
-- caso as migrations 20260703180000 / 20260703190000 tenham sido registradas sem executar o SQL.

-- ── Contas a pagar ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "corporate_expense_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "corporate_expense_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payable_recurrence_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "financialAccountId" TEXT NOT NULL,
    "corporateExpenseTypeId" TEXT,
    "defaultCostCenterId" TEXT,
    "projectId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MENSAL',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDueDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payable_recurrence_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "financialAccountId" TEXT NOT NULL,
    "corporateExpenseTypeId" TEXT,
    "description" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "competenceDate" DATE,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reimbursementId" TEXT,
    "recurrenceRuleId" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payable_installments" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payable_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payable_allocations" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "percentBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "payable_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payable_attachments" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTRO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payable_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payable_history" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payable_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_entries" ADD COLUMN IF NOT EXISTS "payableInstallmentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "corporate_expense_types_tenant_name_uq" ON "corporate_expense_types"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "corporate_expense_types_tenant_active_name_idx" ON "corporate_expense_types"("tenantId", "isActive", "name");
CREATE INDEX IF NOT EXISTS "payable_recurrence_tenant_active_next_idx" ON "payable_recurrence_rules"("tenantId", "isActive", "nextDueDate");
CREATE UNIQUE INDEX IF NOT EXISTS "payables_sourceId_key" ON "payables"("sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "payables_reimbursementId_key" ON "payables"("reimbursementId");
CREATE INDEX IF NOT EXISTS "payables_tenant_status_created_idx" ON "payables"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "payables_tenant_kind_status_idx" ON "payables"("tenantId", "kind", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "payable_installments_payable_number_uq" ON "payable_installments"("payableId", "installmentNumber");
CREATE INDEX IF NOT EXISTS "payable_installments_payable_due_idx" ON "payable_installments"("payableId", "dueDate");
CREATE INDEX IF NOT EXISTS "payable_installments_status_due_idx" ON "payable_installments"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "payable_allocations_payable_idx" ON "payable_allocations"("payableId");
CREATE INDEX IF NOT EXISTS "payable_attachments_payable_created_idx" ON "payable_attachments"("payableId", "createdAt");
CREATE INDEX IF NOT EXISTS "payable_history_payable_created_idx" ON "payable_history"("payableId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_entries_payableInstallmentId_key" ON "financial_entries"("payableInstallmentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corporate_expense_types_tenantId_fkey') THEN
    ALTER TABLE "corporate_expense_types" ADD CONSTRAINT "corporate_expense_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_tenantId_fkey') THEN
    ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_supplierId_fkey') THEN
    ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_financialAccountId_fkey') THEN
    ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_corporateExpenseTypeId_fkey') THEN
    ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_corporateExpenseTypeId_fkey" FOREIGN KEY ("corporateExpenseTypeId") REFERENCES "corporate_expense_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_tenantId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_supplierId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_financialAccountId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_corporateExpenseTypeId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_corporateExpenseTypeId_fkey" FOREIGN KEY ("corporateExpenseTypeId") REFERENCES "corporate_expense_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_reimbursementId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "reimbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_recurrenceRuleId_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "payable_recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_createdById_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_approvedById_fkey') THEN
    ALTER TABLE "payables" ADD CONSTRAINT "payables_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_installments_payableId_fkey') THEN
    ALTER TABLE "payable_installments" ADD CONSTRAINT "payable_installments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_allocations_payableId_fkey') THEN
    ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_allocations_costCenterId_fkey') THEN
    ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_allocations_projectId_fkey') THEN
    ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_attachments_payableId_fkey') THEN
    ALTER TABLE "payable_attachments" ADD CONSTRAINT "payable_attachments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_attachments_userId_fkey') THEN
    ALTER TABLE "payable_attachments" ADD CONSTRAINT "payable_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_history_payableId_fkey') THEN
    ALTER TABLE "payable_history" ADD CONSTRAINT "payable_history_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payable_history_userId_fkey') THEN
    ALTER TABLE "payable_history" ADD CONSTRAINT "payable_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_entries_payableInstallmentId_fkey') THEN
    ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_payableInstallmentId_fkey" FOREIGN KEY ("payableInstallmentId") REFERENCES "payable_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Contas a receber ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "receivable_recurrence_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "financialAccountId" TEXT NOT NULL,
    "projectId" TEXT,
    "defaultCostCenterId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MENSAL',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDueDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receivable_recurrence_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "receivables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectRevenueId" TEXT,
    "financialAccountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "netAmountCents" INTEGER,
    "taxAmountCents" INTEGER,
    "retentionAmountCents" INTEGER,
    "competenceDate" DATE,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'PREVISTO',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "recurrenceRuleId" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "receivable_invoices" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "nfNumber" TEXT NOT NULL,
    "nfSeries" TEXT,
    "emissionDate" DATE NOT NULL,
    "grossAmountCents" INTEGER NOT NULL,
    "netAmountCents" INTEGER NOT NULL,
    "taxAmountCents" INTEGER NOT NULL DEFAULT 0,
    "retentionAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receivable_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "receivable_installments" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PREVISTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receivable_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "receivable_allocations" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "percentBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "receivable_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "receivable_history" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receivable_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_entries" ADD COLUMN IF NOT EXISTS "receivableInstallmentId" TEXT;

CREATE INDEX IF NOT EXISTS "receivable_recurrence_tenant_active_next_idx" ON "receivable_recurrence_rules"("tenantId", "isActive", "nextDueDate");
CREATE UNIQUE INDEX IF NOT EXISTS "receivables_projectRevenueId_key" ON "receivables"("projectRevenueId");
CREATE UNIQUE INDEX IF NOT EXISTS "receivables_sourceId_key" ON "receivables"("sourceId");
CREATE INDEX IF NOT EXISTS "receivables_tenant_status_created_idx" ON "receivables"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "receivables_tenant_client_idx" ON "receivables"("tenantId", "clientId");
CREATE INDEX IF NOT EXISTS "receivables_tenant_competence_idx" ON "receivables"("tenantId", "competenceDate");
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_invoices_receivableId_key" ON "receivable_invoices"("receivableId");
CREATE INDEX IF NOT EXISTS "receivable_invoices_emission_idx" ON "receivable_invoices"("emissionDate");
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_installments_receivable_number_uq" ON "receivable_installments"("receivableId", "installmentNumber");
CREATE INDEX IF NOT EXISTS "receivable_installments_receivable_due_idx" ON "receivable_installments"("receivableId", "dueDate");
CREATE INDEX IF NOT EXISTS "receivable_installments_status_due_idx" ON "receivable_installments"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "receivable_allocations_receivable_idx" ON "receivable_allocations"("receivableId");
CREATE INDEX IF NOT EXISTS "receivable_history_receivable_created_idx" ON "receivable_history"("receivableId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_entries_receivableInstallmentId_key" ON "financial_entries"("receivableInstallmentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_recurrence_rules_tenantId_fkey') THEN
    ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_recurrence_rules_clientId_fkey') THEN
    ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_recurrence_rules_financialAccountId_fkey') THEN
    ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_recurrence_rules_projectId_fkey') THEN
    ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_tenantId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_clientId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_projectId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_projectRevenueId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectRevenueId_fkey" FOREIGN KEY ("projectRevenueId") REFERENCES "project_revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_financialAccountId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_recurrenceRuleId_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "receivable_recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_createdById_fkey') THEN
    ALTER TABLE "receivables" ADD CONSTRAINT "receivables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_invoices_receivableId_fkey') THEN
    ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_installments_receivableId_fkey') THEN
    ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_allocations_receivableId_fkey') THEN
    ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_allocations_costCenterId_fkey') THEN
    ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_allocations_projectId_fkey') THEN
    ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_history_receivableId_fkey') THEN
    ALTER TABLE "receivable_history" ADD CONSTRAINT "receivable_history_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_history_userId_fkey') THEN
    ALTER TABLE "receivable_history" ADD CONSTRAINT "receivable_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_entries_receivableInstallmentId_fkey') THEN
    ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_receivableInstallmentId_fkey" FOREIGN KEY ("receivableInstallmentId") REFERENCES "receivable_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
