-- Permite agrupamento de contas a pagar com centros de custo diferentes.
-- O CC do grupo fica null quando os membros têm CCs mistos; cada PayableAllocation permanece intacta.
ALTER TABLE "payable_billing_groups"
  ALTER COLUMN "costCenterId" DROP NOT NULL;
