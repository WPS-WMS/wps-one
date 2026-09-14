-- Forma de pagamento da assinatura WPS One (PIX | BOLETO | CARTAO_CREDITO).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionPaymentMethod" TEXT;
