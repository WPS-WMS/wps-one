ALTER TABLE "project_revenues"
ADD COLUMN "revenueType" TEXT NOT NULL DEFAULT 'FIXA';

CREATE TABLE "project_revenue_variable_entries" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "competenceDate" DATE NOT NULL,
    "description" TEXT,
    "hours" DOUBLE PRECISION,
    "hourlyRate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "firstDueDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_variable_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "project_revenue_billing_lines"
ADD COLUMN "variableEntryId" TEXT;

CREATE INDEX "project_revenue_variable_entries_revenue_sort_idx"
ON "project_revenue_variable_entries"("revenueId", "sortOrder");

CREATE INDEX "project_revenue_billing_lines_variable_entry_idx"
ON "project_revenue_billing_lines"("variableEntryId");

ALTER TABLE "project_revenue_variable_entries"
ADD CONSTRAINT "project_revenue_variable_entries_revenueId_fkey"
FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_revenue_billing_lines"
ADD CONSTRAINT "project_revenue_billing_lines_variableEntryId_fkey"
FOREIGN KEY ("variableEntryId") REFERENCES "project_revenue_variable_entries"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
