-- Marca projetos que devem aparecer no filtro "Operação" do Dashboard Daily.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "operacaoAtivo" BOOLEAN NOT NULL DEFAULT false;
