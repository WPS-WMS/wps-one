-- Focus NFe (NFSe Nacional): config por tenant + rastreio na parcela do CR

CREATE TABLE "tenant_focus_nfe_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
    "tokenHomologacao" TEXT,
    "tokenProducao" TEXT,
    "cnpjPrestador" TEXT,
    "inscricaoMunicipalPrestador" TEXT,
    "codigoMunicipioEmissora" TEXT,
    "codigoTributacaoNacionalIss" TEXT,
    "descricaoServicoPadrao" TEXT,
    "codigoOpcaoSimplesNacional" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_focus_nfe_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_focus_nfe_configs_tenantId_key" ON "tenant_focus_nfe_configs"("tenantId");

ALTER TABLE "tenant_focus_nfe_configs"
  ADD CONSTRAINT "tenant_focus_nfe_configs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receivable_installments"
  ADD COLUMN "focusNfeRef" TEXT,
  ADD COLUMN "focusNfeStatus" TEXT,
  ADD COLUMN "focusNfeUrl" TEXT,
  ADD COLUMN "focusNfeDanfseUrl" TEXT,
  ADD COLUMN "focusNfeError" TEXT;

CREATE INDEX "receivable_installments_focus_ref_idx" ON "receivable_installments"("focusNfeRef");
