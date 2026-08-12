-- Permite o mesmo usuário em vários fornecedores (remove unique em userId).
DROP INDEX IF EXISTS "supplier_user_links_userId_key";

CREATE INDEX IF NOT EXISTS "supplier_user_links_user_idx"
ON "supplier_user_links"("userId");
