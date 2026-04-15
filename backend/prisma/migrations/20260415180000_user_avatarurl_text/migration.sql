-- Ensure avatarUrl can store large Data URLs (base64).
-- Some existing databases may have avatarUrl as VARCHAR(255), which truncates images.
-- Idempotent: safe to run multiple times.

DO $$
BEGIN
  IF to_regclass('public."users"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'avatarUrl'
    ) THEN
      -- Casting to TEXT is safe even if it is already TEXT/VARCHAR without limit.
      EXECUTE 'ALTER TABLE "users" ALTER COLUMN "avatarUrl" TYPE TEXT';
    END IF;
  END IF;
END $$;

