-- Soft delete de contratos de projeto
ALTER TABLE "project_contracts" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
