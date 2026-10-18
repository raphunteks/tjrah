// Skrip mandiri untuk menguji koneksi SMTP Gmail dan pratinjau template email undangan Tijarah
// Jalankan via: node --env-file=.env.local scripts/test-smtp-invite.mjs [target_email]

import "./_env.mjs";
import { getMailTransporter } from "../src/server/inviteService.js";
import { renderInviteEmailHtml } from "../src/server/emailTemplate.js";

const targetEmail = process.argv[2] || process.env.ADMIN_EMAIL;
if (!targetEmail) {
  console.error("ADMIN_EMAIL tidak ditemukan di .env.local atau argumen baris perintah.");
  process.exit(1);
}

console.log("\n========================================================");
console.log("  TIJARAH SMTP EMAIL TEST RUNNER");
console.log("========================================================");
console.log(`Menguji koneksi SMTP Gmail ke: ${process.env.ADMIN_EMAIL}`);
console.log(`Email tujuan uji coba: ${targetEmail}\n`);

try {
  const transporter = getMailTransporter();
  console.log("1. Memverifikasi kredensial SMTP...");
  await transporter.verify();
  console.log("   ✓ Kredensial SMTP Gmail VALID & Terhubung!");

  console.log("\n2. Mengirim email uji coba dengan template responsif Tijarah...");
  const html = renderInviteEmailHtml({
    fullName: "Budi Santoso (Test)",
    email: targetEmail,
    roleLabel: "Pemilik Usaha (Owner)",
    tenantName: "Kopi Harum Nusantara",
    branches: ["Cabang Sudirman", "Cabang Senopati"],
    tempPassword: "Tjr-8x4k#928",
    loginUrl: "http://localhost:5173/masuk",
    senderName: "Superadmin Tijarah"
  });

  const senderDisplayName = process.env.ADMIN_EMAIL_SENDER_NAME || "Tijarah System";
  const info = await transporter.sendMail({
    from: `"${senderDisplayName}" <${process.env.ADMIN_EMAIL}>`,
    to: targetEmail,
    subject: `[UJI COBA SMTP] Akses Akun Baru Anda di ${senderDisplayName} - Kopi Harum Nusantara (Owner)`,
    html: html
  });

  console.log(`   ✓ Email berhasil terkirim!`);
  console.log(`   Message ID: ${info.messageId}`);
  console.log(`   Silakan periksa kotak masuk / spam di: ${targetEmail}`);
  console.log("========================================================\n");
} catch (err) {
  console.error("   ✗ GAGAL:", err.message);
  process.exit(1);
}
