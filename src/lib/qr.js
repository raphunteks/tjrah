// Pembuat QR Code (ISO/IEC 18004) tanpa dependensi: mode byte, koreksi galat level M, versi 1–10 (hingga 213 byte).
// Cukup untuk token kartu Member. Diuji dengan decoder independen (lihat tests/qr.test.mjs bila OpenCV tersedia).

// [data codewords total, ec codewords per block, [[jumlah blok, data per blok], …]] untuk level M
const SPEC = [null,
  [16, 10, [[1, 16]]], [28, 16, [[1, 28]]], [44, 26, [[1, 44]]], [64, 18, [[2, 32]]], [86, 24, [[2, 43]]],
  [108, 16, [[4, 27]]], [124, 18, [[4, 31]]], [154, 22, [[2, 38], [2, 39]]], [182, 22, [[3, 36], [2, 37]]], [216, 26, [[4, 43], [1, 44]]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256), polinomial 0x11D
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function rsRemainder(data, n) {
  const g = rsGenerator(n);
  const r = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift();
    r.push(0);
    if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

const bch = (value, poly, bits) => {
  const hi = (v) => 31 - Math.clz32(v);
  let v = value << bits;
  while (v && hi(v) >= hi(poly)) v ^= poly << (hi(v) - hi(poly));
  return (value << bits) | v;
};

function encodeData(bytes, version) {
  const [total] = SPEC[version];
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = total * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0; out.length < total; pad ^= 1) out.push(pad ? 0x11 : 0xec);
  return out;
}

function interleave(data, version) {
  const [, ecLen, groups] = SPEC[version];
  const blocks = [];
  let pos = 0;
  for (const [count, size] of groups) for (let i = 0; i < count; i++) { const d = data.slice(pos, pos + size); pos += size; blocks.push({ d, e: rsRemainder(d, ecLen) }); }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function build(version, codewords, mask) {
  const n = 17 + version * 4;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false)); // modul fungsi (tidak ditopeng)
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = v; fn[r][c] = true; } };

  const finder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(r0 + dr, c0 + dc, dark);
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const ap = ALIGN[version];
  for (const r of ap) for (const c of ap) {
    if ((r === 6 && c === 6) || (r === 6 && c === ap[ap.length - 1]) || (r === ap[ap.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(n - 8, 8, true); // modul gelap tetap
  // area format (dicadangkan, diisi kemudian)
  for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; }
  for (let i = 0; i < 8; i++) { fn[8][n - 1 - i] = true; fn[n - 1 - i][8] = true; }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fn[i][n - 11 + j] = true; fn[n - 11 + j][i] = true; }

  // data zigzag
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) {
      const row = ((right + 1) & 2) === 0 ? n - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (fn[row][c]) continue;
        const bit = k < bits.length ? bits[k++] === 1 : false;
        m[row][c] = bit !== MASKS[mask](row, c);
      }
    }
  }
  // format (level M = 00)
  const fmt = bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412;
  const fb = (i) => ((fmt >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = fb(i);
  m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  for (let i = 0; i < 8; i++) m[8][n - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i][8] = fb(i);
  m[n - 8][8] = true;
  if (version >= 7) {
    const vi = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) { const b = ((vi >> i) & 1) === 1; const a = Math.floor(i / 3), bb = (i % 3) + n - 11; m[a][bb] = b; m[bb][a] = b; }
  }
  return m;
}

function penalty(m) {
  const n = m.length;
  let p = 0;
  const run = (line) => {
    let s = 0, i = 0;
    while (i < n) { let j = i; while (j < n && line[j] === line[i]) j++; if (j - i >= 5) s += 3 + (j - i - 5); i = j; }
    return s;
  };
  for (let i = 0; i < n; i++) { p += run(m[i]); p += run(m.map((r) => r[i])); }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const rev = [...pat].reverse();
  const hit = (get) => { let s = 0; for (let i = 0; i <= n - 11; i++) { let a = true, b = true; for (let k = 0; k < 11; k++) { const v = get(i + k); if (v !== pat[k]) a = false; if (v !== rev[k]) b = false; } if (a || b) s += 40; } return s; };
  for (let i = 0; i < n; i++) { p += hit((k) => m[i][k]); p += hit((k) => m[k][i]); }
  let dark = 0; for (const r of m) for (const v of r) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

/** Matriks QR (true = modul gelap). Melempar bila teks lebih dari 213 byte. */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let version = 1;
  while (version <= 10 && Math.floor((SPEC[version][0] * 8 - 4 - (version < 10 ? 8 : 16)) / 8) < bytes.length) version++;
  if (version > 10) throw new Error("Teks terlalu panjang untuk QR (maks 213 byte)");
  const words = interleave(encodeData(bytes, version), version);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(version, words, mask);
    const s = penalty(m);
    if (s < bestScore) { best = m; bestScore = s; }
  }
  return best;
}

/** Path SVG (satu <path d>) untuk matriks, dengan zona sunyi `margin` modul. */
export function qrSvg(text, { margin = 4 } = {}) {
  const m = qrMatrix(text);
  const size = m.length + margin * 2;
  let d = "";
  m.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c]) d += `M${c + margin} ${r + margin}h1v1h-1z`; });
  return { size, d };
}
