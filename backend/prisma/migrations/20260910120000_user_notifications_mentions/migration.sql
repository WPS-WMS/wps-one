-- Notificações in-app (menções em comentários de tarefa)
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "ticketId" TEXT,
  "commentId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_notifications_user_read_created_idx"
  ON "user_notifications"("userId", "readAt", "createdAt");

CREATE INDEX IF NOT EXISTS "user_notifications_tenant_created_idx"
  ON "user_notifications"("tenantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_tenantId_fkey'
  ) THEN
    ALTER TABLE "user_notifications"
      ADD CONSTRAINT "user_notifications_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_userId_fkey'
  ) THEN
    ALTER TABLE "user_notifications"
      ADD CONSTRAINT "user_notifications_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_actorId_fkey'
  ) THEN
    ALTER TABLE "user_notifications"
      ADD CONSTRAINT "user_notifications_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_ticketId_fkey'
  ) THEN
    ALTER TABLE "user_notifications"
      ADD CONSTRAINT "user_notifications_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
