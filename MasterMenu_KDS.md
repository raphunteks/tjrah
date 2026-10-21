# DOKUMEN MASTER SPESIFIKASI & STRUKTUR 3 FASE PENGEMBANGAN TIJARAH OS
**Spesifikasi Paripurna & Roadmap Eksekusi 3 Fase: Subtab Baru Pengaturan Dapur & KDS, Subtab Baru Riwayat Transaksi, Subtab Baru Printer & Preferensi (Bluetooth & LAN/WiFi), Customer Facing Display (CFD), Filter Cabang Multi-Outlet, Visual POS Menu WebP, Mode Layanan 3 Pilar, Searchable Pelanggan L5 & Tambah Member Baru, Fondasi Finansial "Tunai = S-Wallet" (Zero Cash Skimming), Transfer Virtual Account (VA Pakasir 9 Bank), QRIS Dinamis Pakasir, S-Wallet Member Digital, Diskon Cepat Dinamis, dan Kalkulator Kembalian Cepat**  
*Versi: 6.2 (Revisi Finansial: Tunai = S-Wallet & Transfer VA Pakasir) — Tijarah Operating System*  
*Prinsip Mutlak: Bebas Emoji (100% SVG Icons & KPI Badges), Mobile/Tablet/Desktop Friendly, Zero Dummy Data*

---

## 1. PENEGASAN ARSITEKTUR METODE PEMBAYARAN TIJARAH OS

> [!IMPORTANT]
> **PRINSIP DASAR KEUANGAN: TUNAI = S-WALLET (ZERO CASH SKIMMING)**  
> Di Tijarah OS, pembayaran **Tunai (Cash)** tidak dibiarkan sebagai transaksi manual tanpa buku besar digital. Setiap kas tunai fisik yang diterima kasir **WAJIB menggunakan dan membukukan saldo ke Laci Kasir S-Wallet (`cash_drawer_wallet`)** bertugas.  
> Dengan demikian, **Tunai adalah S-Wallet Fisik**, di mana uang tunai di tangan kasir dicatat dengan pembukuan ganda (*double-entry bookkeeping*). Saat tutup shift (Z-Report), jumlah uang tunai fisik di laci kas wajib sama persis dengan mutasi saldo S-Wallet kasir di server (menghapus 100% celah penggelapan kasir / *cash skimming*).

### Empat Pilar Metode Pembayaran Resmi Tijarah:
1. **Tunai (S-Wallet Tunai Kasir)**: Penerimaan uang tunai fisik yang secara otomatis membukukan mutasi kredit-debit ke brankas/laci kas S-Wallet kasir bertugas.
2. **QRIS Dinamis (Pakasir API v2)**: Pembuatan kode QRIS instan otomatis dari gateway Pakasir (0.7% / 1%), ditampilkan pada POS dan Layar Pelanggan (CFD), dengan konfirmasi pelunasan instan via Webhook Pakasir.
3. **Transfer Bank / Virtual Account (VA Pakasir API v2)**: Pembuatan nomor VA instan multi-bank resmi Pakasir yang mendukung 9 jaringan bank nasional:
   - `bri_va` (Bank BRI)
   - `bni_va` (Bank BNI)
   - `cimb_niaga_va` (Bank CIMB Niaga)
   - `bsi_va` (Bank Syariah Indonesia)
   - `danamon_va` (Bank Danamon)
   - `muamalat_va` (Bank Muamalat)
   - `bnc_va` (Bank Neo Commerce)
   - `maybank_va` (Bank Maybank)
   - `ocbc_va` (Bank OCBC)
   Nomor VA dan petunjuk transfer ditampilkan secara live pada POS dan Customer Facing Display (CFD), dengan status pelunasan realtime dari webhook Pakasir.
4. **S-Wallet Member Digital (L5)**: Pembayaran non-tunai langsung memotong saldo dompet digital member setia melalui token kartu `SW-XXXXXX` atau otentikasi nomor WhatsApp/PIN pelanggan.

---

## 2. MATRIKS RBAC PENAMBAHAN SUBTAB & FITUR BARU

