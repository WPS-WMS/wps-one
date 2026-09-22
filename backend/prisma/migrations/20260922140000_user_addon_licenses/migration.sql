-- Licenças de addon por usuário (estilo atribuição Microsoft)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addonSharepoint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addonComercial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addonRh" BOOLEAN NOT NULL DEFAULT false;
