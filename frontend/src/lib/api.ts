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

const SESSION_HINT_KEY = "wps_has_session";

/** Remove JWT legado do localStorage (não deve mais existir no browser). */
function purgeLegacyTokenStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("wps_token");
    localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
}

/**
 * Se ainda houver JWT antigo no storage, marca hint e apaga o token.
 * O cookie HttpOnly (se existir) passa a autenticar nas próximas chamadas.
 */
function migrateLegacySessionHint() {
  if (typeof window === "undefined") return;
  try {
    const hadLegacy =
      Boolean(localStorage.getItem("wps_token")) || Boolean(localStorage.getItem("token"));
    if (hadLegacy) {
      localStorage.setItem(SESSION_HINT_KEY, "1");
      sessionStorage.setItem(SESSION_HINT_KEY, "1");
    }
  } catch {
    /* ignore */
  }
  purgeLegacyTokenStorage();
}

/**
 * Indica se o FE deve tentar `/auth/me` (cookie HttpOnly pode existir).
 * Não contém o JWT — só um marcador não secreto.
 */
export function hasSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  migrateLegacySessionHint();
  try {
    return (
      localStorage.getItem(SESSION_HINT_KEY) === "1" ||
      sessionStorage.getItem(SESSION_HINT_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * @deprecated Nome legado: não devolve JWT. Use para saber se há sessão possível (cookie).
 * Retorna `"1"` se houver hint, senão `null` — nunca o token.
 */
export function getToken(): string | null {
  return hasSessionHint() ? "1" : null;
}

function handleSubscriptionLockedResponse(res: Response) {
  if (res.status !== 403 || typeof window === "undefined") return;
  void (async () => {
    try {
      const clone = res.clone();
      const body = (await clone.json().catch(() => null)) as { code?: string } | null;
      if (body?.code !== "SUBSCRIPTION_LOCKED") return;
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        /* ignore */
      }
      purgeLegacyTokenStorage();
      try {
        localStorage.removeItem(SESSION_HINT_KEY);
        sessionStorage.removeItem(SESSION_HINT_KEY);
      } catch {
        /* ignore */
      }
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace(`${window.location.origin}/login?locked=1`);
      }
    } catch {
      /* ignore */
    }
  })();
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  // Sessão só via cookie HttpOnly (`credentials: "include"`). Não anexar Bearer do storage.
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
      handleSubscriptionLockedResponse(res);
      if (!canRetry) return res;
      if (![502, 503, 504].includes(res.status)) return res;
    }
    return lastRes as Response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Segurança: em produção, evita expor a URL/stack detalhada em mensagens visíveis ao utilizador.
    // Mantemos detalhe apenas em dev para facilitar troubleshooting.
    const msg = err instanceof Error ? err.message : "Erro de rede";
    const isProd = process.env.NODE_ENV === "production";
    const userMessage = "Falha ao conectar com a API. Tente novamente em instantes.";
    const debugMessage = `Falha ao conectar com a API: ${msg}. Verifique se o backend está rodando em ${API_BASE_URL}`;
    throw new Error(isProd ? userMessage : debugMessage);
  }
}

/** GET binário (ficheiro) com cookie de sessão; não define `Content-Type: application/json`. */
export async function apiFetchBlob(path: string, options: RequestInit = {}) {
  const baseHeaders: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
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
      handleSubscriptionLockedResponse(res);
      if (!canRetry) return res;
      if (![502, 503, 504].includes(res.status)) return res;
    }
    return lastRes as Response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    const msg = err instanceof Error ? err.message : "Erro de rede";
    const isProd = process.env.NODE_ENV === "production";
    const userMessage = "Falha ao conectar com a API. Tente novamente em instantes.";
    const debugMessage = `Falha ao conectar com a API: ${msg}. Verifique se o backend está rodando em ${API_BASE_URL}`;
    throw new Error(isProd ? userMessage : debugMessage);
  }
}

/** Após login bem-sucedido: limpa JWT legado e marca que o cookie de sessão deve existir. */
export function setToken(_token?: string) {
  if (typeof window === "undefined") return;
  purgeLegacyTokenStorage();
  try {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sessionStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  if (typeof window === "undefined") return;
  purgeLegacyTokenStorage();
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
    sessionStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* ignore */
  }
}
