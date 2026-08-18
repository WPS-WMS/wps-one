-- Financeiro Fase 4: Contas a Receber e Faturamento

CREATE TABLE "receivable_recurrence_rules" (
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

CREATE TABLE "receivables" (
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

CREATE TABLE "receivable_invoices" (
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

CREATE TABLE "receivable_installments" (
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

CREATE TABLE "receivable_allocations" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "percentBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "receivable_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivable_history" (
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

ALTER TABLE "financial_entries" ADD COLUMN "receivableInstallmentId" TEXT;

CREATE INDEX "receivable_recurrence_tenant_active_next_idx" ON "receivable_recurrence_rules"("tenantId", "isActive", "nextDueDate");

CREATE UNIQUE INDEX "receivables_projectRevenueId_key" ON "receivables"("projectRevenueId");
CREATE UNIQUE INDEX "receivables_sourceId_key" ON "receivables"("sourceId");
CREATE INDEX "receivables_tenant_status_created_idx" ON "receivables"("tenantId", "status", "createdAt");
CREATE INDEX "receivables_tenant_client_idx" ON "receivables"("tenantId", "clientId");
CREATE INDEX "receivables_tenant_competence_idx" ON "receivables"("tenantId", "competenceDate");

CREATE UNIQUE INDEX "receivable_invoices_receivableId_key" ON "receivable_invoices"("receivableId");
CREATE INDEX "receivable_invoices_emission_idx" ON "receivable_invoices"("emissionDate");

CREATE UNIQUE INDEX "receivable_installments_receivable_number_uq" ON "receivable_installments"("receivableId", "installmentNumber");
CREATE INDEX "receivable_installments_receivable_due_idx" ON "receivable_installments"("receivableId", "dueDate");
CREATE INDEX "receivable_installments_status_due_idx" ON "receivable_installments"("status", "dueDate");

CREATE INDEX "receivable_allocations_receivable_idx" ON "receivable_allocations"("receivableId");

CREATE INDEX "receivable_history_receivable_created_idx" ON "receivable_history"("receivableId", "createdAt");

CREATE UNIQUE INDEX "financial_entries_receivableInstallmentId_key" ON "financial_entries"("receivableInstallmentId");

ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_recurrence_rules" ADD CONSTRAINT "receivable_recurrence_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectRevenueId_fkey" FOREIGN KEY ("projectRevenueId") REFERENCES "project_revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "receivable_recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receivable_history" ADD CONSTRAINT "receivable_history_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivable_history" ADD CONSTRAINT "receivable_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_receivableInstallmentId_fkey" FOREIGN KEY ("receivableInstallmentId") REFERENCES "receivable_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
