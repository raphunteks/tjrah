// Bab III — Struktur 5 Peran Pengguna. Sumber: dokumen blueprint BAB III.

export const ROLES = [
  {
    id: "superadmin",
    level: "L0",
    name: "Superadmin / Developer",
    short: "Superadmin",
    domain: "Penyedia platform",
    device: "Web admin terminal / cloud console",
    duties: [
      "Mengelola tenant, paket langganan, billing SaaS",
      "Konfigurasi 9router API base & API key",
      "Integrasi webhook Hermes Agent (WhatsApp & Discord)",
      "Audit log global dan pembaruan sistem",
    ],
    revisi:
      "Superadmin mengelola platform, bukan isi bisnis tenant. Akses ke data merchant (keuangan, resep, rekam medis) hanya lewat mode break-glass: berbatas waktu, wajib alasan, tercatat di audit log, dan diberitahukan ke Owner.",
  },
  {
    id: "owner",
    level: "L1",
    name: "Owner Merchant",
    short: "Owner",
    domain: "Pemilik bisnis",
    device: "Executive web dashboard & mobile app",
    duties: [
      "Akses tertinggi atas seluruh cabang bisnisnya",
      "Laba rugi konsolidasi, neraca, arus kas",
      "Persetujuan akhir payroll, harga jual, dividen, rekening payout",
      "Pengajuan Harum.in Capital",
      "Menerima laporan Hermes Agent di WhatsApp / Discord",
    ],
  },
  {
    id: "gm",
    level: "L2",
    name: "General Manager",
    short: "GM",
    domain: "Operasional, keuangan, SDM, rantai pasok",
    device: "Portal operasional & akuntansi",
    duties: [
      "Pembukuan PSAK, jurnal umum, utang/piutang supplier",
      "Master resep BOM",
      "Jadwal shift dan payroll staf",
      "Persetujuan PO dan transfer stok antar-gudang",
      "Otorisasi void nota darurat dengan PIN",
      "Pengadaan bahan baku",
    ],
    revisi:
      "Satu orang memegang pembukuan, pengadaan, dan persetujuan stok adalah celah fraud. Pemisahan tugas: dokumen yang dibuat GM disetujui Owner, dan GM tidak bisa menyetujui draft miliknya sendiri.",
  },
  {
    id: "staff",
    level: "L3",
    name: "Cashier / Staff Operasional",
    short: "Staff",
    domain: "Front-office & operasional harian",
    device: "Tablet POS / smartphone staf",
    duties: [
      "Mengoperasikan kasir, pembayaran multi-metode, cetak struk",
      "Reservasi meja dan layar antrean dapur",
      "Mencatat waste dan pengeluaran kas kecil",
      "Absensi GPS geofencing",
    ],
    revisi:
      "Dokumen meminta PIN “GM / Supervisor” untuk void, tetapi role Supervisor tidak ada dan GM tidak selalu ada di cabang. Usulan tanpa menambah role: atribut Kepala Shift pada akun Staff, dengan PIN override terbatas nominal dan tercatat di audit log.",
  },
  {
    id: "dokter",
    level: "L4",
    name: "Dokter / Terapis",
    short: "Dokter",
    domain: "Layanan klinis & jasa spesialis",
    device: "Workstation dokter / tablet medis",
    duties: [
      "Rekam medis elektronik format SOAP",
      "Odontogram gigi FDI",
      "Diagnosis ICD-10 dan tindakan ICD-9-CM",
      "Penerbitan e-resep farmasi",
      "Sinkronisasi SATUSEHAT Kemenkes RI",
    ],
  },
];
