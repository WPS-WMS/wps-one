-- Histórico de vigências da taxa hora interna do usuário.
CREATE TABLE IF NOT EXISTS "user_hourly_rate_history" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hourlyRate" DOUBLE PRECISION,
  "effectiveFrom" DATE NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_hourly_rate_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_hourly_rate_hist_user_eff_uq"
  ON "user_hourly_rate_history" ("userId", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "user_hourly_rate_hist_ten_user_eff_idx"
  ON "user_hourly_rate_history" ("tenantId", "userId", "effectiveFrom");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_hourly_rate_history_tenantId_fkey'
  ) THEN
    ALTER TABLE "user_hourly_rate_history"
      ADD CONSTRAINT "user_hourly_rate_history_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_hourly_rate_history_userId_fkey'
  ) THEN
    ALTER TABLE "user_hourly_rate_history"
      ADD CONSTRAINT "user_hourly_rate_history_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: a taxa atual passa a valer "desde sempre", para que nada mude nos relatórios já existentes.
INSERT INTO "user_hourly_rate_history" ("id", "tenantId", "userId", "hourlyRate", "effectiveFrom")
SELECT
  'uhrh_' || u."id",
  u."tenantId",
  u."id",
  u."hourlyRate",
  DATE '1900-01-01'
FROM "users" u
WHERE u."hourlyRate" IS NOT NULL
ON CONFLICT ("userId", "effectiveFrom") DO NOTHING;
