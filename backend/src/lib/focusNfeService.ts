import { prisma } from "./prisma.js";
import {
  cancelNfseNacional,
  createNfseNacional,
  FocusNfeHttpError,
  getNfseNacional,
  listFocusEmpresas,
  onlyDigits,
  type FocusEmpresa,
  type FocusNfeEnvironment,
  type FocusNfseNacionalCreateParams,
  type FocusNfseNacionalResponse,
} from "./focusNfeClient.js";
import { upsertNfseEmissionAttempt } from "./focusNfeEmissionAttempts.js";
import { issueInvoice } from "./receivableService.js";
import { deriveReceivableStatus } from "./receivableHelpers.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";

export type FocusNfeConfigRow = {
  id: string;
  tenantId: string;
  enabled: boolean;
  environment: FocusNfeEnvironment;
  tokenHomologacao: string | null;
  tokenProducao: string | null;
  cnpjPrestador: string | null;
  inscricaoMunicipalPrestador: string | null;
  codigoMunicipioEmissora: string | null;
  codigoTributacaoNacionalIss: string | null;
  codigosTributacaoIss: string | null;
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
  serieDpsHomologacao: number;
  proximoNumeroDpsHomologacao: number;
  serieDpsProducao: number;
  proximoNumeroDpsProducao: number;
  webhookSecret: string | null;
  webhookHookId: string | null;
  webhookHookEnvironment: string | null;
};

function asEnv(raw: string | null | undefined): FocusNfeEnvironment {
  return String(raw ?? "").toUpperCase() === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
}

export async function getFocusNfeConfig(tenantId: string): Promise<FocusNfeConfigRow | null> {
  const row = await prisma.tenantFocusNfeConfig.findUnique({ where: { tenantId } });
  if (!row) return null;
  return {
    ...row,
    environment: asEnv(row.environment),
  };
}

export function resolveFocusToken(config: FocusNfeConfigRow): string | null {
  const token =
    config.environment === "PRODUCAO" ? config.tokenProducao : config.tokenHomologacao;
  const t = String(token ?? "").trim();
  return t || null;
}

