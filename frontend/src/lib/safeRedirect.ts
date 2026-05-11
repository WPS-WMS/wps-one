/** Evita open-redirect: só caminhos relativos internos. */
export function getSafeInternalRedirect(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.includes("://") || s.includes("\\")) return null;
  return s;
}
