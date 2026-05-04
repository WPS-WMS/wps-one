-- Novo valor de tipo de projeto: Custos operacionais.
-- Bases legadas podem ter "tipoProjeto" como TEXT (aceita qualquer string).
-- Bases com enum PostgreSQL "TipoProjeto" precisam do novo membro.

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoProjeto') THEN
    BEGIN
      ALTER TYPE "TipoProjeto" ADD VALUE 'CUSTOS_OPERACIONAIS';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $migration$;
