/** Credenciais Microsoft Graph (client credentials) — compartilhado por e-mail e SharePoint. */

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

export function getMicrosoftGraphConfig(): MicrosoftGraphConfig | null {
  const tenantId = pickEnv(GRAPH_TENANT_KEYS);
  const clientId = pickEnv(GRAPH_CLIENT_KEYS);
  const clientSecret = pickEnv(GRAPH_SECRET_KEYS);
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function isMicrosoftGraphConfigured(): boolean {
  return getMicrosoftGraphConfig() !== null;
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

export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getMicrosoftGraphAccessToken();
  const url = path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}
