import { HAS_SUPABASE } from "../lib/supabase.js";

// Pilih adapter. Cabang demo dihapus total dari build produksi kecuali VITE_ALLOW_DEMO=1,
// sehingga data demo & salinan blueprint tidak pernah ikut terkirim ke publik.
export async function loadApi() {
  if (HAS_SUPABASE) return (await import("./supabase.js")).api;
  // eslint-disable-next-line no-undef
  if (__ALLOW_DEMO__) return (await import("./demo.js")).api;
  return null; // produksi tanpa konfigurasi → layar setup
}
