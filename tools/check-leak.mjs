// Fails if the built client bundle leaks secret lot values.
// Usage: node tools/check-leak.mjs [distDir]
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const DIR = process.argv[2] ?? "apps/client/dist";
const FORBIDDEN = ["trueValue", "trueTotal", "lotSecret"];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const exists = await stat(DIR).catch(() => null);
if (!exists) {
  console.error(`[check-leak] no existe ${DIR}: compila el cliente primero`);
  process.exit(1);
}

let failures = 0;
for (const file of await walk(DIR)) {
  if (!/\.(js|mjs|html|css|json)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`[check-leak] FUGA: "${needle}" encontrado en ${file}`);
      failures++;
    }
  }
}

if (failures > 0) process.exit(1);
console.log(`[check-leak] OK: sin valores secretos en ${DIR}`);