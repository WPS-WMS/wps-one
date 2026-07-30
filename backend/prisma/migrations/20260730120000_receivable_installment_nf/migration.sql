-- NF por parcela (emitir nota não afeta as demais parcelas do mesmo CR)
ALTER TABLE "receivable_installments" ADD COLUMN IF NOT EXISTS "nfNumber" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN IF NOT EXISTS "nfEmissionDate" DATE;
