"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function AdminFinanceiroTiposReceitaPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.financeiro.tiposReceita"
      apiPath="/api/revenue-types"
      title="Tipos de receita"
      subtitle="Projeto fechado, T&M, suporte AMS, consultoria, desenvolvimento e demais classificações de receita."
      nameLabel="Tipo de receita"
      allowEdit
    />
  );
}
