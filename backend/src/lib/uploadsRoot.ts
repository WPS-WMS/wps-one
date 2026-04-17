import { isAbsolute, join, normalize, resolve } from "path";

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
 * Converte URL pública `/uploads/...` em caminho absoluto no disco, ou `null` se inválida.
 */
export function resolveUploadsPublicPath(publicUrl: string): string | null {
  const u = String(publicUrl || "").trim().replace(/\\/g, "/");
  if (!u.startsWith("/uploads/")) return null;
  const tail = u.slice("/uploads/".length).replace(/^\/+/, "");
  if (!tail || tail.includes("..")) return null;
  const segments = tail.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "..")) return null;
  return normalize(join(getUploadsRoot(), ...segments));
}
