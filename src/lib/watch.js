// Aturan pemantauan Layanan & Akses — satu implementasi untuk mode demo dan Supabase.
// SQL hanya mengembalikan angka mentah (tenant_health, staff_scorecard); skor dan ambang di sini.
// [Guessing] Semua bobot & ambang adalah titik awal yang masuk akal, bukan hasil kalibrasi data nyata. Ubah di satu tempat ini.

const DAY = 86400e3;
export const daysSince = (iso, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null);

export const HEALTH_LEVEL = {
  sehat: { label: "Sehat", tone: "ok" },
  waspada: { label: "Waspada", tone: "warn" },
  berisiko: { label: "Berisiko", tone: "danger" },
  ditangguhkan: { label: "Ditangguhkan", tone: "neutral" },
};

/** Skor kesehatan tenant 0–100 dari metrik mentah `tenant_health()`. */
export function healthOf(t, now = Date.now()) {
  if (t.status === "suspended") return { score: null, level: "ditangguhkan", reasons: [t.suspended_reason ? `Ditangguhkan: ${t.suspended_reason}` : "Ditangguhkan"], risks: [] };
  let score = 100;
  const reasons = [], risks = [];
  const age = daysSince(t.created_at, now) ?? 999;
  const idle = daysSince(t.owner_last_login, now);
  if (!t.owner_id) { score -= 20; reasons.push("Belum ada akun Owner aktif (undangan belum diterima)"); }
  else if (idle == null) { score -= 25; reasons.push("Owner belum pernah masuk"); }
  else if (idle >= 14) { score -= 30; reasons.push(`Owner tidak masuk ${idle} hari`); risks.push(`Owner tidak masuk ${idle} hari`); }
  else if (idle >= 7) { score -= 15; reasons.push(`Owner terakhir masuk ${idle} hari lalu`); }
  if (age > 7) {
    if (t.orders_7d === 0) { score -= 30; reasons.push("Tidak ada transaksi 7 hari terakhir"); risks.push("Tanpa transaksi 7 hari"); }
    else if (t.orders_28d > 0 && t.orders_7d * 4 < t.orders_28d * 0.6) { score -= 15; reasons.push("Transaksi minggu ini turun >40% dari rata-rata 4 minggu"); }
  }
  if (t.overdue_invoices > 0) { score -= 20; reasons.push(`${t.overdue_invoices} tagihan lewat jatuh tempo`); risks.push("Tagihan lewat jatuh tempo"); }
  if (t.status === "past_due") { score -= 10; reasons.push("Status langganan: telat bayar"); }
  if (t.open_tickets > 2) { score -= 10; reasons.push(`${t.open_tickets} tiket belum selesai`); }
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 75 ? "sehat" : score >= 50 ? "waspada" : "berisiko", reasons, risks };
}

// ── Undangan ──
export const INVITE_STATUS = {
  accepted: ["Diterima", "ok"], revoked: ["Dicabut", "neutral"], expired: ["Kedaluwarsa", "danger"],
  queued: ["Belum terkirim", "warn"], pending: ["Menunggu", "accent"],
};
export function inviteStatus(inv, now = Date.now()) {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at).getTime() < now) return "expired";
  return inv.sent_at ? "pending" : "queued";
}

// ── Tiket ──
export const TICKET_STATUS = { new: ["Baru", "accent"], in_progress: ["Dikerjakan", "warn"], waiting_owner: ["Menunggu Owner", "neutral"], resolved: ["Selesai", "ok"] };
export const PRIORITY = { urgent: ["Mendesak", "danger"], high: ["Tinggi", "warn"], normal: ["Normal", "neutral"], low: ["Rendah", "neutral"] };
const PRIO_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
export const ticketOrder = (a, b) => (PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]) || (new Date(a.sla_due_at) - new Date(b.sla_due_at));

