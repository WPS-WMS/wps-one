-- Marca projetos que devem aparecer no filtro "Operação" do Dashboard Daily.
-- Este arquivo existe para compatibilidade com histórico de migrações em alguns bancos.
ALTER TABLE "Project" ADD COLUMN "operacaoAtivo" BOOLEAN NOT NULL DEFAULT false;

