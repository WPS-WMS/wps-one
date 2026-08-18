-- Multi usuário em categorias de fornecedor + vínculos N usuários por fornecedor

ALTER TABLE "supplier_categories"
ADD COLUMN IF NOT EXISTS "allowMultipleUsers" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "supplier_user_links" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_user_links_userId_key"
ON "supplier_user_links"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_user_links_supplier_user_uq"
ON "supplier_user_links"("supplierId", "userId");

CREATE INDEX IF NOT EXISTS "supplier_user_links_supplier_idx"
ON "supplier_user_links"("supplierId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_user_links_supplierId_fkey'
  ) THEN
    ALTER TABLE "supplier_user_links"
      ADD CONSTRAINT "supplier_user_links_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_user_links_userId_fkey'
  ) THEN
    ALTER TABLE "supplier_user_links"
      ADD CONSTRAINT "supplier_user_links_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Migra vínculo legado linkedUserId → supplier_user_links
INSERT INTO "supplier_user_links" ("id", "supplierId", "userId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), s."id", s."linkedUserId", CURRENT_TIMESTAMP
FROM "suppliers" s
WHERE s."linkedUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "supplier_user_links" l WHERE l."userId" = s."linkedUserId"
  );
