"use client";

import { CorporateExpenseTypesConfigPage } from "@/components/finance/CorporateExpenseTypesConfigPage";

export default function AdminTiposDespesaPage() {
  return <CorporateExpenseTypesConfigPage permission="configuracoes.financeiro.tiposDespesa" />;
}
