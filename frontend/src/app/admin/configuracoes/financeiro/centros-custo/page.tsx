"use client";

import { FinanceSimpleConfigPage } from "@/components/finance/FinanceSimpleConfigPage";

export default function AdminFinanceiroCentrosCustoPage() {
  return (
    <FinanceSimpleConfigPage
      permission="configuracoes.financeiro.centrosCusto"
      apiPath="/api/cost-centers"
      title="Centros de custo"
      subtitle="Separe financeiramente as áreas da empresa. Valores padrão são criados automaticamente na primeira visita."
      nameLabel="Centro de custo"
      showCode
    />
  );
}
