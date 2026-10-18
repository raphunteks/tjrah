// Konten landing page publik. Hanya klaim yang tertulis di blueprint; tanpa angka atau testimoni karangan.

export const NAV = [
  { id: "fitur", label: "Fitur" },
  { id: "industri", label: "Industri" },
  { id: "cara-kerja", label: "Cara kerja" },
  { id: "harga", label: "Paket" },
  { id: "faq", label: "FAQ" },
];

export const INDUSTRIES = [
  {
    id: "fnb", name: "Food & Beverages", who: "Restoran, kafe, bakery, bar, food court, cloud kitchen",
    points: ["Denah meja dengan status warna real-time", "Tiket dapur otomatis per stasiun: dapur, barista, grill, pastry", "Stok bahan terpotong otomatis sesuai resep setiap porsi terjual", "Split bill, gabung meja, pindah meja tanpa cetak ulang tiket"],
  },
  {
    id: "retail", name: "Retail & Distribusi", who: "Minimarket, fashion, toko bangunan, pet shop, elektronik, grosir",
    points: ["Scan barcode 1D/2D dan cetak label harga rak", "Harga grosir bertingkat sesuai jumlah beli", "Barang konsinyasi dengan bagi hasil otomatis", "Stok multi-gudang dan transfer antar-cabang"],
  },
  {
    id: "service", name: "Jasa & Perawatan", who: "Salon, barbershop, spa, refleksi, car wash, bengkel",
    points: ["Booking slot dan pilih terapis atau kapster favorit", "Layar antrean ruang tunggu", "Komisi per layanan dihitung otomatis", "Paket perawatan dengan uang muka dan cicilan"],
  },
  {
    id: "health", name: "Klinik & Praktik", who: "Dokter gigi, dokter umum, klinik estetika, klinik pratama",
    points: ["Rekam medis elektronik format SOAP", "Odontogram gigi digital standar FDI", "Diagnosis ICD-10 dan tindakan ICD-9-CM", "Siap bridging SATUSEHAT Kemenkes (HL7 FHIR)"],
  },
  {
    id: "mfg", name: "Produksi Ringan", who: "Central kitchen, makanan beku, konveksi, katering korporat",
    points: ["Work order dari bahan mentah ke barang jadi", "HPP gabungan bahan, upah, dan overhead", "Resep setengah jadi bertingkat (sub-resep)", "Pengadaan dan penerimaan barang dengan nomor batch"],
  },
  {
    id: "omni", name: "Online & Omnichannel", who: "Toko online, e-menu QR meja, pesan antar",
    points: ["Toko online dengan domain sendiri tanpa komisi pihak ketiga", "Pesan dari meja lewat scan QR", "Ongkir real-time GoSend, GrabExpress, JNE, SiCepat", "Pesanan marketplace & food aggregator di satu layar kasir"],
  },
];

export const MODULES = [
  { code: "M1", name: "Kasir POS", text: "Tunai, kartu, QRIS dinamis, e-wallet, split payment, shift dan Z-Report.", size: "xl" },
  { code: "M3", name: "Inventori & Resep", text: "Resep bertingkat memotong stok bahan otomatis. Opname digital mendeteksi selisih.", size: "lg" },
  { code: "M4", name: "Akuntansi PSAK", text: "Jurnal otomatis dari setiap transaksi. Laba rugi, arus kas, neraca.", size: "lg" },
  { code: "M2", name: "Layar Dapur", text: "Tiket per stasiun dengan timer SLA.", size: "sm" },
  { code: "M5", name: "SDM & Payroll", text: "Absen GPS, shift, komisi, slip gaji.", size: "sm" },
  { code: "M7", name: "Omnichannel", text: "Toko online domain sendiri, pesan dari meja lewat QR, kurir, dan pesanan marketplace di satu layar.", size: "lg" },
  { code: "M6", name: "CRM & Loyalti", text: "Poin, tier member, voucher ulang tahun.", size: "sm" },
  { code: "M8", name: "Reservasi", text: "Jadwal, terapis favorit, antrean.", size: "sm" },
  { code: "M9", name: "Klinik", text: "Rekam medis SOAP, odontogram FDI, ICD-10, e-resep, siap bridging SATUSEHAT.", size: "lg" },
  { code: "M10", name: "Ritel & Grosir", text: "Barcode, harga bertingkat, konsinyasi.", size: "sm" },
  { code: "M11", name: "Produksi", text: "Work order dan HPP produksi.", size: "sm" },
  { code: "M12", name: "Capital & Supplies", text: "Pengajuan modal kerja lewat mitra berizin OJK dan belanja bahan grosir dari distributor.", size: "lg" },
];

