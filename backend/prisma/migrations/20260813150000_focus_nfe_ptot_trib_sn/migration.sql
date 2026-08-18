-- Percentual aproximado dos tributos do Simples Nacional (pTotTribSN) para ME/EPP.
ALTER TABLE "tenant_focus_nfe_configs"
ADD COLUMN "percentualTotalTributosSimplesNacional" DECIMAL(5,2);
