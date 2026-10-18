// Backend Service: Provisioning Supabase Auth Admin + Pengiriman Email Kredensial via SMTP Gmail
import nodemailer from "nodemailer";
import { createRequire } from "node:module";
import { renderInviteEmailHtml } from "./emailTemplate.js";

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
