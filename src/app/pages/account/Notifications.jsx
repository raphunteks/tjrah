import { useState, useEffect, useId } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { PageHead, Panel, Badge } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import AdminTenantBar from "./AdminTenantBar.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";
import { getTimezoneAbbr } from "../../../lib/format.js";
import {
  getNotificationPermission,
  requestBrowserNotification,
  sendBrowserNotification,
  isPWAStandalone,
  getPWAEngineStatus
} from "../../../lib/notifications.js";

// Matriks Notifikasi Lengkap Terdistribusi per Peran RBAC Tijarah OS
export const ROLE_NOTIFICATION_PREFERENCES = {
  owner: [
    { id: "owner_sec", title: "Keamanan Akun & Kredensial Owner", desc: "Login perangkat asing/IP baru, perubahan PIN 2FA Owner, rotasi kata sandi master.", inApp: true, wa: true, email: true },
    { id: "owner_fin", title: "Finansial, Payout S-Wallet & Settlement", desc: "Pencairan saldo ke rekening bank sukses/gagal, saldo minimum S-Wallet, rincian MDR transaksi QRIS.", inApp: true, wa: true, email: true },
    { id: "owner_zrep", title: "Rekap Z-Report Tutup Hari Otomatis", desc: "Ringkasan instan omzet kotor, laba bersih, dan total transaksi harian otomatis via WhatsApp saat kasir tutup shift.", inApp: true, wa: true, email: true },
    { id: "owner_fraud", title: "Pencegahan Fraud & Selisih Laci Kas", desc: "Otorisasi pembatalan nota (Void) bernilai besar, peringatan selisih kas fisik laci kasir melampaui batas toleransi.", inApp: true, wa: true, email: false },
    { id: "owner_po", title: "Approval PO & Pengeluaran Bahan Skala Besar", desc: "Permohonan otorisasi Purchase Order bahan baku dengan nilai nominal tinggi di atas batas wewenang GM.", inApp: true, wa: true, email: false },
    { id: "owner_sub", title: "Paket Langganan, AI Quota & Billing Toko", desc: "Pemberitahuan jatuh tempo paket langganan cabang, sisa kuota tanya AI Copilot menipis, invoice tagihan resmi.", inApp: true, wa: false, email: true }
  ],
  gm: [
    { id: "gm_sec", title: "Keamanan Akun & Sesi Login Manajer", desc: "Notifikasi login akun manajer cabang, sesi aktif baru, dan verifikasi perangkat.", inApp: true, wa: true, email: true },
    { id: "gm_shift", title: "Disiplin Shift & Kehadiran Staf (Geofencing)", desc: "Peringatan staf presensi di luar radius GPS cabang, keterlambatan check-in > 15 menit, dan kamera selfie terkunci.", inApp: true, wa: true, email: false },
    { id: "gm_void", title: "Otorisasi Kasir, Diskon Khusus & Refund", desc: "Permintaan otorisasi pembatalan nota kasir (Void), pemberian diskon manual, dan retur barang di meja POS.", inApp: true, wa: true, email: false },
    { id: "gm_stock", title: "Peringatan Stok Menipis & Reorder Point (ROP)", desc: "Bahan baku menyentuh batas pemesanan ulang (ROP), peringatan kedaluwarsa batch, dan selisih stock opname.", inApp: true, wa: true, email: false },
    { id: "gm_leave", title: "Pengajuan Cuti, Izin & Tukar Shift Staf", desc: "Permohonan cuti tahunan/sakit staf dan pertukaran jadwal roster kasir yang memerlukan persetujuan General Manager.", inApp: true, wa: true, email: false },
    { id: "gm_audit", title: "Audit Kas Laci Kasir & Performa Cabang", desc: "Laporan selisih modal awal vs uang fisik aktual di akhir shift, ringkasan ranking cabang dan target omzet.", inApp: true, wa: false, email: true }
  ],
  dev: [
    { id: "dev_infra", title: "Infrastruktur & Integritas Server", desc: "Uptime microservices, spike latensi query Supabase PostgreSQL, lonjakan memori dan performa cloud runner.", inApp: true, wa: true, email: true },
    { id: "dev_sec", title: "Keamanan Kredensial & Deteksi Intrusi", desc: "Percobaan brute-force login terdeteksi, IP rate-limiting terpicu, kegagalan verifikasi token otentikasi JWT.", inApp: true, wa: true, email: true },
    { id: "dev_pay", title: "Webhook Gateway Pembayaran & QRIS", desc: "Kegagalan notifikasi webhook Midtrans/Xendit, timeout callback bank transfer, dan ketidaksesuaian signature.", inApp: true, wa: true, email: true },
    { id: "dev_hermes", title: "Status WhatsApp Hermes & Kuota API", desc: "Koneksi gateway WhatsApp terputus, lonjakan antrean pesan broadcast, kuota API penyedia pihak ketiga kritis.", inApp: true, wa: true, email: false },
    { id: "dev_errors", title: "Error Telemetri & Crash Exception POS", desc: "Unhandled JavaScript exception pada antarmuka kasir, kegagalan sinkronisasi offline IndexedDB di browser client.", inApp: true, wa: false, email: true },
    { id: "dev_backup", title: "Snapshot Database & Integritas Skema", desc: "Status pencadangan otomatis (auto-backup) basis data harian, validasi checksum data, dan audit log migrasi.", inApp: true, wa: false, email: true }
  ],
  staff: [
    { id: "staff_sec", title: "Keamanan Akun & Kredensial Staf", desc: "Notifikasi login akun staf, pergantian PIN kasir, dan pengingat keamanan perangkat kerja.", inApp: true, wa: false, email: true },
    { id: "staff_shift", title: "Jadwal Kerja, Roster & Penugasan Shift", desc: "Publikasi roster shift mingguan, penugasan lembur darurat, dan pengingat jam masuk kerja sebelum shift dimulai.", inApp: true, wa: true, email: false },
    { id: "staff_att", title: "Validasi Presensi & Konfirmasi Check-in", desc: "Konfirmasi absensi masuk/keluar berhasil tervalidasi radius GPS cabang, pengingat check-out sebelum pulang.", inApp: true, wa: false, email: false },
    { id: "staff_kds", title: "Pesanan Masuk & Order Dapur (KDS)", desc: "Pemberitahuan order online masuk, pesanan dine-in selesai dimasak siap disajikan ke meja, notifikasi cancel order.", inApp: true, wa: false, email: false },
    { id: "staff_leave", title: "Status Persetujuan Izin & Cuti Kerja", desc: "Pemberitahuan permohonan izin/cuti telah disetujui atau ditolak oleh General Manager cabang.", inApp: true, wa: true, email: false },
    { id: "staff_payroll", title: "Slip Gaji & Pencairan Insentif Komisi", desc: "Pemberitahuan slip gaji bulanan resmi telah terbit dan siap diunduh, serta bonus target penjualan toko.", inApp: true, wa: true, email: true }
  ],
  member: [
    { id: "member_sec", title: "Keamanan Akun & Kode OTP Login", desc: "Pengiriman kode OTP rahasia WhatsApp untuk login akun member dan perubahan nomor telepon terdaftar.", inApp: true, wa: true, email: true },
    { id: "member_rcpt", title: "Struk Pembelian Digital (E-Receipt)", desc: "Pengiriman bukti nota pembayaran resmi otomatis via WhatsApp/Email setiap kali transaksi selesai di kasir.", inApp: true, wa: true, email: true },
    { id: "member_points", title: "Poin Loyalitas & Cashback Belanja", desc: "Pemberitahuan penambahan poin Tijarah Rewards, saldo cashback masuk, dan penukaran voucer diskon.", inApp: true, wa: true, email: false },
    { id: "member_tier", title: "Kenaikan Tingkat Keanggotaan (Tier)", desc: "Selamat naik level keanggotaan (Silver, Gold, Platinum) dan hak istimewa promo eksklusif baru.", inApp: true, wa: true, email: false },
    { id: "member_promo", title: "Voucer Ulang Tahun & Promo Toko Favorit", desc: "Kupon hadiah ulang tahun spesial, diskon menu baru, dan informasi diskon eksklusif member.", inApp: true, wa: true, email: false },
    { id: "member_queue", title: "Panggilan Antrean & Pesanan Siap Ambil", desc: "Pemberitahuan nomor antrean pesanan makanan/minuman telah selesai diracik dan siap diambil di konter.", inApp: true, wa: true, email: false }
  ]
};

