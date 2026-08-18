"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function AdminFinanceiroCategoriasPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.financeiro.categorias"
      apiPath="/api/supplier-categories"
      title="Categorias de fornecedor"
      subtitle="Classifique fornecedores e parceiros. Valores padrão são criados automaticamente na primeira visita."
      nameLabel="Categoria"
      allowEdit
      showAllowMultipleUsers
    />
  );
}
