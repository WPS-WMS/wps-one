-- Anexo obrigatório por tipo de reembolso (configurável em admin).
ALTER TABLE "reimbursement_types" ADD COLUMN IF NOT EXISTS "attachmentRequired" BOOLEAN NOT NULL DEFAULT false;
