/**
 * Deploy de migrations no Render/Neon.
 * Desabilita advisory lock (incompatível com pooler/Neon em alguns cenários).
 * Use apenas quando um deploy roda por vez.
 */
import { execSync } from "node:child_process";

process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1";

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: process.env,
});
