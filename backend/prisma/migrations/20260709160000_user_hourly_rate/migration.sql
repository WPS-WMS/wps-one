-- Taxa hora por usuário para custo de operação no dashboard financeiro
ALTER TABLE "users" ADD COLUMN "hourlyRate" DOUBLE PRECISION;
