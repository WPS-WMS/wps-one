/** Resposta relevante do ViaCEP para formulários de endereço. */
export type ViaCepAddress = {
  logradouro: string;
  /**
   * Metadado da faixa/lado da via (ex.: "lado ímpar") — NÃO é número do imóvel
   * nem o complemento de apartamento/sala. Não deve ir para o campo Número.
   */
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
};

/**
 * Busca endereço no ViaCEP.
 * O ViaCEP não retorna número do imóvel. O campo `complemento` da API é
 * observação da via e, na prática, não deve preencher Número nem Complemento
 * do formulário (deixe o usuário informar).
 */
export async function fetchViaCepAddress(cepDigits: string): Promise<ViaCepAddress | null> {
  const digits = String(cepDigits ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = (await res.json()) as {
    erro?: boolean;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    ibge?: string;
  };
  if (!data || data.erro) return null;
  return {
    logradouro: String(data.logradouro ?? "").trim(),
    complemento: String(data.complemento ?? "").trim(),
    bairro: String(data.bairro ?? "").trim(),
    localidade: String(data.localidade ?? "").trim(),
    uf: String(data.uf ?? "").trim().toUpperCase().slice(0, 2),
    ibge: String(data.ibge ?? "").replace(/\D/g, ""),
  };
}
