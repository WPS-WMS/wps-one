import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cleanScript = path.join(__dirname, "clean-next.mjs");
const npmScript = process.argv[2] ?? "build:qa";
const maxAttempts = 3;
const projectRoot = path.resolve(__dirname, "..");

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  if (attempt > 1) {
    console.warn(`\n[build] Falha na tentativa ${attempt - 1}. Limpando cache e tentando novamente (${attempt}/${maxAttempts})…\n`);
    const clean = spawnSync(process.execPath, [cleanScript], {
      stdio: "inherit",
      cwd: projectRoot,
    });
    if (clean.status !== 0) {
      process.exit(clean.status ?? 1);
    }
  }

  const result = spawnSync("npm", ["run", npmScript], {
    stdio: "inherit",
    shell: true,
    cwd: projectRoot,
  });

  if (result.status === 0) {
    process.exit(0);
  }
}

console.error(`\n[build] Falhou após ${maxAttempts} tentativas.\n`);
process.exit(1);