export function parseIssCodeList(...rawParts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawParts) {
    for (const part of String(raw ?? "").split(/[,;\n]+/)) {
      const code = part.trim().replace(/\s+/g, "");
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/**
 * NBS (9 dígitos, sem pontos) correlacionado ao item ISS nacional (Anexo VIII).
 * O ADN exige cNBS quando a DPS declara IBS/CBS.
 */
const NBS_BY_ISS: Record<string, string> = {
  // 01.05 licenciamento de software → 1.1103.22.00
  "010501": "111032200",
  // 01.06 consultoria em informática → 1.1501.10.00
  "010601": "115011000",
  // 01.07 suporte técnico em informática → 1.1501.30.00
  "010701": "115013000",
  // 01.08 páginas eletrônicas → 1.1502.30.00
  "010801": "115023000",
};

export function resolveCodigoNbs(codigoIss: string): string | null {
  const key = onlyDigits(codigoIss).padStart(6, "0").slice(0, 6);
  return NBS_BY_ISS[key] ?? null;
}

/** Reserva atomicamente o próximo nDPS do ambiente ativo. */
export async function consumeNextDpsNumber(
  tenantId: string,
  environment: FocusNfeEnvironment,
): Promise<{ serie: number; numero: number }> {
  const isProd = environment === "PRODUCAO";
  const updated = await prisma.tenantFocusNfeConfig.update({
    where: { tenantId },
    data: isProd
      ? { proximoNumeroDpsProducao: { increment: 1 } }
      : { proximoNumeroDpsHomologacao: { increment: 1 } },
    select: {
      serieDpsHomologacao: true,
      proximoNumeroDpsHomologacao: true,
      serieDpsProducao: true,
      proximoNumeroDpsProducao: true,
    },
  });
  const serieRaw = isProd ? updated.serieDpsProducao : updated.serieDpsHomologacao;
  const numeroRaw = isProd
    ? updated.proximoNumeroDpsProducao
    : updated.proximoNumeroDpsHomologacao;
  const serie = Math.min(49999, Math.max(1, serieRaw || 1));
  const numero = Math.max(1, (numeroRaw || 1) - 1);
  return { serie, numero };
}

export function resolveIssCodeOptions(config: FocusNfeConfigRow): {
  defaultCode: string | null;
  options: string[];
} {
  const options = parseIssCodeList(config.codigosTributacaoIss, config.codigoTributacaoNacionalIss);
  const defaultCode =
    String(config.codigoTributacaoNacionalIss ?? "").trim() || options[0] || null;
  if (defaultCode && !options.includes(defaultCode)) {
    options.unshift(defaultCode);
  }
  return { defaultCode, options };
}

/** Só o essencial: token + ISS + CNPJ/município (token de empresa não acessa GET /empresas). */
export function focusConfigReadyErrors(config: FocusNfeConfigRow | null): string[] {
  if (!config) return ["Configure a Focus NFe em Configurações > Financeiro > Focus NFe."];
  if (!config.enabled) return ["A integração Focus NFe está desativada para este tenant."];
  const errors: string[] = [];
  if (!resolveFocusToken(config)) {
    errors.push(
      config.environment === "PRODUCAO"
        ? "Informe o token de produção da Focus NFe."
        : "Informe o token de homologação da Focus NFe.",
    );
  }
  const { defaultCode, options } = resolveIssCodeOptions(config);
  if (!defaultCode && options.length === 0) {
    errors.push("Informe ao menos um código de tributação nacional ISS.");
  }
  const cnpj = onlyDigits(config.cnpjPrestador);
  if (!cnpj || (cnpj.length !== 14 && cnpj.length !== 11)) {
    errors.push("Informe o CNPJ (ou CPF) do prestador.");
  }
  if (!String(config.codigoMunicipioEmissora ?? "").trim()) {
    errors.push("Informe o código IBGE do município emissor.");
  }
  const simples = String(config.codigoOpcaoSimplesNacional ?? "").trim();
  if (!simples || !["1", "2", "3"].includes(simples)) {
    errors.push(
      "Informe a opção do Simples Nacional (1 = Não optante, 2 = MEI, 3 = ME/EPP).",
    );
  }
  return errors;
}

export type ResolvedPrestador = {
  cnpjPrestador: string;
  inscricaoMunicipalPrestador: string | null;
  codigoMunicipioEmissora: string;
  empresaNome: string | null;
  fromFocus: boolean;
  empresasListSkipped?: boolean;
  empresasListNote?: string | null;
};

export async function resolvePrestadorFromFocus(
  config: FocusNfeConfigRow,
): Promise<{ ok: true; prestador: ResolvedPrestador } | { ok: false; error: string }> {
  const token = resolveFocusToken(config);
  if (!token) return { ok: false, error: "Token Focus NFe não configurado." };

  let empresa: FocusEmpresa | null = null;
  let listUnavailable = false;
  let empresasListNote: string | null = null;
  try {
    const listed = await listFocusEmpresas({ token, environment: config.environment });
    empresa = listed.empresas[0] ?? null;
    listUnavailable = listed.listUnavailable;
    if (listUnavailable) {
      empresasListNote =
        "A Focus não lista empresas com este token (HTTP 404 — normal para token de empresa). Usando CNPJ e município salvos no WPS One.";
    }
  } catch (error) {
    // Outros erros de /empresas (401/403 etc.) — ainda tentamos com CNPJ/município locais.
    listUnavailable = true;
    empresasListNote =
      error instanceof Error
        ? error.message
        : "Não foi possível listar empresas na Focus NFe.";
    if (error instanceof FocusNfeHttpError && (error.statusCode === 401 || error.statusCode === 403)) {
      return {
        ok: false,
        error: "Token Focus NFe rejeitado (não autorizado). Confira o token do ambiente ativo.",
      };
    }
  }

  const cnpj =
    onlyDigits(config.cnpjPrestador) ||
    onlyDigits(empresa?.cnpj) ||
    onlyDigits(empresa?.cpf);
  const municipio =
    String(config.codigoMunicipioEmissora ?? "").trim() ||
    String(empresa?.codigo_municipio ?? "").trim();
  const im =
    String(config.inscricaoMunicipalPrestador ?? "").trim() ||
    String(empresa?.inscricao_municipal ?? "").trim() ||
    null;

  if (!cnpj || (cnpj.length !== 14 && cnpj.length !== 11)) {
    return {
      ok: false,
      error: listUnavailable
        ? "Token aceito, mas a Focus não devolveu o CNPJ via /empresas. Informe o CNPJ do prestador na configuração."
        : "Informe o CNPJ (ou CPF) do prestador na configuração Focus NFe.",
    };
  }
  if (!municipio) {
    return {
      ok: false,
      error: listUnavailable
        ? "Token aceito, mas a Focus não devolveu o município via /empresas. Informe o código IBGE do município emissor."
        : "Informe o código IBGE do município emissor na configuração Focus NFe.",
    };
  }

  if (config.environment === "HOMOLOGACAO" && empresa && empresa.habilita_nfsen_homologacao === false) {
    return {
      ok: false,
      error: "NFSe Nacional (homologação) não está habilitada na empresa da Focus.",
    };
  }
  if (config.environment === "PRODUCAO" && empresa && empresa.habilita_nfsen_producao === false) {
    return {
      ok: false,
      error: "NFSe Nacional (produção) não está habilitada na empresa da Focus.",
    };
  }

  return {
    ok: true,
    prestador: {
      cnpjPrestador: cnpj,
      inscricaoMunicipalPrestador: im,
      codigoMunicipioEmissora: municipio,
      empresaNome: empresa?.nome?.trim() || null,
      fromFocus: Boolean(empresa),
      empresasListSkipped: listUnavailable,
      empresasListNote,
    },
  };
}

function brazilOffsetIso(date = new Date()): string {
  // Relógio do Render é UTC. Pegar getHours() e colar -03:00 adianta dhEmi em 3h
  // (rejeição E0008: emissão posterior ao processamento no ADN).
  // 60s de folga evita relógio do host um pouco à frente do Sistema Nacional.
  const safe = new Date(date.getTime() - 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(safe);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

function competenceIsoDate(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString().slice(0, 10);
}

function formatFocusErrors(resp: FocusNfseNacionalResponse): string {
  if (resp.erros?.length) {
    return resp.erros
      .map((e) => String(e.mensagem ?? e.message ?? e.codigo ?? "erro"))
      .join("; ");
  }
  return resp.mensagem?.trim() || "Erro na autorização da NFSe na Focus NFe.";
}

async function applyAuthorizedFocusResult(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId: string;
  response: FocusNfseNacionalResponse;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const nfNumber = String(params.response.numero ?? "").trim();
  if (!nfNumber) {
    return { ok: false, error: "Focus autorizou a nota, mas não retornou o número." };
  }
  let emissionDate = new Date();
  if (params.response.data_emissao) {
    const parsed = new Date(params.response.data_emissao);
    if (!Number.isNaN(parsed.getTime())) emissionDate = parsed;
  }
  const installment = await prisma.receivableInstallment.findFirst({
    where: { id: params.installmentId, receivableId: params.receivableId },
    select: { amountCents: true },
  });
  if (!installment) return { ok: false, error: "Parcela não encontrada." };

  const issued = await issueInvoice(
    params.tenantId,
    params.userId,
    params.receivableId,
    {
      nfNumber,
      nfSeries: params.response.serie_rps ?? null,
      emissionDate,
      grossAmountCents: installment.amountCents,
      netAmountCents: installment.amountCents,
      taxAmountCents: 0,
      retentionAmountCents: 0,
    },
    { installmentId: params.installmentId },
  );
  if (!issued.ok) return issued;

  await prisma.receivableInstallment.update({
    where: { id: params.installmentId },
    data: {
      focusNfeStatus: "autorizado",
      focusNfeUrl: params.response.url ?? null,
      focusNfeDanfseUrl: params.response.url_danfse ?? null,
      focusNfeError: null,
    },
  });
  return { ok: true };
}

export async function syncFocusNfseStatus(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId: string;
}): Promise<
  | {
      ok: true;
      focusNfeStatus: string | null;
      nfNumber: string | null;
      focusNfeError: string | null;
      focusNfeUrl: string | null;
      focusNfeDanfseUrl: string | null;
    }
  | { ok: false; error: string }
> {
  const config = await getFocusNfeConfig(params.tenantId);
  const token = config ? resolveFocusToken(config) : null;
  if (!config || !token) {
    return { ok: false, error: "Focus NFe não configurada." };
  }

  const installment = await prisma.receivableInstallment.findFirst({
    where: { id: params.installmentId, receivableId: params.receivableId },
    select: {
      id: true,
      nfNumber: true,
      focusNfeRef: true,
      focusNfeStatus: true,
      focusNfeUrl: true,
      focusNfeDanfseUrl: true,
      focusNfeError: true,
    },
  });
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (!installment.focusNfeRef) {
    return {
      ok: true,
      focusNfeStatus: installment.focusNfeStatus,
      nfNumber: installment.nfNumber,
      focusNfeError: installment.focusNfeError,
      focusNfeUrl: installment.focusNfeUrl,
      focusNfeDanfseUrl: installment.focusNfeDanfseUrl,
    };
  }

  if (installment.focusNfeStatus === "autorizado" && installment.nfNumber) {
    return {
      ok: true,
      focusNfeStatus: installment.focusNfeStatus,
      nfNumber: installment.nfNumber,
      focusNfeError: null,
      focusNfeUrl: installment.focusNfeUrl,
      focusNfeDanfseUrl: installment.focusNfeDanfseUrl,
    };
  }

  try {
    const response = await getNfseNacional({
      token,
      environment: config.environment,
      ref: installment.focusNfeRef,
    });
    const status = String(response.status ?? "").trim() || "processando_autorizacao";

    if (status === "autorizado") {
      if (!installment.nfNumber) {
        const applied = await applyAuthorizedFocusResult({
          tenantId: params.tenantId,
          userId: params.userId,
          receivableId: params.receivableId,
          installmentId: params.installmentId,
          response,
        });
        if (applied.ok === false) return { ok: false, error: applied.error };
      } else {
        await prisma.receivableInstallment.update({
          where: { id: installment.id },
          data: {
            focusNfeStatus: "autorizado",
            focusNfeUrl: response.url ?? installment.focusNfeUrl,
            focusNfeDanfseUrl: response.url_danfse ?? installment.focusNfeDanfseUrl,
            focusNfeError: null,
          },
        });
      }
    } else if (status === "erro_autorizacao") {
      await prisma.receivableInstallment.update({
        where: { id: installment.id },
        data: {
          focusNfeStatus: "erro_autorizacao",
          focusNfeError: formatFocusErrors(response),
        },
      });
    } else {
      await prisma.receivableInstallment.update({
        where: { id: installment.id },
        data: {
          focusNfeStatus: status,
          focusNfeUrl: response.url ?? null,
          focusNfeDanfseUrl: response.url_danfse ?? null,
        },
      });
    }

    const updated = await prisma.receivableInstallment.findFirst({
      where: { id: installment.id },
      select: {
        nfNumber: true,
        focusNfeStatus: true,
        focusNfeError: true,
        focusNfeUrl: true,
        focusNfeDanfseUrl: true,
        focusNfeRef: true,
      },
    });

    if (updated?.focusNfeRef) {
      await upsertNfseEmissionAttempt({
        tenantId: params.tenantId,
        receivableId: params.receivableId,
        installmentId: params.installmentId,
        focusNfeRef: updated.focusNfeRef,
        environment: config.environment,
        status: updated.focusNfeStatus ?? status,
        source: "SYNC",
        createdById: params.userId,
        nfNumber: updated.nfNumber,
        focusNfeUrl: updated.focusNfeUrl,
        focusNfeDanfseUrl: updated.focusNfeDanfseUrl,
        errorMessage: updated.focusNfeError,
      });
    }

    return {
      ok: true,
      focusNfeStatus: updated?.focusNfeStatus ?? status,
      nfNumber: updated?.nfNumber ?? null,
      focusNfeError: updated?.focusNfeError ?? null,
      focusNfeUrl: updated?.focusNfeUrl ?? null,
      focusNfeDanfseUrl: updated?.focusNfeDanfseUrl ?? null,
    };
  } catch (error) {
    if (error instanceof FocusNfeHttpError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao consultar Focus NFe.",
    };
  }
}

export async function buildEmitInvoicePreview(params: {
  tenantId: string;
  receivableId: string;
  installmentId?: string | null;
}): Promise<
  | {
      ok: true;
      preview: {
        provider: "FOCUS_NFE" | "PROVISORIA";
        receivableId: string;
        installmentId: string;
        environment: FocusNfeEnvironment | null;
        clientName: string;
        tomadorDocumento: string;
        tomadorRazaoSocial: string;
        description: string;
        amountCents: number;
        amountFormatted: string;
        competenceDate: string | null;
        codigoTributacaoNacionalIss: string | null;
        codigosTributacaoIssOptions: string[];
        codigoMunicipioEmissora: string | null;
        cnpjPrestador: string | null;
        warnings: string[];
      };
    }
  | { ok: false; error: string }
> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: {
      client: {
        include: { financial: true },
      },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const installmentId =
    params.installmentId?.trim() ||
    (receivable.installments.length === 1 ? receivable.installments[0]!.id : null);
  if (!installmentId) {
    return { ok: false, error: "Selecione a parcela para emitir a nota." };
  }
  const installment = receivable.installments.find((i) => i.id === installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.nfNumber) return { ok: false, error: "Nota já emitida" };
  if (installment.focusNfeStatus === "processando_autorizacao") {
    return { ok: false, error: "Já existe uma emissão em processamento nesta parcela." };
  }
  if (installment.status === "RECEBIDO") return { ok: false, error: "Parcela já recebida." };
  if (installment.status === "CANCELADO") return { ok: false, error: "Parcela cancelada." };

  const client = receivable.client;
  const config = await getFocusNfeConfig(params.tenantId);
  const focusErrors = focusConfigReadyErrors(config);
  const useFocus = Boolean(config?.enabled) && focusErrors.length === 0;

  if (config?.enabled && focusErrors.length > 0) {
    return { ok: false, error: focusErrors[0]! };
  }

  const warnings: string[] = [];
  const doc = onlyDigits(client.cnpj);
  let cnpjPrestador: string | null = null;
  let codigoMunicipioEmissora: string | null = null;

  if (useFocus && config) {
    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      return {
        ok: false,
        error: "Cliente sem CPF/CNPJ válido. Atualize o cadastro do cliente antes de emitir.",
      };
    }
    const prestador = await resolvePrestadorFromFocus(config);
    if (prestador.ok === false) return { ok: false, error: prestador.error };
    cnpjPrestador = prestador.prestador.cnpjPrestador;
    codigoMunicipioEmissora = prestador.prestador.codigoMunicipioEmissora;
    if (prestador.prestador.fromFocus) {
      warnings.push(
        `Prestador obtido da Focus${prestador.prestador.empresaNome ? `: ${prestador.prestador.empresaNome}` : ""}.`,
      );
    }
    if (!client.endereco || !client.cidade || !client.cep) {
      warnings.push("Endereço do cliente incompleto — a prefeitura pode recusar a nota.");
    }
  } else {
    warnings.push(
      "Focus NFe desativada: será gerada uma NF provisória no sistema (sem envio à Focus).",
    );
  }

  const descricaoServico =
    (useFocus ? String(config?.descricaoServicoPadrao ?? "").trim() : "") ||
    receivable.description.trim() ||
    "Serviços prestados";

  const iss = useFocus && config ? resolveIssCodeOptions(config) : { defaultCode: null, options: [] as string[] };

  return {
    ok: true,
    preview: {
      provider: useFocus ? "FOCUS_NFE" : "PROVISORIA",
      receivableId: receivable.id,
      installmentId: installment.id,
      environment: useFocus && config ? config.environment : null,
      clientName: client.name,
      tomadorDocumento: doc || "—",
      tomadorRazaoSocial: client.financial?.razaoSocial?.trim() || client.name,
      description: receivable.description.trim() || "Serviços prestados",
      descricaoServico,
      amountCents: installment.amountCents,
      amountFormatted: formatCentsToBrl(installment.amountCents),
      competenceDate: competenceIsoDate(receivable.competenceDate),
      codigoTributacaoNacionalIss: iss.defaultCode,
      codigosTributacaoIssOptions: iss.options,
      codigoMunicipioEmissora,
      cnpjPrestador,
      warnings,
    },
  };
}

export async function emitFocusNfseNacional(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId?: string | null;
  codigoTributacaoNacionalIss?: string | null;
  descricaoServico?: string | null;
}): Promise<
  | {
      ok: true;
      focusNfeStatus: string;
      focusNfeRef: string;
      nfNumber: string | null;
      focusNfeError: string | null;
      environment: FocusNfeEnvironment;
    }
  | { ok: false; error: string }
> {
  const preview = await buildEmitInvoicePreview(params);
  if (preview.ok === false) return { ok: false, error: preview.error };

  const config = await getFocusNfeConfig(params.tenantId);
  const token = config ? resolveFocusToken(config) : null;
  if (!config || !token) {
    return { ok: false, error: "Focus NFe não configurada." };
  }

  const iss = resolveIssCodeOptions(config);
  const requestedIss = String(params.codigoTributacaoNacionalIss ?? "").trim();
  const codigoIss = requestedIss || iss.defaultCode || "";
  if (!codigoIss) {
    return { ok: false, error: "Informe o código de tributação nacional ISS." };
  }
  if (iss.options.length > 0 && !iss.options.includes(codigoIss)) {
    return {
      ok: false,
      error: `Código ISS "${codigoIss}" não está na lista configurada (${iss.options.join(", ")}).`,
    };
  }
  const codigoNbs = resolveCodigoNbs(codigoIss);
  if (!codigoNbs) {
    return {
      ok: false,
      error: `Não há NBS mapeado para o ISS ${codigoIss}. O ADN exige cNBS quando a DPS informa IBS/CBS.`,
    };
  }

  const installment = await prisma.receivableInstallment.findFirst({
    where: { id: preview.preview.installmentId },
  });
  if (!installment) return { ok: false, error: "Parcela não encontrada." };

  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: { client: { include: { financial: true } } },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };

  const client = receivable.client;
  const doc = onlyDigits(client.cnpj);
  const prestador = await resolvePrestadorFromFocus(config);
  if (prestador.ok === false) return { ok: false, error: prestador.error };

  const refBase = `wps-${installment.id}`;
  const ref =
    installment.focusNfeStatus === "erro_autorizacao" ||
    installment.focusNfeStatus === "cancelado"
      ? `${refBase}-${Date.now()}`
      : installment.focusNfeRef || refBase;

  const cepTomador = onlyDigits(client.cep);
  const logradouroTomador = client.endereco?.trim() || "";
  const numeroTomador = client.numero?.trim() || "";
  const bairroTomador = client.bairro?.trim() || "";
  // Focus: se informar logradouro, exige endereço completo — só envia bloco se estiver ok.
  const tomadorEnderecoCompleto = Boolean(
    cepTomador && logradouroTomador && numeroTomador && bairroTomador,
  );
  const codigoMunicipioEmissora = prestador.prestador.codigoMunicipioEmissora;
  // Cliente ainda não tem IBGE próprio; com endereço completo usamos o município do prestador
  // (obrigatório no XML nacional: cMun antes de CEP). Ajuste fino depois via cadastro do cliente.
  const codigoMunicipioTomador = tomadorEnderecoCompleto
    ? codigoMunicipioEmissora
    : undefined;
  const codigoSimples = String(config.codigoOpcaoSimplesNacional ?? "").trim();
  const optanteSimples = codigoSimples === "2" || codigoSimples === "3";
  const dps = await consumeNextDpsNumber(params.tenantId, config.environment);

  const payload: FocusNfseNacionalCreateParams = {
    data_emissao: brazilOffsetIso(),
    data_competencia: competenceIsoDate(receivable.competenceDate),
    emitente_dps: 1, // Prestador
    serie_dps: dps.serie,
    numero_dps: dps.numero,
    codigo_municipio_emissora: codigoMunicipioEmissora,
    cnpj_prestador: prestador.prestador.cnpjPrestador,
    inscricao_municipal_prestador:
      prestador.prestador.inscricaoMunicipalPrestador || undefined,
    // regTrib — EmissaoDPSXml: opSimpNac + regEspTrib obrigatórios; regApTribSN se SN
    codigo_opcao_simples_nacional: codigoSimples,
    regime_especial_tributacao: 0, // 0 = Nenhum
    ...(optanteSimples
      ? {
          // 1 = tributos federais e municipal pelo SN
          regime_tributario_simples_nacional: 1,
        }
      : {}),
    ...(doc.length === 11 ? { cpf_tomador: doc } : { cnpj_tomador: doc }),
    razao_social_tomador: client.financial?.razaoSocial?.trim() || client.name,
    email_tomador: client.email?.trim() || undefined,
    telefone_tomador: onlyDigits(client.telefone) || undefined,
    ...(tomadorEnderecoCompleto
      ? {
          codigo_municipio_tomador: codigoMunicipioTomador,
          cep_tomador: cepTomador,
          logradouro_tomador: logradouroTomador,
          numero_tomador: numeroTomador,
          complemento_tomador: client.complemento?.trim() || undefined,
          bairro_tomador: bairroTomador,
        }
      : {}),
    // locPrest — município da prestação (default = emissor)
    codigo_municipio_prestacao: codigoMunicipioEmissora,
    codigo_tributacao_nacional_iss: codigoIss,
    codigo_nbs: codigoNbs,
    descricao_servico: (
      String(params.descricaoServico ?? "").trim() ||
      preview.preview.descricaoServico ||
      preview.preview.description
    ).slice(0, 1000),
    valor_servico: Number((installment.amountCents / 100).toFixed(2)),
    // tribMun
    tributacao_iss: 1, // 1 = Operação tributável
    tipo_retencao_iss: 1, // 1 = Não retido
    // trib/totTrib — XSD exige tribFed OU totTrib; indTotTrib=0 = não informar estimados
    indicador_total_tributacao: 0,
    // Reforma tributária (EmissaoDPSXml — tags obrigatórias)
    finalidade_emissao: 0, // NFS-e regular
    consumidor_final: 0, // Não
    // cIndOp antes de indDest (XSD nacional). 100301 = demais serviços onerosos (B2B típico)
    codigo_indicador_operacao: "100301",
    indicador_destinatario: 0, // destinatário = tomador
    // CST/cClassTrib padrão "tributação integral" (tabelas RFB / exemplos Focus)
    ibs_cbs_situacao_tributaria: "000",
    ibs_cbs_classificacao_tributaria: "000001",
  };

  try {
    const response = await createNfseNacional({
      token,
      environment: config.environment,
      ref,
      payload,
    });

    const status = String(response.status ?? "processando_autorizacao").trim();
    await prisma.receivableInstallment.update({
      where: { id: installment.id },
      data: {
        focusNfeRef: ref,
        focusNfeStatus: status,
        focusNfeUrl: response.url ?? null,
        focusNfeDanfseUrl: response.url_danfse ?? null,
        focusNfeError: status === "erro_autorizacao" ? formatFocusErrors(response) : null,
      },
    });

    await upsertNfseEmissionAttempt({
      tenantId: params.tenantId,
      receivableId: params.receivableId,
      installmentId: installment.id,
      focusNfeRef: ref,
      environment: config.environment,
      status,
      source: "EMIT",
      createdById: params.userId,
      codigoIss: codigoIss,
      focusNfeUrl: response.url ?? null,
      focusNfeDanfseUrl: response.url_danfse ?? null,
      errorMessage: status === "erro_autorizacao" ? formatFocusErrors(response) : null,
    });

    await prisma.receivableHistory.create({
      data: {
        receivableId: params.receivableId,
        userId: params.userId,
        action: "INVOICE",
        details: `NFSe Nacional enviada à Focus NFe (ref ${ref}, DPS ${dps.serie}/${dps.numero}, ambiente ${config.environment}, ISS ${codigoIss}, status ${status}).`,
      },
    });

    let nfNumber: string | null = null;
    let focusNfeError: string | null =
      status === "erro_autorizacao" ? formatFocusErrors(response) : null;

    if (status === "autorizado") {
      const applied = await applyAuthorizedFocusResult({
        tenantId: params.tenantId,
        userId: params.userId,
        receivableId: params.receivableId,
        installmentId: installment.id,
        response,
      });
      if (applied.ok === false) return { ok: false, error: applied.error };
      nfNumber = String(response.numero ?? "").trim() || null;
      await upsertNfseEmissionAttempt({
        tenantId: params.tenantId,
        receivableId: params.receivableId,
        installmentId: installment.id,
        focusNfeRef: ref,
        environment: config.environment,
        status: "autorizado",
        source: "EMIT",
        createdById: params.userId,
        nfNumber,
        codigoIss: codigoIss,
        focusNfeUrl: response.url ?? null,
        focusNfeDanfseUrl: response.url_danfse ?? null,
        errorMessage: null,
      });
    } else if (status === "processando_autorizacao") {
      // Tenta uma consulta rápida (emissão às vezes resolve em segundos).
      const synced = await syncFocusNfseStatus({
        tenantId: params.tenantId,
        userId: params.userId,
        receivableId: params.receivableId,
        installmentId: installment.id,
      });
      if (synced.ok) {
        return {
          ok: true,
          focusNfeStatus: synced.focusNfeStatus ?? status,
          focusNfeRef: ref,
          nfNumber: synced.nfNumber,
          focusNfeError: synced.focusNfeError,
          environment: config.environment,
        };
      }
    }

    return {
      ok: true,
      focusNfeStatus: status,
      focusNfeRef: ref,
      nfNumber,
      focusNfeError,
      environment: config.environment,
    };
  } catch (error) {
    if (error instanceof FocusNfeHttpError) {
      await prisma.receivableInstallment.update({
        where: { id: installment.id },
        data: {
          focusNfeRef: ref,
          focusNfeStatus: "erro_autorizacao",
          focusNfeError: error.message,
        },
      });
      await upsertNfseEmissionAttempt({
        tenantId: params.tenantId,
        receivableId: params.receivableId,
        installmentId: installment.id,
        focusNfeRef: ref,
        environment: config.environment,
        status: "erro_autorizacao",
        source: "EMIT",
        createdById: params.userId,
        codigoIss: codigoIss,
        errorMessage: error.message,
      });
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao emitir NFSe na Focus NFe.",
    };
  }
}

