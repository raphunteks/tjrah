// Panduan operasional 4 alur kerja (Bab V) versi yang DIJALANKAN aplikasi: pembagian peran mengikuti
// matriks RBAC ASLI. Bila matriks dan narasi Bab V berbeda, matriks yang berlaku (lihat `matriks`).
export const LANE = { staff: "Staff", gm: "GM", owner: "Owner", dokter: "Dokter", system: "Sistem", hermes: "Hermes" };

export const FLOWS = [
  {
    id: "dinein", code: "Alur 1", pillar: "fnb", title: "Dine-in, dapur, jurnal & Z-Report",
    steps: [
      { by: ["staff"], title: "Pilih meja & input pesanan", text: "Meja berubah dari kosong ke terisi; tiket langsung muncul di layar dapur.", path: "/app/kasir" },
      { by: ["staff"], title: "Masak & ubah status tiket", text: "Baru → dimasak → siap → diantar. Meja kuning selama ada item yang dimasak.", path: "/app/dapur" },
      { by: ["staff"], title: "Bayar QRIS, tunai, atau split", text: "Isi WhatsApp pelanggan untuk poin CRM. Pembayaran butuh shift kasir terbuka.", path: "/app/kasir" },
      { by: ["system"], title: "Potong stok BOM & jurnal", text: "Bahan terpotong sesuai resep GM, HPP riil dihitung, jurnal penjualan + pajak (tarif tenant) seimbang, meja menjadi perlu dibersihkan." },
      { by: ["staff"], title: "Tutup shift & Z-Report", text: "Hitung uang fisik; selisih kas tercatat. Z-Report mengunci hari.", path: "/app/shift" },
      { by: ["hermes"], title: "Laporan ke Owner & GM", text: "Ringkasan Z-Report ke WhatsApp Owner & GM serta Discord #laporan-harian.", path: "/app/hermes" },
    ],
  },
  {
    id: "void", code: "Alur 2", pillar: "fnb", title: "Otorisasi void nota",
    steps: [
      { by: ["staff"], title: "Ajukan void", text: "Pilih alasan (Salah Input Kasir, Pelanggan Membatalkan, Masakan Rusak) dan tulis catatan.", path: "/app/kasir" },
      { by: ["gm", "owner"], title: "Periksa & putuskan", text: "GM memasukkan PIN otorisasi (matriks: Approval PIN). Owner juga berhak Approval. Catatan wajib; pilih bahan kembali ke stok atau dicatat waste.", path: "/app/persetujuan",
        matriks: "Bab V menyebut PIN Supervisor; peran itu tidak ada di matriks, jadi PIN dipegang GM." },
      { by: ["system"], title: "Balik jurnal & audit", text: "Jurnal penjualan dibalik, stok kembali atau dibebankan sebagai waste, setoran shift dikoreksi, semua tercatat di audit log." },
      { by: ["hermes"], title: "Alert keamanan", text: "Pesan ke Discord #alert-sistem: nomor nota, nominal, pemberi otorisasi, cabang.", path: "/app/hermes" },
    ],
  },
  {
    id: "supply", code: "Alur 3", pillar: "fnb", title: "Pengadaan & transfer stok",
    steps: [
      { by: ["system", "hermes"], title: "Stok di bawah minimum", text: "Saat penjualan menurunkan stok melewati batas aman, Hermes mengirim pengingat WhatsApp ke GM." },
      { by: ["staff"], title: "Laporkan kondisi stok", text: "Staff mencatat opname buta dan waste dari cabang (Create · Opname/Waste).", path: "/app/opname" },
      { by: ["gm"], title: "Buat STO atau PO", text: "Transfer dari Gudang Pusat ke cabang, atau Purchase Order ke vendor.", path: "/app/transfer" },
      { by: ["gm"], title: "Setujui transfer", text: "STO disetujui GM (fitur 10: Approval & CRUD), lalu dikirim → dalam perjalanan → diterima.", path: "/app/persetujuan" },
      { by: ["owner"], title: "Setujui PO", text: "Purchase Order hanya bisa disetujui Owner (fitur 9: Approval).", path: "/app/persetujuan" },
      { by: ["gm"], title: "Terima barang", text: "Goods receipt PO dikonfirmasi GM; stok bertambah dan harga pokok diperbarui.", path: "/app/pembelian",
        matriks: "Bab V menyebut Staff menerima barang, tetapi matriks asli tidak memberi Staff akses fitur 9." },
      { by: ["system"], title: "Sinkron stok & akuntansi", text: "Persediaan bertambah di cabang tujuan; jurnal persediaan vs utang dagang tercatat." },
    ],
  },
  {
    id: "medis", code: "Alur 4", pillar: "health", title: "Pelayanan medis, e-resep & SATUSEHAT",
    steps: [
      { by: ["staff"], title: "Registrasi antrean dengan NIK", text: "NIK 16 digit divalidasi (kode wilayah & tanggal lahir); jenis kelamin dan tanggal lahir terisi otomatis.", path: "/app/antrean" },
      { by: ["dokter"], title: "Panggil & buka rekam medis", text: "Kartu rekam medis dibuat atau ditautkan dari NIK saat dokter memulai pemeriksaan.", path: "/app/antrean",
        matriks: "Bab V menyebut Staff mendaftarkan pasien ke RME; matriks memberi Staff hanya R (Billing Obat) pada fitur 17, jadi Staff mendaftarkan antrean (fitur 18) dan Dokter membuat kartu RME." },
      { by: ["dokter"], title: "SOAP, odontogram, ICD", text: "Riwayat alergi, anamnesis SOAP, odontogram FDI (11–48, 51–85), diagnosis ICD-10, tindakan ICD-9-CM.", path: "/app/pemeriksaan" },
      { by: ["dokter"], title: "E-resep & tutup kunjungan", text: "Rekam medis terkunci, e-resep dan tagihan terbit ke kasir, encounter diantrekan ke SATUSEHAT.", path: "/app/pemeriksaan" },
      { by: ["system"], title: "Kirim FHIR ke SATUSEHAT", text: "Bundle Encounter, Condition, Procedure, MedicationRequest dikirim asinkron oleh Edge Function satusehat-sync, tanpa menunggu pelunasan." },
      { by: ["staff"], title: "Siapkan obat & terima pembayaran", text: "Kasir membaca e-resep (aturan pakai), menyerahkan obat, lalu menerima pembayaran. Jasa kesehatan tanpa pajak penjualan.", path: "/app/tagihan" },
      { by: ["system"], title: "Stok obat, jurnal & komisi", text: "Stok obat terpotong, resep berstatus diserahkan, jurnal tercatat, komisi dokter dihitung untuk payroll." },
    ],
  },
];

export const stepsFor = (flow, role) => flow.steps.filter((s) => s.by.includes(role));
