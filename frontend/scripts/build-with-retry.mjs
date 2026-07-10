import { spawnSync } from "node:child_process";

const npmScript = process.argv[2] ?? "build:qa";
const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  if (attempt > 1) {
    console.warn(`\n[build] Falha na tentativa ${attempt - 1}. Limpando cache e tentando novamente (${attempt}/${maxAttempts})…\n`);
    const clean = spawnSync("node", ["scripts/clean-next.mjs"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (clean.status !== 0) {
      process.exit(clean.status ?? 1);
    }
  }

  const result = spawnSync("npm", ["run", npmScript], {
    stdio: "inherit",
    shell: true,
  });

  if (result.status === 0) {
    process.exit(0);
  }
}

console.error(`\n[build] Falhou após ${maxAttempts} tentativas.\n`);
process.exit(1);