/** Cancela NFSe Nacional autorizada na Focus e reabre a parcela no Flowa. */
export async function cancelFocusNfseNacional(params: {
  tenantId: string;
  userId: string;
  receivableId: string;
  installmentId: string;
  justificativa?: string;
}): Promise<{ ok: true; focusNfeStatus: string } | { ok: false; error: string }> {
  const config = await getFocusNfeConfig(params.tenantId);
  const token = config ? resolveFocusToken(config) : null;
  if (!config?.enabled || !token) {
    return { ok: false, error: "Focus NFe não configurada/ativada." };
  }

  const receivable = await prisma.receivable.findFirst({
    where: { id: params.receivableId, tenantId: params.tenantId },
    include: {
      invoice: { select: { id: true } },
      installments: true,
    },
  });
  if (!receivable) return { ok: false, error: "Conta a receber não encontrada." };
  if (receivable.status === "CANCELADO") return { ok: false, error: "Conta cancelada." };

  const installment = receivable.installments.find((i) => i.id === params.installmentId);
  if (!installment) return { ok: false, error: "Parcela não encontrada." };
  if (installment.status === "RECEBIDO") {
    return { ok: false, error: "Parcela já recebida — desmarque o recebimento antes de cancelar a NF." };
  }
  if (!installment.focusNfeRef) {
    return { ok: false, error: "Esta parcela não tem NFSe emitida pela Focus NFe." };
  }
  if (installment.focusNfeStatus === "cancelado") {
    return { ok: false, error: "NFSe já cancelada." };
  }
  if (
    installment.focusNfeStatus !== "autorizado" &&
    !installment.nfNumber
  ) {
    return {
      ok: false,
      error: "Só é possível cancelar NFSe autorizada. Consulte o status na Focus antes.",
    };
  }

  const justificativa = String(params.justificativa ?? "").trim() || "Cancelamento solicitado pelo emitente";
  if (justificativa.length < 15) {
    return { ok: false, error: "Justificativa deve ter ao menos 15 caracteres." };
  }

  try {
    const response = await cancelNfseNacional({
      token,
      environment: config.environment,
      ref: installment.focusNfeRef,
      justificativa,
    });
    const status = String(response.status ?? "cancelado").trim() || "cancelado";

    await prisma.$transaction(async (tx) => {
      await tx.receivableInstallment.update({
        where: { id: installment.id },
        data: {
          status: "PREVISTO",
          nfNumber: null,
          nfEmissionDate: null,
          focusNfeStatus: status,
          focusNfeError: null,
        },
      });

      if (receivable.installments.length === 1 && receivable.invoice) {
        await tx.receivableInvoice.delete({ where: { id: receivable.invoice.id } });
      }

      const installments = await tx.receivableInstallment.findMany({
        where: { receivableId: params.receivableId },
        select: { status: true, dueDate: true, nfNumber: true },
      });
      const hasAnyInvoice = installments.some((i) => !!i.nfNumber || i.status === "FATURADO");
      const nextStatus = deriveReceivableStatus(installments, receivable.status, hasAnyInvoice);
      await tx.receivable.update({
        where: { id: params.receivableId },
        data: { status: nextStatus, updatedById: params.userId },
      });

      await tx.receivableHistory.create({
        data: {
          receivableId: params.receivableId,
          userId: params.userId,
          action: "INVOICE",
          details: `NFSe Nacional cancelada na Focus NFe (ref ${installment.focusNfeRef}). Justificativa: ${justificativa.slice(0, 200)}`,
        },
      });
    });

    await upsertNfseEmissionAttempt({
      tenantId: params.tenantId,
      receivableId: params.receivableId,
      installmentId: installment.id,
      focusNfeRef: installment.focusNfeRef,
      environment: config.environment,
      status,
      source: "CANCEL",
      createdById: params.userId,
      nfNumber: null,
      errorMessage: null,
    });

    return { ok: true, focusNfeStatus: status };
  } catch (error) {
    if (error instanceof FocusNfeHttpError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao cancelar NFSe na Focus NFe.",
    };
  }
}
