-- Competência por parcela (coluna Data da planilha de receitas).
ALTER TABLE "receivable_installments"
ADD COLUMN "competenceDate" DATE;

CREATE INDEX "receivable_installments_receivable_competence_idx"
ON "receivable_installments"("receivableId", "competenceDate");
