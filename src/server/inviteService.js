// Backend Service: Provisioning Supabase Auth Admin + Pengiriman Email Kredensial via SMTP Gmail
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { renderInviteEmailHtml, renderPasswordResetEmailHtml } from "./emailTemplate.js";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const ROLE_LABELS = {
  superadmin: "Superadmin",
  owner: "Pemilik Usaha (Owner)",
  gm: "General Manager",
  staff: "Kasir / Staf",
  dokter: "Dokter / Tenaga Medis",
  member: "Member Pelanggan"
};

// Ambil kredensial lingkungan secara fleksibel
function getEnv(key, fallback = "") {
  return (process.env[key] || fallback).replace(/^['"](.*)['"]$/, "$1");
}

let cachedTransporter = null;
export function getMailTransporter() {
  if (cachedTransporter) return cachedTransporter;
  
  const adminEmail = getEnv("ADMIN_EMAIL");
  const adminPass = getEnv("ADMIN_EMAIL_PASS").replace(/\s+/g, "");

  if (!adminEmail || !adminPass) {
    throw new Error("Kredensial ADMIN_EMAIL dan ADMIN_EMAIL_PASS belum dikonfigurasi di variabel lingkungan (.env.local)");
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: adminEmail,
      pass: adminPass
    }
  });

  return cachedTransporter;
}

let cachedSupabaseAdmin = null;
export function getSupabaseAdmin() {
  if (cachedSupabaseAdmin) return cachedSupabaseAdmin;
  
  const url = (getEnv("VITE_SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL")).replace(/\/+$/, "");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib dikonfigurasi di .env.local");
  }

  cachedSupabaseAdmin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return cachedSupabaseAdmin;
}

/**
 * Provision akun di Supabase Auth (email_confirm: true) + simpan Profil + kirim Email SMTP
 */
