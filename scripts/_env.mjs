// Muat .env.development.local (dibuat oleh `npm run supabase:create`) di atas nilai dari .env.local — persis urutan Vite,
// sehingga `npm run dev`, db:*, dan demo:users memakai proyek Supabase yang sama tanpa menyentuh .env.local.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OVERRIDE_FILE = path.join(ROOT, ".env.development.local");
export const OVERRIDE_ACTIVE = existsSync(OVERRIDE_FILE);

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}
if (OVERRIDE_ACTIVE) for (const [k, v] of Object.entries(parseEnv(readFileSync(OVERRIDE_FILE, "utf8")))) process.env[k] = v;
