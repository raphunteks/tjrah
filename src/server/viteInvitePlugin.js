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

export function inviteSmtpPlugin() {
  return {
    name: "vite-plugin-invite-smtp",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];

        // Preflight CORS
        if (req.method === "OPTIONS" && (url === "/api/invite-account" || url === "/api/test-smtp" || url === "/api/hermes-dispatch" || url === "/api/send-test-email")) {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
          return res.end();
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

        // Endpoint: Kirim Email Uji Coba Resmi via SMTP Gmail
        if (url === "/api/send-test-email" && req.method === "POST") {
          try {
            const body = await parseJsonBody(req);
            const transporter = getMailTransporter();
            const adminEmail = (process.env.ADMIN_EMAIL || "").replace(/^['"](.*)['"]$/, "$1");
            const senderName = (process.env.ADMIN_EMAIL_SENDER_NAME || "Tijarah System").replace(/^['"](.*)['"]$/, "$1");
            const recipient = (body.recipient || body.email || adminEmail).trim();
            const roleLabel = body.role || "Owner Merchant";

            if (!adminEmail || !recipient) {
              return sendJson(res, 400, { ok: false, error: "ADMIN_EMAIL belum dikonfigurasi di variabel lingkungan (.env.local)" });
            }

            const mailOptions = {
              from: `"${senderName}" <${adminEmail}>`,
              to: recipient,
              subject: `[Tijarah OS] Uji Notifikasi Email Resmi - ${roleLabel}`,
              html: `
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
              `
            };

            const info = await transporter.sendMail(mailOptions);
            return sendJson(res, 200, { ok: true, messageId: info.messageId, recipient });
          } catch (err) {
            console.error("[viteInvitePlugin] Error /api/send-test-email:", err);
            return sendJson(res, 500, { ok: false, error: err.message || "Gagal mengirim email uji coba" });
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
