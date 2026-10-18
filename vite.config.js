import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { inviteSmtpPlugin } from "./src/server/viteInvitePlugin.js";

const require = createRequire(import.meta.url);
const hasPkg = (name) => {
  try {
    require.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
};

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Kredensial publik Supabase boleh ditulis sebagai VITE_* atau NEXT_PUBLIC_* (mis. .env.local yang dipakai bersama proyek Next).
  // Nilai placeholder dari .env.example diabaikan. Hanya URL & anon key yang diteruskan ke browser — service role TIDAK.
  const real = (v) => (v && !/x{6,}|\.\.\.$|^eyJhbGciOi\.\.\./.test(v) ? v : "");
  process.env.VITE_SUPABASE_URL = real(env.VITE_SUPABASE_URL) || real(env.NEXT_PUBLIC_SUPABASE_URL);
  process.env.VITE_SUPABASE_ANON_KEY = real(env.VITE_SUPABASE_ANON_KEY) || real(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  process.env.SUPABASE_SERVICE_ROLE_KEY = real(env.SUPABASE_SERVICE_ROLE_KEY) || process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL_PASS = env.ADMIN_EMAIL_PASS || process.env.ADMIN_EMAIL_PASS;
  process.env.ADMIN_EMAIL_SENDER_NAME = env.ADMIN_EMAIL_SENDER_NAME || process.env.ADMIN_EMAIL_SENDER_NAME || "Tijarah System";
  // Literal boolean → cabang demo (data contoh + salinan blueprint) dihapus total dari build produksi.
  const allowDemo = mode === "development" || env.VITE_ALLOW_DEMO === "1";
  const supabaseInstalled = hasPkg("@supabase/supabase-js");
  if (!supabaseInstalled) {
    if (command === "build") throw new Error("@supabase/supabase-js belum terpasang. Jalankan `npm install` sebelum build.");
    console.warn("\n⚠ @supabase/supabase-js belum terpasang — dev server jalan di mode demo. Jalankan `npm install` untuk mode Supabase.\n");
  }
  return {
    plugins: [react(), inviteSmtpPlugin()],
    optimizeDeps: {
      include: ["leaflet"],
    },
    define: {
      __ALLOW_DEMO__: JSON.stringify(allowDemo),
      // Ditulis eksplisit agar fallback NEXT_PUBLIC_* berlaku di dev maupun build.
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
      "import.meta.env.ADMIN_EMAIL_SENDER_NAME": JSON.stringify(process.env.ADMIN_EMAIL_SENDER_NAME),
    },
    resolve: {
      alias: supabaseInstalled ? {} : { "@supabase/supabase-js": fileURLToPath(new URL("./src/lib/supabase-missing.js", import.meta.url)) },
    },
    build: {
      rollupOptions: {
        output: { manualChunks: { gsap: ["gsap", "@gsap/react"], supabase: ["@supabase/supabase-js"] } },
      },
    },
  };
});
