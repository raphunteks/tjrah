// Dipakai otomatis oleh vite.config.js bila paket @supabase/supabase-js belum terpasang
// (mis. `npm install` belum dijalankan ulang). Mode demo tetap jalan; mode Supabase memberi pesan jelas.
export function createClient() {
  throw new Error("Paket @supabase/supabase-js belum terpasang. Jalankan `npm install` lalu `npm run dev` ulang.");
}
