-- Performance indexes: user billing filters / addons + payable competenceDate
CREATE INDEX IF NOT EXISTS "users_tenant_ativo_role_idx" ON "users"("tenantId", "ativo", "role");
CREATE INDEX IF NOT EXISTS "users_tenant_updated_idx" ON "users"("tenantId", "updatedAt");
CREATE INDEX IF NOT EXISTS "users_tenant_addon_sharepoint_idx" ON "users"("tenantId", "addonSharepoint");
CREATE INDEX IF NOT EXISTS "users_tenant_addon_comercial_idx" ON "users"("tenantId", "addonComercial");
CREATE INDEX IF NOT EXISTS "users_tenant_addon_rh_idx" ON "users"("tenantId", "addonRh");
CREATE INDEX IF NOT EXISTS "payables_tenant_competence_idx" ON "payables"("tenantId", "competenceDate");
