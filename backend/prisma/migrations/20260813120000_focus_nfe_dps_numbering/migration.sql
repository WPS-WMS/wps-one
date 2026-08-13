-- Série e próximo número da DPS (NFS-e Nacional)
ALTER TABLE "tenant_focus_nfe_configs"
ADD COLUMN IF NOT EXISTS "serieDps" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "proximoNumeroDps" INTEGER NOT NULL DEFAULT 1;