| Subtab & Fitur Baru | Rute URL | Grup Sidebar | Owner (L1) | General Manager (L2) | Kasir / Staf (L3) | Member (L5) | Deskripsi Hak Akses & Keamanan |
|---|---|---|:---:|:---:|:---:|:---:|---|
| **Pengaturan Dapur & KDS** | `/app/pengaturan-dapur` | `Gudang & menu` | Akses Penuh (CRUD) | Akses Penuh (CRUD) | Tersembunyi | Tersembunyi | Mengatur sakelar KDS, multi-stasiun, SLA timer, dan chip stasiun dapur aktif. |
| **Riwayat Transaksi** | `/app/transaksi` | `Operasional` | Semua Cabang | Cabang Bertugas | Shift/Cabang Kasir | Tersembunyi | Tabel riwayat penjualan dengan filter 4 metode bayar (Tunai S-Wallet, QRIS, Transfer VA, S-Wallet Member) & 3 tombol cetak thermal. |
| **Printer & Preferensi** | `/app/akun/printer` | `Akun` | Akses Penuh | Akses Penuh | Akses Device Kasir | Tersembunyi | Konfigurasi 4 printer (Struk, Item, Dapur, Bar), pairing Bluetooth Web API & LAN IP:Port. |
| **Customer Facing Display (CFD)** | `/display/customer` | *Layar Publik* | Akses Monitor | Akses Monitor | Display Kasir | Terbuka di Display | Layar tablet kedua menghadap pembeli: keranjang belanja, QRIS Dinamis (280×280 px), dan nomor Transfer VA Pakasir. |
| **Filter Lokasi Cabang (`BranchSelect`)** | `/app/produk` & `/app/resep` | `Gudang & menu` | Pilih Semua Cabang | Pilih Cabang Terkait | Terkunci Permanen | Tersembunyi | Owner/GM bebas filter cabang. Kasir otomatis terkunci ke `profiles.branch_id` (Aman). |
| **Foto Menu WebP & Deskripsi** | `/app/produk` | `Gudang & menu` | Upload & Edit | Upload & Edit | Hanya Lihat | Terbuka di Katalog | Konversi HTML5 Canvas ke WebP (<50KB), pratinjau, dan textarea deskripsi menu. |
| **Bulk Import Menu (.xlsx & .csv)** | `/app/produk` | `Gudang & menu` | Unduh & Unggah | Unduh & Unggah | Tersembunyi | Tersembunyi | Unduh templat resmi 7 kolom SheetJS dan unggah batch ratusan menu secara instan. |
| **Visual POS Menu Card Grid** | `/app/kasir` | `Operasional` | Akses Kasir | Akses Kasir | Akses Utama Kasir | Tersembunyi | Kartu menu visual dengan foto WebP, harga rupiah, dan badge ketersediaan stok. |
| **3 Mode Layanan (Puncak Tiket)** | `/app/kasir` | `Operasional` | Ya | Ya | Ya | Terbuka di E-Menu | Segmented switch: `Takeaway`, `Dine In` (nomor meja), `Drive Thru` (plat nomor mobil). |
| **CRM Kasir: Search & Add Member L5** | `/app/kasir` | `Operasional` | Ya | Ya | Ya | Akun Pribadi (/m) | Ketik nama/WA ➔ 1-klik pasang ke tiket. Tombol `+ Pelanggan Baru` langsung terdaftar ke L5. |
| **Widget Diskon Cepat (Rp / %)** | `/app/kasir` | `Operasional` | Akses Penuh | Akses Penuh | Butuh PIN jika > Max | Tersembunyi | Input potongan harga fleksibel di atas Subtotal dengan proteksi PIN otorisasi. |
| **Kalkulator Kembalian Uang Kasir** | `/app/kasir` (Bayar Tunai) | `Operasional` | Ya | Ya | Ya | Tersembunyi | Total dinamis, uang diterima, deretan tombol pecahan cepat (Uang Pas, 10k, 20k, 40k, 50k, 100k). |
| **Buku Kas Laci S-Wallet (Tunai = S-Wallet)** | `/app/kasir` ➔ S-Wallet | `Keuangan` / Kasir | Pantau Saldo | Pantau Saldo | Laci Kasir Shift | Tersembunyi | Pembayaran tunai wajib membukukan saldo ke laci kas S-Wallet kasir (Zero Skimming). |
| **Transfer VA Pakasir Multi-Bank** | `/app/kasir` (Bayar VA) | `Operasional` | Pantau Transaksi | Pantau Transaksi | Buat VA Kasir | Terbuka di CFD | Menghasilkan nomor VA (BRI, BNI, CIMB, BSI, Danamon, Muamalat, BNC, Maybank, OCBC) via Pakasir API v2. |

