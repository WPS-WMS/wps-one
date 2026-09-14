-- Assinatura WPS One por tenant (cobrança por usuário ativo).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionNextPaymentAt" TIMESTAMP(3);
