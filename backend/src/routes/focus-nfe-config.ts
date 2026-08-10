import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { maskToken, onlyDigits, type FocusNfeEnvironment } from "../lib/focusNfeClient.js";
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
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
  updatedAt: Date;
}) {
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
    descricaoServicoPadrao: row.descricaoServicoPadrao,
    codigoOpcaoSimplesNacional: row.codigoOpcaoSimplesNacional,
    updatedAt: row.updatedAt.toISOString(),
  };
}

focusNfeConfigRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const row = await prisma.tenantFocusNfeConfig.findUnique({ where: { tenantId: user.tenantId } });
  if (!row) {
    res.json({
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
      descricaoServicoPadrao: null,
      codigoOpcaoSimplesNacional: null,
      updatedAt: null,
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
    descricaoServicoPadrao:
      body.descricaoServicoPadrao != null
        ? String(body.descricaoServicoPadrao).trim() || null
        : existing?.descricaoServicoPadrao ?? null,
    codigoOpcaoSimplesNacional:
      body.codigoOpcaoSimplesNacional != null
        ? String(body.codigoOpcaoSimplesNacional).trim() || null
        : existing?.codigoOpcaoSimplesNacional ?? null,
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

  res.json(publicConfig(row));
});
