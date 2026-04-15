-- Add project scoping + active flag for activities.
-- This is used to control which "Tipo" options appear when opening a ticket.
-- Idempotent (safe to apply on existing DBs without baseline migrations).

DO $$
BEGIN
  -- Add isActive column to "Activity"
  IF to_regclass('public."Activity"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Activity'
        AND column_name = 'isActive'
    ) THEN
      EXECUTE 'ALTER TABLE "Activity" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE';
    END IF;
  END IF;

  -- Create join table "ActivityProject" (many-to-many: activity <-> project)
  IF to_regclass('public."ActivityProject"') IS NULL THEN
    EXECUTE '
      CREATE TABLE "ActivityProject" (
        "id" TEXT NOT NULL,
        "activityId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        CONSTRAINT "ActivityProject_pkey" PRIMARY KEY ("id")
      )
    ';
    EXECUTE 'ALTER TABLE "ActivityProject" ADD CONSTRAINT "ActivityProject_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE';
    EXECUTE 'ALTER TABLE "ActivityProject" ADD CONSTRAINT "ActivityProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE';
    EXECUTE 'CREATE UNIQUE INDEX "ActivityProject_activityId_projectId_key" ON "ActivityProject"("activityId", "projectId")';
    EXECUTE 'CREATE INDEX "ActivityProject_projectId_idx" ON "ActivityProject"("projectId")';
    EXECUTE 'CREATE INDEX "ActivityProject_activityId_idx" ON "ActivityProject"("activityId")';
  END IF;
END $$;

