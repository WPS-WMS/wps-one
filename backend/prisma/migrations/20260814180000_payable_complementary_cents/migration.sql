-- Horas complementares passam a ser valor em R$ (centavos).
-- Colunas do Postgres neste projeto usam camelCase (Prisma sem @map).

ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "complementaryCents" INTEGER;

-- Se a tentativa anterior criou complementary_cents (snake_case), migra e remove.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payables'
      AND column_name = 'complementary_cents'
  ) THEN
    EXECUTE $sql$
      UPDATE "payables"
      SET "complementaryCents" = "complementary_cents"
      WHERE "complementaryCents" IS NULL
        AND "complementary_cents" IS NOT NULL
    $sql$;
    ALTER TABLE "payables" DROP COLUMN "complementary_cents";
  END IF;
END $$;

-- Converte legado (horas × tx hora) para centavos.
UPDATE "payables"
SET "complementaryCents" = ROUND(("hourRateCents"::numeric) * ("complementaryHours"::numeric))
WHERE "complementaryCents" IS NULL
  AND "complementaryHours" IS NOT NULL
  AND "complementaryHours" > 0
  AND "hourRateCents" IS NOT NULL
  AND "hourRateCents" > 0;
