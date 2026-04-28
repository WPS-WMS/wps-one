-- Ajuste manual de saldo (importação do sistema anterior)
ALTER TABLE "HourBankRecord" ADD COLUMN IF NOT EXISTS "saldoAjuste" DOUBLE PRECISION;

