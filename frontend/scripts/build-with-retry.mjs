import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cleanScript = path.join(__dirname, "clean-next.mjs");
const npmScript = process.argv[2] ?? "build:qa";
const maxAttempts = 3;
const projectRoot = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function runClean() {
  const clean = spawnSync(process.execPath, [cleanScript], {
    stdio: "inherit",
    cwd: projectRoot,
  });
  if (clean.status !== 0) {
    console.warn("[build] Aviso: limpeza retornou código", clean.status);
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  // No Windows, limpa antes de toda tentativa (incluindo a 1ª) —
  // evita cache .next/out inconsistente e ENOENT em manifests/segments.
  if (attempt === 1 && isWindows) {
    console.log("[build] Limpando .next e out antes do build (Windows)…");
    runClean();
  } else if (attempt > 1) {
    console.warn(
      `\n[build] Falha na tentativa ${attempt - 1}. Limpando cache e tentando novamente (${attempt}/${maxAttempts})…\n`,
    );
    runClean();
    // Espera extra entre retries: AV/indexação no Windows ainda soltam arquivos.
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{}, 2000)"], {
      stdio: "ignore",
      cwd: projectRoot,
    });
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
