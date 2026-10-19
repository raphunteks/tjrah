import { lazy } from "react";
import { can, permOf } from "../lib/rbac.js";

// Pembatas peran untuk halaman yang memang khusus satu peran (penempatan menu), selalu dipadukan dengan izin matriks bila ada.
const is = (...roles) => (r) => roles.includes(r);
const isSuperadmin = is("superadmin");
const isOwner = is("owner");
const isGm = is("gm");
const isOwnerOrGm = is("owner", "gm");
const isMember = is("member");
const notDokter = (r) => !is("dokter")(r);

const APPROVAL_FEATURES = [6, 9, 10, 14, 20];

// Satu registri: menu sidebar, guard rute, dan fitur matriks yang menjadi dasar akses.
// `gate(role)` diturunkan dari matriks ASLI; RLS di database menegakkan hal yang sama.
export const PAGES = [
  { path: "/app", label: "Beranda", group: "Umum", code: "—", gate: () => true, Comp: lazy(() => import("./pages/Home.jsx")) },
  { path: "/app/alur", label: "Alur kerja", group: "Umum", code: "Bab V", gate: () => true, Comp: lazy(() => import("./pages/Flows.jsx")) },

  // Layanan & Akses — FASE 1. Sub-tab per peran (lihat pages/service/tabs.js); tiap sub-tab punya URL sendiri.
  { path: "/app/layanan/owner", label: "Kelola Owner Merchant", group: "Layanan & Akses", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "c"), Comp: lazy(() => import("./pages/service/Owners.jsx")) },
  { path: "/app/layanan/aktivitas", label: "Monitoring Aktivitas Owner", group: "Layanan & Akses", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "r"), Comp: lazy(() => import("./pages/service/OwnerActivity.jsx")) },
  { path: "/app/layanan/tiket", label: "Tiket Bantuan CS", group: "Layanan & Akses", code: "CS", platform: true,
    gate: (r) => isSuperadmin(r), Comp: lazy(() => import("./pages/service/Tickets.jsx")) },
  { path: "/app/layanan/tim", label: "Kelola GM & Kasir/Staf", group: "Layanan & Akses", code: "F13", tenant: true,
    gate: (r) => isOwner(r) && can(r, 13, "u"), Comp: lazy(() => import("./pages/service/Team.jsx")) },
  { path: "/app/layanan/kebijakan", label: "Kebijakan Berjenjang", group: "Layanan & Akses", code: "F13·Pol", tenant: true,
    gate: (r) => isOwnerOrGm(r) && can(r, 13, "u"), Comp: lazy(() => import("./pages/service/PolicyBuilder.jsx")) },
  { path: "/app/layanan/pantau", label: "Monitoring GM & Kasir/Staf", group: "Layanan & Akses", code: "F13·5", tenant: true,
    gate: (r) => isOwner(r) && can(r, 13, "r") && can(r, 5, "r"), Comp: lazy(() => import("./pages/service/Pulse.jsx")) },
  { path: "/app/layanan/bantuan", label: "Tiket ke Dukungan Tijarah", group: "Layanan & Akses", code: "CS", tenant: true,
    gate: (r) => isOwner(r), Comp: lazy(() => import("./pages/service/Help.jsx")) },
  { path: "/app/layanan/kasir", label: "Kelola Kasir Cabang", group: "Layanan & Akses", code: "F13", tenant: true,
    gate: (r) => isGm(r) && can(r, 13, "u"), Comp: lazy(() => import("./pages/service/Team.jsx")) },
  { path: "/app/layanan/bertugas", label: "Monitoring Kasir Bertugas", group: "Layanan & Akses", code: "F5", tenant: true,
    gate: (r) => isGm(r) && can(r, 5, "r") && can(r, 13, "r"), Comp: lazy(() => import("./pages/service/Pulse.jsx")) },

  // Platform — Superadmin (fitur 1)
  { path: "/app/platform", label: "Ringkasan platform", group: "Platform", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "r"), Comp: lazy(() => import("./pages/superadmin/Overview.jsx")) },
  { path: "/app/tenant", label: "Tenant", group: "Platform", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "r"), Comp: lazy(() => import("./pages/superadmin/Tenants.jsx")) },
  { path: "/app/paket", label: "Paket & tagihan", group: "Platform", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "r"), Comp: lazy(() => import("./pages/superadmin/Plans.jsx")) },
  { path: "/app/integrasi", label: "9router & Hermes", group: "Platform", code: "F1",
    gate: (r) => can(r, 1, "r"), Comp: lazy(() => import("./pages/superadmin/Integrations.jsx")) },
  { path: "/app/audit", label: "Audit log", group: "Platform", code: "F1",
    gate: (r) => can(r, 1, "r"), Comp: lazy(() => import("./pages/superadmin/Audit.jsx")) },
  { path: "/app/blueprint", label: "Blueprint (privat)", group: "Platform", code: "SA", platform: true,
    gate: (r) => isSuperadmin(r), Comp: lazy(() => import("./pages/superadmin/Blueprint.jsx")) },

  // Bisnis — butuh konteks tenant
  { path: "/app/dashboard", label: "Dashboard eksekutif", group: "Bisnis", code: "F2", tenant: true,
    gate: (r) => can(r, 2, "r"), Comp: lazy(() => import("./pages/owner/Dashboard.jsx")) },
  { path: "/app/laba-rugi", label: "Laba rugi", group: "Bisnis", code: "F11", tenant: true,
    gate: (r) => can(r, 11, "r"), Comp: lazy(() => import("./pages/owner/ProfitLoss.jsx")) },
  { path: "/app/capital", label: "Capital & payout", group: "Bisnis", code: "F19", tenant: true,
    gate: (r) => can(r, 19, "r"), Comp: lazy(() => import("./pages/owner/Capital.jsx")) },
  { path: "/app/hermes", label: "Laporan Hermes", group: "Bisnis", code: "F2", tenant: true,
    gate: (r) => can(r, 2, "r"), Comp: lazy(() => import("./pages/owner/Hermes.jsx")) },
  { path: "/app/crm", label: "Pelanggan & poin", group: "Bisnis", code: "F15", tenant: true,
    gate: (r) => can(r, 15, "r"), Comp: lazy(() => import("./pages/ops/Crm.jsx")) },
  { path: "/app/cabang", label: "Kelola cabang", group: "Bisnis", code: "F1·Cabang", tenant: true,
    gate: (r) => isOwner(r), Comp: lazy(() => import("./pages/owner/Branches.jsx")) },

  // Klinik — Dokter (FASE 3). Hanya untuk tenant berjenis layanan kesehatan.
  { path: "/app/pemeriksaan", label: "Pemeriksaan (RME)", group: "Klinik", code: "F17", tenant: true, pillars: ["health"],
    gate: (r) => can(r, 17, "c"), Comp: lazy(() => import("./pages/clinic/Exam.jsx")) },
  { path: "/app/pasien", label: "Pasien & rekam medis", group: "Klinik", code: "F17", tenant: true, pillars: ["health"],
    gate: (r) => can(r, 17, "r") && !permOf(r, 17)?.scope, Comp: lazy(() => import("./pages/clinic/Patients.jsx")) },

  // Operasional cabang — Staff & GM (FASE 2)
  { path: "/app/antrean", label: "Reservasi & antrean", group: "Operasional", code: "F18", tenant: true,
    gate: (r) => can(r, 18, "r"), Comp: lazy(() => import("./pages/clinic/Queue.jsx")) },
  { path: "/app/tagihan", label: "Tagihan & e-resep", group: "Operasional", code: "F5·17", tenant: true, pillars: ["health"],
    gate: (r) => can(r, 5, "r") && can(r, 17, "r"), Comp: lazy(() => import("./pages/clinic/Billing.jsx")) },
  { path: "/app/kasir", label: "Kasir POS", group: "Operasional", code: "F5", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 5, "r"), Comp: lazy(() => import("./pages/ops/Pos.jsx")) },
  { path: "/app/dapur", label: "Layar dapur", group: "Operasional", code: "F8", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 8, "u"), Comp: lazy(() => import("./pages/ops/Kitchen.jsx")) },
  { path: "/app/shift", label: "Shift & Z-Report", group: "Operasional", code: "F5", tenant: true,
    gate: (r) => can(r, 5, "c"), Comp: lazy(() => import("./pages/ops/Shift.jsx")) },
  { path: "/app/opname", label: "Opname & waste", group: "Operasional", code: "F10", tenant: true,
    gate: (r) => permOf(r, 10)?.scope === "opname_waste", Comp: lazy(() => import("./pages/ops/Opname.jsx")) },
  { path: "/app/kas", label: "Kas kecil", group: "Operasional", code: "F12", tenant: true,
    gate: (r) => can(r, 12, "r"), Comp: lazy(() => import("./pages/ops/Cash.jsx")) },
  { path: "/app/slip", label: "Komisi & slip gaji", group: "Operasional", code: "F14", tenant: true,
    gate: (r) => permOf(r, 14)?.scope === "own", Comp: lazy(() => import("./pages/ops/MyPay.jsx")) },

  // SDM & Ketenagakerjaan (FASE 2) — 9 Sub-menu Sesuai Hirarki
  { path: "/app/sdm", label: "Dashboard SDM", group: "SDM", code: "F13", tenant: true,
    gate: (r) => can(r, 13, "r") && !permOf(r, 13)?.scope, Comp: lazy(() => import("./pages/sdm/SdmDashboard.jsx")) },
  { path: "/app/karyawan", label: "Kelola Kasir", group: "SDM", code: "F13", tenant: true,
    gate: (r) => can(r, 13, "r") && !permOf(r, 13)?.scope, Comp: lazy(() => import("./pages/ops/Staff.jsx")) },
  { path: "/app/tukar-shift", label: "Jadwal & Tukar Shift", group: "SDM", code: "F13", tenant: true,
    gate: (r) => is("staff", "dokter", "gm", "owner", "superadmin")(r), Comp: lazy(() => import("./pages/growth/Swaps.jsx")) },
  { path: "/app/absen", label: "Absensi", group: "SDM", code: "F13", tenant: true,
    gate: (r) => can(r, 13, "c"), Comp: lazy(() => import("./pages/ops/Attendance.jsx")) },
  { path: "/app/sdm/cuti", label: "Cuti & Izin", group: "SDM", code: "F13", tenant: true,
    gate: (r) => is("staff", "dokter", "gm", "owner", "superadmin")(r), Comp: lazy(() => import("./pages/sdm/LeaveManagement.jsx")) },
  { path: "/app/penggajian", label: "Penggajian", group: "SDM", code: "F14", tenant: true,
    gate: (r) => can(r, 14, "r") && !permOf(r, 14)?.scope, Comp: lazy(() => import("./pages/ops/Payroll.jsx")) },
  { path: "/app/sdm/pengetahuan", label: "Pengetahuan & Form", group: "SDM", code: "F13", tenant: true,
    gate: (r) => is("staff", "dokter", "gm", "owner", "superadmin")(r), Comp: lazy(() => import("./pages/sdm/KnowledgeForms.jsx")) },
  { path: "/app/persetujuan", label: "Persetujuan", group: "SDM", code: "F6·9·10·14·20", tenant: true,
    gate: (r) => APPROVAL_FEATURES.some((f) => can(r, f, "a") || can(r, f, "q")), Comp: lazy(() => import("./pages/owner/Approvals.jsx")) },
  { path: "/app/sdm/laporan", label: "Laporan SDM", group: "SDM", code: "F13", tenant: true,
    gate: (r) => can(r, 13, "r") && !permOf(r, 13)?.scope, Comp: lazy(() => import("./pages/sdm/SdmReports.jsx")) },

  // Gudang, keuangan — GM (dan peran lain sesuai matriks)
  { path: "/app/produk", label: "Menu & harga", group: "Gudang & menu", code: "F3", tenant: true,
    gate: (r) => can(r, 3, "u"), Comp: lazy(() => import("./pages/ops/Products.jsx")) },
  { path: "/app/resep", label: "Resep & BOM", group: "Gudang & menu", code: "F4", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 4, "u"), Comp: lazy(() => import("./pages/ops/Recipes.jsx")) },
  { path: "/app/stok", label: "Stok & gudang", group: "Gudang & menu", code: "F10", tenant: true,
    gate: (r) => can(r, 10, "r") && !permOf(r, 10)?.scope, Comp: lazy(() => import("./pages/ops/Stock.jsx")) },
  { path: "/app/pembelian", label: "Pembelian & vendor", group: "Gudang & menu", code: "F9", tenant: true,
    gate: (r) => can(r, 9, "r"), Comp: lazy(() => import("./pages/ops/Purchasing.jsx")) },
  { path: "/app/transfer", label: "Transfer stok", group: "Gudang & menu", code: "F10", tenant: true,
    gate: (r) => can(r, 10, "r") && !permOf(r, 10)?.scope, Comp: lazy(() => import("./pages/ops/Transfers.jsx")) },
  { path: "/app/denah", label: "Denah meja", group: "Gudang & menu", code: "F7", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 7, "c"), Comp: lazy(() => import("./pages/ops/Floor.jsx")) },
  { path: "/app/jurnal", label: "Jurnal umum", group: "Keuangan", code: "F11", tenant: true,
    gate: (r) => can(r, 11, "r"), Comp: lazy(() => import("./pages/ops/Journal.jsx")) },
  { path: "/app/neraca", label: "Neraca & arus kas", group: "Keuangan", code: "F11", tenant: true,
    gate: (r) => can(r, 11, "r"), Comp: lazy(() => import("./pages/ops/Balance.jsx")) },
  { path: "/app/pesanan-online", label: "Pesanan online", group: "Gudang & menu", code: "F16", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 16, "r"), Comp: lazy(() => import("./pages/ops/Online.jsx")) },
  { path: "/app/rekonsiliasi", label: "Rekonsiliasi pembayaran", group: "Keuangan", code: "F12", tenant: true,
    gate: (r) => (isSuperadmin(r) || isOwnerOrGm(r)) && can(r, 12, "r"), Comp: lazy(() => import("./pages/ops/Recon.jsx")) },

  // Pertumbuhan & platform — FASE 3–5
  { path: "/app/kpi", label: "KPI & laporan terjadwal", group: "Bisnis", code: "F2", tenant: true,
    gate: (r) => can(r, 2, "r") && notDokter(r), Comp: lazy(() => import("./pages/growth/Kpi.jsx")) },
  { path: "/app/menu-engineering", label: "Menu engineering", group: "Bisnis", code: "F2·3", tenant: true, notPillars: ["health"],
    gate: (r) => can(r, 2, "r") && notDokter(r), Comp: lazy(() => import("./pages/growth/MenuEng.jsx")) },
  { path: "/app/proyeksi", label: "Proyeksi kas & labour cost", group: "Keuangan", code: "F12·13", tenant: true,
    gate: (r) => isOwnerOrGm(r) && can(r, 12, "r"), Comp: lazy(() => import("./pages/growth/Forecast.jsx")) },
  { path: "/app/promo", label: "Promo & voucher", group: "Gudang & menu", code: "F3", tenant: true,
    gate: (r) => isOwnerOrGm(r) && can(r, 3, "c"), Comp: lazy(() => import("./pages/growth/Promos.jsx")) },
  { path: "/app/checklist", label: "Checklist shift", group: "Operasional", code: "F5", tenant: true,
    gate: (r) => can(r, 5, "r") && notDokter(r), Comp: lazy(() => import("./pages/growth/Checklist.jsx")) },
  { path: "/app/copilot", label: "Owner Copilot", group: "Bisnis", code: "F2·AI", tenant: true,
    gate: (r) => isOwner(r) && can(r, 2, "r"), Comp: lazy(() => import("./pages/growth/Copilot.jsx")) },
  { path: "/app/akun/profil", label: "Profil saya", group: "Akun", code: "Akun", gate: () => true, Comp: lazy(() => import("./pages/account/Profile.jsx")) },
  { path: "/app/akun/keamanan", label: "Keamanan & kredensial", group: "Akun", code: "2FA", gate: () => true, Comp: lazy(() => import("./pages/account/Security.jsx")) },
  { path: "/app/akun/tampilan", label: "Tampilan & bahasa", group: "Akun", code: "UI", gate: () => true, Comp: lazy(() => import("./pages/account/Appearance.jsx")) },
  { path: "/app/akun/notifikasi", label: "Notifikasi", group: "Akun", code: "Alert", gate: () => true, Comp: lazy(() => import("./pages/account/Notifications.jsx")) },
  { path: "/app/akun/akses", label: "Hak akses saya", group: "Akun", code: "RBAC", gate: () => true, Comp: lazy(() => import("./pages/account/Access.jsx")) },
  { path: "/app/langganan", label: "Langganan & kuota AI", group: "Akun", code: "F1", tenant: true,
    gate: (r) => isOwner(r) || isSuperadmin(r), Comp: lazy(() => import("./pages/growth/Subscription.jsx")) },
  { path: "/app/akun/referral", label: "Kode referral", group: "Akun", code: "Ref",
    gate: (r) => notDokter(r), Comp: lazy(() => import("./pages/account/Referral.jsx")) },
  { path: "/app/platform-ops", label: "Penagihan & flag", group: "Platform", code: "F1", platform: true,
    gate: (r) => isSuperadmin(r) && can(r, 1, "r"), Comp: lazy(() => import("./pages/growth/PlatformOps.jsx")) },
];

