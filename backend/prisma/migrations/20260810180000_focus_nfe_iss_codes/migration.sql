-- Códigos ISS disponíveis para escolha na emissão do Contas a receber
ALTER TABLE "tenant_focus_nfe_configs"
  ADD COLUMN IF NOT EXISTS "codigosTributacaoIss" TEXT;
