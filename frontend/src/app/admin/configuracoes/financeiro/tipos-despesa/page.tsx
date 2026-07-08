"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function AdminFinanceiroTiposDespesaPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.financeiro.tiposDespesa"
      apiPath="/api/corporate-expense-types"
      title="Tipos de despesas"
      subtitle="Infraestrutura, software, marketing, viagens, eventos, administrativo e demais despesas corporativas."
      nameLabel="Tipo de despesa"
      allowEdit
    />
  );
}
