-- Acelera DELETE/checks de FK em plano de contas (antes: seq scan em CP/CR).
CREATE INDEX IF NOT EXISTS "payables_financial_account_idx"
ON "payables"("financialAccountId");

CREATE INDEX IF NOT EXISTS "receivables_financial_account_idx"
ON "receivables"("financialAccountId");

CREATE INDEX IF NOT EXISTS "payable_recurrence_financial_account_idx"
ON "payable_recurrence_rules"("financialAccountId");

CREATE INDEX IF NOT EXISTS "receivable_recurrence_financial_account_idx"
ON "receivable_recurrence_rules"("financialAccountId");
