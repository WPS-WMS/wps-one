-- Add manual queue priority for tasks list ordering
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "queuePriority" INTEGER;

-- Optional index to speed up member queue ordering
CREATE INDEX IF NOT EXISTS "tickets_assignedToId_queuePriority_idx"
ON "tickets" ("assignedToId", "queuePriority");

