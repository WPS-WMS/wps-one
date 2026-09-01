-- Skills por medição de receita variável (taxa hora + horas por perfil).
CREATE TABLE "project_revenue_variable_cost_lines" (
    "id" TEXT NOT NULL,
    "variableEntryId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_variable_cost_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_revenue_variable_cost_lines_entry_sort_idx"
    ON "project_revenue_variable_cost_lines"("variableEntryId", "sortOrder");

ALTER TABLE "project_revenue_variable_cost_lines"
    ADD CONSTRAINT "project_revenue_variable_cost_lines_variableEntryId_fkey"
    FOREIGN KEY ("variableEntryId") REFERENCES "project_revenue_variable_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
