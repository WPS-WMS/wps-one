-- Reembolsos: limites por projeto suportando FIXO (maxValueCents) e POR_UNIDADE (maxUnitValueCents).
-- Idempotente: seguro para rodar mais de uma vez (ex.: QA com drift).

-- 1) Garantir colunas (e manter compat com migração anterior que renomeou maxValueCents -> maxUnitValueCents).
DO $$
BEGIN
  IF to_regclass('public."reimbursement_project_limits"') IS NOT NULL THEN
    -- Se a coluna maxValueCents não existir, cria (nullable).
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_project_limits'
        AND column_name = 'maxValueCents'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_project_limits" ADD COLUMN "maxValueCents" INTEGER';
    END IF;

    -- Se a coluna maxUnitValueCents não existir, cria (nullable).
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_project_limits'
        AND column_name = 'maxUnitValueCents'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_project_limits" ADD COLUMN "maxUnitValueCents" INTEGER';
    END IF;
  END IF;
END $$;

-- 2) Migração de dados (best-effort):
-- Se maxValueCents estiver vazio e maxUnitValueCents tiver valores (cenário comum após rename),
-- copia os valores para maxValueCents para não “sumir” limite de tipos FIXO existentes.
DO $$
BEGIN
  IF to_regclass('public."reimbursement_project_limits"') IS NOT NULL THEN
    EXECUTE $SQL$
      UPDATE "reimbursement_project_limits"
      SET "maxValueCents" = COALESCE("maxValueCents", "maxUnitValueCents")
      WHERE "maxValueCents" IS NULL
        AND "maxUnitValueCents" IS NOT NULL
    $SQL$;
  END IF;
END $$;

