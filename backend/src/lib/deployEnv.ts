import type { Request } from "express";

/** Ambiente de produção (Render prod). QA/homolog com `APP_ENV` não conta como prod. */
export function isProductionDeploy(): boolean {
  const appEnv = String(process.env.APP_ENV || process.env.DEPLOY_ENV || "")
    .trim()
    .toLowerCase();
  if (["qa", "staging", "homolog", "homologacao", "hml"].includes(appEnv)) return false;
  if (["prod", "production"].includes(appEnv)) return true;
  return process.env.NODE_ENV === "production";
}

/**
 * Cadastro público de tenant: livre em dev/QA; em prod exige `TENANT_SIGNUP_SECRET`
 * e header `X-Tenant-Signup-Key` com o mesmo valor.
 */
export function isTenantSignupAllowed(req: Request): boolean {
  if (!isProductionDeploy()) return true;
  const secret = String(process.env.TENANT_SIGNUP_SECRET ?? "").trim();
  if (!secret) return false;
  const raw = req.headers["x-tenant-signup-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return typeof key === "string" && key === secret;
}
