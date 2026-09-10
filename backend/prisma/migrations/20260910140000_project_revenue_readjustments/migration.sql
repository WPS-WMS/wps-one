-- Histórico de reajustes (mês/ano + taxas) por receita variável
CREATE TABLE "project_revenue_readjustments" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "clientHourlyRate" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_readjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_revenue_readjustment_skill_rates" (
    "id" TEXT NOT NULL,
    "readjustmentId" TEXT NOT NULL,
    "skillProfileId" TEXT NOT NULL,
    "skillName" TEXT,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_revenue_readjustment_skill_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_revenue_readjustments_revenue_year_month_uq"
  ON "project_revenue_readjustments"("revenueId", "year", "month");

CREATE INDEX "project_revenue_readjustments_revenue_period_idx"
  ON "project_revenue_readjustments"("revenueId", "year", "month");

CREATE INDEX "project_revenue_readjustment_skill_rates_sort_idx"
  ON "project_revenue_readjustment_skill_rates"("readjustmentId", "sortOrder");

ALTER TABLE "project_revenue_readjustments"
  ADD CONSTRAINT "project_revenue_readjustments_revenueId_fkey"
  FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_revenue_readjustments"
  ADD CONSTRAINT "project_revenue_readjustments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_revenue_readjustment_skill_rates"
  ADD CONSTRAINT "project_revenue_readjustment_skill_rates_readjustmentId_fkey"
  FOREIGN KEY ("readjustmentId") REFERENCES "project_revenue_readjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_revenue_readjustment_skill_rates"
  ADD CONSTRAINT "project_revenue_readjustment_skill_rates_skillProfileId_fkey"
  FOREIGN KEY ("skillProfileId") REFERENCES "skill_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: um registro a partir do mês/taxas atuais (ano corrente)
INSERT INTO "project_revenue_readjustments" (
  "id", "revenueId", "year", "month", "clientHourlyRate", "notes", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || r."id"),
  r."id",
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  r."readjustmentMonth",
  r."clientHourlyRate",
  'Registro inicial a partir dos dados atuais da receita',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "project_revenues" r
WHERE r."revenueType" = 'VARIAVEL'
  AND r."status" <> 'CANCELADO'
  AND r."readjustmentMonth" IS NOT NULL
  AND r."readjustmentMonth" BETWEEN 1 AND 12;

INSERT INTO "project_revenue_readjustment_skill_rates" (
  "id", "readjustmentId", "skillProfileId", "skillName", "hourlyRate", "sortOrder"
)
SELECT
  md5(random()::text || clock_timestamp()::text || sr."id" || adj."id"),
  adj."id",
  sr."skillProfileId",
  sp."name",
  sr."hourlyRate",
  sr."sortOrder"
FROM "project_revenue_skill_rates" sr
INNER JOIN "project_revenue_readjustments" adj ON adj."revenueId" = sr."revenueId"
  AND adj."notes" = 'Registro inicial a partir dos dados atuais da receita'
INNER JOIN "skill_profiles" sp ON sp."id" = sr."skillProfileId";
