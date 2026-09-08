import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { maskToken, onlyDigits, type FocusNfeEnvironment } from "../lib/focusNfeClient.js";
import {
  ensureFocusNfsenWebhook,
  focusNfeWebhookUrlForTenant,
  publicApiBaseUrl,
} from "../lib/focusNfeEmissionAttempts.js";
import {
  getFocusNfeConfig,
  parseNbsOptions,
  resolveFocusToken,
  resolvePrestadorFromFocus,
  serializeNbsOptions,
} from "../lib/focusNfeService.js";

export const focusNfeConfigRouter = Router();
focusNfeConfigRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.focusNfe" as const;

function publicConfig(row: {
  id: string;
  tenantId: string;
  enabled: boolean;
  environment: string;
  tokenHomologacao: string | null;
  tokenProducao: string | null;
  cnpjPrestador: string | null;
  inscricaoMunicipalPrestador: string | null;
  codigoMunicipioEmissora: string | null;
  codigoTributacaoNacionalIss: string | null;
  codigosTributacaoIss: string | null;
  codigosNbs: string | null;
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
  percentualTotalTributosSimplesNacional: { toString(): string } | number | null;
  serieDpsHomologacao: number;
  proximoNumeroDpsHomologacao: number;
  serieDpsProducao: number;
  proximoNumeroDpsProducao: number;
  webhookSecret: string | null;
  webhookHookId: string | null;
  webhookHookEnvironment: string | null;
  updatedAt: Date;
}) {
  const webhookUrl = focusNfeWebhookUrlForTenant(row.tenantId);
  const pctSn =
    row.percentualTotalTributosSimplesNacional != null
      ? Number(row.percentualTotalTributosSimplesNacional)
      : null;
  return {
    id: row.id,
    enabled: row.enabled,
    environment: row.environment === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO",
    tokenHomologacaoMasked: maskToken(row.tokenHomologacao),
    tokenProducaoMasked: maskToken(row.tokenProducao),
    hasTokenHomologacao: Boolean(String(row.tokenHomologacao ?? "").trim()),
    hasTokenProducao: Boolean(String(row.tokenProducao ?? "").trim()),
    cnpjPrestador: row.cnpjPrestador,
    inscricaoMunicipalPrestador: row.inscricaoMunicipalPrestador,
    codigoMunicipioEmissora: row.codigoMunicipioEmissora,
    codigoTributacaoNacionalIss: row.codigoTributacaoNacionalIss,
    codigosTributacaoIss: row.codigosTributacaoIss,
    codigosNbs: row.codigosNbs,
    codigosNbsOptions: parseNbsOptions(row.codigosNbs),
    descricaoServicoPadrao: row.descricaoServicoPadrao,
    codigoOpcaoSimplesNacional: row.codigoOpcaoSimplesNacional,
    percentualTotalTributosSimplesNacional:
      pctSn != null && Number.isFinite(pctSn) ? pctSn : null,
    serieDpsHomologacao: row.serieDpsHomologacao,
    proximoNumeroDpsHomologacao: row.proximoNumeroDpsHomologacao,
    serieDpsProducao: row.serieDpsProducao,
    proximoNumeroDpsProducao: row.proximoNumeroDpsProducao,
    webhookUrl,
    webhookConfigured: Boolean(row.webhookHookId && row.webhookSecret),
    webhookHookId: row.webhookHookId,
    webhookHookEnvironment: row.webhookHookEnvironment,
    publicApiUrlConfigured: Boolean(publicApiBaseUrl()),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const emptyPublic = {
  id: null,
  enabled: false,
  environment: "HOMOLOGACAO",
  tokenHomologacaoMasked: null,
  tokenProducaoMasked: null,
  hasTokenHomologacao: false,
  hasTokenProducao: false,
  cnpjPrestador: null,
  inscricaoMunicipalPrestador: null,
  codigoMunicipioEmissora: null,
  codigoTributacaoNacionalIss: null,
  codigosTributacaoIss: null,
  codigosNbs: null,
  codigosNbsOptions: [] as Array<{ codigo: string; descricao: string }>,
  descricaoServicoPadrao: null,
  codigoOpcaoSimplesNacional: null,
  percentualTotalTributosSimplesNacional: null as number | null,
  serieDpsHomologacao: 1,
  proximoNumeroDpsHomologacao: 1,
  serieDpsProducao: 1,
  proximoNumeroDpsProducao: 1,
  webhookUrl: null as string | null,
  webhookConfigured: false,
  webhookHookId: null,
  webhookHookEnvironment: null,
  publicApiUrlConfigured: Boolean(publicApiBaseUrl()),
  updatedAt: null,
};

focusNfeConfigRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const row = await prisma.tenantFocusNfeConfig.findUnique({ where: { tenantId: user.tenantId } });
  if (!row) {
    res.json({
      ...emptyPublic,
      webhookUrl: focusNfeWebhookUrlForTenant(user.tenantId),
    });
    return;
  }
  res.json(publicConfig(row));
});

