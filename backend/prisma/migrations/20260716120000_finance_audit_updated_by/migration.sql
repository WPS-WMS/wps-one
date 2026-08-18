-- Auditoria: usuário de alteração + histórico de lançamentos
ALTER TABLE "financial_entries" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

CREATE TABLE IF NOT EXISTS "financial_entry_history" (
  "id" TEXT NOT NULL,
  "financialEntryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "field" TEXT,
  "oldValue" TEXT,
  "newValue" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_entry_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_entry_history_entry_created_idx"
  ON "financial_entry_history"("financialEntryId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "financial_entries"
    ADD CONSTRAINT "financial_entries_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payables"
    ADD CONSTRAINT "payables_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivables"
    ADD CONSTRAINT "receivables_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "financial_entry_history"
    ADD CONSTRAINT "financial_entry_history_financialEntryId_fkey"
    FOREIGN KEY ("financialEntryId") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "financial_entry_history"
    ADD CONSTRAINT "financial_entry_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
