-- Subcategoria de contas RECEITA: FATURAMENTO | OUTRAS_RECEITAS (reusa dreSubcategory).
UPDATE "financial_accounts"
SET "dreSubcategory" = 'OUTRAS_RECEITAS', "updatedAt" = NOW()
WHERE "type" = 'RECEITA'
  AND "dreSubcategory" IS NULL
  AND (
    lower("name") LIKE '%reembolso%'
    OR lower("name") LIKE '%juros%'
    OR lower("name") LIKE '%multa%'
  );

UPDATE "financial_accounts"
SET "dreSubcategory" = 'FATURAMENTO', "updatedAt" = NOW()
WHERE "type" = 'RECEITA'
  AND "dreSubcategory" IS NULL;
