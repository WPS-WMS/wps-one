/**
 * Cliente HTTP mínimo para Focus NFe — NFSe Nacional (`/v2/nfsen`).
 * Docs: https://doc.focusnfe.com.br / SDK nfse-nacional
 */

export type FocusNfeEnvironment = "HOMOLOGACAO" | "PRODUCAO";

export type FocusNfseNacionalStatus =
  | "processando_autorizacao"
  | "autorizado"
  | "erro_autorizacao"
  | "cancelado"
  | string;

export type FocusNfseNacionalCreateParams = {
  data_emissao: string;
  data_competencia?: string;
  codigo_municipio_emissora: string | number;
  cnpj_prestador: string;
  inscricao_municipal_prestador?: string;
  /** opSimpNac: 1 Não optante | 2 MEI | 3 ME/EPP */
  codigo_opcao_simples_nacional?: string | number;
  /** regApTribSN — obrigatório no XML quando optante pelo SN (2 ou 3) */
  regime_tributario_simples_nacional?: string | number;
  /** regEspTrib — 0 Nenhum (obrigatório no layout Focus quando não há regApTribSN) */
  regime_especial_tributacao?: string | number;
  cpf_tomador?: string;
  cnpj_tomador?: string;
  razao_social_tomador?: string;
  codigo_municipio_tomador?: string | number;
  cep_tomador?: string;
  logradouro_tomador?: string;
  numero_tomador?: string;
  complemento_tomador?: string;
  bairro_tomador?: string;
  telefone_tomador?: string;
  email_tomador?: string;
  codigo_municipio_prestacao?: string | number;
  codigo_tributacao_nacional_iss?: string;
  descricao_servico: string;
  valor_servico: number | string;
  tributacao_iss?: string | number;
  tipo_retencao_iss?: string | number;
  /** indTotTrib — preenche totTrib no XML (0 = não informar valores estimados) */
  indicador_total_tributacao?: string | number;
  percentual_total_tributos_federais?: number | string;
  percentual_total_tributos_estaduais?: number | string;
  percentual_total_tributos_municipais?: number | string;
  percentual_total_tributos_simples_nacional?: number | string;
  valor_total_tributos_federais?: number | string;
  valor_total_tributos_estaduais?: number | string;
  valor_total_tributos_municipais?: number | string;
};

export type FocusNfseNacionalResponse = {
  cnpj_prestador?: string;
  ref?: string;
  status: FocusNfseNacionalStatus;
  numero?: string;
  numero_rps?: string;
  serie_rps?: string;
  tipo_rps?: string;
  codigo_verificacao?: string;
  data_emissao?: string;
  url?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  erros?: Array<{ codigo?: string; mensagem?: string; message?: string }>;
  mensagem?: string;
};

function baseUrl(environment: FocusNfeEnvironment): string {
  return environment === "PRODUCAO"
    ? "https://api.focusnfe.com.br/v2"
    : "https://homologacao.focusnfe.com.br/v2";
}

function authHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

export class FocusNfeHttpError extends Error {
  statusCode: number;
  body: unknown;

