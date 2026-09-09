-- Prazo de pagamento (dias) e mês de reajuste na receita do projeto.
ALTER TABLE "project_revenues" ADD COLUMN IF NOT EXISTS "paymentTermDays" INTEGER;
ALTER TABLE "project_revenues" ADD COLUMN IF NOT EXISTS "readjustmentMonth" INTEGER;
