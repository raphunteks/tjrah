// Vite plugin untuk menangani endpoint API provisioning akun & kirim email SMTP di localhost
import { provisionAndSendInvite, getMailTransporter } from "./inviteService.js";

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(data));
}

const recaptchaRateLimit = new Map();
const RECAPTCHA_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RECAPTCHA_MAX_ATTEMPTS = 5;

function checkRecaptchaRateLimit(ip) {
  if (!ip) return false;
  const now = Date.now();
  const history = recaptchaRateLimit.get(ip) || [];
  const valid = history.filter((ts) => now - ts < RECAPTCHA_RATE_LIMIT_WINDOW_MS);
  if (valid.length >= RECAPTCHA_MAX_ATTEMPTS) {
    recaptchaRateLimit.set(ip, valid);
    return true;
  }
  valid.push(now);
  recaptchaRateLimit.set(ip, valid);
  return false;
}

export function inviteSmtpPlugin() {
  return {
    name: "vite-plugin-invite-smtp",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];

        // Preflight CORS
        if (req.method === "OPTIONS" && (url === "/api/invite-account" || url === "/api/test-smtp" || url === "/api/hermes-dispatch" || url === "/api/send-test-email" || url === "/api/send-email" || url === "/api/verify-recaptcha")) {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
          return res.end();
        }

        // Endpoint: Verifikasi Google reCAPTCHA v2 (Checkbox) & v3 Server-Side dengan Rate Limiting
        if (url === "/api/verify-recaptcha" && req.method === "POST") {
          const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";
          if (checkRecaptchaRateLimit(clientIp)) {
            return sendJson(res, 429, {
              ok: false,
              error: "Terlalu banyak percobaan masuk dari alamat IP ini. Silakan tunggu 1 menit sebelum mencoba kembali."
            });
          }

          try {
            const body = await parseJsonBody(req);
            const { token, action, version } = body || {};
            const secretKeyV3 = (process.env.RECAPTCHA_SECRET_KEY || "").replace(/^['"](.*)['"]$/, "$1");
            const secretKeyV2 = (process.env.RECAPTCHA_V2_SECRET_KEY || process.env.SECRET_KEY_RECAPTCHAV2 || "").replace(/^['"](.*)['"]$/, "$1");
            const enabled = process.env.VITE_RECAPTCHA_ENABLED !== "false";

            if (!enabled || (!secretKeyV3 && !secretKeyV2)) {
              return sendJson(res, 200, { ok: true, score: 1.0, bypassed: true });
            }

            if (!token) {
              return sendJson(res, 400, { ok: false, error: "Token verifikasi reCAPTCHA wajib disertakan." });
            }

            const primaryKey = (version === "v2" && secretKeyV2) ? secretKeyV2 : (secretKeyV3 || secretKeyV2);

            const verifyGoogle = async (secKey) => {
              const params = new URLSearchParams();
              params.append("secret", secKey);
              params.append("response", token);
              if (clientIp) params.append("remoteip", clientIp);

              const gRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString()
              });
              if (!gRes.ok) throw new Error(`Google reCAPTCHA HTTP ${gRes.status}`);
              return await gRes.json();
            };

            let data = await verifyGoogle(primaryKey);
            if (!data.success && secretKeyV2 && secretKeyV3) {
              const altKey = primaryKey === secretKeyV2 ? secretKeyV3 : secretKeyV2;
              try {
                const altData = await verifyGoogle(altKey);
                if (altData.success) data = altData;
              } catch (e) {
                // Ignore fallback error
              }
            }

            if (data.success && (data.score === undefined || data.score >= 0.5)) {
              return sendJson(res, 200, {
                ok: true,
                score: data.score ?? 1.0,
                version: data.score !== undefined ? "v3" : "v2",
                action: data.action || action,
                hostname: data.hostname
              });
            }

            return sendJson(res, 403, {
              ok: false,
              error: "Verifikasi reCAPTCHA mendeteksi aktivitas mencurigakan atau skor risiko tinggi.",
              score: data.score ?? 0,
              codes: data["error-codes"] || []
            });
          } catch (err) {
            console.error("[reCAPTCHA Vite Plugin Error]", err);
            return sendJson(res, 500, {
              ok: false,
              error: "Gagal memverifikasi token ke server Google. Silakan coba kembali."
            });
          }
        }


        // Endpoint: Verifikasi Status SMTP
        if (url === "/api/test-smtp" && req.method === "GET") {
          try {
            const transporter = getMailTransporter();
            await transporter.verify();
            return sendJson(res, 200, { ok: true, message: "Koneksi SMTP Gmail Aktif & Terverifikasi" });
          } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        // Endpoint: Kirim Email Transaksional / OTP / Notifikasi Resmi via SMTP Gmail
        if ((url === "/api/send-test-email" || url === "/api/send-email") && req.method === "POST") {
          try {
            const body = await parseJsonBody(req);
            const transporter = getMailTransporter();
            const adminEmail = (process.env.ADMIN_EMAIL || "").replace(/^['"](.*)['"]$/, "$1");
            const senderName = (process.env.ADMIN_EMAIL_SENDER_NAME || "Tijarah System").replace(/^['"](.*)['"]$/, "$1");
            const recipient = (body.recipient || body.email || adminEmail).trim();
            const roleLabel = body.role || body.roleLabel || "Owner Merchant";
            const otpCode = body.otpCode || body.otp;
            const isOtp = body.kind === "pin_reset_otp" || Boolean(otpCode);

            if (!adminEmail || !recipient) {
              return sendJson(res, 400, { ok: false, error: "ADMIN_EMAIL belum dikonfigurasi di variabel lingkungan (.env.local)" });
            }

            let subject = body.customSubject || body.subject;
            let html = body.customHtml || body.html;

            // Template Khusus: Kode OTP Reset PIN S-Wallet
            if (isOtp && otpCode) {
              if (!subject) {
                subject = `[Tijarah S-Wallet] Kode OTP Reset PIN Transaksi: ${otpCode}`;
              }
              html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
                  <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px;">
                    <h2 style="color: #0B5D4B; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Tijarah Cloud OS</h2>
                    <p style="color: #64748b; margin: 4px 0 0; font-size: 12px; font-weight: 500;">S-Wallet Digital · Keamanan Finansial</p>
                  </div>

                  <h3 style="color: #0f172a; margin: 0 0 12px; font-size: 18px; font-weight: 700;">Otorisasi Reset PIN Transaksi</h3>
                  <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                    Halo <strong>${body.userName || "Pemilik Akun"}</strong>,
                  </p>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                    Kami menerima permintaan untuk mengatur ulang (reset) <strong>PIN Transaksi 6-Digit</strong> S-Wallet pada akun Anda. Masukkan kode One-Time Password (OTP) rahasia berikut pada antarmuka aplikasi untuk menyelesaikan pembaruan:
                  </p>

                  <div style="background: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #047857; font-weight: 700; margin-bottom: 8px;">KODE VERIFIKASI RAHASIA</div>
                    <div style="font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #065f46;">
                      ${otpCode}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                      Masa berlaku: <strong>5 Menit</strong>
                    </div>
                  </div>

                  <div style="background: #fff1f2; border-left: 4px solid #f43f5e; padding: 12px 16px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0; color: #9f1239; font-size: 12px; line-height: 1.5;">
                      <strong>PERINGATAN KEAMANAN:</strong> Jangan pernah memberikan kode OTP ini kepada siapa pun, termasuk staf yang mengatasnamakan Tijarah. Jika Anda tidak merasa melakukan permintaan ini, segera abaikan email ini dan perbarui kata sandi akun Anda.
                    </p>
                  </div>

                  <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0 16px;" />
                  <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
                    &copy; 2026 Tijarah Cloud OS · Pesan otomatis dari Sistem Keamanan S-Wallet
                  </p>
                </div>
              `;
            } else if (!html) {
              if (!subject) {
                subject = `[Tijarah OS] Uji Notifikasi Email Resmi - ${roleLabel}`;
              }
              html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
                  <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
                    <h2 style="color: #0B5D4B; margin: 0; font-size: 22px; font-weight: 700;">Tijarah Cloud OS</h2>
                    <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Smart Trade, Better Business</p>
                  </div>
                  <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Uji Saluran Pengiriman Email Resmi Berhasil</h3>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                    Halo, ini adalah pesan konfirmasi bahwa saluran pengiriman <strong>Email Resmi</strong> pada platform <strong>Tijarah OS</strong> untuk peran <strong>${roleLabel}</strong> telah terkonfigurasi dan berfungsi dengan sempurna.
                  </p>
                  <div style="background: #f8fafc; border-left: 4px solid #10b981; padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
                    <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Status Server SMTP:</strong> Terhubung & Terverifikasi (Gmail SMTP)</p>
                    <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Alamat Pengirim:</strong> ${adminEmail}</p>
                    <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Alamat Penerima:</strong> ${recipient}</p>
                    <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Waktu Pengiriman:</strong> ${new Date().toLocaleString("id-ID")}</p>
                  </div>
                  <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
                    Saluran ini akan digunakan secara otomatis oleh sistem untuk pengiriman laporan Z-Report harian toko, faktur tagihan langganan, verifikasi kredensial akun, dan penerbitan slip gaji resmi.
                  </p>
                  <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                  <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">&copy; 2026 Tijarah Cloud OS · Seluruh hak cipta dilindungi undang-undang.</p>
                </div>
              `;
            }

            const mailOptions = {
              from: `"${senderName}" <${adminEmail}>`,
              to: recipient,
              subject: subject,
              html: html
            };

            const info = await transporter.sendMail(mailOptions);
            return sendJson(res, 200, { ok: true, messageId: info.messageId, recipient });
          } catch (err) {
            console.error("[viteInvitePlugin] Error /api/send-test-email:", err);
            return sendJson(res, 500, { ok: false, error: err.message || "Gagal mengirim email" });
          }
        }

        // Endpoint: Provision Akun & Kirim Email Undangan
        if (url === "/api/invite-account" && req.method === "POST") {
          try {
            const body = await parseJsonBody(req);
            const result = await provisionAndSendInvite(body);
            return sendJson(res, 200, result);
          } catch (err) {
            console.error("[viteInvitePlugin] Error /api/invite-account:", err);
            return sendJson(res, 500, { ok: false, error: err.message || "Gagal memproses undangan" });
          }
        }

        // Endpoint: Dispatch ke Webhook Hermes (Bypass Browser CORS)
        if (url === "/api/hermes-dispatch" && req.method === "POST") {
          try {
            const body = await parseJsonBody(req);
            const defaultPhone = process.env.HERMES_DEFAULT_PHONE || "6285256739684";
            if (!body.target && !body.target_phone && !body.phone) {
              body.target = defaultPhone;
              body.target_phone = defaultPhone;
            }
            const testUrl = process.env.HERMES_WEBHOOK_TEST_URL || "https://webhook.dentsweb.my.id/webhook-test/tijarah";
            const prodUrl = process.env.HERMES_WEBHOOK_URL || "https://webhook.dentsweb.my.id/webhook/tijarah";

            // Coba testUrl dulu jika n8n canvas sedang dalam mode 'Execute workflow'
            let n8nRes = await fetch(testUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            }).catch(() => null);

            let modeUsed = "test";
            if (!n8nRes || !n8nRes.ok) {
              n8nRes = await fetch(prodUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
              }).catch(() => null);
              modeUsed = "production";
            }

            if (n8nRes && n8nRes.ok) {
              const data = await n8nRes.json().catch(() => ({ status: "success" }));
              return sendJson(res, 200, { ok: true, mode: modeUsed, data });
            } else {
              return sendJson(res, 502, { ok: false, mode: modeUsed, error: "Gateway n8n tidak merespons status 200" });
            }
          } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        next();
      });
    }
  };
}
