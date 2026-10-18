// Matriks RBAC — VERSI ASLI, persis seperti BAB IV dokumen blueprint (20 fitur × 5 peran).
// File ini satu-satunya sumber kebenaran: dipakai UI (lib/rbac.js) dan di-generate ke SQL
// (supabase/migrations/*_rbac_seed.sql) lewat scripts/gen-seed.mjs.

export const ROLES = ["superadmin", "owner", "gm", "staff", "dokter"];

export const ROLE_LABEL = {
  member: "Member / Pelanggan",
  superadmin: "Superadmin / Developer",
  owner: "Owner Merchant",
  gm: "General Manager",
  staff: "Cashier / Staff",
  dokter: "Dokter / Terapis",
};

export const ROLE_LEVEL = { superadmin: "L0", owner: "L1", gm: "L2", staff: "L3", dokter: "L4", member: "L5" };

//          no  fitur                                          superadmin  owner       gm                          staff                        dokter
export const MATRIX = [
  [1, "Konfigurasi Tenant, 9router & Hermes", "CRUD", "R", "-", "-", "-"],
  [2, "Dashboard Eksekutif & Laba Riil", "R", "CRUD", "R (Operasional)", "-", "-"],
  [3, "Master Produk, Varian & Harga Jual", "CRUD", "CRUD", "CRUD", "R", "R"],
  [4, "Resep & Bill of Materials (BOM)", "CRUD", "CRUD", "CRUD", "R", "-"],
  [5, "Register Transaksi POS & Struk", "-", "R", "R", "CRUD", "-"],
  [6, "Otorisasi Void, Refund & Diskon", "-", "Approval", "Approval (PIN/Otorisasi)", "Request", "-"],
  [7, "Denah Meja, Kiosk & QR E-Menu", "CRUD", "CRUD", "CRUD", "RU", "-"],
  [8, "Antrean Pesanan Dapur & Status Masak", "CRUD", "R", "R", "CRUD", "-"],
  [9, "Purchase Order (PO) & Vendor Supplier", "CRUD", "Approval", "CRUD", "-", "-"],
  [10, "Mutasi Stok, Opname & Susut/Waste", "CRUD", "Approval & CRUD", "Approval & CRUD", "Create (Opname/Waste)", "-"],
  [11, "Akuntansi, Jurnal & Neraca PSAK", "CRUD", "R", "CRUD", "-", "-"],
  [12, "Buku Kas, Rekonsiliasi & Settlement", "CRUD", "R", "CRUD", "Input Petty Cash", "-"],
  [13, "Master Karyawan, Shift & Geofencing", "CRUD", "CRUD", "CRUD", "Absen GPS Masuk/Pulang", "-"],
  [14, "Payroll, Komisi & Kasbon Karyawan", "CRUD", "Approval", "CRUD", "R (Komisi Pribadi)", "R (Komisi Pribadi)"],
  [15, "Database CRM & Poin Loyalitas", "CRUD", "CRUD", "CRUD", "RU", "-"],
  [16, "Integrasi Omnichannel & Marketplace", "CRUD", "CRUD", "CRUD", "R (Proses Pesanan)", "-"],
  [17, "Rekam Medis & SATUSEHAT Kemenkes", "CRUD", "R", "R", "R (Billing Obat)", "CRUD"],
  [18, "Reservasi & Antrean Ruang Tunggu", "CRUD", "CRUD", "CRUD", "CRUD", "RU"],
  [19, "Pengajuan Harum.in Capital & Payout", "CRUD", "CRUD", "RU", "-", "-"],
  [20, "Pengadaan Bahan Harum.in Supplies", "CRUD", "Approval", "CRUD", "-", "-"],
];

// Peran Member (L5) — TAMBAHAN di luar dokumen asli (keputusan Q12, lihat docs/MEMBER-DASHBOARD.md).
// Matriks asli 20×5 di atas tidak diubah. Member hanya bertindak atas data miliknya sendiri; semua tulis lewat RPC khusus.
// Kunci = nomor fitur; fitur yang tidak tercantum = "-".
export const MEMBER_ACCESS = {
  3: "R (Katalog)",
  5: "R (Pesanan Sendiri)",
  7: "Create (Pesanan Sendiri)",
  8: "R (Status Sendiri)",
  15: "RU (Data Pribadi)",
  17: "R (Jadwal, Resep, Tagihan Pribadi)",
  18: "CRUD (Milik Sendiri)",
};
export const memberLabel = (feature) => MEMBER_ACCESS[feature] ?? "-";
export const ALL_ROLES = [...ROLES, "member"];

// Terjemahan label dokumen → aksi. c=create r=read u=update d=delete a=approve q=request.
// `scope` membatasi aksi pada subset data (dipakai RLS & UI).
export function parseLabel(label) {
  const L = label.trim();
  const base = { c: false, r: false, u: false, d: false, a: false, q: false, scope: null, pin: false };
  if (L === "-") return base;
  if (L === "CRUD") return { ...base, c: true, r: true, u: true, d: true };
  if (L === "RU") return { ...base, r: true, u: true };
  if (L === "R") return { ...base, r: true };
  if (L === "Approval") return { ...base, r: true, a: true };
  if (L === "Approval (PIN/Otorisasi)") return { ...base, r: true, a: true, pin: true };
  if (L === "Approval & CRUD") return { ...base, c: true, r: true, u: true, d: true, a: true };
  if (L === "Request") return { ...base, r: true, q: true, scope: "own" };
  if (L === "R (Operasional)") return { ...base, r: true, scope: "operasional" };
  if (L === "R (Komisi Pribadi)") return { ...base, r: true, scope: "own" };
  if (L === "R (Proses Pesanan)") return { ...base, r: true, scope: "proses_pesanan" };
  if (L === "R (Billing Obat)") return { ...base, r: true, scope: "billing_obat" };
  if (L === "Create (Opname/Waste)") return { ...base, c: true, r: true, scope: "opname_waste" };
  if (L === "Input Petty Cash") return { ...base, c: true, r: true, scope: "petty_cash" };
  if (L === "Absen GPS Masuk/Pulang") return { ...base, c: true, r: true, scope: "own_attendance" };
  if (L === "R (Katalog)") return { ...base, r: true, scope: "katalog" };
  if (L === "R (Pesanan Sendiri)") return { ...base, r: true, scope: "pesanan_sendiri" };
  if (L === "Create (Pesanan Sendiri)") return { ...base, c: true, scope: "pesanan_sendiri" };
  if (L === "R (Status Sendiri)") return { ...base, r: true, scope: "status_sendiri" };
  if (L === "RU (Data Pribadi)") return { ...base, r: true, u: true, scope: "data_pribadi" };
  if (L === "R (Jadwal, Resep, Tagihan Pribadi)") return { ...base, r: true, scope: "rme_pribadi" };
  if (L === "CRUD (Milik Sendiri)") return { ...base, c: true, r: true, u: true, d: true, scope: "milik_sendiri" };
  throw new Error(`Label RBAC tidak dikenal: ${label}`);
}
