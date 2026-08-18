/**
 * Deploy de migrations no Render/Neon.
 * - Desabilita advisory lock (pooler/Neon).
 * - Marca migrations falhas como rolled-back para permitir reaplicação (P3009).
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1";

async function resolveFailedMigrations() {
  const prisma = new PrismaClient();
  try {
    const failed = await prisma.$queryRaw`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
        AND started_at IS NOT NULL
    `;
    if (!Array.isArray(failed) || failed.length === 0) return;

    for (const row of failed) {
      const name = String(row.migration_name ?? "").trim();
      if (!name) continue;
      console.log(`[migrate] Resolving failed migration as rolled-back: ${name}`);
      execSync(`npx prisma migrate resolve --rolled-back "${name}"`, {
        stdio: "inherit",
        env: process.env,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

await resolveFailedMigrations();

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: process.env,
});