  constructor(statusCode: number, message: string, body: unknown) {
    super(message);
    this.name = "FocusNfeHttpError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const o = body as Record<string, unknown>;
  if (typeof o.mensagem === "string" && o.mensagem.trim()) return o.mensagem;
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  if (typeof o.error === "string" && o.error.trim()) return o.error;
  if (typeof o.erro === "string" && o.erro.trim()) return o.erro;
  if (Array.isArray(o.erros) && o.erros.length > 0) {
    const parts = o.erros.map((e) => {
      if (!e || typeof e !== "object") return String(e);
      const err = e as Record<string, unknown>;
      return String(err.mensagem ?? err.message ?? err.codigo ?? JSON.stringify(e));
    });
    return parts.join("; ");
  }
  if (Array.isArray(o.errors) && o.errors.length > 0) {
    const parts = o.errors.map((e) => {
      if (!e || typeof e !== "object") return String(e);
      const err = e as Record<string, unknown>;
      return String(err.mensagem ?? err.message ?? err.code ?? JSON.stringify(e));
    });
    return parts.join("; ");
  }
  try {
    const json = JSON.stringify(body);
    if (json && json !== "{}" && json.length < 500) return `${fallback} Detalhe: ${json}`;
  } catch {
    /* ignore */
  }
  return fallback;
}

export async function createNfseNacional(params: {
  token: string;
  environment: FocusNfeEnvironment;
  ref: string;
  payload: FocusNfseNacionalCreateParams;
}): Promise<FocusNfseNacionalResponse> {
  const url = `${baseUrl(params.environment)}/nfsen?ref=${encodeURIComponent(params.ref)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(params.token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params.payload),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeHttpError(
      res.status,
      errorMessageFromBody(body, `Focus NFe recusou a emissão (HTTP ${res.status}).`),
      body,
    );
  }
  return body as FocusNfseNacionalResponse;
}

export async function getNfseNacional(params: {
  token: string;
  environment: FocusNfeEnvironment;
  ref: string;
  completa?: boolean;
}): Promise<FocusNfseNacionalResponse> {
  const q = params.completa ? "?completa=1" : "";
  const url = `${baseUrl(params.environment)}/nfsen/${encodeURIComponent(params.ref)}${q}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(params.token),
      Accept: "application/json",
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeHttpError(
      res.status,
      errorMessageFromBody(body, `Focus NFe: falha ao consultar NFSe (HTTP ${res.status}).`),
      body,
    );
  }
  return body as FocusNfseNacionalResponse;
}

/** DELETE /v2/nfsen/{ref} — só notas com status autorizado. */
export async function cancelNfseNacional(params: {
  token: string;
  environment: FocusNfeEnvironment;
  ref: string;
  justificativa?: string;
}): Promise<FocusNfseNacionalResponse> {
  const url = `${baseUrl(params.environment)}/nfsen/${encodeURIComponent(params.ref)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: authHeader(params.token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      justificativa: params.justificativa?.trim() || "Cancelamento solicitado pelo emitente",
    }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeHttpError(
      res.status,
      errorMessageFromBody(body, `Focus NFe: falha ao cancelar NFSe (HTTP ${res.status}).`),
      body,
    );
  }
  const parsed = body as FocusNfseNacionalResponse;
  if (String(parsed.status ?? "") === "erro_cancelamento") {
    throw new FocusNfeHttpError(
      400,
      errorMessageFromBody(body, "Focus NFe: erro ao cancelar a NFSe."),
      body,
    );
  }
  return parsed;
}

export type FocusEmpresa = {
  id?: number;
  nome?: string;
  cnpj?: string;
  cpf?: string;
  inscricao_municipal?: string;
  codigo_municipio?: string;
  municipio?: string;
  habilita_nfsen_homologacao?: boolean;
  habilita_nfsen_producao?: boolean;
  regime_tributario?: string;
};

export type ListFocusEmpresasResult = {
  empresas: FocusEmpresa[];
  /** Token de empresa costuma receber 404 em GET /empresas — não indica token inválido. */
  listUnavailable: boolean;
  listStatus: number | null;
};

/** GET /v2/empresas — dados do prestador já cadastrados na Focus. */
export async function listFocusEmpresas(params: {
  token: string;
  environment: FocusNfeEnvironment;
}): Promise<ListFocusEmpresasResult> {
  const url = `${baseUrl(params.environment)}/empresas`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(params.token),
      Accept: "application/json",
    },
  });
  const body = await parseJson(res);
  // Token de empresa: a Focus responde 404 em /empresas. Isso é esperado.
  if (res.status === 404) {
    return { empresas: [], listUnavailable: true, listStatus: 404 };
  }
  if (!res.ok) {
    throw new FocusNfeHttpError(
      res.status,
      errorMessageFromBody(body, `Focus NFe: falha ao listar empresas (HTTP ${res.status}).`),
      body,
    );
  }
  return {
    empresas: Array.isArray(body) ? (body as FocusEmpresa[]) : [],
    listUnavailable: false,
    listStatus: res.status,
  };
}

export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function maskToken(token: string | null | undefined): string | null {
  const t = String(token ?? "").trim();
  if (!t) return null;
  if (t.length <= 4) return "••••";
  return `••••${t.slice(-4)}`;
}
