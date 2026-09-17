/** Credenciais Microsoft Graph — client credentials (legado) + OAuth por empresa. */

import { AsyncLocalStorage } from "async_hooks";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma.js";
import { decryptSecret, encryptSecret } from "./secretCrypto.js";

function pickEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const v = process.env[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

const GRAPH_TENANT_KEYS = [
  "M365_TENANT_ID",
  "TENANT_ID",
  "AZURE_TENANT_ID",
  "GRAPH_TENANT_ID",
  "MICROSOFT_TENANT_ID",
] as const;

const GRAPH_CLIENT_KEYS = [
  "M365_CLIENT_ID",
  "CLIENT_ID",
  "AZURE_CLIENT_ID",
  "GRAPH_CLIENT_ID",
  "MS_CLIENT_ID",
  "MICROSOFT_CLIENT_ID",
] as const;

const GRAPH_SECRET_KEYS = [
  "M365_CLIENT_SECRET",
  "CLIENT_SECRET",
  "AZURE_CLIENT_SECRET",
  "GRAPH_CLIENT_SECRET",
  "MS_CLIENT_SECRET",
  "MICROSOFT_CLIENT_SECRET",
] as const;

export type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

/** App registration (multi-tenant) — client id/secret bastam para OAuth. */
export type MicrosoftOAuthAppConfig = {
  clientId: string;
  clientSecret: string;
};

const OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "Sites.ReadWrite.All",
  "Files.ReadWrite.All",
].join(" ");

type GraphRequestContext = { accessToken: string };
const graphContext = new AsyncLocalStorage<GraphRequestContext>();

