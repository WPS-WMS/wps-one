// Sempre usa a URL do backend. Se a env não estiver definida, cai no backend de produção.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://wps-one-backend-production.onrender.com";

// Exportar base da API para montar URLs completas (ex.: links de download)
export const API_BASE_URL = API_URL;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  // Compat: versões antigas podem ter salvo como "token"
  return localStorage.getItem("wps_token") || localStorage.getItem("token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const url = `${API_URL}${path.startsWith("/") ? path : "/" + path}`;
  try {
    const res = await fetch(url, { ...options, headers });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de rede";
    throw new Error(`Falha ao conectar com a API: ${msg}. Verifique se o backend está rodando em ${API_URL}`);
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
