/**
 * Monta header Content-Disposition seguro (RFC 5987).
 * Evita TypeError ERR_INVALID_CHAR em Node quando o nome tem acentos,
 * aspas, quebras de linha ou outros caracteres fora de ISO-8859-1.
 */
export function contentDispositionAttachment(filename: string | null | undefined, fallback = "download"): string {
  const raw = String(filename ?? fallback)
    .replace(/[\r\n\0]/g, " ")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 180);
  const safe = raw || fallback;

  // filename= clássico: só ASCII imprimível (sem aspas / barra)
  const ascii = safe
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || fallback;

  const encoded = encodeURIComponent(safe).replace(/['()]/g, escape);

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