---

## 3. PETA STRATEGIS ROADMAP 3 FASE EKSEKUSI

Pengembangan dibagi secara tegas menjadi **3 Fase Mandiri**. Anda dapat memerintahkan pengerjaan dan menguji hasilnya **satu per satu**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: FONDASI MENU, PENGATURAN DAPUR KDS & MULTI-CABANG                              │
│ • Database & Migrasi (image_url, description, kds_enabled, kitchen_stations)          │
│ • Subtab Baru: Pengaturan Dapur & KDS (/app/pengaturan-dapur) di Gudang & Menu         │
│ • Sakelar Stasiun Dapur (Default: Nonaktif) & Sakelar Master KDS                       │
│ • Filter Lokasi Cabang (BranchSelect) di Produk & Menu serta Resep & BOM               │
│ • Modal Produk: Upload Foto Auto-Convert WebP (<50KB Canvas) & Textarea Deskripsi Menu │
│ • Modul Bulk Import Menu (.xlsx & .csv) dengan Generator Templat 7 Kolom Resmi         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ (Setelah Anda menguji & menyetujui Fase 1)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 2: TRANSFORMASI KASIR POS VISUAL, CRM L5, PEMBAYARAN VA/QRIS & CFD                │
│ • Redesain Layar Kasir POS: Full Menu Visual Card Grid dengan Foto WebP                │
│ • 3 Mode Layanan di Panel Tiket: Takeaway, Dine In (Meja), Drive Thru (Plat Mobil)     │
│ • Modul CRM Kasir: Searchable Pelanggan Lama (1-Klik) & Modal Tambah Member Baru L5   │
│ • Widget Diskon Cepat di Atas Subtotal (Toggle Rp & %, Proteksi PIN Otorisasi)         │
│ • Kalkulator Kembalian Kasir Tunai (Pecahan Cepat: Pas, 10k, 20k, 40k, 50k, 100k)     │
│ • Modul Transfer Bank / Virtual Account (VA Pakasir 9 Bank) di Dialog Pembayaran       │
│ • Customer Facing Display (CFD / Layar Pelanggan) Rute /display/customer:              │
│   Menampilkan Total Belanja, QRIS Dinamis (280×280 px), dan Nomor Virtual Account      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ (Setelah Anda menguji & menyetujui Fase 2)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 3: EKOSISTEM FINANSIAL "TUNAI = S-WALLET", RIWAYAT TRANSAKSI & PRINTER            │
│ • Integrasi Finansial "Tunai = S-Wallet" (Uang Tunai Wajib Pakai Saldo Laci Kasir)     │
│ • Rekonsiliasi Tutup Shift (Z-Report): Fisik Tunai di Laci == Saldo Kasir S-Wallet     │
│ • Subtab Baru: Riwayat Transaksi (/app/transaksi) dengan Filter 4 Metode Pembayaran    │
│   (Tunai S-Wallet, QRIS Pakasir, Transfer VA 9 Bank, S-Wallet Member)                  │
│ • 3 Format Tombol Cetak Thermal: 1. Cetak Struk, 2. Tiket Dapur/Bar, 3. Label Item     │
│ • Subtab Baru: Printer & Preferensi (/app/akun/printer) Bluetooth & LAN/WiFi           │
│ • Standar Mutlak Anti-Emoji (100% SVG Icons & KPI Badges Tijarah)                      │
│ • Pengujian Komprehensif: npm test (28 Test Suite Pass) & Build Vite Produksi          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. FASE 1: FONDASI MENU, PENGATURAN DAPUR KDS & MULTI-CABANG

