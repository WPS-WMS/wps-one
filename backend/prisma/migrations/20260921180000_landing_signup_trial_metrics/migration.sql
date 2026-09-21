-- Trial / cadastro landing + leads para métricas da plataforma
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "signupSource" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "employeeCountLabel" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "companyNeed" TEXT;

CREATE TABLE IF NOT EXISTS "landing_lead_requests" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "employees" TEXT,
  "need" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landing_lead_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "landing_lead_requests_kind_createdAt_idx" ON "landing_lead_requests"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "landing_lead_requests_createdAt_idx" ON "landing_lead_requests"("createdAt");
