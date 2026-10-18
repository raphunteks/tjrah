/**
 * ============================================================================
 * TIJARAH OS · HERMES WHATSAPP GATEWAY DISPATCHER (N8N CODE NODE)
 * ============================================================================
 * Modul pemroses webhook cerdas multi-peran (RBAC) untuk Gateway WhatsApp Hermes.
 * Mengubah webhook events dari Tijarah OS menjadi pesan WhatsApp terformat elegan.
 * Mendukung perutean peran: Owner, General Manager, Staf/Kasir, Member & Dev.
 * ============================================================================
 */

// 1. Ekstraksi Input Fleksibel dari Node n8n ($input / $json / items)
let item = {};
try {
  if (typeof $input !== "undefined" && typeof $input.first === "function") {
    item = $input.first().json;
  } else if (typeof $json !== "undefined") {
    item = $json;
  } else if (typeof items !== "undefined" && items[0]) {
    item = items[0].json;
  }
} catch (e) {
  item = {};
}

const body = item.body || item.data || item;

// 2. Helper Utilitas Format & Sanitasi Nomor WhatsApp
const defaultTarget = (typeof process !== "undefined" && process.env && process.env.HERMES_DEFAULT_PHONE) || body.default_target || "";

const cleanPhone = (phoneStr) => {
  const raw = phoneStr || defaultTarget;
  if (!raw) return "";
  let s = raw.toString().trim();
  if (s.includes("@")) return s;
  s = s.replace(/[^0-9]/g, "");
  if (s.startsWith("0")) s = "62" + s.slice(1);
  return s ? s + "@c.us" : "";
};

const formatRp = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

// 3. Metadata Konteks Tenant & Cabang
const tenant = body.tenant_name || body.tenant_id || "Harumin Merchant";
const branch = body.branch_name || "Cabang Utama";
const event = (body.event || body.type || body.kind || "").toLowerCase().trim();
const d = body.data || body;

// 4. Struktur Template Notifikasi Berbasis Peran RBAC
let title = "";
let icon = "🔔";
let roleBadge = "TIJARAH OS";
let content = "";
let footer = "_Pesan otomatis resmi terverifikasi dari Tijarah Cloud OS._";

