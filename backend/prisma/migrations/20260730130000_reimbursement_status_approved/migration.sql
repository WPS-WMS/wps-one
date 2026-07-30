-- Status APPROVED passou a ser usado na aprovação (antes só IN_PROGRESS/REJECTED/PAID).
-- Sem isso, PATCH para APPROVED falha no CHECK e o botão "Aprovar" parece não fazer nada.

ALTER TABLE "reimbursements" DROP CONSTRAINT IF EXISTS "reimbursements_status_chk";

ALTER TABLE "reimbursements"
  ADD CONSTRAINT "reimbursements_status_chk"
  CHECK ("status" IN ('IN_PROGRESS', 'APPROVED', 'REJECTED', 'PAID'));
