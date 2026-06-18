-- SharePoint por cliente (equipe Teams de cada cliente)

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sharePointEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sharePointSiteUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sharePointDriveId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sharePointRootFolderPath" TEXT DEFAULT 'Projetos WPSone';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sharePointRootFolderItemId" TEXT;
