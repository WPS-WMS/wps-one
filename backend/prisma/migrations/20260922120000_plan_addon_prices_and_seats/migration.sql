-- Preço adicional por usuário de cada addon no plano
ALTER TABLE "platform_plans" ADD COLUMN IF NOT EXISTS "addonSharepointCentsPerUser" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_plans" ADD COLUMN IF NOT EXISTS "addonComercialCentsPerUser" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_plans" ADD COLUMN IF NOT EXISTS "addonRhCentsPerUser" INTEGER NOT NULL DEFAULT 0;

-- Seats de addon contratados pela empresa
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionAddonSharepointUsers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionAddonComercialUsers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionAddonRhUsers" INTEGER NOT NULL DEFAULT 0;