/** Status SLA respons pertama (jam kalender). */
export function slaOf(tk, now = Date.now()) {
  if (tk.first_response_at) {
    const met = new Date(tk.first_response_at) <= new Date(tk.sla_due_at);
    return { label: met ? "Respons tepat waktu" : "Respons terlambat", tone: met ? "ok" : "warn" };
  }
  if (tk.status === "resolved") return { label: "Selesai tanpa respons", tone: "neutral" };
  const left = new Date(tk.sla_due_at).getTime() - now;
  if (left < 0) return { label: `SLA lewat ${fmtSpan(-left)}`, tone: "danger" };
  return { label: `SLA ${fmtSpan(left)} lagi`, tone: left < 3600e3 ? "warn" : "neutral" };
}
export function fmtSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} j ${m % 60} mnt`;
  return `${Math.floor(h / 24)} hari`;
}
export const TEMPLATES = [
  ["Minta rincian", "Terima kasih sudah menghubungi kami. Agar bisa kami telusuri, mohon kirimkan: (1) langkah yang dilakukan sebelum kendala muncul, (2) waktu kejadian, dan (3) tangkapan layar jika ada."],
  ["Sedang ditangani", "Laporan Anda sudah kami terima dan sedang ditangani tim teknis. Kami kabari lagi begitu ada perkembangan."],
  ["Konfirmasi selesai", "Kendala ini sudah kami perbaiki. Silakan dicoba kembali. Bila masih terjadi, balas pesan ini dan tiket akan kami buka kembali."],
  ["Tagihan diterbitkan ulang", "Faktur sudah kami terbitkan ulang dan dapat diunduh di menu Paket & tagihan. Mohon dicek kembali."],
];

// ── Kartu skor ──
const pct = (a, b) => (b > 0 ? a / b : 0);
export const voidRatio = (r) => pct(r.voids, r.orders_paid + r.voids);
export const discountPct = (r) => pct(r.discount_total, r.subtotal_total);
export const VARIANCE_TOLERANCE = 5000; // selisih kas ±Rp 5.000 per shift masih dianggap wajar

/** Peringatan anomali per orang. Pembanding void = rata-rata Kasir lain di set yang sama. */
export function anomaliesOf(rows) {
  const out = [];
  const cashiers = rows.filter((r) => r.role === "staff");
  for (const r of rows) {
    const add = (severity, text) => out.push({ profile_id: r.profile_id, name: r.full_name, severity, text });
    if (r.role === "staff") {
      const others = cashiers.filter((x) => x.profile_id !== r.profile_id);
      const avg = others.length ? others.reduce((a, x) => a + voidRatio(x), 0) / others.length : 0;
      const vr = voidRatio(r);
      if (r.voids >= 3 && others.length && avg > 0 && vr > avg * 3) add("danger", `Rasio void ${(vr * 100).toFixed(1)}% — lebih dari 3× rata-rata Kasir lain (${(avg * 100).toFixed(1)}%)`);
      else if (r.voids >= 5 && vr > 0.05) add("warn", `Rasio void ${(vr * 100).toFixed(1)}% (${r.voids} nota)`);
      if (r.orders_paid >= 10 && discountPct(r) > 0.15) add("warn", `Diskon ${(discountPct(r) * 100).toFixed(1)}% dari penjualan kotor — di atas 15%`);
      if (r.short_shifts >= 3) add("danger", `Kas kurang pada ${r.short_shifts} shift pada periode ini`);
      else if (r.cash_variance < -VARIANCE_TOLERANCE * 4) add("warn", `Selisih kas kumulatif ${Math.round(r.cash_variance).toLocaleString("id-ID")}`);
      if (r.clock_ins >= 4 && pct(r.late_ins, r.clock_ins) >= 0.5) add("warn", `Terlambat ${r.late_ins} dari ${r.clock_ins} kali masuk`);
    }
    if (r.role === "gm" && r.approvals_decided >= 3 && r.avg_decision_min > 60) add("warn", `Approval rata-rata ${r.avg_decision_min} menit`);
  }
  return out;
}

// ── Audit → kalimat ──
const ACTION = { insert: "menambah", update: "mengubah", delete: "menghapus" };
const ENTITY = { profiles: "akun", tenants: "data tenant", staff_invites: "undangan", member_branches: "penugasan cabang", products: "produk", approvals: "persetujuan",
  support_tickets: "tiket", invoices: "tagihan", branches: "cabang", tenant_integrations: "integrasi", plans: "paket", payout_accounts: "rekening payout", capital_applications: "pengajuan modal" };
export function auditText(a) {
  const d = a.detail ?? {};
  const after = d.after ?? d;
  if (a.action === "login") return "masuk ke dashboard";
  if (a.action === "pin_reset") return "mengatur ulang PIN otorisasi GM";
  if (a.action === "invite") return `mengundang ${d.email ?? "anggota"} sebagai ${d.role ?? "—"}`;
  if (a.action === "invite_resend") return "mengirim ulang undangan";
  if (a.action === "invite_revoke") return "mencabut undangan";
  if (a.action === "access") return "membuka konteks tenant";
  if (a.entity === "profiles" && a.action === "update" && after.is_active === false) return `menonaktifkan akun${after.deactivation_reason ? ` (${after.deactivation_reason})` : ""}`;
  if (a.entity === "profiles" && a.action === "update" && after.is_active === true && !after.deactivated_at) return "mengaktifkan kembali akun";
  if (a.entity === "tenants" && after.status === "suspended") return `menangguhkan tenant${after.suspended_reason ? ` (${after.suspended_reason})` : ""}`;
  if (a.entity === "member_branches") return "mengatur penugasan cabang";
  return `${ACTION[a.action] ?? a.action} ${ENTITY[a.entity] ?? a.entity}`;
}
export const AUDIT_GROUPS = {
  login: ["login"],
  akun: ["invite", "invite_resend", "invite_revoke", "pin_reset"],
};
