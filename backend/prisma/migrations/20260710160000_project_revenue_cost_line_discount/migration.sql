-- Linha de desconto na composição de custos das receitas de projeto.

ALTER TABLE "project_revenue_cost_lines"
ADD COLUMN IF NOT EXISTS "isDiscount" BOOLEAN NOT NULL DEFAULT false;