### 4.1 Sasaran & Lingkup Pekerjaan Fase 1
Meletakkan fondasi master data produk dan konfigurasi dapur. Owner dan General Manager mendapatkan kontrol penuh atas sakelar dapur/KDS, menyaring menu per cabang, mengunggah foto WebP hemat bandwidth, dan mengimpor ratusan menu via Excel.

### 4.2 Skema Database PostgreSQL & Migrasi Kolom
```sql
-- Penambahan kolom gambar WebP dan deskripsi menu
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Penambahan konfigurasi operasional dapur & KDS pada tenant
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS kds_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kitchen_stations_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kitchen_stations JSONB NOT NULL DEFAULT '["dapur", "barista", "grill", "pastry"]'::jsonb,
ADD COLUMN IF NOT EXISTS kds_sla_minutes INTEGER NOT NULL DEFAULT 15;
```

### 4.3 Subtab Baru: Pengaturan Dapur & KDS (`/app/pengaturan-dapur`)
- **Grup Sidebar**: `Gudang & menu`
- **Rute URL**: `/app/pengaturan-dapur`
- **Hak Akses**: `can(role, 8, "u") && isOwnerOrGm(role)` (Owner L1 & GM L2).
- **Komponen 4 Kartu Pengaturan**:
  1. *Sakelar Master KDS*: Toggle Aktif/Nonaktif (*Default: Nonaktif*).
  2. *Sakelar Multi-Stasiun Dapur*: Toggle Aktif/Nonaktif (*Default: Nonaktif*).
  3. *SLA Timer Masak*: Input target menit (15 mnt, kuning 10 mnt, merah 15 mnt).
  4. *Kelola Stasiun Aktif*: Chips badge stasiun (`dapur`, `barista`, `grill`, `pastry`) + tombol tambah/hapus.

### 4.4 Logika Sakelar Stasiun Dapur (Default: Nonaktif) & KDS Sidebar Gate
- **Kondisi Nonaktif (Default)**:
  - Form modal *Tambah Menu* & *Ubah Menu* menyembunyikan dropdown Stasiun Dapur (otomatis bernilai `"dapur"`).
  - Kolom *STASIUN* pada tabel daftar menu disembunyikan.
  - Subtab *Display Dapur (/app/dapur)* di sidebar disembunyikan dari Staf Kasir (L3).
- **Kondisi Aktif**: Dropdown stasiun muncul di modal produk, kolom stasiun muncul di tabel, dan KDS membagi antrean per stasiun kerja.

### 4.5 Filter Lokasi Cabang (`BranchSelect`) di Produk & Resep
- Dipasang pada [src/app/pages/ops/Products.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Products.jsx) dan [src/app/pages/ops/Recipes.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Recipes.jsx).
- **Keamanan Isolasi Kasir (L3)**: Akun kasir terikat permanen pada `profiles.branch_id` (`Cabang Pettarani`). Kasir tidak bisa mengganti filter cabang dan hanya menjual produk cabangnya sendiri.

### 4.6 Modal Tambah/Ubah Menu: Upload Foto WebP Client-Side & Textarea Deskripsi
- Upload foto gambar (.jpg, .jpeg, .png, .webp).
- Dikonversi instan menggunakan **HTML5 Canvas API** menjadi format `image/webp` (kualitas 0.82, max 800×800 px, ukuran **< 50 KB**).
- Pratinjau thumbnail instan + tombol Ganti & Hapus Foto.
- Textarea form *Deskripsi Menu* (komposisi bahan, rasa, info alergen).
- Dropdown stasiun dapur kondisional (hanya muncul saat sakelar multi-stasiun aktif).

