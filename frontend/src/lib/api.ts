// Sempre usa a URL do backend (deploy estático = Firebase Hosting; em dev o backend deve ter CORS).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wps_token");
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
  if (typeof window !== "undefined") localStorage.setItem("wps_token", token);
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem("wps_token");
}
