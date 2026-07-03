"use client";

import { ProjectBillingTypesConfigPage } from "@/components/finance/ProjectBillingTypesConfigPage";

export default function AdminFinanceiroTiposCobrancaPage() {
  return (
    <ProjectBillingTypesConfigPage permission="configuracoes.financeiro.tiposCobranca" />
  );
}