### 4.7 Modul Bulk Import Menu (.xlsx & .csv) & Generator Templat Resmi
- Tombol sekunder di samping *Tambah menu*: `[ + Bulk Import (.xlsx) ]`.
- Modal interaktif berbasis SheetJS (`xlsx`):
  1. *Unduh Templat Excel Resmi (.xlsx)*: Berkas 7 kolom (`SKU`, `Nama Menu`, `Kategori`, `Harga Jual`, `Stasiun Dapur`, `Barcode`, `Deskripsi Menu`) + 3 baris data contoh.
  2. *Unggah Berkas Spreadsheet*: Validasi instan SKU unik dan format harga angka.
  3. *Tabel Pratinjau Interaktif*: Seleksi checkbox baris dan status validasi.
  4. *Simpan Massal*: Batch insert ke database Supabase.

### 4.8 Matriks Berkas yang Dibuat / Dimodifikasi pada Fase 1
- **BARU**: `src/app/pages/ops/KitchenSettings.jsx` (Subtab Pengaturan Dapur & KDS).
- **MODIFIKASI**: [src/app/pages.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages.js) (Rute `/app/pengaturan-dapur`).
- **MODIFIKASI**: [src/app/pages/ops/Products.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Products.jsx) (BranchSelect, WebP uploader, deskripsi, conditional station, Bulk Import SheetJS).
- **MODIFIKASI**: [src/app/pages/ops/Recipes.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Recipes.jsx) (BranchSelect).
- **MODIFIKASI**: [src/app/pages/ops/Kitchen.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Kitchen.jsx) (Evaluasi `kds_enabled` & `kitchen_stations_enabled`).

### 4.9 Kriteria Kelulusan & Verifikasi Fase 1 (Definition of Done)
1. Subtab `/app/pengaturan-dapur` tampil di grup *Gudang & menu* untuk Owner dan GM.
2. Toggle Stasiun Dapur berhasil menyembunyikan/memunculkan dropdown stasiun pada modal tambah menu.
3. Upload foto mengonversi gambar ke WebP (<50 KB) dan tampil di pratinjau.
4. Filter lokasi cabang (`BranchSelect`) berfungsi di halaman Produk dan Resep BOM.
5. Unduh templat Excel menghasilkan berkas `.xlsx` 7 kolom dan impor berhasil memasukkan data.
6. `npm test` lolos 28/28 tests PASS dan `npm run build` sukses.

---

## 5. FASE 2: TRANSFORMASI KASIR POS VISUAL, CRM L5, PEMBAYARAN VA/QRIS & LAYAR PELANGGAN (CFD)

### 5.1 Sasaran & Lingkup Pekerjaan Fase 2
Kecepatan transaksi kasir touchscreen dengan menu visual foto WebP, pilihan 3 mode layanan, registrasi pelanggan CRM L5 instan, widget diskon cepat, kalkulator kembalian uang pecahan cepat, modul pembayaran Transfer Bank (Virtual Account Pakasir 9 Bank) & QRIS Dinamis, serta Customer Facing Display (CFD).

### 5.2 Redesain Grid Menu Kasir POS Visual Card Grid dengan Foto WebP
- Grid kartu produk modern di [src/app/pages/ops/Pos.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Pos.jsx): foto WebP 1:1, nama menu tebal, harga rupiah, badge stok (Tersedia / Habis 86).
- Kapsul tab kategori cepat dan bilah pencarian instan (nama/SKU/barcode).
- GSAP micro-interaction sentuh halus saat item dipilih.

### 5.3 Tiga Mode Layanan di Puncak Panel Tiket (Takeaway, Dine In, Drive Thru)
Segmented switch di puncak tiket:
1. `Takeaway (Bawa Pulang)` — Ikon SVG Kantong.
2. `Dine In (Makan di Tempat)` — Ikon SVG Sendok Garpu / Meja + Selector Meja.
3. `Drive Thru (Lantatur)` — Ikon SVG Mobil + Input Nomor Polisi Kendaraan (misal: *DD 1234 XY*).

