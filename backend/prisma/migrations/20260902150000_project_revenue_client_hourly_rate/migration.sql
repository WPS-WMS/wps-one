-- Taxa hora do cliente em receitas variáveis (AMS/T&M).
ALTER TABLE "project_revenues"
ADD COLUMN IF NOT EXISTS "clientHourlyRate" DOUBLE PRECISION;
