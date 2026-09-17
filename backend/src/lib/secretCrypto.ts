import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function encryptionKey(): Buffer {
  const raw =
    String(process.env.TOKEN_ENCRYPTION_KEY || "").trim() ||
    String(process.env.JWT_SECRET || "").trim() ||
    "dev-token-encryption-key";
  return createHash("sha256").update(raw).digest();
}

/** Criptografa texto sensível (ex.: refresh token OAuth) com AES-256-GCM. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const parts = String(payload || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Formato de segredo criptografado inválido.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
