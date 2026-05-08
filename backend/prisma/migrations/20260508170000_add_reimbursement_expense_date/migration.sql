-- Add expenseDate (DATE) to reimbursements
ALTER TABLE "reimbursements" ADD COLUMN IF NOT EXISTS "expenseDate" DATE;

