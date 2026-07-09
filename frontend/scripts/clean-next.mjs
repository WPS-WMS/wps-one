import fs from "node:fs";
import path from "node:path";

const dirs = [".next", "out"];

for (const dir of dirs) {
  const full = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(full)) continue;
  fs.rmSync(full, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