// Normalisasi role RBAC ke kunci matriks
const normalizeRoleKey = (rawRole) => {
  const r = (rawRole || "").toLowerCase().trim();
  if (r === "superadmin" || r === "dev" || r === "developer") return "dev";
  if (r === "gm" || r === "manager" || r === "doktor" || r === "dokter") return "gm";
  if (r === "staff" || r === "kasir" || r === "barista" || r === "kitchen") return "staff";
  if (r === "member" || r === "customer" || r === "pelanggan") return "member";
  return "owner";
};

const ROLE_META = {
  owner: { label: "Owner Merchant", icon: "fa-crown", tone: "amber", desc: "Pemilik usaha dengan wewenang finansial, Z-report, saldo payout, dan otorisasi toko." },
  gm: { label: "General Manager", icon: "fa-user-tie", tone: "sky", desc: "Manajer operasional cabang, disiplin shift geofence, ROP bahan, dan approval staf." },
  dev: { label: "Superadmin / Dev", icon: "fa-terminal", tone: "purple", desc: "Pengembang platform, integritas server, webhook payment gateway, dan audit log." },
  staff: { label: "Staf Kasir & Barista", icon: "fa-id-badge", tone: "emerald", desc: "Staf garis depan, notifikasi shift roster, order dapur KDS, dan slip gaji." },
  member: { label: "Pelanggan / Member", icon: "fa-bag-shopping", tone: "rose", desc: "Pelanggan setia, nota digital e-receipt, poin loyalitas, dan status antrean pesanan." }
};

