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
  type FocusNfseNacionalResponse,
} from "./focusNfeClient.js";
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
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
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

/** Só o essencial no Flowa: token + ISS. CNPJ/IM/município vêm da Focus (com override opcional). */
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
  if (!String(config.codigoTributacaoNacionalIss ?? "").trim()) {
    errors.push("Informe o código de tributação nacional ISS (tipo do serviço).");
  }
  return errors;
}

export type ResolvedPrestador = {
  cnpjPrestador: string;
  inscricaoMunicipalPrestador: string | null;
  codigoMunicipioEmissora: string;
  empresaNome: string | null;
  fromFocus: boolean;
};

export async function resolvePrestadorFromFocus(
  config: FocusNfeConfigRow,
): Promise<{ ok: true; prestador: ResolvedPrestador } | { ok: false; error: string }> {
  const token = resolveFocusToken(config);
  if (!token) return { ok: false, error: "Token Focus NFe não configurado." };

  let empresa: FocusEmpresa | null = null;
  try {
    const empresas = await listFocusEmpresas({ token, environment: config.environment });
    empresa = empresas[0] ?? null;
  } catch (error) {
    // Se a listagem falhar mas houver override manual, segue com o override.
    if (
      !onlyDigits(config.cnpjPrestador) ||
      !String(config.codigoMunicipioEmissora ?? "").trim()
    ) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível obter os dados da empresa na Focus NFe.",
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
      error:
        "CNPJ/CPF do prestador não encontrado na Focus. Cadastre a empresa na Focus ou informe o CNPJ na configuração.",
    };
  }
  if (!municipio) {
    return {
      ok: false,
      error:
        "Município emissor não encontrado na Focus. Cadastre o código do município na Focus ou na configuração.",
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
    },
  };
}

function brazilOffsetIso(date = new Date()): string {
  // Focus aceita ISO com offset; usamos -03:00 (BRT) de forma estável.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`;
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
      },
    });
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

  const descricao =
    (useFocus ? String(config?.descricaoServicoPadrao ?? "").trim() : "") ||
    receivable.description.trim() ||
    "Serviços prestados";

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
      description: descricao,
      amountCents: installment.amountCents,
      amountFormatted: formatCentsToBrl(installment.amountCents),
      competenceDate: competenceIsoDate(receivable.competenceDate),
      codigoTributacaoNacionalIss: useFocus
        ? String(config!.codigoTributacaoNacionalIss).trim()
        : null,
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

  const refBase = `flowa-${installment.id}`;
  const ref =
    installment.focusNfeStatus === "erro_autorizacao" ||
    installment.focusNfeStatus === "cancelado"
      ? `${refBase}-${Date.now()}`
      : installment.focusNfeRef || refBase;

  const payload = {
    data_emissao: brazilOffsetIso(),
    data_competencia: competenceIsoDate(receivable.competenceDate),
    codigo_municipio_emissora: prestador.prestador.codigoMunicipioEmissora,
    cnpj_prestador: prestador.prestador.cnpjPrestador,
    inscricao_municipal_prestador:
      prestador.prestador.inscricaoMunicipalPrestador || undefined,
    codigo_opcao_simples_nacional: config.codigoOpcaoSimplesNacional?.trim() || undefined,
    ...(doc.length === 11 ? { cpf_tomador: doc } : { cnpj_tomador: doc }),
    razao_social_tomador: client.financial?.razaoSocial?.trim() || client.name,
    email_tomador: client.email?.trim() || undefined,
    telefone_tomador: onlyDigits(client.telefone) || undefined,
    cep_tomador: onlyDigits(client.cep) || undefined,
    logradouro_tomador: client.endereco?.trim() || undefined,
    numero_tomador: client.numero?.trim() || undefined,
    complemento_tomador: client.complemento?.trim() || undefined,
    bairro_tomador: client.bairro?.trim() || undefined,
    codigo_tributacao_nacional_iss: String(config.codigoTributacaoNacionalIss).trim(),
    descricao_servico: preview.preview.description.slice(0, 2000),
    valor_servico: Number((installment.amountCents / 100).toFixed(2)),
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

    await prisma.receivableHistory.create({
      data: {
        receivableId: params.receivableId,
        userId: params.userId,
        action: "INVOICE",
        details: `NFSe Nacional enviada à Focus NFe (ref ${ref}, ambiente ${config.environment}, status ${status}).`,
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
