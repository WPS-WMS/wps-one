import { isAbsolute, join, normalize, relative, resolve } from "path";

/**
 * Raiz dos arquivos servidos em `/uploads/*` (portal, projetos, tickets, avatares).
 *
 * Em produção, defina `UPLOADS_ROOT` apontando para um volume persistente (fora da pasta
 * da release), para que anexos não se percam em redeploy, novo commit ou limpeza do
 * diretório da aplicação. Caminho absoluto ou relativo ao `process.cwd()`.
 */
export function getUploadsRoot(): string {
  const raw = process.env.UPLOADS_ROOT?.trim();
  if (raw) {
    return normalize(isAbsolute(raw) ? raw : resolve(process.cwd(), raw));
  }
  return join(process.cwd(), "uploads");
}

/**
 * Extrai o caminho público `/uploads/...` de URLs absolutas ou relativas.
 */
export function normalizeUploadsPublicUrl(publicUrl: string): string | null {
  let u = String(publicUrl || "").trim().replace(/\\/g, "/");
  if (!u) return null;
  const idx = u.indexOf("/uploads/");
  if (idx >= 0) u = u.slice(idx);
  else if (u.startsWith("uploads/")) u = `/${u}`;
  if (!u.startsWith("/uploads/")) return null;
  return u;
}

/**
 * Converte URL pública `/uploads/...` em caminho absoluto no disco, ou `null` se inválida.
 */
export function resolveUploadsPublicPath(publicUrl: string): string | null {
  const u = normalizeUploadsPublicUrl(publicUrl);
  if (!u) return null;
  const tail = u.slice("/uploads/".length).replace(/^\/+/, "");
  if (!tail || tail.includes("..")) return null;
  const segments = tail.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "..")) return null;
  return normalize(join(getUploadsRoot(), ...segments));
}

/** True se `absPath` está dentro de `rootDir` (sem path traversal). */
export function isPathInsideRoot(absPath: string, rootDir: string): boolean {
  const rel = relative(normalize(rootDir), normalize(absPath));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
