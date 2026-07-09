-- Vincula receita de projeto ao tipo de imposto cadastrado em Configurações.

ALTER TABLE "project_revenues"
ADD COLUMN IF NOT EXISTS "taxTypeId" TEXT;

CREATE INDEX IF NOT EXISTS "project_revenues_tax_type_idx"
ON "project_revenues"("taxTypeId");

DO $$ BEGIN
  ALTER TABLE "project_revenues"
  ADD CONSTRAINT "project_revenues_taxTypeId_fkey"
  FOREIGN KEY ("taxTypeId") REFERENCES "tax_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
