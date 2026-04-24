-- Add manual queue priority for tasks list ordering
-- NOTE: Some databases may have the table mapped as "tickets" or "Ticket".
DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "queuePriority" INTEGER';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "tickets_assignedToId_queuePriority_idx" ON "tickets" ("assignedToId", "queuePriority")';
  ELSIF to_regclass('public."Ticket"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "queuePriority" INTEGER';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "ticket_assignedToId_queuePriority_idx" ON "Ticket" ("assignedToId", "queuePriority")';
  ELSE
    RAISE EXCEPTION 'Neither "tickets" nor "Ticket" table exists in schema public';
  END IF;
END $$;

