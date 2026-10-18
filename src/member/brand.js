// Warna merek Tenant → variabel CSS. Hanya hex 6 digit yang diterima; kontras teks tombol dihitung (WCAG) agar tetap terbaca.
export const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Teks di atas warna merek: putih atau hampir-hitam, mana yang kontrasnya lebih tinggi. */
export const inkOn = (hex) => (contrast(hex, "#ffffff") >= contrast(hex, "#101418") ? "#ffffff" : "#101418");
export function brandVars(accent) {
  if (!isHex(accent)) return {};
  return { "--color-accent": accent, "--color-accent-hover": accent, "--color-accent-ink": inkOn(accent), "--color-focus": accent };
}
