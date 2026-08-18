-- Subcategoria DRE das categorias financeiras (IMPOSTO | CUSTO | REEMBOLSOS).
ALTER TABLE "financial_categories"
  ADD COLUMN IF NOT EXISTS "dreSubcategory" TEXT;
