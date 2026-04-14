import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Next.js static export (App Router) writes Flight payloads like:
 *   out/login/__next.login/__PAGE__.txt
 *
 * Some static hosts end up requesting:
 *   /login/__next.login.__PAGE__.txt
 *
 * This script creates compatibility copies next to each route folder.
 */

const OUT_DIR = path.resolve(process.cwd(), "out");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = [];
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(path.join(dir, e.name));
    else if (e.isFile()) files.push(path.join(dir, e.name));
  }
  return { dirs, files };
}

async function main() {
  if (!(await exists(OUT_DIR))) return;

  const queue = [OUT_DIR];
  while (queue.length) {
    const dir = queue.pop();
    const { dirs } = await walk(dir);
    for (const childDir of dirs) {
      queue.push(childDir);

      const base = path.basename(childDir);
      if (!base.startsWith("__next.")) continue;

      const pageTxt = path.join(childDir, "__PAGE__.txt");
      if (!(await exists(pageTxt))) continue;

      const targetTxt = path.join(path.dirname(childDir), `${base}.__PAGE__.txt`);
      if (await exists(targetTxt)) continue;

      const buf = await readFile(pageTxt);
      await writeFile(targetTxt, buf);
    }
  }
}

await main();

