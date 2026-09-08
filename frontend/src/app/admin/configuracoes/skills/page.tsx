"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function AdminSkillsPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.skills"
      apiPath="/api/skill-profiles"
      title="Skill"
      subtitle="Cadastre os perfis de skill usados no usuário e nas receitas variáveis do projeto."
      nameLabel="Nome do skill"
      allowEdit
    />
  );
}
