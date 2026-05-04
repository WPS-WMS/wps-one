-- Marca projetos que devem aparecer no filtro "Operação" do Dashboard Daily.
ALTER TABLE "Project" ADD COLUMN "operacaoAtivo" BOOLEAN NOT NULL DEFAULT false;
