import fs from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";
const dirs = [".next", "out"];

for (const dir of dirs) {
  const full = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(full)) continue;
  fs.rmSync(full, {
    recursive: true,
    force: true,
    maxRetries: isWindows ? 10 : 5,
    retryDelay: isWindows ? 500 : 200,
  });
}

/** Windows: aguarda handles de AV/indexação liberarem antes do próximo build. */
if (isWindows) {
  await new Promise((resolve) => setTimeout(resolve, 400));
}
