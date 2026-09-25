-- Vínculos entre tarefas: dependência (FINISH_START) e referência (RELATES_TO)
CREATE TABLE IF NOT EXISTS "ticket_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromTicketId" TEXT NOT NULL,
    "toTicketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_links_from_to_type_uq"
  ON "ticket_links"("fromTicketId", "toTicketId", "type");

CREATE INDEX IF NOT EXISTS "ticket_links_tenant_to_type_idx"
  ON "ticket_links"("tenantId", "toTicketId", "type");

CREATE INDEX IF NOT EXISTS "ticket_links_tenant_from_type_idx"
  ON "ticket_links"("tenantId", "fromTicketId", "type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_links_tenantId_fkey'
  ) THEN
    ALTER TABLE "ticket_links"
      ADD CONSTRAINT "ticket_links_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_links_fromTicketId_fkey'
  ) THEN
    ALTER TABLE "ticket_links"
      ADD CONSTRAINT "ticket_links_fromTicketId_fkey"
      FOREIGN KEY ("fromTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_links_toTicketId_fkey'
  ) THEN
    ALTER TABLE "ticket_links"
      ADD CONSTRAINT "ticket_links_toTicketId_fkey"
      FOREIGN KEY ("toTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_links_createdById_fkey'
  ) THEN
    ALTER TABLE "ticket_links"
      ADD CONSTRAINT "ticket_links_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
