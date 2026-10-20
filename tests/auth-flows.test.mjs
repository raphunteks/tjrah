import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanPhone,
  isStrongPassword,
  resetTokens,
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

test("Reset Password Token: Masa berlaku ketat 2 menit (120 detik)", () => {
  const dummyToken = "test-token-12345";
  const dummyEmail = "owner@tijarah.id";

  // 1. Simpan token yang masih berlaku (expiresAt = now + 120 detik)
  resetTokens.set(dummyToken, {
    token: dummyToken,
    userId: "usr-1",
    email: dummyEmail,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false
  });

  const validRes = verifyPasswordResetToken({ token: dummyToken, email: dummyEmail });
  assert.equal(validRes.ok, true);
  assert.equal(validRes.email, dummyEmail);
  assert.equal(validRes.remainingSeconds > 0, true);

  // 2. Token kedaluwarsa (dibuat 3 menit yang lalu)
  const expiredToken = "expired-token-67890";
  resetTokens.set(expiredToken, {
    token: expiredToken,
    userId: "usr-2",
    email: dummyEmail,
    expiresAt: Date.now() - 60000, // Lewat 1 menit dari batas
    used: false
  });

  const expiredRes = verifyPasswordResetToken({ token: expiredToken, email: dummyEmail });
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.expired, true);
  assert.match(expiredRes.error, /kedaluwarsa|2 menit/i);

  // 3. Token salah atau email tidak cocok
  const mismatchRes = verifyPasswordResetToken({ token: dummyToken, email: "other@tijarah.id" });
  assert.equal(mismatchRes.ok, false);
  assert.match(mismatchRes.error, /identitas email/i);
});
