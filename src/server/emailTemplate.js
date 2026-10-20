// Template Email Undangan Akun Baru Tijarah
// Didesain responsif Paripurna untuk Desktop, Tablet, dan Mobile.
// Palet warna: Obsidian Black & Emerald Gold (#0B1310, #131F19, #10B981, #F59E0B).

export function renderInviteEmailHtml({
  fullName = "Pengguna",
  email = "",
  roleLabel = "Anggota Tim",
  tenantName = "Tijarah Merchant",
  branches = [],
  tempPassword = "",
  loginUrl = "http://localhost:5173/masuk",
  senderName = (typeof process !== "undefined" && process.env?.ADMIN_EMAIL_SENDER_NAME) || "Tijarah System"
}) {
  const branchText = branches.length > 0 ? branches.join(", ") : "Seluruh Cabang";
  
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Akses Akun Baru Tijarah - ${tenantName}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    /* Reset styles */
    body, p, h1, h2, h3, table, td { margin: 0; padding: 0; }
    body { width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; margin: 0; padding: 0; background-color: #070B09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E2E8F0; }
    img { outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; border: none; display: block; }
    a { color: #10B981; text-decoration: none; }
    .email-container { max-width: 600px; margin: 0 auto; width: 100%; }
    
    /* Responsive styles */
    @media only screen and (max-width: 620px) {
      .mobile-padding { padding-left: 18px !important; padding-right: 18px !important; }
      .mobile-card { padding: 24px 18px !important; }
      .mobile-hero-title { font-size: 22px !important; line-height: 28px !important; }
      .mobile-btn { width: 100% !important; display: block !important; text-align: center !important; }
      .credential-table td { display: block !important; width: 100% !important; padding-bottom: 6px !important; }
    }
  </style>
</head>
<body style="background-color: #070B09; margin: 0; padding: 30px 10px; -webkit-font-smoothing: antialiased;">

  <!-- Main Wrapper -->
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#070B09">
    <tr>
      <td align="center">
        
        <!-- Container -->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; margin: 0 auto;">
          
          <!-- Top Header Brand -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 999px;">
                      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #10B981;">
                        TIJARAH &bull; OFFICIAL ACCESS
                      </span>
                    </div>
                    <h1 style="margin: 12px 0 2px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF;">
                      TIJARAH
                    </h1>
                    <p style="font-size: 13px; color: #64748B; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase;">
                      Smart Trade, Better Business
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card Content -->
          <tr>
            <td style="background: linear-gradient(180deg, #131E18 0%, #0F1713 100%); border: 1px solid #1E3326; border-radius: 16px; padding: 36px 32px; box-shadow: 0 16px 40px rgba(0,0,0,0.4);" class="mobile-card">
              
              <!-- Salutation & Welcome -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 600; color: #10B981; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;">
                      Aktivasi Akun Baru
                    </div>
                    <h2 class="mobile-hero-title" style="font-size: 24px; font-weight: 700; color: #F1F5F9; line-height: 32px; margin-bottom: 14px;">
                      Selamat Datang, ${fullName}
                    </h2>
                    <p style="font-size: 15px; color: #94A3B8; line-height: 24px; margin-bottom: 22px;">
                      Anda telah resmi didaftarkan untuk bergabung ke platform operasional <strong style="color: #FFFFFF;">${tenantName}</strong> dengan hak akses peran <span style="display: inline-block; padding: 2px 8px; background: rgba(16, 185, 129, 0.18); border-radius: 6px; color: #34D399; font-weight: 600; font-size: 13px;">${roleLabel}</span>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Credential Box (Hero Highlight) -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 26px;">
                <tr>
                  <td style="background: #090F0C; border: 1px solid #1A3023; border-left: 4px solid #10B981; border-radius: 12px; padding: 20px 22px;">
                    <div style="font-size: 11px; font-weight: 700; color: #6EE7B7; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">
                      KREDENSIAL MASUK ANDA (SIAP PAKAI)
                    </div>
                    
                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="credential-table">
                      <tr>
                        <td width="35%" style="font-size: 13px; color: #94A3B8; padding: 5px 0;">Email Masuk:</td>
                        <td width="65%" style="font-size: 14px; font-weight: 600; color: #FFFFFF; font-family: monospace; padding: 5px 0;">${email}</td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size: 13px; color: #94A3B8; padding: 5px 0;">Kata Sandi Sementara:</td>
                        <td width="65%" style="padding: 5px 0;">
                          <span style="font-size: 16px; font-weight: 700; color: #34D399; background: rgba(16, 185, 129, 0.15); padding: 4px 10px; border-radius: 6px; border: 1px dashed rgba(16, 185, 129, 0.4); font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; letter-spacing: 0.05em; display: inline-block;">
                            ${tempPassword}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size: 13px; color: #94A3B8; padding: 5px 0;">Penempatan Cabang:</td>
                        <td width="65%" style="font-size: 13px; font-weight: 500; color: #CBD5E1; padding: 5px 0;">${branchText}</td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size: 13px; color: #94A3B8; padding: 5px 0;">Status Akun:</td>
                        <td width="65%" style="font-size: 13px; font-weight: 600; color: #10B981; padding: 5px 0;">Aktif & Siap Digunakan</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Button CTA -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 26px;">
                <tr>
                  <td align="center">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="mobile-btn">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: #10B981;">
                          <a href="${loginUrl}" target="_blank" style="font-size: 15px; font-weight: 700; color: #070B09; text-decoration: none; padding: 14px 32px; border-radius: 10px; display: inline-block; letter-spacing: 0.02em; background-color: #10B981; border: 1px solid #10B981;">
                            Masuk ke Dashboard Sekarang &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top: 10px; font-size: 12px; color: #64748B;">
                      Atau buka langsung via tautan: <a href="${loginUrl}" style="color: #10B981; word-break: break-all;">${loginUrl}</a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="24" valign="top" style="padding-right: 10px;">
                          <span style="font-size: 16px;">&#128274;</span>
                        </td>
                        <td style="font-size: 12px; color: #FCD34D; line-height: 18px;">
                          <strong>Panduan Keamanan:</strong> Demi keamanan data usaha Anda, segera perbarui kata sandi sementara ini setelah Anda pertama kali masuk melalui menu <strong>Akun &gt; Keamanan &amp; Kredensial</strong>.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Steps Guide -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-top: 6px; border-top: 1px solid #1E2E25;">
                    <div style="font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; margin-top: 14px;">
                      Langkah Pertama Penggunaan:
                    </div>
                    <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #94A3B8; line-height: 22px;">
                      <li>Buka halaman masuk di atas.</li>
                      <li>Masukkan email <strong>${email}</strong> dan kata sandi sementara yang diberikan.</li>
                      <li>Nikmati seluruh fitur bisnis dan pantau operasional secara realtime.</li>
                    </ol>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Information -->
          <tr>
            <td align="center" style="padding-top: 26px; padding-bottom: 30px;">
              <p style="font-size: 12px; color: #64748B; line-height: 18px; margin-bottom: 6px;">
                Email ini dikirim secara otomatis oleh sistem administrasi <strong>Tijarah</strong> atas permintaan ${senderName}.
              </p>
              <p style="font-size: 11px; color: #475569;">
                &copy; 2026 Tijarah &bull; Smart Trade, Better Business &bull; Seluruh hak cipta dilindungi.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * Template Email Atur Ulang Kata Sandi (Masa Berlaku 2 Menit)
 */
export function renderPasswordResetEmailHtml({
  fullName = "Pengguna",
  email = "",
  resetUrl = "http://localhost:5173/reset-password",
  expiresInMinutes = 2,
  senderName = (typeof process !== "undefined" && process.env?.ADMIN_EMAIL_SENDER_NAME) || "Tijarah System"
}) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atur Ulang Kata Sandi Tijarah</title>
  <style type="text/css">
    body, p, h1, h2, h3, table, td { margin: 0; padding: 0; }
    body { width: 100% !important; margin: 0; padding: 0; background-color: #070B09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #E2E8F0; }
    a { color: #10B981; text-decoration: none; }
    .email-container { max-width: 600px; margin: 0 auto; width: 100%; }
    @media only screen and (max-width: 620px) {
      .mobile-card { padding: 24px 18px !important; }
      .mobile-btn { width: 100% !important; display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="background-color: #070B09; margin: 0; padding: 30px 10px; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#070B09">
    <tr>
      <td align="center">
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 800; color: #10B981; letter-spacing: -0.02em;">Tijarah</span>
            </td>
          </tr>
          <tr>
            <td class="mobile-card" bgcolor="#0F1713" style="background-color: #0F1713; border: 1px solid #1E2E25; border-radius: 14px; padding: 36px 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
              <h1 style="font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 28px; margin-bottom: 12px;">
                Permintaan Atur Ulang Kata Sandi
              </h1>
              <p style="font-size: 14px; color: #94A3B8; line-height: 22px; margin-bottom: 20px;">
                Halo <strong>${fullName || email}</strong>, kami menerima permintaan untuk mengatur ulang kata sandi akun Tijarah Anda (${email}).
              </p>

              <!-- Kotak Peringatan Batas Waktu 2 Menit -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <p style="font-size: 13px; font-weight: 700; color: #F59E0B; margin-bottom: 4px;">
                      PENTING: Tautan Hanya Berlaku ${expiresInMinutes} Menit
                    </p>
                    <p style="font-size: 12px; color: #CBD5E1; line-height: 18px;">
                      Demi keamanan brankas akun Anda, tautan ini akan otomatis kedaluwarsa setelah 2 menit sejak email ini dikirim.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Tombol Utama -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td align="center" bgcolor="#10B981" style="border-radius: 8px;">
                    <a href="${resetUrl}" target="_blank" class="mobile-btn" style="font-size: 14px; font-weight: 700; color: #042F1E; text-decoration: none; padding: 14px 32px; display: inline-block; border-radius: 8px;">
                      Atur Ulang Kata Sandi Saya
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; color: #64748B; line-height: 18px; margin-bottom: 16px; word-break: break-all;">
                Atau salin tautan berikut ke peramban Anda:<br>
                <a href="${resetUrl}" style="color: #10B981;">${resetUrl}</a>
              </p>

              <hr style="border: 0; border-top: 1px solid #1E2E25; margin: 20px 0;" />

              <p style="font-size: 12px; color: #94A3B8; line-height: 18px;">
                Jika Anda tidak meminta pengaturan ulang kata sandi ini, silakan abaikan email ini. Kata sandi akun Anda tetap aman dan tidak berubah.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top: 24px; padding-bottom: 30px;">
              <p style="font-size: 11px; color: #475569;">
                &copy; 2026 Tijarah &bull; Smart Trade, Better Business &bull; Seluruh hak cipta dilindungi.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

