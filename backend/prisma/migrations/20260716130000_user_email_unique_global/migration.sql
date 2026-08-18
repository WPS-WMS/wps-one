-- E-mail único globalmente: um e-mail só pode pertencer a um tenant
DROP INDEX IF EXISTS "User_email_tenantId_key";
DROP INDEX IF EXISTS "users_email_tenantId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
