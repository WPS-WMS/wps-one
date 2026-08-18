-- Financeiro: Contas a Pagar e Despesas Corporativas

CREATE TABLE "corporate_expense_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_expense_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payable_recurrence_rules" (
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

CREATE TABLE "payables" (
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

CREATE TABLE "payable_installments" (
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

CREATE TABLE "payable_allocations" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "percentBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "payable_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payable_attachments" (
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

CREATE TABLE "payable_history" (
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

ALTER TABLE "financial_entries" ADD COLUMN "payableInstallmentId" TEXT;

CREATE UNIQUE INDEX "corporate_expense_types_tenant_name_uq" ON "corporate_expense_types"("tenantId", "name");
CREATE INDEX "corporate_expense_types_tenant_active_name_idx" ON "corporate_expense_types"("tenantId", "isActive", "name");

CREATE INDEX "payable_recurrence_tenant_active_next_idx" ON "payable_recurrence_rules"("tenantId", "isActive", "nextDueDate");

CREATE UNIQUE INDEX "payables_sourceId_key" ON "payables"("sourceId");
CREATE UNIQUE INDEX "payables_reimbursementId_key" ON "payables"("reimbursementId");
CREATE INDEX "payables_tenant_status_created_idx" ON "payables"("tenantId", "status", "createdAt");
CREATE INDEX "payables_tenant_kind_status_idx" ON "payables"("tenantId", "kind", "status");

CREATE UNIQUE INDEX "payable_installments_payable_number_uq" ON "payable_installments"("payableId", "installmentNumber");
CREATE INDEX "payable_installments_payable_due_idx" ON "payable_installments"("payableId", "dueDate");
CREATE INDEX "payable_installments_status_due_idx" ON "payable_installments"("status", "dueDate");

CREATE INDEX "payable_allocations_payable_idx" ON "payable_allocations"("payableId");

CREATE INDEX "payable_attachments_payable_created_idx" ON "payable_attachments"("payableId", "createdAt");

CREATE INDEX "payable_history_payable_created_idx" ON "payable_history"("payableId", "createdAt");

CREATE UNIQUE INDEX "financial_entries_payableInstallmentId_key" ON "financial_entries"("payableInstallmentId");

ALTER TABLE "corporate_expense_types" ADD CONSTRAINT "corporate_expense_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_recurrence_rules" ADD CONSTRAINT "payable_recurrence_rules_corporateExpenseTypeId_fkey" FOREIGN KEY ("corporateExpenseTypeId") REFERENCES "corporate_expense_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payables" ADD CONSTRAINT "payables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_corporateExpenseTypeId_fkey" FOREIGN KEY ("corporateExpenseTypeId") REFERENCES "corporate_expense_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "reimbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "payable_recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payable_installments" ADD CONSTRAINT "payable_installments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payable_attachments" ADD CONSTRAINT "payable_attachments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payable_attachments" ADD CONSTRAINT "payable_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payable_history" ADD CONSTRAINT "payable_history_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payable_history" ADD CONSTRAINT "payable_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_payableInstallmentId_fkey" FOREIGN KEY ("payableInstallmentId") REFERENCES "payable_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
