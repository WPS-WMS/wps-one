-- Cadastro da própria empresa (tenant) para notas de débito e invoices.
-- Colunas em camelCase (Prisma sem @map), alinhado ao restante do financeiro.

CREATE TABLE "tenant_company_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "razaoSocial" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "site" TEXT,
    "cnpj" TEXT,
    "ie" TEXT,
    "ieIsento" BOOLEAN NOT NULL DEFAULT false,
    "im" TEXT,
    "regimeTributario" TEXT,
    "cnae" TEXT,
    "cep" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "codigoMunicipio" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "pixKey" TEXT,
    "titularConta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_company_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_company_profiles_tenantId_key" ON "tenant_company_profiles"("tenantId");

ALTER TABLE "tenant_company_profiles"
  ADD CONSTRAINT "tenant_company_profiles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
