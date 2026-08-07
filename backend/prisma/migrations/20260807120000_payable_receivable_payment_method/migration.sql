-- Forma de pagamento em contas a pagar / receber (e espelho da receita de projeto).
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

-- Propaga forma de pagamento já salva na receita de projeto para CRs vinculadas.
UPDATE "receivables" r
SET "paymentMethod" = pr."paymentMethod"
FROM "project_revenues" pr
WHERE r."projectRevenueId" = pr.id
  AND r."paymentMethod" IS NULL
  AND pr."paymentMethod" IS NOT NULL;
