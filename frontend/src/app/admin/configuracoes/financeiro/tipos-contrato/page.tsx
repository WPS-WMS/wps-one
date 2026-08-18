"use client";

import { ContractTypesConfigPage } from "@/components/finance/ContractTypesConfigPage";

export default function AdminFinanceiroTiposContratoPage() {
  return (
    <ContractTypesConfigPage permission="configuracoes.financeiro.tiposContrato" />
  );
}