// ── KELOMPOK 1: OWNER MERCHANT (FINANSIAL, AUDIT & OTORISASI BESAR) ──
if (event === "z_report" || event === "owner_zrep") {
  icon = "📊";
  roleBadge = "REKAP EKSEKUTIF · OWNER & GM";
  title = `DAILY Z-REPORT · ${tenant.toUpperCase()}`;
  const orders = d.orders || d.order_count || 0;
  const omzet = d.omzet || d.omzet_bruto || d.revenue || 0;
  const net = d.net_sales || d.omzet_netto || omzet;
  const voids = d.voids || d.void_count || 0;
  const cash = d.cash_actual || d.cash_in_drawer || 0;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Total Transaksi:* ${orders} nota berhasil\n` +
    `• *Omzet Bruto:* *${formatRp(omzet)}*\n` +
    `• *Omzet Bersih:* ${formatRp(net)}\n` +
    `• *Uang Fisik Kas Laci:* ${formatRp(cash)}\n` +
    `• *Pembatalan (Void):* ${voids} nota\n` +
    `\n_Shift kasir resmi ditutup & buku harian berhasil dikunci._`;

} else if (event === "payout" || event === "owner_fin" || event === "settlement") {
  icon = "💰";
  roleBadge = "FINANSIAL & S-WALLET · OWNER";
  title = `PENCAIRAN SALDO S-WALLET · ${tenant.toUpperCase()}`;
  const status = d.status || "Berhasil Ditransfer";
  const amount = d.amount || d.nominal || 0;
  const bank = d.bank_name || "Rekening Payroll Owner";
  const acc = d.account_number ? `••••${d.account_number.slice(-4)}` : "Rekening Terdaftar";
  content = `• *Nominal Penarikan:* *${formatRp(amount)}*\n` +
    `• *Status:* *${status}*\n` +
    `• *Rekening Tujuan:* ${bank} (${acc})\n` +
    `• *ID Transaksi:* #${d.payout_id || d.ref_id || "PO-" + Date.now().toString().slice(-6)}\n` +
    `• *Sisa Saldo S-Wallet:* ${formatRp(d.remaining_balance || 0)}`;

} else if (event === "void_alert" || event === "owner_fraud") {
  icon = "🚨";
  roleBadge = "SECURITY & ANTI-FRAUD · OWNER";
  title = `PERINGATAN PEMBATALAN NOTA (VOID)`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *No. Nota:* *${d.order_code || d.code || "TRX-VOID"}*\n` +
    `• *Nilai Transaksi:* *${formatRp(d.amount || d.total || 0)}*\n` +
    `• *Kasir / Pemohon:* ${d.cashier_name || "Kasir Bertugas"}\n` +
    `• *Otorisasi Oleh:* ${d.approved_by || "General Manager"}\n` +
    `• *Alasan:* _"${d.reason || "Koreksi pesanan meja"}"_\n` +
    `\n_Pemberitahuan otomatis saat pembatalan melampaui batas batas aman._`;

} else if (event === "po_approval" || event === "owner_po") {
  icon = "📑";
  roleBadge = "OTORISASI PENGELUARAN · OWNER";
  title = `PERMOHONAN PURCHASE ORDER (PO) BESAR`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *No. PO:* ${d.po_number || d.code || "PO-EXP"}\n` +
    `• *Nama Vendor:* ${d.vendor_name || d.supplier || "Supplier Bahan Baku"}\n` +
    `• *Total Tagihan:* *${formatRp(d.total_amount || d.total || 0)}*\n` +
    `• *Catatan:* Nilai nominal di atas batas limit wewenang GM.\n` +
    `\n_Silakan buka dashboard modul Pembelian (PO) untuk persetujuan._`;

} else if (event === "subscription_billing" || event === "owner_sub") {
  icon = "💳";
  roleBadge = "LANGGANAN & TAGIHAN · OWNER";
  title = `INFO PAKET & KUOTA AI TOKO`;
  content = `• *Merchant:* ${tenant}\n` +
    `• *Paket Aktif:* *${d.plan_name || "Growth Merchant"}*\n` +
    `• *Sisa Kuota AI:* ${d.ai_credits || "Menipis"} pertanyaan\n` +
    `• *Jatuh Tempo Faktur:* ${d.due_date || "7 hari mendatang"}\n` +
    `• *Tagihan Perpanjangan:* ${formatRp(d.amount || 0)}`;

} else if (event === "owner_sec" || event === "security_alert") {
  icon = "🔐";
  roleBadge = "KEAMANAN AKUN · OWNER";
  title = `AKTIVITAS KEAMANAN TERDETEKSI`;
  content = `Peringatan keamanan akun Owner Merchant *${tenant}*:\n` +
    `• *Kejadian:* ${d.activity || "Login dari Perangkat / IP Baru"}\n` +
    `• *Perangkat:* ${d.device || "Chrome on MacOS"}\n` +
    `• *Waktu:* ${d.timestamp || new Date().toLocaleString("id-ID")}\n` +
    `\n_Jika bukan Anda yang melakukan, segera ubah sandi master & reset sesi._`;

// ── KELOMPOK 2: GENERAL MANAGER (OPERASIONAL CABANG & KONTROL TIM) ──
} else if (event === "low_stock" || event === "gm_stock") {
  icon = "⚠️";
  roleBadge = "LOGISTIK GUDANG · GENERAL MANAGER";
  title = `ALERT STOK MENIPIS (REORDER POINT)`;
  const item = d.item_name || d.name || "Bahan Baku";
  const current = d.current_stock || d.stock || 0;
  const min = d.min_stock || d.rop || 0;
  const unit = d.unit || "unit";
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Nama Bahan:* *${item}*\n` +
    `• *Sisa Stok Aktual:* *${current} ${unit}*\n` +
    `• *Batas Aman (ROP):* ${min} ${unit}\n` +
    `\n_Harap segera terbitkan Purchase Order (PO) agar operasional dapur tidak terhenti._`;

} else if (event === "geofence_alert" || event === "gm_shift") {
  icon = "📍";
  roleBadge = "DISIPLIN SDM & PRESENSI · GM";
  title = `PERINGATAN GEOFENCE PRESENSI STAF`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Nama Staf:* *${d.staff_name || "Staf Toko"}*\n` +
    `• *Penyimpangan Jarak:* ${d.distance_meters || "> 200"} meter di luar radius toko\n` +
    `• *Waktu Check-in:* ${d.checkin_time || "Baru saja"}\n` +
    `• *Status Kamera:* ${d.photo_verified ? "Selfie Tervalidasi" : "Kamera Terkunci"}\n` +
    `\n_Memerlukan tinjauan manual General Manager untuk konfirmasi absensi._`;

} else if (event === "discount_approval" || event === "gm_void") {
  icon = "🏷️";
  roleBadge = "OTORISASI KASIR POS · GM";
  title = `PERMOHONAN DISKON / OTORISASI MEJA`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Kasir:* ${d.cashier_name || "Kasir Bertugas"}\n` +
    `• *Nomor Nota:* #${d.order_code || "TRX-POS"}\n` +
    `• *Diskon Diajukan:* ${d.discount_percent || 0}% (${formatRp(d.discount_amount || 0)})\n` +
    `• *Alasan:* _"${d.note || "Permohonan diskon relasi pelanggan"}"_`;

} else if (event === "leave_request" || event === "swap_shift" || event === "gm_leave") {
  icon = "🗓️";
  roleBadge = "PERSETUJUAN SDM · GENERAL MANAGER";
  title = event.includes("swap") ? `PERMOHONAN TUKAR SHIFT KERJA` : `PENGAJUAN IZIN / CUTI STAF`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Nama Pemohon:* *${d.staff_name || "Staf"}*\n` +
    `• *Jenis Pengajuan:* ${d.leave_type || (event.includes("swap") ? "Tukar Jadwal Roster" : "Cuti Tahunan")}\n` +
    `• *Tanggal / Periode:* ${d.date_range || d.date || "Jadwal Kerja Mendatang"}\n` +
    `• *Keterangan:* _"${d.reason || "-"}"_\n` +
    `\n_Silakan buka modul Persetujuan (Approval) di dashboard untuk memproses._`;

} else if (event === "shift_audit" || event === "gm_audit") {
  icon = "📋";
  roleBadge = "AUDIT KAS LACI KASIR · GM";
  title = `AUDIT PENUTUPAN SESI KASIR`;
  content = `📍 *Cabang:* ${branch}\n` +
    `• *Kasir:* ${d.cashier_name || "Kasir"}\n` +
    `• *Modal Awal Laci:* ${formatRp(d.initial_cash || 0)}\n` +
    `• *Total Kas Masuk:* ${formatRp(d.cash_sales || 0)}\n` +
    `• *Uang Fisik Dihitung:* ${formatRp(d.cash_actual || 0)}\n` +
    `• *Selisih Fisik vs Sistem:* *${formatRp(d.discrepancy || 0)}* (${(d.discrepancy || 0) === 0 ? "SEIMBANG / MATCH" : "ADA SELISIH"})`;

// ── KELOMPOK 3: STAF KASIR & BARISTA (OPERASIONAL GARIS DEPAN) ──
} else if (event === "shift_roster" || event === "staff_shift") {
  icon = "⏰";
  roleBadge = "JADWAL KERJA · STAF & KASIR";
  title = `PEMBERITAHUAN JADWAL SHIFT KERJA`;
  content = `Halo *${d.staff_name || "Rekan Tim"}*,\n` +
    `Berikut jadwal roster tugas Anda di *${branch}*:\n\n` +
    `• *Tanggal:* ${d.shift_date || "Hari Ini"}\n` +
    `• *Jam Kerja:* *${d.shift_hours || "08:00 - 16:00 WITA"}*\n` +
    `• *Penugasan:* ${d.position || "Kasir / Barista"}\n` +
    `\n_Harap hadir 15 menit sebelum shift dimulai untuk persiapan kasir._`;

} else if (event === "attendance_confirmation" || event === "staff_att") {
  icon = "✅";
  roleBadge = "VALIDASI PRESENSI · STAF";
  title = `PRESENSI HARIAN BERHASIL TERCATAT`;
  content = `Halo *${d.staff_name || "Staf"}*,\n` +
    `• *Status:* *${d.att_type === "out" ? "Check-Out (Selesai Tugas)" : "Check-In (Masuk Tugas)"}*\n` +
    `• *Waktu Presensi:* ${d.timestamp || new Date().toLocaleTimeString("id-ID")}\n` +
    `• *Radius Cabang:* ${branch} (GPS Terverifikasi)\n` +
    `\n_Terima kasih atas dedikasi dan profesionalitas Anda!_`;

} else if (event === "kds_order" || event === "staff_kds") {
  icon = "🍳";
  roleBadge = "PESANAN KDS · BAR & DAPUR";
  title = `PESANAN SIAP DISAJIKAN`;
  content = `📍 *Tujuan:* *${d.table_no ? "Meja " + d.table_no : (d.queue_no ? "Antrean #" + d.queue_no : "Takeaway")}*\n` +
    `• *No. Pesanan:* #${d.order_code || "ORDER"}\n` +
    `• *Menu Disiapkan:* \n${d.items_summary || "Pesanan Makanan & Minuman"}\n` +
    `• *Status:* Selesai dimasak & siap diantar ke meja pelanggan.`;

} else if (event === "leave_status" || event === "staff_leave") {
  const isApproved = d.status === "approved" || d.is_approved === true;
  icon = isApproved ? "✅" : "❌";
  roleBadge = "STATUS PERMOHONAN SDM · STAF";
  title = isApproved ? `PENGAJUAN ANDA DISETUJUI` : `PENGAJUAN TIDAK DISETUJUI`;
  content = `Halo *${d.staff_name || "Staf"}*,\n` +
    `Permohonan *${d.leave_type || "Cuti / Izin"}* Anda untuk tanggal *${d.date || "-"}* telah *${isApproved ? "DISETUJUI" : "DITOLAK"}* oleh General Manager.\n` +
    (d.notes ? `• *Catatan:* _"${d.notes}"_\n` : "");

} else if (event === "payslip_issued" || event === "staff_payroll") {
  icon = "💵";
  roleBadge = "PENGGAJIAN RESMI · STAF";
  title = `SLIP GAJI BULANAN TELAH TERBIT`;
  content = `Halo *${d.staff_name || "Karyawan"}*,\n` +
    `Slip gaji resmi periode *${d.period || "Bulan Ini"}* sudah diterbitkan oleh manajemen *${tenant}*.\n\n` +
    `• *Gaji Bersih (THP):* *${formatRp(d.net_salary || 0)}*\n` +
    `• *Rekening Transfer:* ${d.bank_name || "Bank Payroll"} (${d.bank_account ? "••••" + d.bank_account.slice(-4) : "Terdaftar"})\n` +
    `\n_Rincian rincian gaji & potongan dapat diakses melalui menu 'Slip Gaji Saya'._`;

// ── KELOMPOK 4: MEMBER & PELANGGAN SETIA (LOYALTY & CRM) ──
} else if (event === "otp_login" || event === "member_sec") {
  icon = "🔐";
  roleBadge = "AUTENTIKASI AKUN · MEMBER";
  title = `KODE RAHASIA OTP TIJARAH`;
  content = `Kode keamanan masuk ke akun Pelanggan *${tenant}* Anda:\n\n` +
    `*>>> ${d.otp_code || "123456"} <<<*\n\n` +
    `_Jangan berikan kode ini kepada siapa pun termasuk staf kasir toko. Berlaku 5 menit._`;

} else if (event === "receipt" || event === "member_rcpt") {
  icon = "🧾";
  roleBadge = "BUKTI TRANSAKSI · MEMBER";
  title = `STRUK DIGITAL · ${tenant.toUpperCase()}`;
  const items = d.items_text || d.items_summary || "Produk Pembelian";
  content = `Terima kasih telah berkunjung dan bertransaksi di *${branch}*!\n\n` +
    `• *No. Nota:* ${d.order_code || d.code || "NOTA-TRX"}\n` +
    `• *Waktu:* ${d.date || new Date().toLocaleDateString("id-ID")}\n` +
    `• *Pesanan:* \n${items}\n` +
    `• *Total Pembayaran:* *${formatRp(d.total || 0)}*\n` +
    `• *Metode:* ${d.payment_method || "QRIS / Tunai"}\n` +
    (d.points_earned ? `• *Poin Diperoleh:* +${d.points_earned} Poin Tijarah Rewards\n` : "") +
    `\n_Simpan nota digital ini sebagai bukti transaksi resmi Anda._`;

} else if (event === "loyalty_points" || event === "member_points") {
  icon = "⭐";
  roleBadge = "TIJARAH REWARDS · MEMBER";
  title = `POIN LOYALITAS DITAMBAHKAN`;
  content = `Halo *${d.customer_name || "Pelanggan Setia"}*,\n` +
    `• *Poin Bertambah:* +${d.points_added || 0} Poin\n` +
    `• *Total Poin Anda:* *${d.current_points || 0} Poin*\n` +
    `\n_Tukarkan akumulasi poin dengan potongan belanja dan menu gratis di kasir toko._`;

} else if (event === "tier_upgrade" || event === "member_tier") {
  icon = "👑";
  roleBadge = "LEVEL MEMBERSHIP · MEMBER";
  title = `SELAMAT! LEVEL ANGGOTA NAIK`;
  content = `Halo *${d.customer_name || "Pelanggan Istimewa"}*,\n` +
    `Akun Anda berhasil ditingkatkan menjadi *${(d.tier_name || "GOLD").toUpperCase()} MEMBER*.\n` +
    `Nikmati keuntungan diskon khusus, antrean prioritas, dan cashback lebih tinggi setiap transaksi!`;

} else if (event === "birthday_voucher" || event === "member_promo") {
  icon = "🎁";
  roleBadge = "SPESIAL ULANG TAHUN · MEMBER";
  title = `SELAMAT ULANG TAHUN DARI ${tenant.toUpperCase()}!`;
  content = `Semoga hari Anda menyenangkan! Kami mempersembahkan hadiah eksklusif:\n\n` +
    `• *Kode Voucer:* *${d.voucher_code || "HBD-TIJARAH"}*\n` +
    `• *Benefit:* Diskon ${d.discount_text || "25% Semua Menu"}\n` +
    `• *Masa Berlaku:* Hingga ${d.expiry_date || "30 hari ke depan"}\n` +
    `\nTunjukkan pesan WhatsApp ini ke kasir toko saat pemesanan menu!`;

} else if (event === "queue_ready" || event === "member_queue") {
  icon = "🛎️";
  roleBadge = "PANGGILAN PESANAN · MEMBER";
  title = `PESANAN ANDA SIAP DIAMBIL`;
  content = `Panggilan untuk Nomor Antrean: *#${d.queue_no || "01"}*\n` +
    `Pesanan Anda di *${branch}* telah selesai diracik.\n` +
    `Silakan menuju meja konter pengambilan untuk mengambil pesanan Anda. Selamat menikmati!`;

// ── KELOMPOK 5: SUPERADMIN & DEVELOPER PLATFORM ──
} else if (event.startsWith("dev_")) {
  icon = "⚡";
  roleBadge = "PLATFORM TELEMETRY · SUPERADMIN";
  title = `TELEMETRI ALERT: ${event.toUpperCase()}`;
  content = `• *Environment:* Production Cloud OS\n` +
    `• *Modul:* ${d.service_name || "Core Microservice"}\n` +
    `• *Keterangan:* ${d.detail || d.message || JSON.stringify(d)}\n` +
    `• *Timestamp:* ${new Date().toISOString()}`;

// ── KELOMPOK 6: UJI COBA RESMI DASHBOARD (TEST ALERT) ──
} else if (event === "test_alert") {
  icon = "🧪";
  roleBadge = "UJI COBA RESMI DASHBOARD";
  title = `UJI KONEKSI BOT WHATSAPP HERMES`;
  content = `Halo Tim *${tenant}*!\n\n` +
    `Pesan ini merupakan uji coba resmi dari subtab *Notifikasi* Tijarah OS.\n` +
    `• *Target Role:* ${body.role || "Owner Merchant"}\n` +
    `• *Status Gateway:* Terhubung & Aktif\n` +
    `• *Nomor Penerima:* ${cleanPhone(body.target || body.target_phone || defaultTarget)}\n` +
    `\n_Gateway Hermes siap menyalurkan seluruh peringatan operasional otomatis._`;

// ── KELOMPOK 7: CUSTOM RAW MESSAGE / FALLBACK ──
} else {
  if (body.message || body.text) {
    const rawTarget = body.target || body.target_phone || body.phone || body.whatsapp_owner || body.whatsapp_gm || defaultTarget;
    return [{
      json: {
        chatId: cleanPhone(rawTarget),
        text: body.message || body.text,
        event: "raw_custom",
        tenant: tenant,
        branch: branch,
        timestamp: new Date().toISOString()
      }
    }];
  }
  icon = "ℹ️";
  title = `UPDATE OPERASIONAL · ${tenant.toUpperCase()}`;
  content = `• *Event:* ${event || "Informasi Sistem"}\n` +
    `• *Data Rincian:* ` + JSON.stringify(d);
}