/** Testa token e mostra dados do prestador vindos da Focus. */
focusNfeConfigRouter.post("/test-connection", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const config = await getFocusNfeConfig(user.tenantId);
  if (!config || !resolveFocusToken(config)) {
    res.status(400).json({ error: "Salve o token do ambiente ativo antes de testar." });
    return;
  }
  const result = await resolvePrestadorFromFocus(config);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({
    ok: true,
    environment: config.environment,
    prestador: result.prestador,
  });
});

/** Cadastra/atualiza o gatilho nfsen na Focus apontando para o WPS. */
focusNfeConfigRouter.post("/sync-webhook", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const config = await getFocusNfeConfig(user.tenantId);
  const token = config ? resolveFocusToken(config) : null;
  if (!config || !token) {
    res.status(400).json({ error: "Salve o token do ambiente ativo antes de registrar o webhook." });
    return;
  }
  const result = await ensureFocusNfsenWebhook({
    tenantId: user.tenantId,
    token,
    config,
  });
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  const row = await prisma.tenantFocusNfeConfig.findUnique({ where: { tenantId: user.tenantId } });
  res.json({
    ok: true,
    created: result.created,
    webhookUrl: result.webhookUrl,
    hookId: result.hookId,
    config: row ? publicConfig(row) : null,
  });
});

