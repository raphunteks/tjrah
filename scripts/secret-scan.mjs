#!/usr/bin/env node
// Pemeriksa rahasia: gagal (exit 1) bila berkas yang dilacak Git berisi kunci, token, atau kata sandi asli.
//   node scripts/secret-scan.mjs            periksa semua berkas yang dilacak Git
//   node scripts/secret-scan.mjs --staged   periksa hanya isi yang akan di-commit (dipakai hook pre-commit)
// Temuan hanya mencetak berkas, baris, dan jenisnya. Nilai rahasia TIDAK pernah dicetak.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staged = process.argv.includes("--staged");

const SKIP_FILES = new Set(["package-lock.json"]);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|pdf|zip|gz|tgz)$/i;
// Nilai yang jelas pengganti (placeholder), bukan rahasia asli.
const PLACEHOLDER = /(<[^>]*>|\.\.\.|xxxx|your[-_ ]|changeme|ganti|contoh|example|placeholder|\*{3}|\$\{|\[YOUR|process\.env)/i;

const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

function files() {
  const out = git(staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"] : ["ls-files", "-z"]);
  return out.split("\0").filter(Boolean).filter((f) => !SKIP_FILES.has(path.basename(f)) && !SKIP_EXT.test(f));
}
function content(f) {
  if (staged) return git(["show", `:${f}`]);
  return readFileSync(path.join(ROOT, f), "utf8");
}

const b64 = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function jwtRole(tok) {
  try {
    return JSON.parse(b64(tok.split(".")[1])).role ?? null;
  } catch {
    return null;
  }
}

// [nama, ekspresi, penilai(match)->true bila rahasia asli]
const RULES = [
  ["JWT service_role Supabase", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, (m) => jwtRole(m[0]) === "service_role"],
  ["JWT dengan klaim peran selain anon", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, (m) => {
    const r = jwtRole(m[0]);
    return r !== null && r !== "anon";
  }],
  ["URL basis data berisi kata sandi", /postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s"']+)@/g, (m) => !PLACEHOLDER.test(m[1]) && !/^(password|pass|pwd)$/i.test(m[1])],
  ["URL Redis berisi token", /rediss?:\/\/[^:\s/@]*:([^@\s"']+)@/g, (m) => !PLACEHOLDER.test(m[1])],
  ["Kunci gaya sk-", /\bsk-[A-Za-z0-9][A-Za-z0-9-]{19,}/g, (m) => !PLACEHOLDER.test(m[0])],
  ["Personal access token Supabase", /\bsbp_[A-Za-z0-9]{20,}/g, () => true],
  ["Token GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}/g, () => true],
  ["Kunci pribadi", /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, () => true],
  ["Nilai KEY/TOKEN/SECRET/PASSWORD panjang", /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*["']?([A-Za-z0-9+/_\-.=]{20,})["']?/g,
    (m) => !PLACEHOLDER.test(m[0]) && !/^(true|false|null)$/i.test(m[1]) && !/^[a-z][a-z0-9._:-]*$/.test(m[1])],
];

const findings = [];
for (const f of files()) {
  let text;
  try {
    text = content(f);
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 4000) return;
    for (const [name, re, isReal] of RULES) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        if (isReal(m)) findings.push({ f, line: i + 1, name });
      }
    }
  });
}

// Satu temuan per (berkas, baris, jenis)
const uniq = [...new Map(findings.map((x) => [`${x.f}:${x.line}:${x.name}`, x])).values()];
if (uniq.length) {
  console.error(`✖ Pemeriksa rahasia menemukan ${uniq.length} kemungkinan rahasia asli (nilai tidak dicetak):`);
  for (const x of uniq) console.error(`  ${x.f}:${x.line}  ${x.name}`);
  console.error("\nGanti dengan nilai pengganti, pindahkan rahasia ke .env.local atau `supabase secrets set`, dan ROTASI kunci yang sudah terlanjur ter-commit.");
  process.exit(1);
}
console.log(`✔ Tidak ada rahasia asli terdeteksi (${staged ? "isi yang akan di-commit" : "semua berkas terlacak"}).`);
