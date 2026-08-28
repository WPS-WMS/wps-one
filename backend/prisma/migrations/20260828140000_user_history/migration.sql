-- Trilha de alterações do cadastro de usuário.
CREATE TABLE IF NOT EXISTS "user_history" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "authorId" TEXT,
  "action" TEXT NOT NULL,
  "field" TEXT,
  "oldValue" TEXT,
  "newValue" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_history_user_created_idx"
  ON "user_history" ("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_history_tenantId_fkey') THEN
    ALTER TABLE "user_history"
      ADD CONSTRAINT "user_history_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_history_userId_fkey') THEN
    ALTER TABLE "user_history"
      ADD CONSTRAINT "user_history_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_history_authorId_fkey') THEN
    ALTER TABLE "user_history"
      ADD CONSTRAINT "user_history_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