export function getMicrosoftGraphConfig(): MicrosoftGraphConfig | null {
  const tenantId = pickEnv(GRAPH_TENANT_KEYS);
  const clientId = pickEnv(GRAPH_CLIENT_KEYS);
  const clientSecret = pickEnv(GRAPH_SECRET_KEYS);
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function getMicrosoftOAuthAppConfig(): MicrosoftOAuthAppConfig | null {
  const clientId = pickEnv(GRAPH_CLIENT_KEYS);
  const clientSecret = pickEnv(GRAPH_SECRET_KEYS);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Graph legado (client credentials) configurado no servidor. */
export function isMicrosoftGraphConfigured(): boolean {
  return getMicrosoftGraphConfig() !== null;
}

/** App OAuth (client id/secret) disponível para conectar tenants de clientes. */
export function isMicrosoftOAuthAppConfigured(): boolean {
  return getMicrosoftOAuthAppConfig() !== null;
}

export async function getMicrosoftGraphAccessToken(cfg?: MicrosoftGraphConfig): Promise<string> {
  const resolved = cfg ?? getMicrosoftGraphConfig();
  if (!resolved) throw new Error("Microsoft Graph: configuração incompleta.");

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(resolved.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", resolved.clientId);
  body.set("client_secret", resolved.clientSecret);
  body.set("grant_type", "client_credentials");
  body.set("scope", "https://graph.microsoft.com/.default");

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Falha ao obter token do Graph (${resp.status}): ${text || resp.statusText}`);
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Token do Graph não retornou access_token.");
  return data.access_token;
}

export async function runWithGraphAccessToken<T>(
  accessToken: string,
  fn: () => Promise<T>,
): Promise<T> {
  return graphContext.run({ accessToken }, fn);
}

async function resolveGraphAccessToken(): Promise<string> {
  const ctx = graphContext.getStore();
  if (ctx?.accessToken) return ctx.accessToken;
  return getMicrosoftGraphAccessToken();
}

export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await resolveGraphAccessToken();
  const url = path.startsWith("https://")
    ? path
    : `https://graph.microsoft.com/v1.0${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

function normalizeBaseUrl(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/\/+$/, "");
}

export function getMicrosoftOAuthRedirectUri(): string {
  const explicit = pickEnv([
    "MICROSOFT_OAUTH_REDIRECT_URI",
    "SHAREPOINT_OAUTH_REDIRECT_URI",
  ]);
  if (explicit) return explicit;
  const apiBase = pickEnv(["PUBLIC_API_URL", "API_URL", "BACKEND_URL"]);
  if (apiBase) return `${normalizeBaseUrl(apiBase)}/api/sharepoint/oauth/callback`;
  return "http://localhost:4000/api/sharepoint/oauth/callback";
}

function oauthStateSecret(): string {
  return (
    String(process.env.JWT_SECRET || "").trim() ||
    String(process.env.TOKEN_ENCRYPTION_KEY || "").trim() ||
    "dev-oauth-state-secret"
  );
}

export type MicrosoftOAuthState = {
  tid: string;
  uid: string;
  ret: string;
  exp: number;
};

export function signMicrosoftOAuthState(payload: Omit<MicrosoftOAuthState, "exp">): string {
  const body: MicrosoftOAuthState = {
    ...payload,
    exp: Date.now() + 15 * 60 * 1000,
  };
  const json = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", oauthStateSecret()).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyMicrosoftOAuthState(raw: string): MicrosoftOAuthState {
  const [json, sig] = String(raw || "").split(".");
  if (!json || !sig) throw new Error("State OAuth inválido.");
  const expected = createHmac("sha256", oauthStateSecret()).update(json).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("State OAuth inválido.");
  }
  const parsed = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as MicrosoftOAuthState;
  if (!parsed?.tid || !parsed?.uid || !parsed?.exp) throw new Error("State OAuth incompleto.");
  if (Date.now() > parsed.exp) throw new Error("State OAuth expirado. Tente conectar novamente.");
  return parsed;
}

export function buildMicrosoftAuthorizeUrl(state: string): string {
  const app = getMicrosoftOAuthAppConfig();
  if (!app) throw new Error("App Microsoft OAuth não configurado (CLIENT_ID / CLIENT_SECRET).");
  const params = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: getMicrosoftOAuthRedirectUri(),
    response_mode: "query",
    scope: OAUTH_SCOPES,
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function exchangeOAuthToken(body: URLSearchParams): Promise<TokenResponse> {
  const app = getMicrosoftOAuthAppConfig();
  if (!app) throw new Error("App Microsoft OAuth não configurado.");
  body.set("client_id", app.clientId);
  body.set("client_secret", app.clientSecret);

  const resp = await fetch("https://login.microsoftonline.com/organizations/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await resp.json().catch(() => ({}))) as TokenResponse;
  if (!resp.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Falha no token OAuth (${resp.status})`,
    );
  }
  return data;
}

export async function exchangeMicrosoftAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", getMicrosoftOAuthRedirectUri());
  body.set("scope", OAUTH_SCOPES);
  const data = await exchangeOAuthToken(body);
  if (!data.refresh_token) {
    throw new Error("Microsoft não retornou refresh_token. Verifique o escopo offline_access.");
  }
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) || 3600,
  };
}

async function refreshMicrosoftAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("scope", OAUTH_SCOPES);
  const data = await exchangeOAuthToken(body);
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token || refreshToken,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export async function fetchMicrosoftAccountProfile(accessToken: string): Promise<{
  email: string | null;
  azureTenantId: string | null;
}> {
  const meResp = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  let email: string | null = null;
  if (meResp.ok) {
    const me = (await meResp.json()) as { mail?: string; userPrincipalName?: string };
    email = String(me.mail || me.userPrincipalName || "").trim() || null;
  }

  const orgResp = await fetch("https://graph.microsoft.com/v1.0/organization?$select=id", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  let azureTenantId: string | null = null;
  if (orgResp.ok) {
    const org = (await orgResp.json()) as { value?: Array<{ id?: string }> };
    azureTenantId = String(org.value?.[0]?.id || "").trim() || null;
  }

  return { email, azureTenantId };
}

export type TenantMicrosoftConnectionStatus = {
  connected: boolean;
  accountEmail: string | null;
  azureTenantId: string | null;
  connectedAt: string | null;
  /** Pode usar Graph: OAuth do cliente OU client credentials legado no servidor. */
  graphAvailable: boolean;
  /** Modo legado (sem OAuth do cliente). */
  legacyServerGraph: boolean;
  oauthAppConfigured: boolean;
};

export async function getTenantMicrosoftConnectionStatus(
  wpsTenantId: string,
): Promise<TenantMicrosoftConnectionStatus> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: wpsTenantId },
    select: {
      microsoftOauthTenantId: true,
      microsoftOauthAccountEmail: true,
      microsoftOauthRefreshToken: true,
      microsoftOauthConnectedAt: true,
    },
  });
  const connected = !!(tenant?.microsoftOauthRefreshToken && tenant.microsoftOauthTenantId);
  const legacyServerGraph = isMicrosoftGraphConfigured();
  return {
    connected,
    accountEmail: tenant?.microsoftOauthAccountEmail ?? null,
    azureTenantId: tenant?.microsoftOauthTenantId ?? null,
    connectedAt: tenant?.microsoftOauthConnectedAt
      ? tenant.microsoftOauthConnectedAt.toISOString()
      : null,
    graphAvailable: connected || legacyServerGraph,
    legacyServerGraph: legacyServerGraph && !connected,
    oauthAppConfigured: isMicrosoftOAuthAppConfigured(),
  };
}

export async function saveTenantMicrosoftOAuthConnection(params: {
  wpsTenantId: string;
  refreshToken: string;
  accessToken: string;
}): Promise<void> {
  const profile = await fetchMicrosoftAccountProfile(params.accessToken);
  const idPayload = decodeJwtPayload(params.accessToken);
  const azureTenantId =
    profile.azureTenantId ||
    (typeof idPayload?.tid === "string" ? idPayload.tid : null);
  if (!azureTenantId) {
    throw new Error("Não foi possível identificar o tenant Microsoft conectado.");
  }

  await prisma.tenant.update({
    where: { id: params.wpsTenantId },
    data: {
      microsoftOauthTenantId: azureTenantId,
      microsoftOauthAccountEmail: profile.email,
      microsoftOauthRefreshToken: encryptSecret(params.refreshToken),
      microsoftOauthConnectedAt: new Date(),
    },
  });
}

export async function disconnectTenantMicrosoftOAuth(wpsTenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: wpsTenantId },
    data: {
      microsoftOauthTenantId: null,
      microsoftOauthAccountEmail: null,
      microsoftOauthRefreshToken: null,
      microsoftOauthConnectedAt: null,
    },
  });
}

/**
 * Resolve access token Graph para um tenant WPSone:
 * 1) OAuth do cliente (preferencial)
 * 2) Client credentials do servidor (legado WPS)
 */
export async function getGraphAccessTokenForWpsTenant(wpsTenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: wpsTenantId },
    select: {
      microsoftOauthRefreshToken: true,
      microsoftOauthTenantId: true,
    },
  });

  if (tenant?.microsoftOauthRefreshToken) {
    const refreshToken = decryptSecret(tenant.microsoftOauthRefreshToken);
    const refreshed = await refreshMicrosoftAccessToken(refreshToken);
    if (refreshed.refreshToken !== refreshToken) {
      await prisma.tenant.update({
        where: { id: wpsTenantId },
        data: { microsoftOauthRefreshToken: encryptSecret(refreshed.refreshToken) },
      });
    }
    return refreshed.accessToken;
  }

  if (isMicrosoftGraphConfigured()) {
    return getMicrosoftGraphAccessToken();
  }

  throw new Error(
    "Microsoft não conectada nesta empresa. Conecte a conta Microsoft em Integrações.",
  );
}

export async function isGraphAvailableForWpsTenant(wpsTenantId: string): Promise<boolean> {
  const status = await getTenantMicrosoftConnectionStatus(wpsTenantId);
  return status.graphAvailable;
}

export async function withGraphForWpsTenant<T>(
  wpsTenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const token = await getGraphAccessTokenForWpsTenant(wpsTenantId);
  return runWithGraphAccessToken(token, fn);
}
