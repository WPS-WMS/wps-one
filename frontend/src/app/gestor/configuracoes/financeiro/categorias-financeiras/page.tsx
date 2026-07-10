"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function GestorFinanceiroCategoriasFinanceirasPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.financeiro.categoriasFinanceiras"
      apiPath="/api/financial-categories"
      title="Categorias financeiras"
      subtitle="Classificação de contas a pagar (ex.: Folha, Custo)."
      nameLabel="Categoria financeira"
      allowEdit
    />
  );
}