// 5. Susun Pesan Akhir WhatsApp
const text = `${icon} *${title}*\n` +
  `_${roleBadge}_\n` +
  `━━━━━━━━━━━━━━━━━━━━━━\n` +
  `${content}\n` +
  `━━━━━━━━━━━━━━━━━━━━━━\n` +
  `${footer}`;

// 6. Penentuan Target Penerima (Mendukung Multi-Penerima / Array untuk n8n)
let targets = [];
if (body.targets && Array.isArray(body.targets) && body.targets.length > 0) {
  targets = body.targets;
} else if ((event === "z_report" || event === "owner_zrep") && body.whatsapp_owner && body.whatsapp_gm && body.whatsapp_owner !== body.whatsapp_gm) {
  // Z-Report harian otomatis diteruskan ke nomor Owner dan nomor GM
  targets = [body.whatsapp_owner, body.whatsapp_gm];
} else {
  const single = body.target || body.target_phone || body.phone || body.whatsapp || body.whatsapp_owner || body.whatsapp_gm || defaultTarget;
  targets = [single];
}

// 7. Output Array JSON siap kirim untuk n8n
return targets.map(t => ({
  json: {
    chatId: cleanPhone(t),
    text: text,
    event: event,
    tenant: tenant,
    branch: branch,
    timestamp: new Date().toISOString()
  }
}));
