-- Pagamento para: Empresa ou Consultor
ALTER TABLE "reimbursements" ADD COLUMN IF NOT EXISTS "paymentTo" TEXT;