### 5.4 Modul CRM Kasir: Searchable Pelanggan Lama (1-Klik) & Modal Member L5 Baru
- **Pencarian Cepat Pelanggan Lama**: Kasir mengetik nama atau no WA ➔ Muncul daftar pelanggan dari tabel `customers` (Nama, WA, Tier, Saldo Poin/S-Wallet) ➔ **Klik 1 kali langsung terpasang ke pesanan!**
- **Tombol `[ + Pelanggan Baru ]`**: Modal cepat pendaftaran Nama Lengkap, Nomor WhatsApp (+62), dan Catatan Alergen ➔ Otomatis tersimpan ke tabel `customers`, langsung berhak login ke **Portal Member L5 (`/m`)** via WhatsApp OTP, dan menerima e-struk digital.

### 5.5 Widget Diskon Cepat di Atas Subtotal (Toggle Rp & %, Proteksi PIN)
- Terletak persis di atas baris Subtotal panel kasir.
- Tombol pemilih satuan: `[ Rp ]` atau `[ % ]` (default: `Rp`).
- Proteksi PIN otorisasi Owner/GM jika diskon melampaui batas kebijakan kasir.

### 5.6 Kalkulator Kembalian Kasir Tunai (Tender Calculator & Tombol Pecahan Cepat)
Pada dialog pembayaran [src/app/pages/ops/Payment.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payment.jsx) saat opsi Tunai (S-Wallet Tunai) dipilih:
- Kolom `Jumlah Total Tagihan` dinamis dan `Uang Diterima`.
- Deretan tombol pecahan cepat: `[ Uang Pas ]` | `[ Rp 10.000 ]` | `[ Rp 20.000 ]` | `[ Rp 40.000 ]` | `[ Rp 50.000 ]` | `[ Rp 100.000 ]`.
- Tampilan teks kembalian tebal kontras: *"Uang Kembalian: Rp XX.XXX"*.

### 5.7 Modul Pembayaran Transfer Bank / Virtual Account (VA Pakasir API v2)
- Di dalam dialog pembayaran [Payment.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payment.jsx):
  - Kasir dapat memilih opsi pembayaran `Transfer (VA)` dengan pilihan bank resmi:
    *BRI, BNI, CIMB Niaga, BSI, Danamon, Muamalat, Neo Commerce (BNC), Maybank, OCBC*.
  - Sistem memanggil endpoint Pakasir `createPakasirTransaction` dan mengembalikan:
    - *Nomor Virtual Account*
    - *Batas Waktu Bayar (Countdown Timer)*
    - *Nama Pemilik Rekening / Merchant*
  - Kasir dan pembeli melihat nomor VA secara live; begitu pelanggan transfer, webhook Pakasir otomatis mengubah status pesanan menjadi `paid` tanpa perlu konfirmasi manual.

### 5.8 Customer Facing Display (CFD / Layar Pelanggan) Rute `/display/customer`
- Layar web mandiri untuk tablet/monitor kedua yang menghadap pembeli.
- Sinkronisasi realtime keranjang belanja pembeli.
- **Render Mode Pembayaran Interaktif**:
  - Jika metode QRIS dipilih: Menampilkan QRIS Dinamis Pakasir (280 × 280 piksel).
  - Jika metode Transfer VA dipilih: Menampilkan logo bank, Nomor Virtual Account besar dengan tombol salin, dan petunjuk transfer.
- Animasi sukses centang hijau SVG saat transaksi lunas.

### 5.9 Matriks Berkas yang Dibuat / Dimodifikasi pada Fase 2
- **MODIFIKASI**: [src/app/pages/ops/Pos.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Pos.jsx) (Grid WebP, 3 mode layanan, searchable CRM pelanggan L5, widget diskon cepat).
- **MODIFIKASI**: [src/app/pages/ops/Payment.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payment.jsx) (Kalkulator kembalian pecahan cepat, modul VA Pakasir 9 bank, QRIS Dinamis).
- **BARU**: `src/app/pages/public/CustomerDisplay.jsx` (Layar CFD untuk keranjang, QRIS Dinamis, dan nomor Transfer VA).
- **MODIFIKASI**: [src/app/pages.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages.js) atau [src/App.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/App.jsx) (Rute `/display/customer`).

