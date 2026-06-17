-- Integração SharePoint / Teams (pastas por projeto e tarefa + sync de anexos)

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sharePointEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sharePointSiteUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sharePointDriveId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sharePointRootFolderPath" TEXT DEFAULT 'Projetos WPSone';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sharePointRootFolderItemId" TEXT;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sharePointFolderId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sharePointFolderUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sharePointSyncStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sharePointSyncError" TEXT;

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "sharePointFolderId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "sharePointFolderUrl" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "sharePointSyncStatus" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "sharePointSyncError" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "sharePointDeltaLink" TEXT;

ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "sharePointItemId" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "sharePointWebUrl" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "sharePointETag" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "syncSource" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TicketAttachment_sharePointItemId_idx" ON "TicketAttachment"("sharePointItemId");
