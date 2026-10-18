// Bab II — Dekomposisi 12 Modul Fungsional. Sumber: dokumen blueprint BAB II.
// `revisi` = koreksi/risiko atas teks asli, ditandai jelas di UI.
import { PILLARS } from "./bab1.js";

export const MODULE_LIST = [
  {
    id: "M1",
    name: "Kasir POS & Front-Office",
    en: "POS & Front-Office Engine",
    groups: [
      {
        title: "Pembayaran terintegrasi (Harum.in Pay)",
        items: [
          "Tunai: tombol denominasi cepat (pas, 50rb, 100rb), kembalian otomatis, peringatan batas uang di laci",
          "Debit & kredit: integrasi EDC BCA, Mandiri, BRI, BNI, nomor approval trace, pemisahan biaya MDR",
          "QRIS dinamis per invoice di layar kasir, monitor pelanggan, dan soundbox audio",
          "E-wallet GoPay, OVO, DANA, ShopeePay, LinkAja dengan konfirmasi webhook otomatis",
          "Split payment: satu tagihan, dua metode atau lebih",
          "Uang muka & cicilan untuk katering, venue, paket perawatan, dengan pelacakan sisa piutang",
        ],
      },
      {
        title: "Denah meja interaktif (FnB)",
        items: [
          "Editor denah visual: lantai 1–2, area merokok, outdoor, VIP",
          "Status warna: hijau kosong, merah terisi, kuning diproses dapur, biru reservasi, abu-abu perlu dibersihkan",
          "Split bill per menu atau rata, merge bill antar-meja, pindah meja tanpa cetak ulang tiket dapur",
          "Hold & recall pesanan",
        ],
      },
      {
        title: "Shift & penutupan kasir",
        items: [
          "Wajib input modal awal (starting cash float) sebelum transaksi pertama",
          "Cash count akhir shift, selisih lebih/kurang tercatat, cetak X-Report",
          "Z-Report harian dikunci dan dikirim Hermes Agent ke WhatsApp Owner & GM",
        ],
      },
      {
        title: "Struk & nota digital",
        items: [
          "Kustomisasi logo, alamat, telepon, footer, media sosial, nomor izin usaha",
          "Struk digital ke WhatsApp pelanggan lewat Hermes",
        ],
      },
    ],
    revisi:
      "Simpan hanya 4 digit akhir kartu dan kode approval. Menyimpan nomor kartu penuh membawa sistem ke lingkup audit PCI-DSS.",
  },
  {
    id: "M2",
    name: "Dapur & Produksi",
    en: "Kitchen Display & Workstations",
    groups: [
      {
        title: "Antrean tiket digital",
        items: [
          "Pesanan dari kasir atau scan QR langsung tampil di layar produksi",
          "Routing per stasiun: Dapur Utama, Barista, Grill, Pastry",
        ],
      },
      {
        title: "Siklus masak",
        items: [
          "Status Baru → Sedang Dimasak → Siap Saji, terlihat oleh kasir & pelayan",
          "Timer SLA: hijau aman, kuning mendekati batas, merah berkedip bila lewat 15 menit",
        ],
      },
      {
        title: "Siap saji & layar pelanggan",
        items: [
          "Tombol Ready memicu notifikasi ke tablet pelayan",
          "Customer Order Display menampilkan nomor antrean yang sudah siap",
        ],
      },
      {
        title: "Kontrol bahan",
        items: [
          "Sakelar 86 / habis: satu klik mengunci menu di POS dan e-menu QR",
          "Log waste & spoilage dengan alasan, untuk menghitung nilai kerugian riil",
        ],
      },
    ],
  },
  {
    id: "M3",
    name: "Inventori, Gudang & Rantai Pasok",
    en: "Inventory & Supply Chain",
    groups: [
      {
        title: "Resep bertingkat (multi-level BOM)",
        items: [
          "Penjualan 1 porsi memotong bahan mentah otomatis (contoh: Nasi Goreng Spesial → beras, telur, ayam, minyak, bumbu, kemasan)",
          "Sub-resep barang setengah jadi: kaldu 10 liter memotong tulang & bumbu, lalu dipotong per mangkuk",
        ],
      },
      {
        title: "Multi-gudang & multi-cabang",
        items: [
          "Gudang pusat / central kitchen dan gudang per gerai, diawasi GM",
          "Stock Transfer Order: Draft → Approved → In Transit → Received",
        ],
      },
      {
        title: "Opname & anti-fraud",
        items: [
          "Hitung fisik dengan scanner kamera tablet",
          "Laporan shrinkage & variance: selisih fisik vs sistem dalam rupiah",
        ],
      },
      {
        title: "Pengadaan & vendor",
        items: [
          "Database supplier: rekening, termin (COD, Net 14, Net 30), histori harga",
          "Purchase Order ke PDF, email, atau WhatsApp",
          "Goods Receipt: cocokkan PO, kuantitas, nomor batch, tanggal kedaluwarsa",
          "Reorder point otomatis dengan alert WhatsApp ke GM",
        ],
      },
    ],
    revisi:
      "Alur STO tidak menyebut siapa yang menyetujui bila GM sendiri yang membuat draft. Perlu aturan: pembuat tidak boleh menyetujui dokumennya sendiri.",
  },
  {
    id: "M4",
    name: "Akuntansi & Laporan Finansial",
    en: "Accounting & 30+ Reports",
    groups: [
      {
        title: "Jurnal otomatis",
        items: [
          "Penjualan, retur, HPP, pembelian, dan biaya toko otomatis menjadi jurnal debit-kredit sesuai PSAK",
        ],
      },
      {
        title: "Laporan inti",
        items: [
          "Laba/rugi real-time: omset, diskon, HPP berbasis BOM, beban operasional, laba bersih harian & bulanan",
          "Arus kas: operasional, investasi, pendanaan",
          "Neraca: aset lancar, aset tetap minus penyusutan, kewajiban, ekuitas",
        ],
      },
      {
        title: "Kas kecil & pajak",
        items: [
          "Petty cash outlet dengan foto nota, diajukan kasir, divalidasi GM",
          "PB1 10% dan PPN transparan di struk, ekspor rekap untuk Bapenda / DJP",
        ],
      },
    ],
  },
  {
    id: "M5",
    name: "SDM, Presensi & Penggajian",
    en: "Mini HRIS & Payroll",
    groups: [
      {
        title: "Presensi & jadwal",
        items: [
          "Absen GPS geofencing radius maksimal 50 meter + foto selfie",
          "Kalender shift pagi, siang, malam, dan tukar shift antar-cabang",
        ],
      },
      {
        title: "Komisi & payroll",
        items: [
          "Komisi persentase per menu atau nominal tetap per layanan (terapis, kapster, montir, dokter gigi)",
          "Slip gaji: gaji pokok + tunjangan + lembur + komisi − denda telat − kasbon, disetujui GM, disahkan Owner",
        ],
      },
    ],
    revisi:
      "Foto wajah dan lokasi karyawan adalah data pribadi menurut UU PDP. Perlu persetujuan tertulis, masa simpan yang dibatasi, dan akses hanya untuk HR.",
  },
  {
    id: "M6",
    name: "Pelanggan, CRM & Loyalti",
    en: "CRM & Loyalty",
    groups: [
      {
        title: "Data & membership",
        items: [
          "Profil pelanggan: nama, WhatsApp, email, gender, tanggal lahir, preferensi, customer lifetime value",
          "Poin otomatis (misal Rp 10.000 = 1 poin), ditukar voucher",
          "Tier Bronze → Silver → Gold → Platinum, naik otomatis",
        ],
      },
      {
        title: "Promosi & komunikasi",
        items: [
          "Diskon %, nominal, Buy 1 Get 1, bundling, happy hour, kupon unik",
          "Pesan WhatsApp otomatis via Hermes: sambutan, info poin, voucher ulang tahun",
          "Survei bintang 1–5 di nota digital per cabang",
        ],
      },
    ],
  },
  {
    id: "M7",
    name: "Toko Online & Omnichannel",
    en: "Online Store & Omnichannel",
    groups: [
      {
        title: "Kanal milik sendiri",
        items: [
          "Web order domain kustom: dine-in scan QR, takeaway, delivery, tanpa komisi pihak ketiga",
          "Ongkir real-time & resi: GoSend, GrabExpress, JNE, SiCepat",
        ],
      },
      {
        title: "Kanal pihak ketiga",
        items: [
          "Pesanan & stok GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee di satu monitor kasir",
        ],
      },
    ],
    revisi:
      "Integrasi aggregator bergantung pada akses API mitra yang tidak terbuka untuk semua merchant. Perlakukan sebagai fase lanjutan, bukan janji peluncuran.",
  },
  {
    id: "M8",
    name: "Reservasi & Booking Jasa",
    en: "Service POS",
    groups: [
      {
        title: "Jadwal & praktisi",
        items: [
          "Kalender slot untuk barbershop, salon, spa, cuci mobil, klinik",
          "Pelanggan memilih kapster, terapis, atau teknisi favorit",
          "Layar ruang tunggu: nomor yang sedang dilayani dan estimasi giliran",
        ],
      },
    ],
  },
  {
    id: "M9",
    name: "Klinik & SATUSEHAT",
    en: "Healthcare & SATUSEHAT",
    groups: [
      {
        title: "Rekam Medis Elektronik",
        items: [
          "Anamnesis SOAP, riwayat alergi, tanda vital, catatan perkembangan",
          "Odontogram digital FDI: gigi permanen 11–48, gigi sulung 51–85, status tambalan, karies, hilang, implan, mahkota",
          "Pencarian kode diagnosis ICD-10 dan tindakan ICD-9-CM",
        ],
      },
      {
        title: "Integrasi & farmasi",
        items: [
          "Bridging SATUSEHAT Kemenkes RI dengan HL7 FHIR JSON terenkripsi",
          "E-resep langsung ke kasir/instalasi obat, stok obat terpotong otomatis",
        ],
      },
    ],
    revisi:
      "Pengiriman encounter ke SATUSEHAT tidak boleh menunggu pelunasan. Kirim saat kunjungan ditutup dokter; status pembayaran adalah urusan terpisah.",
  },
  {
    id: "M10",
    name: "Ritel, Grosir & Distribusi",
    en: "Retail & Distribution",
    groups: [
      {
        title: "Fitur ritel",
        items: [
          "Barcode scanner 1D/2D dan cetak label harga rak",
          "Harga bertingkat kuantitas (contoh: 1–5 pcs Rp 50.000, 6–20 pcs Rp 45.000, >20 pcs Rp 40.000)",
          "Konsinyasi: stok titipan supplier dengan bagi hasil otomatis saat terjual",
        ],
      },
    ],
  },
  {
    id: "M11",
    name: "Manufaktur Ringan",
    en: "Light Manufacturing",
    groups: [
      {
        title: "Produksi",
        items: [
          "Work order / production batch: bahan mentah → barang jadi, tahapan dipantau GM",
          "HPP produksi: bahan riil + upah langsung + alokasi listrik & penyusutan mesin",
        ],
      },
    ],
  },
  {
    id: "M12",
    name: "Capital, Supplies & Ads",
    en: "Financial & Growth Services",
    groups: [
      {
        title: "Layanan tambahan",
        items: [
          "Harum.in Capital: pinjaman modal tanpa agunan dari lembaga berizin OJK berdasarkan histori omset, diajukan Owner",
          "Harum.in Supplies: belanja bahan grosir dari distributor tangan pertama, dikelola GM",
          "Harum.in Ads: kampanye Facebook, Instagram, Google Ads dari dashboard",
        ],
      },
    ],
    revisi:
      "Capital mensyaratkan kemitraan resmi dengan lender berizin OJK dan persetujuan merchant untuk berbagi data omset. Tidak bisa dibangun sepihak oleh tim produk.",
  },
];

// Peta modul → pilar (diturunkan dari Bab I, bukan diketik ulang).
export const MODULE_PILLARS = Object.fromEntries(
  MODULE_LIST.map((m) => [m.id, PILLARS.filter((p) => p.modules.includes(m.id)).map((p) => p.code)])
);

export const PILLAR_FILTERS = PILLARS.map((p) => ({ code: p.code, name: p.name }));