// Member (L5) memakai cangkang sendiri (/m); tidak ada satu pun halaman operasional untuknya.
for (const pg of PAGES) { const g = pg.gate; pg.gate = (r) => !isMember(r) && g(r); }

/** Halaman khusus jenis usaha: klinik tidak butuh denah meja/dapur/resep masakan, F&B tidak butuh RME/rekam medis. */
export const pillarOk = (p, pillar) => {
  // Jika halaman khusus pilar tertentu (misal: pillars: ["health"] untuk RME & Pasien Klinik),
  // halaman HANYA BOLEH tampil jika tenant secara eksplisit memiliki pilar tersebut!
  if (p.pillars && p.pillars.length > 0) {
    return Boolean(pillar && p.pillars.includes(pillar));
  }
  // Jika halaman mengecualikan pilar tertentu (misal: notPillars: ["health"] untuk Dapur, Meja, Pesanan Online, Resep BOM),
  // sembunyikan untuk pilar tersebut.
  if (p.notPillars && p.notPillars.length > 0) {
    return !pillar || !p.notPillars.includes(pillar);
  }
  return true;
};
export const pagesFor = (role, pillar = null) => PAGES.filter((p) => p.gate(role) && pillarOk(p, pillar));
export const findPage = (path) => (path === "/app/akses" ? PAGES.find((p) => p.path === "/app/akun/akses") : PAGES.find((p) => p.path === path));

