-- Campos de valor da categoria financeira na regra de recorrência,
-- espelhando os da conta a pagar avulsa.
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "hourRateCents" INTEGER;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "benefitCents" INTEGER;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "reimbursementCents" INTEGER;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "complementaryCents" INTEGER;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "interestFineCents" INTEGER;
