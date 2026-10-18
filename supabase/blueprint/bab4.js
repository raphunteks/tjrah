// Bab IV — Matriks RBAC granular (20 baris × 5 peran).
// `asli` = persis seperti dokumen. `revisi` hanya berisi sel yang diubah, beserta alasannya.

export const RBAC_ROLES = [
  { id: "sa", label: "Superadmin", level: "L0" },
  { id: "ow", label: "Owner", level: "L1" },
  { id: "gm", label: "General Manager", level: "L2" },
  { id: "st", label: "Cashier / Staff", level: "L3" },
  { id: "dr", label: "Dokter / Terapis", level: "L4" },
];

// Nilai: CRUD · RU · R · Create · Request · Approval · – ; teks dalam kurung = cakupan.
const A = (sa, ow, gm, st, dr) => ({ sa, ow, gm, st, dr });

const BG = "Break-glass";
const BG_WHY =
  "Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu.";

export const RBAC = [
  { no: 1, name: "Konfigurasi tenant, 9router & Hermes", asli: A("CRUD", "R", "–", "–", "–") },
  { no: 2, name: "Dashboard eksekutif & laba riil", asli: A("R", "CRUD", "R (Operasional)", "–", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 3, name: "Master produk, varian & harga jual", asli: A("CRUD", "CRUD", "CRUD", "R", "R"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 4, name: "Resep & Bill of Materials (BOM)", asli: A("CRUD", "CRUD", "CRUD", "R", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 5, name: "Register transaksi POS & struk", asli: A("–", "R", "R", "CRUD", "–") },
  { no: 6, name: "Otorisasi void, refund & diskon", asli: A("–", "Approval", "Approval (PIN)", "Request", "–"),
    revisi: { st: ["Request · Approval (Kepala Shift, ≤ batas)", "Alur 2 meminta PIN Supervisor, padahal role itu tidak ada. Akun Staff berstatus Kepala Shift boleh menyetujui void di bawah batas nominal; di atas batas tetap GM."] } },
  { no: 7, name: "Denah meja, kiosk & QR e-menu", asli: A("CRUD", "CRUD", "CRUD", "RU", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 8, name: "Antrean pesanan dapur & status masak", asli: A("CRUD", "R", "R", "CRUD", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 9, name: "Purchase Order & vendor supplier", asli: A("CRUD", "Approval", "CRUD", "–", "–"),
    revisi: { sa: [BG, BG_WHY], st: ["Create (Goods Receipt)", "Alur 3 menyuruh Staff mengonfirmasi penerimaan barang, tetapi matriks asli tidak memberi akses apa pun."] } },
  { no: 10, name: "Mutasi stok, opname & susut/waste", asli: A("CRUD", "R", "Approval & CRUD", "Create (Opname/Waste)", "–"),
    revisi: { sa: [BG, BG_WHY], ow: ["Approval (STO buatan GM)", "Pemisahan tugas: dokumen yang dibuat GM disetujui Owner."], gm: ["CRUD · Approval (bukan draft sendiri)", "Pembuat dokumen tidak boleh menyetujui dokumennya sendiri."] } },
  { no: 11, name: "Akuntansi, jurnal & neraca PSAK", asli: A("CRUD", "R", "CRUD", "–", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 12, name: "Buku kas, rekonsiliasi & settlement", asli: A("CRUD", "R", "CRUD", "Input petty cash", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 13, name: "Master karyawan, shift & geofencing", asli: A("CRUD", "CRUD", "CRUD", "Absen GPS masuk/pulang", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 14, name: "Payroll, komisi & kasbon karyawan", asli: A("CRUD", "Approval", "CRUD", "R (Komisi pribadi)", "R (Komisi pribadi)"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 15, name: "Database CRM & poin loyalitas", asli: A("CRUD", "CRUD", "CRUD", "RU", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 16, name: "Integrasi omnichannel & marketplace", asli: A("CRUD", "CRUD", "CRUD", "R (Proses pesanan)", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 17, name: "Rekam medis & SATUSEHAT Kemenkes", asli: A("CRUD", "R", "R", "R (Billing obat)", "CRUD"),
    revisi: {
      sa: ["–", "Penyedia platform tidak boleh membaca atau mengubah rekam medis, termasuk lewat break-glass. Dukungan teknis memakai data tersamarkan."],
      ow: ["R (Agregat & billing)", "Pemilik bisnis tidak memerlukan catatan klinis pasien. Cukup statistik kunjungan dan tagihan."],
      gm: ["R (Agregat & billing)", "Sama dengan Owner: catatan SOAP dan diagnosis hanya untuk tenaga medis."],
      st: ["Create (Registrasi pasien) · R (Billing obat)", "Alur 4 meminta Staff mendaftarkan pasien dengan NIK, yang butuh hak membuat data pasien."],
    } },
  { no: 18, name: "Reservasi & antrean ruang tunggu", asli: A("CRUD", "CRUD", "CRUD", "CRUD", "RU"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 19, name: "Pengajuan Harum.in Capital & payout", asli: A("CRUD", "CRUD", "RU", "–", "–"),
    revisi: { sa: [BG, BG_WHY] } },
  { no: 20, name: "Pengadaan bahan Harum.in Supplies", asli: A("CRUD", "Approval", "CRUD", "–", "–"),
    revisi: { sa: [BG, BG_WHY] } },
];

export const RBAC_LEGEND = [
  { code: "CRUD", label: "Create, Read, Update, Delete" },
  { code: "RU", label: "Baca & ubah" },
  { code: "R", label: "Baca saja" },
  { code: "Create", label: "Membuat entri tertentu" },
  { code: "Request", label: "Mengajukan permintaan" },
  { code: "Approval", label: "Menyetujui atau menolak" },
  { code: BG, label: "Akses darurat berbatas waktu, tercatat" },
  { code: "–", label: "Tidak ada akses" },
];

// Kelas visual dari nilai sel (dipakai badge).
export function kindOf(v) {
  if (v === "–") return "none";
  if (v.startsWith(BG)) return "bg";
  if (v.startsWith("CRUD")) return "crud";
  if (v.startsWith("RU")) return "ru";
  if (v.startsWith("R")) return "r";
  if (v.startsWith("Approval")) return "appr";
  return "act";
}

export const RBAC_CHANGED = RBAC.reduce((n, row) => n + Object.keys(row.revisi || {}).length, 0);
