-- Reembolsos: modo de cálculo (FIXO/POR_UNIDADE), unidade e limite por valor unitário.
-- Idempotente: seguro para rodar mais de uma vez (ex.: QA com drift).

-- 1) reimbursement_types: calcMode + unit
DO $$
BEGIN
  IF to_regclass('public."reimbursement_types"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_types'
        AND column_name = 'calcMode'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_types" ADD COLUMN "calcMode" TEXT NOT NULL DEFAULT ''FIXO''';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_types'
        AND column_name = 'unit'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_types" ADD COLUMN "unit" TEXT';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."reimbursement_types"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'reimbursement_types_calc_mode_chk'
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE "reimbursement_types"
        ADD CONSTRAINT "reimbursement_types_calc_mode_chk"
        CHECK ("calcMode" IN ('FIXO', 'POR_UNIDADE'))
      $SQL$;
    END IF;
  END IF;
END $$;

-- 2) reimbursement_project_limits: renomear maxValueCents -> maxUnitValueCents
DO $$
BEGIN
  IF to_regclass('public."reimbursement_project_limits"') IS NOT NULL THEN
    -- Se já existe a coluna nova, ok.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_project_limits'
        AND column_name = 'maxUnitValueCents'
    ) THEN
      -- Se existe a antiga, renomeia.
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reimbursement_project_limits'
          AND column_name = 'maxValueCents'
      ) THEN
        EXECUTE 'ALTER TABLE "reimbursement_project_limits" RENAME COLUMN "maxValueCents" TO "maxUnitValueCents"';
      ELSE
        -- fallback (ambiente sem coluna antiga por algum motivo)
        EXECUTE 'ALTER TABLE "reimbursement_project_limits" ADD COLUMN "maxUnitValueCents" INTEGER NOT NULL DEFAULT 0';
      END IF;
    END IF;
  END IF;
END $$;

-- 3) reimbursements: quantity + unitValueCents
DO $$
BEGIN
  IF to_regclass('public."reimbursements"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursements'
        AND column_name = 'quantity'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursements" ADD COLUMN "quantity" NUMERIC(12,3)';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursements'
        AND column_name = 'unitValueCents'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursements" ADD COLUMN "unitValueCents" INTEGER';
    END IF;
  END IF;
END $$;

