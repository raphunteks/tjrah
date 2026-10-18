// Skrip otomatis untuk memastikan patch Babel pada @vitejs/plugin-react tetap aktif
// Mengatasi error: "babel2.transformAsync is not a function" saat runtime ESM/CJS interop.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const targets = [
  path.join(root, "node_modules/@vitejs/plugin-react/dist/index.mjs"),
  path.join(root, "node_modules/@vitejs/plugin-react/dist/index.cjs")
];

let patchedCount = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  let code = fs.readFileSync(target, "utf8");

  // Jika sudah ter-patch, lewati
  if (code.includes("raw.transformAsync ? raw : (raw.default || raw)")) {
    continue;
  }

  // Patch loadBabel function
  if (code.includes("babel = await import('@babel/core');")) {
    code = code.replace(
      "babel = await import('@babel/core');",
      "const raw = await import('@babel/core');\n  babel = (raw.transformAsync ? raw : (raw.default || raw));\n  if (!babel.transformAsync && raw.default?.transformAsync) babel = raw.default;"
    );
    fs.writeFileSync(target, code, "utf8");
    patchedCount++;
  } else if (code.includes("babel = await import(\"@babel/core\");")) {
    code = code.replace(
      "babel = await import(\"@babel/core\");",
      "const raw = await import(\"@babel/core\");\n  babel = (raw.transformAsync ? raw : (raw.default || raw));\n  if (!babel.transformAsync && raw.default?.transformAsync) babel = raw.default;"
    );
    fs.writeFileSync(target, code, "utf8");
    patchedCount++;
  }
}

if (patchedCount > 0) {
  console.log(`[patch-vite-babel] Berhasil mem-patch ${patchedCount} file @vitejs/plugin-react untuk kestabilan Babel.`);
}