### 5.10 Kriteria Kelulusan & Verifikasi Fase 2 (Definition of Done)
1. POS Kasir menampilkan kartu menu visual dengan foto WebP.
2. 3 mode layanan (Takeaway, Dine In, Drive Thru) tersimpan di data pesanan.
3. Pencarian pelanggan lama terhubung 1-klik dan modal pelanggan baru mendaftar ke Member L5.
4. Widget diskon cepat (Rp / %) berfungsi dengan proteksi PIN jika melewati batas.
5. Kalkulator kembalian tombol pecahan cepat menghitung kembalian akurat.
6. Pilihan Transfer VA Pakasir menghasilkan nomor VA bank resmi dan status terupdate via webhook.
7. Rute `/display/customer` menampilkan belanjaan, QRIS dinamis, dan nomor VA secara sinkron.
8. `npm test` lolos 28/28 tests PASS dan `npm run build` sukses.

---

## 6. FASE 3: EKOSISTEM FINANSIAL "TUNAI = S-WALLET", RIWAYAT TRANSAKSI & PRINTER MULTI-KANAL

### 6.1 Sasaran & Lingkup Pekerjaan Fase 3
Pencegahan celah penggelapan uang tunai kasir (*zero cash skimming*) dengan prinsip fundamental **"Tunai = S-Wallet"** di mana kas fisik wajib membukukan saldo ke laci S-Wallet kasir, subtab riwayat transaksi dengan filter 4 metode bayar dan 3 format cetak thermal, serta konfigurasi printer thermal Bluetooth dan LAN/WiFi persis acuan gambar antarmuka tablet.

### 6.2 Integrasi Finansial "Tunai = S-Wallet" (Zero Cash Skimming)
- **Prinsip Dasar**: Seluruh penerimaan uang tunai di kasir pada hakikatnya adalah penambahan saldo laci S-Wallet kasir (`cash_drawer_wallet`).
- **Mekanisme Double-Entry**:
  - `DEBIT`: Kas di Tangan Kasir Bertugas (+Rp XX.XXX di laci S-Wallet)
  - `KREDIT`: Pendapatan Penjualan (-Rp XX.XXX)
  - Selisih neraca: Rp 0 (seimbang sempurna).
- **Rekonsiliasi Tutup Shift (Z-Report)**:
  - Pada penutupan shift, uang fisik yang dihitung di laci kas wajib sama persis dengan mutasi saldo kas S-Wallet kasir.
  - Jika kasir mencoba mengantongi uang tanpa input pesanan atau melakukan pembatalan palsu (*void skimming*), ketidaksesuaian saldo akan langsung memicu alert Hermes WhatsApp ke Owner & GM.

### 6.3 Subtab Baru: Riwayat Transaksi (`/app/transaksi`) dengan 3 Format Cetak Thermal
- **Grup Sidebar**: `Operasional`
- **Rute URL**: `/app/transaksi`
- **Hak Akses**: Owner (L1), GM (L2), dan Kasir (L3).
- **Filter 4 Metode Pembayaran Resmi**:
  1. *Tunai (S-Wallet Tunai Kasir)*
  2. *QRIS Dinamis (Pakasir API v2)*
  3. *Transfer Bank (VA Pakasir 9 Bank)*
  4. *S-Wallet Member Digital (L5)*
- **Tabel Data Penjualan Lengkap**: Invoice, Waktu WITA, Kasir, Metode Bayar (badge khusus per metode), Mode Layanan, Pelanggan, Item, Total, Status Lunas/Void.
- **3 Tombol Format Cetak Thermal Khusus**:
  1. `[ Cetak Struk ]`: Kwitansi pembayaran pelanggan (58mm/80mm) ke *Printer Struk*.
  2. `[ Tiket Dapur ]`: Salinan tiket pesanan untuk juru masak ke *Printer Dapur/Bar*.
  3. `[ Label Item ]`: Stiker label per cup/kotak makanan ke *Printer Item*.

