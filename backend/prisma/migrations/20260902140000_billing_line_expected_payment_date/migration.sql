-- Previsão de pagamento nas parcelas de faturamento da receita.
ALTER TABLE "project_revenue_billing_lines"
ADD COLUMN IF NOT EXISTS "expectedPaymentDate" DATE;

UPDATE "project_revenue_billing_lines"
SET "expectedPaymentDate" = "dueDate"
WHERE "expectedPaymentDate" IS NULL;
