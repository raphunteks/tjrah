// RFC 6238 Time-based One-Time Password (TOTP) Implementation
// Mendukung Google Authenticator, Microsoft Authenticator, dan Authy
// Menggunakan Web Crypto API murni tanpa dependensi eksternal

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Decode Base32 string to Uint8Array
 * @param {string} str 
 * @returns {Uint8Array}
 */
export function base32Decode(str) {
  const cleaned = String(str || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Encode Uint8Array to Base32 string
 * @param {Uint8Array|number[]} bytes 
 * @returns {string}
 */
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Hasilkan Secret Key Base32 Acak (16 karakter standar Google Authenticator)
 * @returns {string}
 */
export function generateRandomSecret() {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return base32Encode(bytes);
}

/**
 * Format Secret Key dengan spasi setiap 4 karakter untuk kenyamanan baca manusia
 * @param {string} secret 
 * @returns {string} Contoh: "JBSW Y3DP EHPK 3PXP"
 */
export function formatSecretKey(secret) {
  const cleaned = String(secret || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  return cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
}

/**
 * Hasilkan URI Resmi otpauth:// untuk QR Code Google Authenticator
 * @param {Object} params
 * @param {string} params.secret
 * @param {string} params.account
 * @param {string} [params.issuer="Tijarah"]
 * @returns {string}
 */
export function buildOtpauthUri({ secret, account, issuer = "Tijarah" }) {
  const cleanSecret = String(secret || "").toUpperCase().replace(/[\s=-]/g, "");
  const cleanAccount = String(account || "user@tijarah.id").trim();
  const cleanIssuer = String(issuer || "Tijarah").trim();

  const label = `${cleanIssuer}:${cleanAccount}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${cleanSecret}&issuer=${encodeURIComponent(cleanIssuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Hitung sisa detik dalam jendela 30 detik TOTP
 * @returns {number} 1 - 30 detik
 */
export function getRemainingSeconds() {
  const epoch = Math.floor(Date.now() / 1000);
  return 30 - (epoch % 30);
}

/**
 * Generate 6-Digit TOTP Token menggunakan Web Crypto API
 * @param {string} secret 
 * @param {number} [stepOffset=0] 
 * @param {number} [timeMs=Date.now()] 
 * @returns {Promise<string>}
 */
export async function generateTOTP(secret, stepOffset = 0, timeMs = Date.now()) {
  const cleanSecret = String(secret || "").toUpperCase().replace(/[\s=-]/g, "");
  const keyBytes = base32Decode(cleanSecret);

  // Fallback jika secret kosong
  if (keyBytes.length === 0) return "000000";

  const subtle = globalThis.crypto?.subtle;

  const epoch = Math.floor(timeMs / 1000);
  const step = Math.floor(epoch / 30) + stepOffset;

  // Buffer 8-byte big-endian
  const counterBuf = new ArrayBuffer(8);
  const counterView = new DataView(counterBuf);
  counterView.setBigInt64(0, BigInt(step), false);

  if (subtle) {
    const cryptoKey = await subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: { name: "SHA-1" } },
      false,
      ["sign"]
    );

    const signature = await subtle.sign("HMAC", cryptoKey, counterBuf);
    const digest = new Uint8Array(signature);

    const offset = digest[digest.length - 1] & 0x0f;
    const code = (
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, "0");
  }

  return "000000";
}

/**
 * Verifikasi 6-Digit TOTP Token dari input pengguna terhadap Secret Key
 * Memeriksa jendela [-1, 0, +1] untuk toleransi jeda waktu jam HP pengguna
 * @param {string} token 
 * @param {string} secret 
 * @returns {Promise<boolean>}
 */
export async function verifyTOTP(token, secret) {
  const cleaned = String(token || "").trim().replace(/\D/g, "");
  if (cleaned.length !== 6) return false;

  const cleanSecret = String(secret || "").toUpperCase().replace(/[\s=-]/g, "");

  // Toleransi 1 jendela waktu (30 detik sebelumnya, sekarang, 30 detik sesudahnya)
  const offsets = [0, -1, 1];
  for (const offset of offsets) {
    const expected = await generateTOTP(cleanSecret, offset);
    if (expected === cleaned) {
      return true;
    }
  }

  return false;
}