### 6.4 Subtab Baru: Printer & Preferensi (`/app/akun/printer`) Bluetooth & LAN/WiFi
- **Grup Sidebar**: `Akun`
- **Rute URL**: `/app/akun/printer`
- **Hak Akses**: Seluruh staf operasional, GM, dan Owner (`gate: () => true`).
- **Desain Antarmuka Berbasis Acuan Gambar Tablet**:
  1. *Atur Printer (4 Peran Printer)*: *Printer Struk*, *Printer Item / Label*, *Printer Dapur*, *Printer Bar*.
  2. *Modal Pemilihan & Koneksi*:
     - **Bluetooth**: Pindai dan koneksi via `Web Bluetooth API` (`navigator.bluetooth`).
     - **LAN / WiFi**: Input IP Address dan Port Socket `9100` (raw ESC/POS).
     - Tombol *Uji Cetak (Test Print)* per printer.
  3. *Preferensi Tambahan*: Toggle *Cetak struk otomatis*, ukuran kertas (*58mm* / *80mm*), dan opsi pemotong otomatis.

### 6.5 Standar Mutlak Anti-Emoji (100% SVG Icons & KPI Badges Tijarah)
- Seluruh kode sumber dan antarmuka **100% bebas emoji**.
- Menggunakan ikon SVG resmi Tijarah / Lucide React dan lencana status presisi.

### 6.6 Pengujian Menyeluruh (28/28 Test Suite Pass & Production Build Verification)
- `npm test` lolos 28/28 test suite (RBAC, S-Wallet concurrency, 2FA TOTP RFC 6238, reCAPTCHA).
- `npm run build` berhasil tanpa warning atau error.

### 6.7 Matriks Berkas yang Dibuat / Dimodifikasi pada Fase 3
- **BARU**: `src/app/pages/ops/Transactions.jsx` (Subtab Riwayat Transaksi & 3 tombol print thermal).
- **BARU**: `src/app/pages/account/PrinterSettings.jsx` (Subtab Printer & Preferensi).
- **BARU**: `src/lib/thermalPrinter.js` (Modul generator ESC/POS thermal & driver Web Bluetooth/Socket 9100).
- **MODIFIKASI**: [src/app/pages.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages.js) (Rute `/app/transaksi` dan `/app/akun/printer`).
- **MODIFIKASI**: [src/lib/swallet.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/lib/swallet.js) & [src/app/pages/ops/Payment.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payment.jsx) (Pencatatan double-entry tunai ke laci S-Wallet kasir).

### 6.8 Kriteria Kelulusan & Verifikasi Fase 3 (Definition of Done)
1. Pembayaran tunai membukukan double-entry ke laci kas S-Wallet dan terekonsiliasi akurat saat Z-Report.
2. Subtab `/app/transaksi` menampilkan riwayat penjualan dengan filter 4 metode bayar (Tunai S-Wallet, QRIS, Transfer VA, S-Wallet Member) dan 3 tombol print thermal berfungsi.
3. Subtab `/app/akun/printer` menampilkan konfigurasi 4 printer serta modal Bluetooth & LAN IP:Port.
4. Kode sumber bebas emoji 100% dan responsif di seluruh layar.
5. `npm test` lolos 28/28 tests PASS dan `npm run build` sukses.

---

## 7. TATA CARA MEMERINTAHKAN EKSEKUSI PER FASE

Anda dapat memerintahkan pengerjaan satu per satu secara terkendali:

- **Untuk Memulai Fase 1**: Berikan instruksi *"KERJAKAN FASE 1"* (atau klik tombol **Proceed** pada Implementation Plan).  
  Saya akan langsung mengimplementasikan seluruh fitur Fase 1, memverifikasinya dengan test suite, dan melaporkannya kepada Anda.
- **Setelah Fase 1 Anda Uji & Setujui**: Anda cukup memberikan instruksi *"KERJAKAN FASE 2"*.
- **Setelah Fase 2 Anda Uji & Setujui**: Anda cukup memberikan instruksi *"KERJAKAN FASE 3"*.

---
*Dokumen ini merupakan spesifikasi resmi penambahan Subtab & Fitur Baru Tijarah OS v6.2.*
