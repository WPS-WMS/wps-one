-- DPS: sequência independente por ambiente (homologação vs produção)
ALTER TABLE "tenant_focus_nfe_configs"
ADD COLUMN IF NOT EXISTS "serieDpsHomologacao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "proximoNumeroDpsHomologacao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "serieDpsProducao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "proximoNumeroDpsProducao" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_focus_nfe_configs'
      AND column_name = 'serieDps'
  ) THEN
    EXECUTE '
      UPDATE "tenant_focus_nfe_configs"
      SET
        "serieDpsHomologacao" = COALESCE("serieDps", 1),
        "proximoNumeroDpsHomologacao" = COALESCE("proximoNumeroDps", 1),
        "serieDpsProducao" = COALESCE("serieDps", 1),
        "proximoNumeroDpsProducao" = COALESCE("proximoNumeroDps", 1)
    ';
  END IF;
END $$;

ALTER TABLE "tenant_focus_nfe_configs"
DROP COLUMN IF EXISTS "serieDps",
DROP COLUMN IF EXISTS "proximoNumeroDps";
