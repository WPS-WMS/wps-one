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
  resolveFocusToken,
  resolvePrestadorFromFocus,
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
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
  serieDps: number;
  proximoNumeroDps: number;
  webhookSecret: string | null;
  webhookHookId: string | null;
  webhookHookEnvironment: string | null;
  updatedAt: Date;
}) {
  const webhookUrl = focusNfeWebhookUrlForTenant(row.tenantId);
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
    descricaoServicoPadrao: row.descricaoServicoPadrao,
    codigoOpcaoSimplesNacional: row.codigoOpcaoSimplesNacional,
    serieDps: row.serieDps,
    proximoNumeroDps: row.proximoNumeroDps,
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
  descricaoServicoPadrao: null,
  codigoOpcaoSimplesNacional: null,
  serieDps: 1,
  proximoNumeroDps: 1,
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
  if (body.serieDps != null && String(body.serieDps).trim() !== "") {
    const n = Number.parseInt(String(body.serieDps), 10);
    if (!Number.isFinite(n) || n < 1 || n > 49999) {
      res.status(400).json({ error: "Série da DPS deve estar entre 1 e 49999." });
      return;
    }
  }
  if (body.proximoNumeroDps != null && String(body.proximoNumeroDps).trim() !== "") {
    const n = Number.parseInt(String(body.proximoNumeroDps), 10);
    if (!Number.isFinite(n) || n < 1) {
      res.status(400).json({ error: "Próximo número da DPS deve ser um inteiro maior que zero." });
      return;
    }
  }

  const existing = await prisma.tenantFocusNfeConfig.findUnique({
    where: { tenantId: user.tenantId },
  });

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
    descricaoServicoPadrao:
      body.descricaoServicoPadrao != null
        ? String(body.descricaoServicoPadrao).trim() || null
        : existing?.descricaoServicoPadrao ?? null,
    codigoOpcaoSimplesNacional:
      body.codigoOpcaoSimplesNacional != null
        ? String(body.codigoOpcaoSimplesNacional).trim() || null
        : existing?.codigoOpcaoSimplesNacional ?? null,
    serieDps: (() => {
      if (body.serieDps == null || String(body.serieDps).trim() === "") {
        return existing?.serieDps ?? 1;
      }
      const n = Number.parseInt(String(body.serieDps), 10);
      if (!Number.isFinite(n) || n < 1 || n > 49999) return existing?.serieDps ?? 1;
      return n;
    })(),
    proximoNumeroDps: (() => {
      if (body.proximoNumeroDps == null || String(body.proximoNumeroDps).trim() === "") {
        return existing?.proximoNumeroDps ?? 1;
      }
      const n = Number.parseInt(String(body.proximoNumeroDps), 10);
      if (!Number.isFinite(n) || n < 1) return existing?.proximoNumeroDps ?? 1;
      return n;
    })(),
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