export const STEPS = [
  { n: "01", title: "Daftarkan usaha", text: "Pilih industri dan jumlah cabang. Akun Owner dibuat, lalu Anda mengundang GM, kasir, atau dokter dengan peran masing-masing." },
  { n: "02", title: "Atur menu dan resep", text: "Masukkan produk, harga, dan komposisi bahan. Sejak itu setiap penjualan memotong stok dengan takaran yang tepat." },
  { n: "03", title: "Mulai berjualan", text: "Kasir memakai tablet atau ponsel, terhubung ke printer struk, laci kasir, scanner, dan soundbox QRIS." },
  { n: "04", title: "Laporan datang sendiri", text: "Saat toko tutup, Hermes Agent mengirim ringkasan penjualan ke WhatsApp Anda. Laba rugi tersusun otomatis dari jurnal." },
];

export const ROLES = [
  { lv: "Owner", text: "Laba riil semua cabang, persetujuan payroll dan pembelian, payout." },
  { lv: "General Manager", text: "Stok, resep, pembelian, akuntansi, shift, otorisasi void dengan PIN." },
  { lv: "Kasir & Staff", text: "Transaksi, meja, layar dapur, opname, kas kecil, absen." },
  { lv: "Dokter & Terapis", text: "Rekam medis, odontogram, e-resep, jadwal pasien." },
];

export const PLANS = [
  { name: "Starter", for: "Satu outlet yang baru mulai", modules: ["Kasir POS", "Layar dapur", "Inventori & resep", "CRM & loyalti"], branches: "1 cabang" },
  { name: "Growth", for: "Usaha yang mulai membuka cabang", modules: ["Semua di Starter", "Akuntansi PSAK", "SDM & payroll", "Omnichannel", "Reservasi"], branches: "Hingga 5 cabang", featured: true },
  { name: "Enterprise", for: "Jaringan multi-cabang dan klinik", modules: ["Semua modul", "Klinik & SATUSEHAT", "Produksi", "Capital & Supplies"], branches: "Cabang tanpa batas" },
];

export const FAQ = [
  { q: "Apakah data usaha saya terpisah dari merchant lain?", a: "Ya. Setiap baris data di database diberi penanda tenant dan dikunci dengan Row-Level Security, sehingga satu merchant tidak bisa membaca data merchant lain. Hak akses setiap peran juga ditegakkan di database, bukan hanya di tampilan." },
  { q: "Perangkat keras apa yang didukung?", a: "Printer struk ESC/POS (Bluetooth, USB, LAN, Wi-Fi), laci kasir elektronik, scanner barcode 1D/2D, timbangan digital, monitor pelanggan, soundbox QRIS, dan layar dapur." },
  { q: "Metode pembayaran apa saja yang bisa diterima?", a: "Tunai, kartu debit dan kredit lewat EDC bank, QRIS dinamis, dan e-wallet (GoPay, OVO, DANA, ShopeePay, LinkAja). Satu tagihan bisa dibayar dengan beberapa metode sekaligus." },
  { q: "Bagaimana Tijarah mengirim laporan ke WhatsApp?", a: "Melalui Hermes Agent. Saat kasir menutup hari, ringkasan penjualan dikirim ke WhatsApp Owner dan GM. Alert stok minimum dan pembatalan transaksi juga bisa diteruskan ke Discord manajemen." },
  { q: "Apakah klinik bisa terhubung ke SATUSEHAT?", a: "Modul klinik menyiapkan data kunjungan dalam format HL7 FHIR untuk dikirim ke SATUSEHAT Kemenkes. Koneksinya aktif setelah klinik mendaftarkan kredensial resminya." },
  { q: "Berapa biaya berlangganan?", a: "Harga paket diumumkan saat peluncuran. Anda bisa mencoba dashboard demo sekarang tanpa mendaftar." },
];
