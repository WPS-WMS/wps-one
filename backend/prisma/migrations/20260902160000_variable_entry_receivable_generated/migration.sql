-- Flag de geração de conta a receber por medição (receita variável).
ALTER TABLE "project_revenue_variable_entries"
ADD COLUMN IF NOT EXISTS "receivableGeneratedAt" TIMESTAMP(3);

-- Medições de receitas variáveis que já têm CR vinculada à receita.
UPDATE "project_revenue_variable_entries" AS e
SET "receivableGeneratedAt" = COALESCE(r."updatedAt", NOW())
FROM "project_revenues" AS pr
INNER JOIN "receivables" AS r ON r."projectRevenueId" = pr.id
WHERE e."revenueId" = pr.id
  AND pr."revenueType" = 'VARIAVEL'
  AND e."receivableGeneratedAt" IS NULL
  AND r.status <> 'CANCELADO';
