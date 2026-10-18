// Pasang hook Git dari folder .githooks (dijalankan otomatis oleh `npm install` lewat skrip "prepare").
// Tidak pernah menggagalkan instalasi: bila bukan repositori Git atau Git tak tersedia, diam saja.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  if (existsSync(path.join(ROOT, ".git")) && existsSync(path.join(ROOT, ".githooks"))) {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: ROOT, stdio: "ignore" });
  }
} catch {
  /* abaikan */
}
