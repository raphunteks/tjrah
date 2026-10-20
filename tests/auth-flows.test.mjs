import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanPhone,
  isStrongPassword,
  generatePasswordResetToken,
  RESET_TOKEN_TTL_MS,
  verifyPasswordResetToken
} from "../src/server/inviteService.js";
import { checkPasswordCriteria } from "../src/auth/passwordRules.js";

test("Password Criteria: Memverifikasi 5 kriteria kekuatan kata sandi secara akurat", () => {
  // Kurang simbol
  const r1 = checkPasswordCriteria("Tijarah123");
  assert.equal(r1.hasMinLength, true);
  assert.equal(r1.hasUpperCase, true);
  assert.equal(r1.hasLowerCase, true);
  assert.equal(r1.hasNumber, true);
  assert.equal(r1.hasSymbol, false);
  assert.equal(r1.isValid, false);

  // Kurang angka
  const r2 = checkPasswordCriteria("Tijarah!@#");
  assert.equal(r2.hasNumber, false);
  assert.equal(r2.isValid, false);

  // Kurang huruf besar
  const r3 = checkPasswordCriteria("tijarah123!@#");
  assert.equal(r3.hasUpperCase, false);
  assert.equal(r3.isValid, false);

  // Kurang minimal 8 karakter
  const r4 = checkPasswordCriteria("Ti1!a");
  assert.equal(r4.hasMinLength, false);
  assert.equal(r4.isValid, false);

  // Lengkap seluruh 5 kriteria (Sesuai Gambar 2)
  const r5 = checkPasswordCriteria("Tijarah2026!#");
  assert.equal(r5.hasMinLength, true);
  assert.equal(r5.hasUpperCase, true);
  assert.equal(r5.hasLowerCase, true);
  assert.equal(r5.hasNumber, true);
  assert.equal(r5.hasSymbol, true);
  assert.equal(r5.isValid, true);
  assert.equal(isStrongPassword("Tijarah2026!#"), true);
});

test("Sanitasi No Telp / WhatsApp: Format 62+ otomatis", () => {
  assert.equal(cleanPhone("08123456789"), "628123456789");
  assert.equal(cleanPhone("628123456789"), "628123456789");
  assert.equal(cleanPhone("+62 812-3456-789"), "628123456789");
  assert.equal(cleanPhone("8123456789"), "628123456789");
});

test("Reset Password Token: Stateless HMAC-SHA256 Token & Masa berlaku ketat 2 menit (120 detik)", async () => {
  const dummyUserId = "usr-test-12345";
  const dummyEmail = "owner@tijarah.id";

  // 1. Buat token yang masih berlaku (120 detik)
  const { token } = generatePasswordResetToken({
    userId: dummyUserId,
    email: dummyEmail,
    expiresInMs: RESET_TOKEN_TTL_MS
  });

  assert.equal(typeof token, "string");
  assert.equal(token.includes("."), true);

  const validRes = await verifyPasswordResetToken({ token, email: dummyEmail });
  assert.equal(validRes.ok, true);
  assert.equal(validRes.email, dummyEmail);
  assert.equal(validRes.remainingSeconds > 0, true);

  // Ekstraksi email otomatis tanpa mencocokkan parameter email
  const autoEmailRes = await verifyPasswordResetToken({ token, email: "" });
  assert.equal(autoEmailRes.ok, true);
  assert.equal(autoEmailRes.email, dummyEmail);

  // 2. Token kedaluwarsa (> 2 menit)
  const { token: expiredToken } = generatePasswordResetToken({
    userId: dummyUserId,
    email: dummyEmail,
    expiresInMs: -1000 // Sudah lewat
  });

  const expiredRes = await verifyPasswordResetToken({ token: expiredToken, email: dummyEmail });
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.expired, true);
  assert.match(expiredRes.error, /kedaluwarsa|2 menit/i);

  // 3. Token dimanipulasi (Tamper check)
  const tamperedToken = token.slice(0, -4) + "XXXX";
  const tamperedRes = await verifyPasswordResetToken({ token: tamperedToken, email: dummyEmail });
  assert.equal(tamperedRes.ok, false);
  assert.match(tamperedRes.error, /tidak sah|dimodifikasi/i);

  // 4. Token salah identitas email
  const mismatchRes = await verifyPasswordResetToken({ token, email: "other@tijarah.id" });
  assert.equal(mismatchRes.ok, false);
  assert.match(mismatchRes.error, /identitas email/i);
});
