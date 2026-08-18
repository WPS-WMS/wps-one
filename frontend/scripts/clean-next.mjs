import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const isWindows = process.platform === "win32";
const dirs = [".next", "out"];
const projectRoot = process.cwd();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Remove com retries do Node; no Windows também renomeia antes (libera handles). */
function removeDir(full) {
  if (!exists(full)) return;

  let target = full;
  if (isWindows) {
    const renamed = `${full}.__del_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      fs.renameSync(full, renamed);
      target = renamed;
    } catch {
      // Mantém o caminho original se o rename falhar (ex.: processo ainda usando).
    }
  }

  try {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: isWindows ? 15 : 5,
      retryDelay: isWindows ? 400 : 200,
    });
  } catch (err) {
    if (!isWindows) throw err;
    // Fallback: cmd rmdir (lida melhor com locks intermitentes).
    try {
      execFileSync("cmd.exe", ["/c", "rmdir", "/s", "/q", target], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      // Último recurso: robocopy espelha pasta vazia (padrão clássico no Windows).
      const empty = path.join(projectRoot, `.empty_clean_${Date.now()}`);
      fs.mkdirSync(empty, { recursive: true });
      try {
        execFileSync("robocopy", [empty, target, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        // robocopy usa exit codes especiais; ignoramos.
      }
      try {
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        // segue — a próxima tentativa do build pode limpar o que restou
      }
      try {
        fs.rmSync(empty, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

for (const dir of dirs) {
  removeDir(path.resolve(projectRoot, dir));
}

// Resíduos de limpezas anteriores (.next.__del_*)
if (isWindows) {
  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name.startsWith(".next.__del_") || entry.name.startsWith("out.__del_"))) {
      removeDir(path.join(projectRoot, entry.name));
    }
  }
}

/** Windows: aguarda AV/indexação liberarem handles antes do próximo build. */
if (isWindows) {
  await sleep(1200);
}
