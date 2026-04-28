function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// URL da API (chamadas fetch). Se não definida, cai no Render de produção.
const API_URL = normalizeOrigin(
  process.env.NEXT_PUBLIC_API_URL ?? "https://wps-one-backend-production.onrender.com",
);

/** Base usada em `apiFetch` e como fallback para ficheiros públicos. */
export const API_BASE_URL = API_URL;

/**
 * Base para montar URLs de ficheiros servidos em `/uploads/...` (portal, avatares, anexos relativos).
 * Defina `NEXT_PUBLIC_ASSET_PUBLIC_ORIGIN` no build do frontend quando quiser outro domínio na barra
 * de endereços (ex.: `https://api.wpsone.com.br` após apontar DNS + domínio customizado no Render).
 * Para usar `https://wpsone.com.br/...`, o hosting tem de fazer proxy de `/uploads` para a API.
 * Se vazio, usa a mesma base que `NEXT_PUBLIC_API_URL`.
 */
export const ASSET_PUBLIC_BASE_URL = normalizeOrigin(
  process.env.NEXT_PUBLIC_ASSET_PUBLIC_ORIGIN?.trim() || API_URL,
);

let cachedApiOrigin = "";
let cachedAssetOrigin = "";
try {
  cachedApiOrigin = new URL(API_URL).origin;
} catch {
  /* ignore */
}
try {
  cachedAssetOrigin = new URL(ASSET_PUBLIC_BASE_URL).origin;
} catch {
  /* ignore */
}

/**
 * Conteúdo antigo pode vir como URL absoluta do host da API (ex. Render).
 * Nesse caso trocamos só a origem para `ASSET_PUBLIC_BASE_URL`, mantendo o path `/uploads/...`.
 */
function rewriteUploadsAbsoluteUrl(absolute: string): string {
  try {
    const u = new URL(absolute);
    if (!u.pathname.startsWith("/uploads/")) return absolute;
    if (cachedAssetOrigin && u.origin === cachedAssetOrigin) return absolute;

    const sameApiHost = cachedApiOrigin && u.origin === cachedApiOrigin;
    const legacyRenderUploads =
      u.hostname.endsWith(".onrender.com") && u.pathname.startsWith("/uploads/");
    if (!sameApiHost && !legacyRenderUploads) return absolute;

    return `${ASSET_PUBLIC_BASE_URL}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return absolute;
  }
}

/** Monta URL absoluta para paths relativos da API (ex.: `/uploads/portal/...`). */
export function publicFileUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("data:") || p.startsWith("blob:")) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return rewriteUploadsAbsoluteUrl(p);
  if (p.startsWith("/")) return `${ASSET_PUBLIC_BASE_URL}${p}`;
  return `${ASSET_PUBLIC_BASE_URL}/${p}`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  // Compat: versões antigas podem ter salvo como "token"
  return localStorage.getItem("wps_token") || localStorage.getItem("token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
  try {
    const method = String(options.method || "GET").toUpperCase();
    const canRetry = method === "GET" && !options.body;
    const MAX_RETRIES = 2;
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= (canRetry ? MAX_RETRIES : 0); attempt++) {
      // Backoff curto para reduzir 502/503 transitórios sem gerar tempestade.
      if (attempt > 0) {
        const delayMs = attempt === 1 ? 300 : 1200;
        await new Promise((r) => setTimeout(r, delayMs));
      }
      const res = await fetch(url, { ...options, headers, credentials: "include" });
      lastRes = res;
      if (!canRetry) return res;
      if (![502, 503, 504].includes(res.status)) return res;
    }
    return lastRes as Response;
  } catch (err) {
    // Segurança: em produção, evita expor a URL/stack detalhada em mensagens visíveis ao utilizador.
    // Mantemos detalhe apenas em dev para facilitar troubleshooting.
    const msg = err instanceof Error ? err.message : "Erro de rede";
    const isProd = process.env.NODE_ENV === "production";
    const userMessage = "Falha ao conectar com a API. Tente novamente em instantes.";
    const debugMessage = `Falha ao conectar com a API: ${msg}. Verifique se o backend está rodando em ${API_BASE_URL}`;
    throw new Error(isProd ? userMessage : debugMessage);
  }
}

/** GET binário (ficheiro) com JWT; não define `Content-Type: application/json`. */
export async function apiFetchBlob(path: string, options: RequestInit = {}) {
  const token = getToken();
  const baseHeaders: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) baseHeaders.Authorization = `Bearer ${token}`;
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
  try {
    const method = String(options.method || "GET").toUpperCase();
    const canRetry = method === "GET" && !options.body;
    const MAX_RETRIES = 2;
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= (canRetry ? MAX_RETRIES : 0); attempt++) {
      if (attempt > 0) {
        const delayMs = attempt === 1 ? 300 : 1200;
        await new Promise((r) => setTimeout(r, delayMs));
      }
      const res = await fetch(url, { ...options, headers: baseHeaders, credentials: "include" });
      lastRes = res;
      if (!canRetry) return res;
      if (![502, 503, 504].includes(res.status)) return res;
    }
    return lastRes as Response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de rede";
    const isProd = process.env.NODE_ENV === "production";
    const userMessage = "Falha ao conectar com a API. Tente novamente em instantes.";
    const debugMessage = `Falha ao conectar com a API: ${msg}. Verifique se o backend está rodando em ${API_BASE_URL}`;
    throw new Error(isProd ? userMessage : debugMessage);
  }
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("wps_token", token);
    // Compat: outras telas/ambientes podem procurar por "token"
    localStorage.setItem("token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("wps_token");
    localStorage.removeItem("token");
  }
}