export async function provisionAndSendInvite({
  email,
  fullName,
  role = "staff",
  phone = null,
  tenantId = null,
  tenantName = "Tijarah Merchant",
  branches = [],
  branchNames = [],
  tempPassword,
  inviteId = null,
  loginUrl = "http://localhost:5173/masuk",
  senderName = null
}) {
  if (!email || !tempPassword) {
    throw new Error("Email dan kata sandi sementara wajib diisi");
  }

  const effectiveSenderName = senderName || getEnv("ADMIN_EMAIL_SENDER_NAME", "Tijarah System");
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName?.trim() || cleanEmail.split("@")[0];
  const roleLabel = ROLE_LABELS[role] || role;

  const supabaseAdmin = getSupabaseAdmin();
  let userId = null;

  // 1. Periksa apakah akun Auth sudah terdaftar
  try {
    const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (!listErr && userList?.users) {
      const found = userList.users.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (found) userId = found.id;
    }
  } catch (err) {
    console.warn("[inviteService] Gagal membaca listUsers:", err.message);
  }

  // 2. Buat atau perbarui akun di Supabase Auth dengan email_confirm: true
  if (!userId) {
    const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        role: role
      }
    });

    if (createErr) {
      // Jika error 'already registered', coba update kata sandi langsung
      if (/already|exists/i.test(createErr.message)) {
        // Ambil user id dan reset password
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        const existing = userList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (existing) {
          userId = existing.id;
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: cleanName, role: role }
          });
        } else {
          throw new Error(`Gagal membuat akun Auth: ${createErr.message}`);
        }
      } else {
        throw new Error(`Gagal membuat akun Auth: ${createErr.message}`);
      }
    } else {
      userId = createdUser.user.id;
    }
  } else {
    // User sudah ada, perbarui password dan pastikan email terkonfirmasi
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: cleanName, role: role }
    });
    if (updateErr) {
      throw new Error(`Gagal memperbarui kata sandi akun Auth: ${updateErr.message}`);
    }
  }

  // 3. Upsert data ke tabel profiles di PostgreSQL
  if (userId) {
    const mainBranch = role === "gm" || role === "owner" ? null : (branches[0] || null);
    try {
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        tenant_id: tenantId,
        branch_id: mainBranch,
        role: role,
        full_name: cleanName,
        email: cleanEmail,
        phone: phone || null,
        is_active: true
      }, { onConflict: "id" });
    } catch (profErr) {
      console.warn("[inviteService] Upsert profile peringatan:", profErr.message);
    }

    // Cabang tambahan bila ada
    if (branches.length > 0 && role !== "owner" && tenantId) {
      try {
        await supabaseAdmin.from("member_branches").delete().eq("profile_id", userId);
        const rows = branches.map((b) => ({ profile_id: userId, branch_id: b, tenant_id: tenantId }));
        await supabaseAdmin.from("member_branches").insert(rows);
      } catch (brErr) {
        console.warn("[inviteService] Member branches peringatan:", brErr.message);
      }
    }

    // Update staff_invites agar tercatat sent_at dan auth_user_id
    if (inviteId) {
      try {
        await supabaseAdmin.from("staff_invites").update({
          sent_at: new Date().toISOString(),
          auth_user_id: userId
        }).eq("id", inviteId);
      } catch (invErr) {
        console.warn("[inviteService] Update staff_invites peringatan:", invErr.message);
      }
    }
  }

  // 4. Kirim Email Kredensial via SMTP Gmail
  const transporter = getMailTransporter();
  const adminEmail = getEnv("ADMIN_EMAIL");
  const senderDisplayName = getEnv("ADMIN_EMAIL_SENDER_NAME", "Tijarah System");

  const effectiveBranches = branchNames.length > 0 ? branchNames : branches;
  const htmlContent = renderInviteEmailHtml({
    fullName: cleanName,
    email: cleanEmail,
    roleLabel: roleLabel,
    tenantName: tenantName || "Tijarah Merchant",
    branches: effectiveBranches,
    tempPassword: tempPassword,
    loginUrl: loginUrl,
    senderName: senderName || senderDisplayName
  });

  const mailOptions = {
    from: `"${senderDisplayName}" <${adminEmail}>`,
    to: cleanEmail,
    subject: `Akses Akun Baru Anda di ${senderDisplayName} - ${tenantName || "Bisnis Anda"} (${roleLabel})`,
    html: htmlContent
  };

  let emailSent = false;
  let emailError = null;

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[inviteService] Email berhasil dikirim ke ${cleanEmail}: ${info.messageId}`);
    emailSent = true;
  } catch (err) {
    console.error(`[inviteService] Gagal mengirim email via SMTP:`, err);
    emailError = err.message;
  }

  return {
    ok: true,
    userId: userId,
    email: cleanEmail,
    fullName: cleanName,
    role: role,
    tempPassword: tempPassword,
    emailSent: emailSent,
    emailError: emailError,
    message: emailSent
      ? `Akun ${cleanName} (${roleLabel}) berhasil diaktifkan dan email kredensial telah dikirim ke ${cleanEmail}.`
      : `Akun ${cleanName} (${roleLabel}) berhasil diaktifkan dengan kata sandi sementara, namun pengiriman email mengalami kendala (${emailError}). Silakan bagikan kata sandi secara langsung.`
  };
}

// -------------------------------------------------------------
// Fitur Atur Ulang Kata Sandi (Masa Berlaku Ketat 2 Menit / 120 Detik)
// -------------------------------------------------------------

// -------------------------------------------------------------
// Fitur Atur Ulang Kata Sandi (Masa Berlaku Ketat 2 Menit / 120 Detik)
// Arsitektur: Stateless Cryptographic HMAC-SHA256 Token + Supabase User Metadata Sync
// -------------------------------------------------------------

export const RESET_TOKEN_TTL_MS = 2 * 60 * 1000; // 2 menit

function getHmacSecret() {
  return (
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("VITE_SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY") ||
    "tijarah-security-salt-2026-production"
  );
}

export function cleanPhone(phone = "") {
  let p = String(phone || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (!p.startsWith("62") && p.length > 0) p = "62" + p;
  return p;
}

export function isStrongPassword(password = "") {
  const pwd = String(password || "");
  return (
    pwd.length >= 8 &&
    /[A-Z]/.test(pwd) &&
    /[a-z]/.test(pwd) &&
    /[0-9]/.test(pwd) &&
    /[~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
  );
}

/**
 * Pembuatan Token Kriptografis Mandiri (Stateless HMAC-SHA256)
 */
export function generatePasswordResetToken({ userId, email, expiresInMs = RESET_TOKEN_TTL_MS }) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + expiresInMs;
  const payloadObj = {
    userId,
    email: String(email).trim().toLowerCase(),
    expiresAt,
    nonce
  };
  const payloadStr = JSON.stringify(payloadObj);
  const payloadBase64 = Buffer.from(payloadStr).toString("base64url");
  const signature = crypto.createHmac("sha256", getHmacSecret()).update(payloadBase64).digest("base64url");
  const token = `${payloadBase64}.${signature}`;
  return { token, nonce, expiresAt, payload: payloadObj };
}

/**
 * Permintaan Tautan Reset Kata Sandi via Email SMTP Gmail (2 Menit)
 */
export async function requestPasswordResetToken({ email, origin = "http://localhost:5173" }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { ok: false, error: "Alamat email tidak valid." };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("[inviteService] Gagal memeriksa user di Supabase:", error);
    return { ok: false, error: "Gagal memeriksa database: " + error.message };
  }

  const targetUser = (data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === cleanEmail
  );

  if (!targetUser) {
    return {
      ok: false,
      error: "Alamat email tidak terdaftar dalam database sistem Tijarah."
    };
  }

  // Buat stateless cryptographic HMAC token
  const { token, nonce, expiresAt } = generatePasswordResetToken({
    userId: targetUser.id,
    email: cleanEmail,
    expiresInMs: RESET_TOKEN_TTL_MS
  });

  // Simpan status nonce di Supabase user_metadata untuk mencegah replay
  try {
    const existingMeta = targetUser.user_metadata || {};
    await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      user_metadata: {
        ...existingMeta,
        reset_nonce: nonce,
        reset_expires_at: expiresAt
      }
    });
  } catch (err) {
    console.warn("[inviteService] Warning: Gagal menyimpan reset_nonce di Supabase:", err.message);
  }

  const cleanOrigin = origin.replace(/\/+$/, "");
  const resetUrl = `${cleanOrigin}/reset-password?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

  const transporter = getMailTransporter();
  const adminEmail = getEnv("ADMIN_EMAIL");
  const senderDisplayName = getEnv("ADMIN_EMAIL_SENDER_NAME", "Tijarah System");

  const htmlContent = renderPasswordResetEmailHtml({
    fullName: targetUser.user_metadata?.full_name || cleanEmail,
    email: cleanEmail,
    resetUrl,
    expiresInMinutes: 2,
    senderName: senderDisplayName
  });

  const mailOptions = {
    from: `"${senderDisplayName}" <${adminEmail}>`,
    to: cleanEmail,
    subject: `[Tijarah OS] Permintaan Atur Ulang Kata Sandi Akun (${cleanEmail})`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[inviteService] Email reset kata sandi terkirim ke ${cleanEmail}: ${info.messageId}`);
    return {
      ok: true,
      message: "Tautan atur ulang kata sandi berhasil dikirim ke email Anda. Tautan hanya berlaku selama 2 menit.",
      expiresInSeconds: 120
    };
  } catch (err) {
    console.error("[inviteService] Gagal mengirim email reset via SMTP:", err);
    return {
      ok: false,
      error: "Gagal mengirimkan email via server SMTP: " + err.message
    };
  }
}

/**
 * Validasi Masa Berlaku Token Reset Kata Sandi (2 Menit, Stateless HMAC + Supabase Replay Guard)
 */
export async function verifyPasswordResetToken({ token, email }) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "Tautan atur ulang kata sandi tidak valid atau rusak." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "Format tautan atur ulang kata sandi tidak valid." };
  }

  const [payloadBase64, providedSig] = parts;
  const expectedSig = crypto.createHmac("sha256", getHmacSecret()).update(payloadBase64).digest("base64url");

  const expectedBuf = Buffer.from(expectedSig);
  const providedBuf = Buffer.from(providedSig);
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, error: "Tanda tangan keamanan token tidak sah atau telah dimodifikasi." };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "Data muatan token atur ulang rusak." };
  }

  const now = Date.now();
  if (now > payload.expiresAt) {
    return {
      ok: false,
      expired: true,
      error: "Tautan atur ulang kata sandi telah kedaluwarsa (batas waktu 2 menit telah habis). Silakan ajukan permohonan baru."
    };
  }

  if (email && payload.email !== String(email).trim().toLowerCase()) {
    return { ok: false, error: "Identitas email tidak sesuai dengan token." };
  }

  // Validasi keaktifan nonce di Supabase Auth user_metadata
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(payload.userId);
    if (!userError && userData?.user) {
      const activeNonce = userData.user.user_metadata?.reset_nonce;
      if (!activeNonce || activeNonce !== payload.nonce) {
        return {
          ok: false,
          error: "Tautan atur ulang kata sandi tidak valid atau telah digunakan sebelumnya."
        };
      }
    }
  } catch (err) {
    console.warn("[inviteService] Warning: Validasi nonce Supabase:", err.message);
  }

  const remainingSeconds = Math.max(0, Math.round((payload.expiresAt - now) / 1000));
  return {
    ok: true,
    userId: payload.userId,
    email: payload.email,
    remainingSeconds
  };
}

/**
 * Eksekusi Pembaruan Kata Sandi di Database Supabase
 */
export async function executePasswordReset({ token, email, newPassword }) {
  if (!isStrongPassword(newPassword)) {
    return {
      ok: false,
      error: "Kata sandi belum memenuhi seluruh 5 kriteria keamanan (minimal 8 karakter, huruf besar, huruf kecil, angka, dan simbol)."
    };
  }

  const verification = await verifyPasswordResetToken({ token, email });
  if (!verification.ok) {
    return verification;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(verification.userId);
  if (getUserError || !userData?.user) {
    return { ok: false, error: "Akun pengguna tidak ditemukan di database." };
  }

  // Bersihkan reset_nonce agar token langsung hangus (One-Time Use)
  const existingMeta = userData.user.user_metadata || {};
  const updatedMeta = { ...existingMeta };
  delete updatedMeta.reset_nonce;
  delete updatedMeta.reset_expires_at;

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(verification.userId, {
    password: newPassword,
    user_metadata: updatedMeta
  });

  if (updateError) {
    console.error("[inviteService] Gagal memperbarui kata sandi di Supabase:", updateError);
    return { ok: false, error: "Gagal memperbarui kata sandi di database: " + updateError.message };
  }

  return {
    ok: true,
    message: "Kata sandi akun Anda berhasil diperbarui di database. Silakan masuk menggunakan kata sandi baru."
  };
}

/**
 * Registrasi Akun Baru
 */
export async function registerNewAccount({ fullName, phone, email, password, referralCode = "" }) {
  const cleanName = String(fullName || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const sanitizedPhone = cleanPhone(phone);

  if (!cleanName) return { ok: false, error: "Nama lengkap wajib diisi." };
  if (!sanitizedPhone || sanitizedPhone.length < 10) return { ok: false, error: "Nomor WhatsApp/Telepon tidak valid (minimal 10 digit, diawali 62)." };
  if (!cleanEmail || !cleanEmail.includes("@")) return { ok: false, error: "Alamat email tidak valid." };
  if (!isStrongPassword(password)) {
    return {
      ok: false,
      error: "Kata sandi belum memenuhi seluruh 5 kriteria keamanan (minimal 8 karakter, huruf besar, huruf kecil, angka, dan simbol)."
    };
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (!listError && existingUsers?.users?.some(u => (u.email || "").toLowerCase() === cleanEmail)) {
    return { ok: false, error: "Email sudah terdaftar. Silakan gunakan menu Masuk atau Lupa Kata Sandi." };
  }

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: cleanName,
      phone: sanitizedPhone,
      referral_code: referralCode ? String(referralCode).trim() : null
    }
  });

  if (createError) {
    console.error("[inviteService] Gagal mendaftarkan user di Supabase Auth:", createError);
    return { ok: false, error: createError.message };
  }

  try {
    await supabaseAdmin.from("profiles").upsert({
      id: newUser.user.id,
      full_name: cleanName,
      phone: sanitizedPhone,
      role: "owner"
    });
  } catch (err) {
    console.warn("[inviteService] Notice: profiles upsert:", err.message);
  }

  return {
    ok: true,
    userId: newUser.user.id,
    email: cleanEmail,
    fullName: cleanName,
    message: "Akun Anda berhasil didaftarkan. Silakan masuk menggunakan email dan kata sandi baru Anda."
  };
}

