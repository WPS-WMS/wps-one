import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import {
  normalizeCep,
  normalizeDocument,
  normalizeOptionalString,
} from "../lib/supplierHelpers.js";

export const companyProfileRouter = Router();
companyProfileRouter.use(authMiddleware);

const FEATURE = "configuracoes.financeiro.empresa" as const;

const REGIME_TRIBUTARIO = [
  "SIMPLES_NACIONAL",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
  "MEI",
  "OUTRO",
] as const;

type RegimeTributario = (typeof REGIME_TRIBUTARIO)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRegime(raw: unknown): RegimeTributario | null | { invalid: true } {
  if (raw == null || String(raw).trim() === "") return null;
  const value = String(raw).trim().toUpperCase();
  if ((REGIME_TRIBUTARIO as readonly string[]).includes(value)) {
    return value as RegimeTributario;
  }
  return { invalid: true };
}

function normalizeUf(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  return v.length > 0 ? v : null;
}

function normalizeMunicipioIbge(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 7);
  return digits.length > 0 ? digits : null;
}

function normalizeEmail(raw: unknown): string | null | { invalid: true } {
  const v = normalizeOptionalString(raw);
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return { invalid: true };
  return v.toLowerCase();
}

const selectFields = {
  id: true,
  nomeFantasia: true,
  razaoSocial: true,
  email: true,
  telefone: true,
  site: true,
  cnpj: true,
  ie: true,
  ieIsento: true,
  im: true,
  regimeTributario: true,
  cnae: true,
  cep: true,
  endereco: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  estado: true,
  codigoMunicipio: true,
  banco: true,
  agencia: true,
  conta: true,
  pixKey: true,
  titularConta: true,
  pais: true,
  iban: true,
  bancoSwift: true,
  bancoEndereco: true,
  intermediarioBanco: true,
  intermediarioSwift: true,
  intermediarioMoeda: true,
  updatedAt: true,
} as const;

function emptyProfile() {
  return {
    id: null as string | null,
    nomeFantasia: null as string | null,
    razaoSocial: null as string | null,
    email: null as string | null,
    telefone: null as string | null,
    site: null as string | null,
    cnpj: null as string | null,
    ie: null as string | null,
    ieIsento: false,
    im: null as string | null,
    regimeTributario: null as string | null,
    cnae: null as string | null,
    cep: null as string | null,
    endereco: null as string | null,
    numero: null as string | null,
    complemento: null as string | null,
    bairro: null as string | null,
    cidade: null as string | null,
    estado: null as string | null,
    codigoMunicipio: null as string | null,
    banco: null as string | null,
    agencia: null as string | null,
    conta: null as string | null,
    pixKey: null as string | null,
    titularConta: null as string | null,
    pais: "Brazil" as string | null,
    iban: null as string | null,
    bancoSwift: null as string | null,
    bancoEndereco: null as string | null,
    intermediarioBanco: null as string | null,
    intermediarioSwift: null as string | null,
    intermediarioMoeda: null as string | null,
    updatedAt: null as string | null,
  };
}

function toPublic(row: {
  id: string;
  nomeFantasia: string | null;
  razaoSocial: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  cnpj: string | null;
  ie: string | null;
  ieIsento: boolean;
  im: string | null;
  regimeTributario: string | null;
  cnae: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  codigoMunicipio: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pixKey: string | null;
  titularConta: string | null;
  pais: string | null;
  iban: string | null;
  bancoSwift: string | null;
  bancoEndereco: string | null;
  intermediarioBanco: string | null;
  intermediarioSwift: string | null;
  intermediarioMoeda: string | null;
  updatedAt: Date;
}) {
  return {
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseBody(body: Record<string, unknown>) {
  const cnpj = normalizeDocument(body.cnpj);
  if (cnpj && cnpj.length !== 14) {
    return { error: "CNPJ inválido. Informe 14 dígitos." } as const;
  }
  const cep = normalizeCep(body.cep);
  if (cep && cep.length !== 8) {
    return { error: "CEP inválido. Informe 8 dígitos." } as const;
  }
  const email = normalizeEmail(body.email);
  if (email && typeof email === "object" && "invalid" in email) {
    return { error: "E-mail inválido." } as const;
  }
  const regime = normalizeRegime(body.regimeTributario);
  if (regime && typeof regime === "object" && "invalid" in regime) {
    return { error: "Regime tributário inválido." } as const;
  }
  const codigoMunicipio = normalizeMunicipioIbge(body.codigoMunicipio);
  if (codigoMunicipio && codigoMunicipio.length !== 7) {
    return { error: "Código do município (IBGE) deve ter 7 dígitos." } as const;
  }
  const ieIsento = Boolean(body.ieIsento);
  const estado = normalizeUf(body.estado);
  if (estado && estado.length !== 2) {
    return { error: "UF inválida." } as const;
  }

  return {
    data: {
      nomeFantasia: normalizeOptionalString(body.nomeFantasia),
      razaoSocial: normalizeOptionalString(body.razaoSocial),
      email: email as string | null,
      telefone: normalizeOptionalString(body.telefone),
      site: normalizeOptionalString(body.site),
      cnpj,
      ie: ieIsento ? null : normalizeOptionalString(body.ie),
      ieIsento,
      im: normalizeOptionalString(body.im),
      regimeTributario: (regime as RegimeTributario | null) ?? null,
      cnae: normalizeOptionalString(body.cnae)?.replace(/\D/g, "") || null,
      cep,
      endereco: normalizeOptionalString(body.endereco),
      numero: normalizeOptionalString(body.numero),
      complemento: normalizeOptionalString(body.complemento),
      bairro: normalizeOptionalString(body.bairro),
      cidade: normalizeOptionalString(body.cidade),
      estado,
      codigoMunicipio,
      banco: normalizeOptionalString(body.banco),
      agencia: normalizeOptionalString(body.agencia),
      conta: normalizeOptionalString(body.conta),
      pixKey: normalizeOptionalString(body.pixKey),
      titularConta: normalizeOptionalString(body.titularConta),
      pais: normalizeOptionalString(body.pais) ?? "Brazil",
      iban: normalizeOptionalString(body.iban),
      bancoSwift: normalizeOptionalString(body.bancoSwift)?.toUpperCase() ?? null,
      bancoEndereco: normalizeOptionalString(body.bancoEndereco),
      intermediarioBanco: normalizeOptionalString(body.intermediarioBanco),
      intermediarioSwift: normalizeOptionalString(body.intermediarioSwift)?.toUpperCase() ?? null,
      intermediarioMoeda: normalizeOptionalString(body.intermediarioMoeda)?.toUpperCase() ?? null,
    },
  } as const;
}

companyProfileRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const row = await prisma.tenantCompanyProfile.findUnique({
    where: { tenantId: user.tenantId },
    select: selectFields,
  });
  res.json(row ? toPublic(row) : emptyProfile());
});

companyProfileRouter.put("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const parsed = parseBody((req.body ?? {}) as Record<string, unknown>);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const row = await prisma.tenantCompanyProfile.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, ...parsed.data },
    update: parsed.data,
    select: selectFields,
  });
  res.json(toPublic(row));
});