focusNfeConfigRouter.put("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const body = req.body ?? {};

  const environment: FocusNfeEnvironment =
    String(body.environment ?? "").toUpperCase() === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
  const enabled = Boolean(body.enabled);

  const cnpjRaw = body.cnpjPrestador != null ? onlyDigits(String(body.cnpjPrestador)) : null;
  if (cnpjRaw != null && cnpjRaw !== "" && cnpjRaw.length !== 14 && cnpjRaw.length !== 11) {
    res.status(400).json({ error: "CNPJ/CPF do prestador inválido." });
    return;
  }

  function parseSerie(raw: unknown): number | null | "invalid" {
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1 || n > 49999) return "invalid";
    return n;
  }
  function parseNumero(raw: unknown): number | null | "invalid" {
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return "invalid";
    return n;
  }

  const serieH = parseSerie(body.serieDpsHomologacao);
  const numH = parseNumero(body.proximoNumeroDpsHomologacao);
  const serieP = parseSerie(body.serieDpsProducao);
  const numP = parseNumero(body.proximoNumeroDpsProducao);
  if (serieH === "invalid" || serieP === "invalid") {
    res.status(400).json({ error: "Série da DPS deve estar entre 1 e 49999." });
    return;
  }
  if (numH === "invalid" || numP === "invalid") {
    res.status(400).json({ error: "Próximo número da DPS deve ser um inteiro maior que zero." });
    return;
  }

  function parsePercentualSn(raw: unknown): number | null | "invalid" {
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
    return Math.round(n * 100) / 100;
  }
  const pctSn = parsePercentualSn(body.percentualTotalTributosSimplesNacional);
  if (pctSn === "invalid") {
    res.status(400).json({
      error: "Percentual de tributos do Simples Nacional deve ser um número entre 0 e 100.",
    });
    return;
  }

  const existing = await prisma.tenantFocusNfeConfig.findUnique({
    where: { tenantId: user.tenantId },
  });

  const codigoOpcaoSimplesNacional =
    body.codigoOpcaoSimplesNacional != null
      ? String(body.codigoOpcaoSimplesNacional).trim() || null
      : existing?.codigoOpcaoSimplesNacional ?? null;
  const percentualTotalTributosSimplesNacional =
    body.percentualTotalTributosSimplesNacional !== undefined
      ? pctSn
      : existing?.percentualTotalTributosSimplesNacional != null
        ? Number(existing.percentualTotalTributosSimplesNacional)
        : null;
  if (
    codigoOpcaoSimplesNacional === "3" &&
    (percentualTotalTributosSimplesNacional == null ||
      !Number.isFinite(Number(percentualTotalTributosSimplesNacional)))
  ) {
    res.status(400).json({
      error:
        "Para ME/EPP, informe o percentual aproximado de tributos do Simples Nacional (ex.: 6).",
    });
    return;
  }

  const tokenHomologacaoIn =
    typeof body.tokenHomologacao === "string" ? body.tokenHomologacao.trim() : undefined;
  const tokenProducaoIn =
    typeof body.tokenProducao === "string" ? body.tokenProducao.trim() : undefined;

  const data = {
    enabled,
    environment,
    cnpjPrestador: cnpjRaw || null,
    inscricaoMunicipalPrestador:
      body.inscricaoMunicipalPrestador != null
        ? String(body.inscricaoMunicipalPrestador).trim() || null
        : existing?.inscricaoMunicipalPrestador ?? null,
    codigoMunicipioEmissora:
      body.codigoMunicipioEmissora != null
        ? String(body.codigoMunicipioEmissora).trim() || null
        : existing?.codigoMunicipioEmissora ?? null,
    codigoTributacaoNacionalIss:
      body.codigoTributacaoNacionalIss != null
        ? String(body.codigoTributacaoNacionalIss).trim() || null
        : existing?.codigoTributacaoNacionalIss ?? null,
    codigosTributacaoIss:
      body.codigosTributacaoIss != null
        ? String(body.codigosTributacaoIss).trim() || null
        : existing?.codigosTributacaoIss ?? null,
    codigosNbs:
      body.codigosNbs !== undefined
        ? (() => {
            if (body.codigosNbs == null || body.codigosNbs === "") return null;
            if (Array.isArray(body.codigosNbs)) {
              return serializeNbsOptions(
                body.codigosNbs.map((item: unknown) => {
                  if (typeof item === "string") return { codigo: item, descricao: "" };
                  if (item && typeof item === "object") {
                    return {
                      codigo: String((item as { codigo?: unknown }).codigo ?? ""),
                      descricao: String((item as { descricao?: unknown }).descricao ?? ""),
                    };
                  }
                  return { codigo: "", descricao: "" };
                }),
              );
            }
            return serializeNbsOptions(parseNbsOptions(String(body.codigosNbs)));
          })()
        : existing?.codigosNbs ?? null,
    descricaoServicoPadrao:
      body.descricaoServicoPadrao != null
        ? String(body.descricaoServicoPadrao).trim() || null
        : existing?.descricaoServicoPadrao ?? null,
    codigoOpcaoSimplesNacional,
    percentualTotalTributosSimplesNacional,
    serieDpsHomologacao: serieH ?? existing?.serieDpsHomologacao ?? 1,
    proximoNumeroDpsHomologacao: numH ?? existing?.proximoNumeroDpsHomologacao ?? 1,
    serieDpsProducao: serieP ?? existing?.serieDpsProducao ?? 1,
    proximoNumeroDpsProducao: numP ?? existing?.proximoNumeroDpsProducao ?? 1,
    ...(tokenHomologacaoIn !== undefined
      ? { tokenHomologacao: tokenHomologacaoIn || null }
      : {}),
    ...(tokenProducaoIn !== undefined ? { tokenProducao: tokenProducaoIn || null } : {}),
  };

  const row = await prisma.tenantFocusNfeConfig.upsert({
    where: { tenantId: user.tenantId },
    create: {
      tenantId: user.tenantId,
      ...data,
      tokenHomologacao: tokenHomologacaoIn || null,
      tokenProducao: tokenProducaoIn || null,
    },
    update: data,
  });

  let webhookNote: string | null = null;
  const configAfter = await getFocusNfeConfig(user.tenantId);
  const tokenAfter = configAfter ? resolveFocusToken(configAfter) : null;
  if (enabled && configAfter && tokenAfter) {
    const synced = await ensureFocusNfsenWebhook({
      tenantId: user.tenantId,
      token: tokenAfter,
      config: configAfter,
    });
    if (synced.ok === false) {
      webhookNote = synced.error;
    } else {
      webhookNote = synced.created
        ? "Webhook nfsen registrado na Focus."
        : "Webhook nfsen já estava sincronizado.";
    }
  }

  const fresh = await prisma.tenantFocusNfeConfig.findUnique({ where: { tenantId: user.tenantId } });
  res.json({
    ...publicConfig(fresh ?? row),
    webhookNote,
  });
});
