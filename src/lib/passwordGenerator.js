// Generator Kata Sandi Acak Sementara yang aman, mudah dibaca, dan lolos validasi Auth.
// Karakter ambigu (0, O, 1, l, I) dihindari agar tidak keliru saat diketik di mobile/tablet.

const CHARS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CHARS_LOWER = "abcdefghjkmnpqrstuvwxyz";
const CHARS_NUM = "23456789";
const CHARS_SYM = "!@#$%*";

export function generateTempPassword(prefix = "Tjr") {
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  
  // Format: Tjr-XXXX#NNN (contoh: Tjr-8x4k#928 atau Tjr-Km9p!384)
  let mid = "";
  for (let i = 0; i < 4; i++) {
    mid += i % 2 === 0 ? pick(CHARS_UPPER) : pick(CHARS_LOWER);
  }
  
  let num = "";
  for (let i = 0; i < 3; i++) {
    num += pick(CHARS_NUM);
  }

  const sym = pick(CHARS_SYM);
  return `${prefix}-${mid}${sym}${num}`;
}

export async function copyToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback jika clipboard API diblokir
    }
  }
  
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
