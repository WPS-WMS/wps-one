-- AlterTable
ALTER TABLE "ClientUser" ADD COLUMN "seeAllProjects" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "client_user_visible_projects" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "client_user_visible_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_user_visible_projects_cu_proj_uq" ON "client_user_visible_projects"("clientUserId", "projectId");

-- CreateIndex
CREATE INDEX "client_user_visible_projects_project_idx" ON "client_user_visible_projects"("projectId");

-- AddForeignKey
ALTER TABLE "client_user_visible_projects" ADD CONSTRAINT "client_user_visible_projects_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_user_visible_projects" ADD CONSTRAINT "client_user_visible_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Clientes já cadastrados continuam vendo todos os projetos da empresa.
UPDATE "ClientUser" SET "seeAllProjects" = true;