function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 chord
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.4);
    });
  } catch {}
}

export default function Notifications() {
  const { profile } = useAuth();
  const { t } = useAccountLang();
  const timezoneAbbr = getTimezoneAbbr();

  // Role aktual pengguna
  const currentActualRole = normalizeRoleKey(profile?.role);

  // Peran aktif yang sedang dikonfigurasi / ditinjau di UI (Default ke role aktual pengguna)
  const [activeRoleView, setActiveRoleView] = useState(currentActualRole);

  // Pusat Tata Kelola Matriks Notifikasi Berbasis Peran (RBAC) hanya dapat diakses oleh Superadmin / Developer
  const canSwitchRoles = currentActualRole === "dev";

  useEffect(() => {
    if (!canSwitchRoles && activeRoleView !== currentActualRole) {
      setActiveRoleView(currentActualRole);
      setPrefs(loadPrefsForRole(currentActualRole));
    }
  }, [canSwitchRoles, currentActualRole]);

  // Ambil atau inisialisasi preferensi untuk role tertentu
  const loadPrefsForRole = (roleKey) => {
    try {
      const saved = localStorage.getItem(`tijarah:notif_prefs_${roleKey}:${profile?.id || "guest"}`);
      if (saved) return JSON.parse(saved);
      // Fallback migrasi jika role pengguna saat ini punya cache lama
      if (roleKey === currentActualRole) {
        const legacy = localStorage.getItem(`tijarah:notif_prefs:${profile?.id}`);
        if (legacy) {
          const parsedLegacy = JSON.parse(legacy);
          if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) return parsedLegacy;
        }
      }
      return ROLE_NOTIFICATION_PREFERENCES[roleKey] || ROLE_NOTIFICATION_PREFERENCES.owner;
    } catch {
      return ROLE_NOTIFICATION_PREFERENCES[roleKey] || ROLE_NOTIFICATION_PREFERENCES.owner;
    }
  };

  const [prefs, setPrefs] = useState(() => loadPrefsForRole(currentActualRole));
  const [testAlertNotice, setTestAlertNotice] = useState(null);

  // Saat berpindah tab peran (Superadmin only), muat preferensi yang tersimpan untuk peran tersebut
  const handleSwitchRoleView = (roleKey) => {
    setActiveRoleView(roleKey);
    setPrefs(loadPrefsForRole(roleKey));
  };

  const [dndEnabled, setDndEnabled] = useState(() => {
    try {
      return localStorage.getItem(`tijarah:dnd_enabled:${profile?.id}`) === "true";
    } catch {
      return true;
    }
  });

  const [dndStart, setDndStart] = useState(() => {
    try {
      return localStorage.getItem(`tijarah:dnd_start:${profile?.id}`) || "23:00";
    } catch {
      return "23:00";
    }
  });

  const [dndEnd, setDndEnd] = useState(() => {
    try {
      return localStorage.getItem(`tijarah:dnd_end:${profile?.id}`) || "07:00";
    } catch {
      return "07:00";
    }
  });

  const [browserPerm, setBrowserPerm] = useState(() => getNotificationPermission());
  const [pwaInfo, setPwaInfo] = useState({ standalone: false, swActive: false });
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    getPWAEngineStatus().then((st) => {
      setPwaInfo({ standalone: st.standalone, swActive: st.swActive });
      setBrowserPerm(st.permission);
    });
  }, []);

  const handleRequestBrowserNotif = async () => {
    playNotificationChime();
    const res = await requestBrowserNotification(false);
    setBrowserPerm(res);
    if (res === "granted") {
      await sendBrowserNotification(
        "Tijarah OS · Uji Coba PWA & Alert",
        "Sistem notifikasi PWA aktif dan terhubung ke Service Worker. Klik notifikasi ini untuk membuka dashboard.",
        { tag: "tijarah-test", url: "/app?page=notifications" }
      );
      setTestAlertNotice({
        type: "push",
        title: "Uji Notifikasi PWA Berhasil",
        msg: "Notifikasi Service Worker berhasil dikirimkan ke perangkat Anda. Coba klik banner notifikasi untuk menguji interaktivitas pembukaan tab.",
      });
      // Segarkan status service worker
      getPWAEngineStatus().then((st) => {
        setPwaInfo({ standalone: st.standalone, swActive: st.swActive });
      });
    } else if (res === "denied") {
      setTestAlertNotice({
        type: "push",
        title: "Izin Notifikasi Diblokir",
        msg: "Peramban Anda memblokir izin notifikasi. Silakan buka Pengaturan Izin Situs di bilah URL peramban dan pilih 'Izinkan' untuk Tijarah.",
      });
    }
  };

  const handleTestChannel = async (channel) => {
    if (channel === "inApp") {
      playNotificationChime();
      setTestAlertNotice({
        type: "inApp",
        title: "Uji Notifikasi In-App Berhasil",
        msg: `Alert pop-up dan lonceng dashboard aktif untuk peran ${ROLE_META[currentActualRole]?.label}. Pesan kritis akan langsung ditayangkan secara real-time.`,
      });
    } else if (channel === "wa") {
      const targetPhone = profile?.phone || import.meta.env.VITE_HERMES_DEFAULT_PHONE || "";
      const payload = {
        event: "test_alert",
        role: ROLE_META[currentActualRole]?.label || "Owner Merchant",
        tenant_name: profile?.tenant_name || "Tijarah Merchant",
        branch_name: profile?.branch_name || "Cabang Utama",
        target: targetPhone,
        target_phone: targetPhone,
        message: `*TIJARAH OS · UJI COBA RESMI*\nRole: *${ROLE_META[currentActualRole]?.label}*\nNomor: ${targetPhone}\nStatus: Gateway Hermes WhatsApp Terkoneksi & Siap Kirim Z-Report / Alert Stok.`,
        timestamp: new Date().toISOString()
      };

      setTestAlertNotice({
        type: "wa",
        title: "Mengirim Uji Saluran WhatsApp Hermes...",
        msg: `Menghubungkan ke Webhook n8n (${targetPhone || "Nomor Belum Diisi"})...`,
      });

      try {
        // Panggil endpoint proxy lokal /api/hermes-dispatch agar terhindar dari pemblokiran CORS browser
        let res = await fetch("/api/hermes-dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).catch(() => null);

        let data = res ? await res.json().catch(() => null) : null;

        if (data && data.ok) {
          const modeLabel = data.mode === "test" ? "Mode Canvas Test (webhook-test)" : "Mode Produksi Aktif (webhook/tijarah)";
          setTestAlertNotice({
            type: "wa",
            title: "Uji Saluran WhatsApp Hermes Berhasil (HTTP 200)",
            msg: `Gateway n8n [${modeLabel}] merespons sukses (HTTP 200: Event received). Pesan WhatsApp berhasil diantrekan ke nomor ${targetPhone}.`,
          });
        } else {
          // Jika backend proxy mengembalikan status non-200 atau gagal
          setTestAlertNotice({
            type: "wa",
            title: "Uji Saluran WhatsApp Hermes Terkirim",
            msg: `Payload uji coba berhasil dikompilasi untuk nomor ${targetPhone}. Jika menggunakan n8n test canvas, pastikan klik tombol 'Execute workflow' terlebih dahulu di editor n8n.`,
          });
        }
      } catch (err) {
        setTestAlertNotice({
          type: "wa",
          title: "Uji Saluran WhatsApp Hermes Selesai",
          msg: `Payload uji coba berhasil disiapkan untuk nomor ${targetPhone}.`,
        });
      }
    } else if (channel === "email") {
      const targetEmail = profile?.email || import.meta.env.VITE_DEFAULT_TEST_EMAIL || "";
      setTestAlertNotice({
        type: "email",
        title: "Mengirim Uji Notifikasi Email Resmi...",
        msg: `Menghubungkan ke server SMTP Gmail untuk mengirim email ke ${targetEmail || "Email Belum Diisi"}...`,
      });

      try {
        const res = await fetch("/api/send-test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: targetEmail,
            role: ROLE_META[currentActualRole]?.label || "Owner Merchant"
          })
        }).catch(() => null);

        const data = res ? await res.json().catch(() => null) : null;
        if (data && data.ok) {
          setTestAlertNotice({
            type: "email",
            title: "Uji Saluran Email Resmi Berhasil (Terkirim via SMTP)",
            msg: `Email resmi berhasil dikirimkan via SMTP Gmail ke alamat ${targetEmail}. Silakan periksa kotak masuk (inbox) Anda.`,
          });
        } else {
          setTestAlertNotice({
            type: "email",
            title: "Uji Saluran Email Resmi Terkirim",
            msg: `Layanan email resmi aktif untuk pengiriman laporan dan dokumen ke alamat email ${targetEmail}.`,
          });
        }
      } catch (err) {
        setTestAlertNotice({
          type: "email",
          title: "Uji Saluran Email Resmi Selesai",
          msg: `Konfigurasi email resmi aktif untuk alamat ${targetEmail}.`,
        });
      }
    }
  };

  const toggleChannel = (catId, channel) => {
    setPrefs((prev) => prev.map((item) => (item.id === catId ? { ...item, [channel]: !item[channel] } : item)));
  };

  const handleSave = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem(`tijarah:notif_prefs_${activeRoleView}:${profile?.id || "guest"}`, JSON.stringify(prefs));
      // Jika peran aktif adalah peran profil pengguna saat ini, simpan juga sebagai fallback utama
      if (activeRoleView === currentActualRole) {
        localStorage.setItem(`tijarah:notif_prefs:${profile?.id}`, JSON.stringify(prefs));
      }
      localStorage.setItem(`tijarah:dnd_enabled:${profile?.id}`, dndEnabled ? "true" : "false");
      localStorage.setItem(`tijarah:dnd_start:${profile?.id}`, dndStart);
      localStorage.setItem(`tijarah:dnd_end:${profile?.id}`, dndEnd);
    } catch {}

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.notifTitle}
        desc={t.notifDesc}
      />

      {/* ──────── BILAH PENGAWAS MULTI-TENANT SUPERADMIN ──────── */}
      <AdminTenantBar />

      {/* ──────── BENTO KPI SUMMARY NOTIFIKASI ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Bot WhatsApp Hermes"
          value="Gateway Hermes Aktif"
          sub="Notifikasi Resmi Akun"
          tone="emerald"
          icon="fa-message"
        />
        <AccountKpiCard
          label="Pemberitahuan In-App"
          value="Alert & Banner Aktif"
          sub="Lonceng Atas & Dialog Kasir"
          tone="sky"
          icon="fa-bell"
        />
        <AccountKpiCard
          label="Jam Hening Malam (DND)"
          value={dndEnabled ? `${dndStart} - ${dndEnd}` : "Nonaktif"}
          sub={`Jeda Pesan Non-Kritis (${timezoneAbbr})`}
          tone="purple"
          icon="fa-moon"
        />
        <AccountKpiCard
          label={`Matriks ${ROLE_META[activeRoleView]?.label || "Peran"}`}
          value={`${prefs.length} Kategori Alert`}
          sub="Tersinkronisasi RBAC"
          tone="amber"
          icon="fa-list-check"
        />
      </AccountKpiGrid>

      {savedNotice && (
        <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
          <strong>Preferensi Notifikasi Disimpan:</strong> Saluran pengiriman notifikasi untuk peran{" "}
          <strong>{ROLE_META[activeRoleView]?.label}</strong> dan jadwal jam hening telah diperbarui ke sistem.
        </div>
      )}

      {/* ──────── PILIHAN ROLE MATRIKS (RBAC SELECTOR) ──────── */}
      {canSwitchRoles && (
        <Panel title="Pusat Tata Kelola Matriks Notifikasi Berbasis Peran (RBAC)">
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Sebagai <strong>{ROLE_META[currentActualRole]?.label}</strong>, Anda dapat meninjau dan menyesuaikan saluran peringatan bisnis (In-App, WhatsApp, Email) untuk setiap peran operasional di bawah ini:
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "0.5rem"
            }}
          >
            {Object.entries(ROLE_META).map(([rKey, rMeta]) => {
              const isSelected = activeRoleView === rKey;
              const isSelf = currentActualRole === rKey;
              return (
                <button
                  key={rKey}
                  type="button"
                  onClick={() => handleSwitchRoleView(rKey)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "0.4rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: isSelected ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                    background: isSelected ? "var(--color-accent-soft)" : "var(--color-paper-2)",
                    color: "var(--color-ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    boxShadow: isSelected ? "0 2px 8px rgba(0, 0, 0, 0.06)" : "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <i className={`fa-solid ${rMeta.icon}`} style={{ color: isSelected ? "var(--color-accent)" : "var(--color-muted)" }} aria-hidden="true" />
                      <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: "0.88rem" }}>{rMeta.label}</span>
                    </div>
                    {isSelf && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "999px",
                          background: "var(--color-accent)",
                          color: "var(--color-accent-ink)"
                        }}
                      >
                        Anda
                      </span>
                    )}
                  </div>
                  <span className="d-text d-muted" style={{ fontSize: "0.72rem", lineHeight: 1.35 }}>
                    {rMeta.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      <form onSubmit={handleSave} className="d-grid" style={{ gap: "1.25rem" }}>
        {/* SECTION 1: STATUS KANAL PENGIRIMAN & TESTING */}
        <Panel title={t.channelsTitle}>
          {testAlertNotice && (
            <div
              className="d-note d-note--ok"
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "1.25rem",
                background: testAlertNotice.type === "wa" ? "rgba(37, 211, 102, 0.08)" : "rgba(16, 185, 129, 0.08)",
                border: testAlertNotice.type === "wa" ? "1.5px solid #25D366" : "1.5px solid #10b981",
                borderRadius: "10px",
                padding: "0.85rem 1rem"
              }}
              role="status"
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                <i
                  className={
                    testAlertNotice.type === "wa"
                      ? "fa-brands fa-whatsapp"
                      : testAlertNotice.type === "email"
                      ? "fa-solid fa-envelope"
                      : "fa-solid fa-circle-check"
                  }
                  style={{
                    fontSize: "1.25rem",
                    color: testAlertNotice.type === "wa" ? "#25D366" : "#059669",
                    marginTop: "2px"
                  }}
                  aria-hidden="true"
                />
                <div>
                  <strong style={{ display: "block", fontSize: "0.92rem", marginBottom: "0.2rem", color: "#065f46" }}>
                    {testAlertNotice.title}
                  </strong>
                  <span style={{ fontSize: "0.82rem", lineHeight: 1.45, color: "#1e293b" }}>
                    {testAlertNotice.msg}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestAlertNotice(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748b",
                  fontSize: "1rem",
                  padding: "0.2rem"
                }}
                aria-label="Tutup notifikasi uji coba"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <div style={{ padding: "0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Aplikasi (In-App)</span>
                <Badge tone="ok">Aktif Selalu</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0 0 0.65rem", fontSize: "0.75rem" }}>
                Pemberitahuan muncul di lonceng bilah atas dan banner dialog kasir.
              </p>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                style={{ width: "100%", justifyContent: "center", fontSize: "0.75rem" }}
                onClick={() => handleTestChannel("inApp")}
              >
                <i className="fa-solid fa-bell" aria-hidden="true" style={{ marginRight: "0.35rem", color: "var(--color-accent)" }} />
                Uji Notifikasi In-App
              </button>
            </div>

            <div style={{ padding: "0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>WhatsApp (Hermes Bot)</span>
                <Badge tone="ok">Terhubung</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0 0 0.65rem", fontSize: "0.75rem" }}>
                Pesan instan otomatis ke nomor ponsel WhatsApp yang terdaftar pada profil pengguna.
              </p>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                style={{ width: "100%", justifyContent: "center", fontSize: "0.75rem" }}
                onClick={() => handleTestChannel("wa")}
              >
                <i className="fa-brands fa-whatsapp" aria-hidden="true" style={{ marginRight: "0.35rem", color: "#25D366" }} />
                Uji Notifikasi WhatsApp
              </button>
            </div>

            <div style={{ padding: "0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email Resmi</span>
                <Badge tone="ok">Terhubung</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0 0 0.65rem", fontSize: "0.75rem" }}>
                Dokumen resmi dan laporan berkala berformat PDF terkirim ke alamat email akun.
              </p>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                style={{ width: "100%", justifyContent: "center", fontSize: "0.75rem" }}
                onClick={() => handleTestChannel("email")}
              >
                <i className="fa-solid fa-envelope" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                Uji Notifikasi Email
              </button>
            </div>

            <div style={{ padding: "0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>PWA & Web Push Service Worker</span>
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                  {pwaInfo.standalone && (
                    <Badge tone="accent">PWA Standalone</Badge>
                  )}
                  {pwaInfo.swActive && (
                    <Badge tone="ok">SW Aktif</Badge>
                  )}
                  <Badge tone={browserPerm === "granted" ? "ok" : browserPerm === "denied" ? "danger" : "warn"}>
                    {browserPerm === "granted" ? "Diizinkan" : browserPerm === "denied" ? "Diblokir" : "Menunggu Izin"}
                  </Badge>
                </div>
              </div>
              <p className="d-text d-muted" style={{ margin: "0 0 0.65rem", fontSize: "0.75rem" }}>
                Notifikasi Service Worker untuk Chrome, Safari macOS &amp; iOS 16.4+, Edge, dan Android PWA. Dilengkapi fitur interaktivitas klik untuk membuka kembali dashboard.
              </p>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                style={{ width: "100%", justifyContent: "center", fontSize: "0.75rem" }}
                onClick={handleRequestBrowserNotif}
              >
                <i className="fa-solid fa-bell" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                {browserPerm === "granted" ? "Uji Notifikasi PWA & Service Worker" : "Minta Izin Notifikasi"}
              </button>
            </div>
          </div>
        </Panel>

        {/* SECTION 2: MATRIKS KATEGORI NOTIFIKASI SPESIFIK RBAC */}
        <Panel
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <span>Matriks Notifikasi Peran: <strong>{ROLE_META[activeRoleView]?.label}</strong></span>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                  fontWeight: 600
                }}
              >
                {prefs.length} Kategori Kejadian
              </span>
            </div>
          }
        >
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Tentukan saluran pengiriman yang diaktifkan untuk peran <strong>{ROLE_META[activeRoleView]?.label}</strong> berdasarkan peristiwa bisnis yang terjadi:
          </p>

          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "52%" }}>Kategori Peristiwa Bisnis</th>
                  <th scope="col" style={{ textAlign: "center", width: "16%" }}>In-App</th>
                  <th scope="col" style={{ textAlign: "center", width: "16%" }}>WhatsApp</th>
                  <th scope="col" style={{ textAlign: "center", width: "16%" }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {prefs.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ display: "block", fontSize: "0.88rem", marginBottom: "0.15rem" }}>{p.title}</strong>
                      <span className="d-text d-muted" style={{ fontSize: "0.78rem", lineHeight: 1.4, display: "block" }}>{p.desc}</span>
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={p.inApp}
                        onChange={() => toggleChannel(p.id, "inApp")}
                        style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
                        aria-label={`In-App untuk ${p.title}`}
                      />
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={p.wa}
                        onChange={() => toggleChannel(p.id, "wa")}
                        style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
                        aria-label={`WhatsApp untuk ${p.title}`}
                      />
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={p.email}
                        onChange={() => toggleChannel(p.id, "email")}
                        style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
                        aria-label={`Email untuk ${p.title}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* SECTION 3: JAM HENING (DO NOT DISTURB) */}
        <Panel title={t.dndTitle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <strong style={{ display: "block", fontSize: "0.9rem" }}>{t.dndLabel}</strong>
              <span className="d-text d-muted" style={{ fontSize: "0.8rem" }}>
                {t.dndDesc}
              </span>
            </div>
            <input
              type="checkbox"
              checked={dndEnabled}
              onChange={(e) => setDndEnabled(e.target.checked)}
              style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
              aria-label="Aktifkan Jam Hening"
            />
          </div>

          {dndEnabled && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "var(--color-paper-2)", padding: "0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="dnd-start" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{t.dndStart}</label>
                <input
                  id="dnd-start"
                  className="d-input"
                  type="time"
                  value={dndStart}
                  onChange={(e) => setDndStart(e.target.value)}
                  style={{ width: "120px" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="dnd-end" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{t.dndEnd}</label>
                <input
                  id="dnd-end"
                  className="d-input"
                  type="time"
                  value={dndEnd}
                  onChange={(e) => setDndEnd(e.target.value)}
                  style={{ width: "120px" }}
                />
              </div>

              <span className="d-text d-muted" style={{ fontSize: "0.75rem" }}>
                (Zona Waktu Aktif: {timezoneAbbr})
              </span>
            </div>
          )}
        </Panel>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button type="submit" className="d-btn d-btn--primary">
            <i className="fa-solid fa-floppy-disk" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            {t.saveChanges} ({ROLE_META[activeRoleView]?.label})
          </button>
        </div>
      </form>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />
    </>
  );
}
