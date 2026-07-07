export type ClientFinancialFormState = {
  razaoSocial: string;
  ie: string;
  ieIsento: boolean;
  condicoesPagamento: string;
  prazoMedioPagamentoDias: string;
  moedaContrato: string;
  retencaoImpostos: string;
  dadosFaturamento: string;
  contatoFinNome: string;
  contatoFinEmail: string;
  contatoFinCel: string;
};

export const CLIENT_FINANCIAL_MOEDAS = ["BRL", "USD", "EUR"] as const;

export const emptyClientFinancialForm = (): ClientFinancialFormState => ({
  razaoSocial: "",
  ie: "",
  ieIsento: false,
  condicoesPagamento: "",
  prazoMedioPagamentoDias: "",
  moedaContrato: "BRL",
  retencaoImpostos: "",
  dadosFaturamento: "",
  contatoFinNome: "",
  contatoFinEmail: "",
  contatoFinCel: "",
});

type ApiFinancial = {
  razaoSocial?: string | null;
  ie?: string | null;
  ieIsento?: boolean;
  condicoesPagamento?: string | null;
  prazoMedioPagamentoDias?: number | null;
  moedaContrato?: string | null;
  retencaoImpostos?: string | null;
  dadosFaturamento?: string | null;
  contatoFinNome?: string | null;
  contatoFinEmail?: string | null;
  contatoFinCel?: string | null;
};

export function clientFinancialFromApi(f: ApiFinancial | null | undefined): ClientFinancialFormState {
  if (!f) return emptyClientFinancialForm();
  return {
    razaoSocial: f.razaoSocial ?? "",
    ie: f.ie ?? "",
    ieIsento: f.ieIsento ?? false,
    condicoesPagamento: f.condicoesPagamento ?? "",
    prazoMedioPagamentoDias:
      f.prazoMedioPagamentoDias != null ? String(f.prazoMedioPagamentoDias) : "",
    moedaContrato: f.moedaContrato || "BRL",
    retencaoImpostos: f.retencaoImpostos ?? "",
    dadosFaturamento: f.dadosFaturamento ?? "",
    contatoFinNome: f.contatoFinNome ?? "",
    contatoFinEmail: f.contatoFinEmail ?? "",
    contatoFinCel: f.contatoFinCel ?? "",
  };
}

export function clientFinancialFormToPayload(form: ClientFinancialFormState) {
  return {
    razaoSocial: form.razaoSocial.trim() || null,
    ie: form.ieIsento ? null : form.ie.trim() || null,
    ieIsento: form.ieIsento,
    condicoesPagamento: form.condicoesPagamento.trim() || null,
    prazoMedioPagamentoDias: form.prazoMedioPagamentoDias.trim() || null,
    moedaContrato: form.moedaContrato,
    retencaoImpostos: form.retencaoImpostos.trim() || null,
    dadosFaturamento: form.dadosFaturamento.trim() || null,
    contatoFinNome: form.contatoFinNome.trim() || null,
    contatoFinEmail: form.contatoFinEmail.trim() || null,
    contatoFinCel: form.contatoFinCel.trim() || null,
  };
}

export function hasClientFinancialInput(form: ClientFinancialFormState): boolean {
  return (
    form.razaoSocial.trim() !== "" ||
    form.ie.trim() !== "" ||
    form.ieIsento ||
    form.condicoesPagamento.trim() !== "" ||
    form.prazoMedioPagamentoDias.trim() !== "" ||
    form.moedaContrato !== "BRL" ||
    form.retencaoImpostos.trim() !== "" ||
    form.dadosFaturamento.trim() !== "" ||
    form.contatoFinNome.trim() !== "" ||
    form.contatoFinEmail.trim() !== "" ||
    form.contatoFinCel.trim() !== ""
  );
}
