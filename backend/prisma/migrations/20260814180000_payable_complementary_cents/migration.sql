-- Horas complementares passam a ser valor em R$ (centavos).
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "complementary_cents" INTEGER;

-- Converte legado (horas × tx hora) para centavos.
UPDATE "payables"
SET "complementary_cents" = ROUND(("hour_rate_cents"::numeric) * ("complementary_hours"::numeric))
WHERE "complementary_cents" IS NULL
  AND "complementary_hours" IS NOT NULL
  AND "complementary_hours" > 0
  AND "hour_rate_cents" IS NOT NULL
  AND "hour_rate_cents" > 0;
