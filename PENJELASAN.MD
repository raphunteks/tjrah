# DOKUMEN ARSITEKTUR RBAC & DIREKTORI FITUR LENGKAP PLATFORM TIJARAH
**Dokumen Arsitektur Hak Akses Berjenjang (Role-Based Access Control) & Direktori Fitur Paripurna**  
*Versi: 3.2 (Paripurna Multi-Region & Role-Based Alert System) — Pembaruan Sistematis Terpadu: Zona Waktu Operasional (WITA Default, WIB, WIT), Matriks Notifikasi RBAC Multi-Peran, Standar Visual Anti-AI-Slop & Sentralisasi CSS, Optimasi Vite Leaflet Zero-Reload, Paket Langganan Resmi, Real-time Copilot AI Quota, Presensi Kamera Geofencing, Google Places API (New) & AdvancedMarkerElement, Isolasi Mutlak Menu Pilar Industri (F&B vs Healthcare/Klinik), Klinik RME SATUSEHAT, Member WhatsApp OTP & Multi-Cabang*

---

## DAFTAR ISI
1. [Prinsip Arsitektur, Multi-Tenant & Keamanan Zero-Trust Tijarah](#1-prinsip-arsitektur-multi-tenant--keamanan-zero-trust-tijarah)
2. [Struktur & Konfigurasi Lingkungan (.env.local & Brand Identity)](#2-struktur--konfigurasi-lingkungan-envlocal--brand-identity)
3. [Skema Paket Langganan, Harga Resmi & Model Penagihan (Billing Matrix)](#3-skema-paket-langganan-harga-resmi--model-penagihan-billing-matrix)
4. [Matriks RBAC Utama (20 Fitur × Seluruh Peran)](#4-matriks-rbac-utama-20-fitur--seluruh-peran)
5. [Penjelasan Rinci Fitur Per Peran (Roles Directory)](#5-penjelasan-rinci-fitur-per-peran-roles-directory)
   - [5.1 Superadmin / Developer (L0 Platform Governance)](#51-superadmin--developer-l0-platform-governance)
   - [5.2 Owner Merchant (L1 F&B / Ritel / Jasa)](#52-owner-merchant-l1-fb--ritel--jasa)
   - [5.3 General Manager / GM (L2 Multi-Cabang Lapangan)](#53-general-manager--gm-l2-multi-cabang-lapangan)
   - [5.4 Kasir / Barista / Staf Gudang (L3 Operasional Frontline)](#54-kasir--barista--staf-gudang-l3-operasional-frontline)
   - [5.5 Dokter / Terapis Medis (L4 Health - Tenaga Medis RME)](#55-dokter--terapis-medis-l4-health---tenaga-medis-rme)
   - [5.6 Kasir Klinik & Farmasi (L3 Health - Billing Medis & Obat)](#56-kasir-klinik--farmasi-l3-health---billing-medis--obat)
   - [5.7 Owner Klinik (L1 Health - Fasilitas Kesehatan Primer)](#57-owner-klinik-l1-health---fasilitas-kesehatan-primer)
   - [5.8 Member / Pelanggan (L5 Customer / Loyalty Portal /m)](#58-member--pelanggan-l5-customer--loyalty-portal-m)
6. [Katalog Mendalam 20 Fitur Matriks RBAC (Bab V Lengkap)](#6-katalog-mendalam-20-fitur-matriks-rbac-bab-v-lengkap)
7. [Inovasi Unggulan & Fitur Baru Terkini](#7-inovasi-unggulan--fitur-baru-terkini)
   - [7.1 Owner Copilot AI & Sinkronisasi Kuota Database Real-Time](#71-owner-copilot-ai--sinkronisasi-kuota-database-real-time)
   - [7.2 Presensi Kamera Live, Watermark Anti-Fraud & Geofencing GPS](#72-presensi-kamera-live-watermark-anti-fraud--geofencing-gps)
   - [7.3 Roster Shift Kerja, Deteksi Keterlambatan & Lembur Otomatis](#73-roster-shift-kerja-deteksi-keterlambatan--lembur-otomatis)
   - [7.4 Manajemen Multi-Cabang Mandiri & Inovasi 1-Click Branch Clone](#74-manajemen-multi-cabang-mandiri--inovasi-1-click-branch-clone)
   - [7.5 Modul Klinik RME SOAP, Odontogram 52 Gigi & Bridging SATUSEHAT Kemenkes](#75-modul-klinik-rme-soap-odontogram-52-gigi--bridging-satusehat-kemenkes)
   - [7.6 Portal Member Mandiri (/m): WhatsApp OTP, QR Self-Order & UU PDP](#76-portal-member-mandiri-m-whatsapp-otp-qr-self-order--uu-pdp)
   - [7.7 Integrasi Pembayaran QRIS Dinamis Pakasir & Rekonsiliasi Otomatis](#77-integrasi-pembayaran-qris-dinamis-pakasir--rekonsiliasi-otomatis)
   - [7.8 Integrasi Resmi Google Places API (New), AdvancedMarkerElement & Zero-Legacy Error](#78-integrasi-resmi-google-places-api-new-advancedmarkerelement--zero-legacy-error)
   - [7.9 Arsitektur Isolasi Pilar Industri Mutlak: Pemisahan Total Menu F&B vs Healthcare (Klinik)](#79-arsitektur-isolasi-pilar-industri-mutlak-pemisahan-total-menu-fb-vs-healthcare-klinik)
   - [7.10 Standar Visual Anti-AI-Slop & Sentralisasi dashboard.css](#710-standar-visual-anti-ai-slop--sentralisasi-dashboardcss)
   - [7.11 Fitur Zona Waktu Multi-Wilayah (WITA, WIB, WIT) & Akun Tampilan & Bahasa](#711-fitur-zona-waktu-multi-wilayah-wita-wib-wit--akun-tampilan--bahasa)
   - [7.12 Matriks Saluran Notifikasi Berbasis Peran RBAC (Superadmin/Dev, Owner, GM, Staf/Kasir, Pelanggan/Member)](#712-matriks-saluran-notifikasi-berbasis-peran-rbac-superadmindev-owner-gm-stafkasir-pelangganmember)
   - [7.13 Optimasi Dependensi Leaflet & Terminal Bersih Tanpa Reload Runtime](#713-optimasi-dependensi-leaflet--terminal-bersih-tanpa-reload-runtime)
8. [Struktur Database, Migrations Ledger & Integritas Pengujian](#8-struktur-database-migrations-ledger--integritas-pengujian)

---

## 1. PRINSIP ARSITEKTUR, MULTI-TENANT & KEAMANAN ZERO-TRUST TIJARAH

**Tijarah** (Smart Trade, Better Business) dirancang sebagai **Cloud Operating System & POS Multi-Tenant** dengan standar isolasi data ketat setara industri perbankan (*Zero-Trust Database Security*):

```
+-----------------------------------------------------------------------------------+
|                            TIJARAH PLATFORM ENGINE                                |
+-----------------------------------------------------------------------------------+
|  L0: Superadmin / Developer (Platform Governance, AI Engine, Hermes, Pakasir QRIS)|
+-----------------------------------------------------------------------------------+
       |                                          |
       v (Tenant Isolation: tenant_id)            v (Tenant Isolation: tenant_id)
+----------------------------------+       +------------------------------------+
|  TENANT PILAR F&B, RITEL & JASA  |       |  TENANT PILAR HEALTH (KLINIK)      |
|  (Kafe, Restoran, Toko, Salon)   |       |  (Klinik Pratama, Gigi, Estetika)  |
+----------------------------------+       +------------------------------------+
| L1: Owner Merchant               |       | L1: Owner Klinik                   |
| L2: General Manager (GM)         |       | L2: Manajer Operasional Klinik     |
| L3: Kasir / Staf / Barista / KDS |       | L3: Kasir Klinik & Farmasi         |
|                                  |       | L4: Dokter / Tenaga Medis (SOAP)   |
+----------------------------------+       +------------------------------------+
       |                                          |
       +--------------------+---------------------+
                            v
               L5: Member / Pelanggan Portal (/m)
```

### Tiga Pilar Bisnis Utama:
1. **Pilar Food & Beverages (`food`)**:
   - Mendukung denah meja visual dinamis, pemesanan mandiri e-menu QR meja, layar stasiun dapur Kitchen Display System (KDS) per stasiun (Kitchen/Bar/Pastry), pemotongan otomatis stok bahan mentah berbasis Bill of Materials (BOM), dan split payment multi-metode.
2. **Pilar Retail & Jasa (`retail`, `service`)**:
   - Mendukung pembacaan barcode 1D/2D fisik, pencetakan label rak, manajemen harga grosir bertingkat, stok multi-gudang konsinyasi, antrean salon/perawatan, dan komisi terapis per layanan.
3. **Pilar Health & Faskes (`health`)**:
   - Menjalankan Rekam Medis Elektronik (RME SOAP), odontogram gigi digital 52 gigi standar FDI internasional, katalog terpadu ICD-10 & tindakan ICD-9-CM, bridging interoperabilitas Kementerian Kesehatan RI (SATUSEHAT HL7 FHIR), serta kasir billing farmasi tanpa PPN (pajak kesehatan 0%).

### Arsitektur Keamanan Database (Supabase Row-Level Security):
* **Isolasi Baris Ketat (RLS)**: Setiap tabel bisnis memiliki penegakan RLS bawaan `tenant_id = (select auth.jwt() ->> 'tenant_id')::uuid`. Tenant A tidak dapat membaca maupun memodifikasi data milik Tenant B dalam kondisi apa pun.
* **Optimasi InitPlan Query**: Sub-query RLS dirancang menggunakan indeks komposit PostgreSQL `(tenant_id, id)` untuk menjamin query berjalan dalam waktu < 2 milidetik tanpa risiko *statement timeout*.
* **Stored Procedure / RPC (`SECURITY DEFINER`)**: Aksi-aksi berisiko tinggi (void penjualan, penyesuaian stok opname, persetujuan payroll, clock-in presensi kamera, dan pemotongan kuota AI) hanya dapat dieksekusi melalui Stored Procedure PostgreSQL dengan validasi identitas JWT internal.

---

## 2. STRUKTUR & KONFIGURASI LINGKUNGAN (.ENV.LOCAL & BRAND IDENTITY)

Seluruh konfigurasi identitas brand, nama sistem, teks antarmuka, dan kredensial integrasi Tijarah dikelola secara fleksibel melalui berkas konfigurasi lingkungan `.env.local` tanpa perlu menyentuh *source code*:

### Variabel Identitas Brand & Judul Sistem:
* `VITE_APP_NAME="Tijarah System"`: Nama resmi sistem yang tampil pada header login, judul halaman, dan meta tags.
* `VITE_BRAND_NAME="Tijarah"`: Nama pendek brand platform.
* `VITE_BRAND_SLOGAN="Smart trade, Better Business"`: Slogan resmi platform yang tampil pada footer, landing page, dan bio default pengguna.
* `VITE_AUTH_TITLE="Tijarah System"`: Judul kartu otentikasi portal masuk `/masuk`.
* `VITE_AUTH_SUBTITLE="Multi-Tenant Cloud OS & POS Platform"`: Subjudul deskripsi login.

### Variabel Koneksi Database & Server:
* `VITE_SUPABASE_URL`: Endpoint REST API Supabase proyek.
* `VITE_SUPABASE_ANON_KEY`: Kunci otentikasi publik browser.
* `DATABASE_URL_DIRECT` / `DATABASE_URL`: Koneksi langsung PostgreSQL pooler port 5432 / 6543 untuk eksekusi migrasi dan administrasi otomatis via Node.js.
* `SUPABASE_SERVICE_ROLE_KEY`: Kunci otentikasi server-side berprivilese tinggi untuk pembuatan akun demo dan pemeliharaan skema.
* `DEMO_PASSWORD`: Kata sandi terenkripsi default untuk 7 akun demo resmi Tijarah.

---

## 3. SKEMA PAKET LANGGANAN, HARGA RESMI & MODEL PENAGIHAN (BILLING MATRIX)

Tijarah memberlakukan struktur harga paket berlangganan resmi yang transparan dan berjenjang, dirancang untuk mendukung bisnis dari skala rintisan tunggal hingga rantai waralaba multi-cabang:

| Komponen Paket | Starter | Growth *(Paling Populer)* | Enterprise | Superadmin / Dev |
|---|---|---|---|---|
| **Durasi Siklus** | **1 Bulan** | **6 Bulan** | **1 Tahun (12 Bulan)** | Selamanya (Platform) |
| **Harga Resmi** | **Rp 500.000** / bln | **Rp 2.500.000** / 6 bln | **Rp 3.500.000** / tahun | Internal Governance |
| **Biaya Efektif** | Rp 500.000 / bln | ~Rp 416.667 / bln *(Hemat 17%)* | ~Rp 291.667 / bln *(Hemat 42%)* | Gratis |
| **Batas Cabang** | **1 Outlet** | **Hingga 5 Cabang** | **Cabang Tanpa Batas** | Seluruh Tenant |
| **Owner Copilot AI**| Fitur Terkunci (0 Kuota) | **250 Tanya / Bulan** | **Unlimited (999.999)** | Unlimited (999.999) |
| **Kasir POS & Struk**| Termasuk (Unlimited) | Termasuk (Unlimited) | Termasuk (Unlimited) | Penuh |
| **Layar Dapur (KDS)**| Termasuk | Termasuk | Termasuk | Penuh |
| **Inventori & Resep**| Dasar (1 Cabang) | Multi-Gudang & Transfer | Multi-Gudang & Central Kitchen| Penuh |
| **Akuntansi & Jurnal**| - | Termasuk (PSAK Otomatis) | Termasuk (PSAK Konsolidasi) | Penuh |
| **SDM & Payroll GPS**| - | Termasuk (Shift + Watermark) | Termasuk (Multi-Cabang) | Penuh |
| **Klinik & SATUSEHAT**| - | - | Termasuk (RME SOAP + BPJS) | Penuh |
| **Omnichannel & QR** | QR Meja Dasar | QR Meja + Toko Online Web | Full Omnichannel + API | Penuh |

### Ketentuan Siklus Periode & Tagihan Langganan:
1. **Perhitungan Periode Berjalan Akurat**:
   - Paket Starter (1 Bulan): Berlaku 30/31 hari kalender (contoh: 16 Oktober 2026 s/d 16 November 2026).
   - Paket Growth (6 Bulan): Berlaku tepat 6 bulan kalender (contoh akun demo Owner: **12 Oktober 2026 s/d 12 April 2027**).
   - Paket Enterprise (1 Tahun): Berlaku tepat 12 bulan kalender (contoh: 16 Oktober 2026 s/d 16 Oktober 2027).
2. **Riwayat Faktur & Tagihan Riil**:
   - Tabel Riwayat Tagihan menampilkan nomor faktur resmi (contoh: `INV-202610-GRO-7042`), nominal riil sesuai paket langganan aktif (Rp 2.500.000 untuk Growth), tanggal lunas, metode pembayaran QRIS/Transfer Bank, dan tautan unduh kwitansi PDF.
3. **Sistem Referral Voucher**:
   - Tersedia input kode referral diskon pada saat checkout paket langganan, dengan validasi kode promo langsung ke tabel promosi database.

---

## 4. MATRIKS RBAC UTAMA (20 FITUR × SELURUH PERAN)

Berikut adalah Matriks Otorisasi Resmi Tijarah yang telah teruji dan lolos 100% pada suite pengujian integritas kontrak `tests/rbac-contract.test.mjs`:

| No | Fitur Matriks | Superadmin (L0) | Owner (L1) | GM (L2) | Kasir/Staf (L3) | Dokter (L4) | Kasir Klinik (L3) | Member (L5) |
|---|---|---|---|---|---|---|---|---|
| **1** | **Konfigurasi Tenant, 9router & Hermes** | **CRUD** | **R** | - | - | - | - | - |
| **2** | **Dashboard Eksekutif & Laba Riil (+ Copilot AI)** | **R** | **CRUD** | **R (Operasional)** | - | - | - | - |
| **3** | **Master Produk, Varian & Harga Jual** | **CRUD** | **CRUD** | **CRUD** | **R** | **R** | **R** | **R (Katalog)** |
| **4** | **Resep & Bill of Materials (BOM)** | **CRUD** | **CRUD** | **CRUD** | **R** | - | - | - |
| **5** | **Register Transaksi POS & Struk** | - | **R** | **R** | **CRUD** | - | **CRUD (Medis)** | **R (Pesanan Sendiri)** |
| **6** | **Otorisasi Void, Refund & Diskon** | - | **Approval** | **Approval (PIN)** | **Request** | - | **Request** | - |
| **7** | **Denah Meja, Kiosk & QR E-Menu** | **CRUD** | **CRUD** | **CRUD** | **RU** | - | - | **Create (Pesanan)** |
| **8** | **Antrean Pesanan Dapur & Status Masak (KDS)** | **CRUD** | **R** | **R** | **CRUD** | - | - | **R (Status Sendiri)** |
| **9** | **Purchase Order (PO) & Vendor Supplier** | **CRUD** | **Approval** | **CRUD** | - | - | - | - |
| **10** | **Mutasi Stok, Opname & Susut/Waste** | **CRUD** | **R** | **Approval & CRUD** | **Create (Opname)** | - | **Create (Opname)** | - |
| **11** | **Akuntansi, Jurnal & Neraca PSAK** | **CRUD** | **R** | **CRUD** | - | - | - | - |
| **12** | **Buku Kas, Rekonsiliasi & Settlement** | **CRUD** | **R** | **CRUD** | **Input Petty Cash** | - | **Input Petty Cash**| - |
| **13** | **Master Karyawan, Shift & Geofencing** | **CRUD** | **CRUD** | **CRUD** | **Absen GPS (Own)** | - | **Absen GPS (Own)** | - |
| **14** | **Payroll, Komisi & Kasbon Karyawan** | **CRUD** | **Approval** | **CRUD** | **R (Komisi Own)** | **R (Komisi Own)**| **R (Komisi Own)** | - |
| **15** | **Database CRM & Poin Loyalitas** | **CRUD** | **CRUD** | **CRUD** | **RU** | - | **RU** | **RU (Data Pribadi)** |
| **16** | **Integrasi Omnichannel & Marketplace** | **CRUD** | **CRUD** | **CRUD** | **R (Proses Order)**| - | - | - |
| **17** | **Rekam Medis & SATUSEHAT Kemenkes** | **CRUD** | **R** | **R** | - | **CRUD** | **R (Billing Obat)** | **R (Resep Pribadi)** |
| **18** | **Reservasi & Antrean Ruang Tunggu** | **CRUD** | **CRUD** | **CRUD** | **CRUD** | **RU** | **CRUD** | **CRUD (Milik Sendiri)**|
| **19** | **Pengajuan Tijarah Capital & Payout** | **CRUD** | **CRUD** | **RU** | - | - | - | - |
| **20** | **Pengadaan Bahan Tijarah Supplies** | **CRUD** | **Approval** | **CRUD** | - | - | - | - |

---

## 5. PENJELASAN RINCI FITUR PER PERAN (ROLES DIRECTORY)

### 5.1 SUPERADMIN / DEVELOPER (L0 PLATFORM GOVERNANCE)
Aktor tertinggi pengelola platform SaaS Tijarah lintas seluruh merchant dan tenant di Indonesia.
* **Tujuan Peran**: Mengelola kesehatan infrastruktur, stabilitas koneksi AI, gerbang pembayaran nasional, lisensi paket langganan, dan kepatuhan sistem.
* **Fitur & Halaman Utama**:
  1. **Platform Governance (`/app/platform`)**: Pendaftaran tenant baru, pengaturan status akun, dan penetapan pilar bisnis (`food`, `retail`, `health`).
  2. **Manajemen Paket & Kuota AI Database (`/app/paket`, `/app/platform-ops`)**:
     - Mengatur harga paket resmi, durasi siklus, batas maksimal cabang, dan kuota bulanan AI Copilot (`ai_quota_tokens`).
     - Menjalankan RPC `set_ai_quota` untuk menambah atau menyetel ulang token kuota tenant secara real-time.
  3. **Gateway Integrasi 9router & Hermes (`/app/integrasi`)**: Memonitor koneksi AI Engine LLM, gateway WhatsApp Hermes, dan webhook status QRIS Pakasir.
  4. **Rekonsiliasi Global QRIS (`/app/rekonsiliasi`)**: Memantau seluruh lalu lintas pembayaran digital merchant se-Indonesia.
  5. **Platform Security Audit (`/app/audit`)**: Audit log forensik aktivitas basis data.
  6. **Blueprint Privat (`/app/blueprint`)**: Dokumentasi arsitektur teknis dan topologi modul Tijarah.

---

### 5.2 OWNER MERCHANT (L1 F&B / RITEL / JASA)
Pemilik usaha yang memegang kendali strategis, legal, dan finansial tertinggi atas seluruh outlet usahanya.
* **Tujuan Peran**: Memaksimalkan laba riil, menjaga likuiditas kas, mengendalikan modal, dan mengambil keputusan bisnis strategis berbasis data.
* **Fitur & Halaman Utama**:
  1. **Dashboard Eksekutif & Laba Riil (`/app/dashboard`)**: Pemantauan real-time atas pendapatan bersih harian/bulanan, omzet kotor, beban pokok penjualan (COGS), margin laba bersih, dan grafik tren transaksi.
  2. **Owner Copilot AI (`/app/copilot`)**:
     - Asisten AI bisnis pribadi yang membaca data transaksi riil merchant.
     - **Sinkronisasi Kuota Real-Time**: Kuota terhubung langsung ke paket database (Paket Growth = 250 kuota/bulan; Enterprise = Unlimited).
     - Menampilkan indikator sisa kuota, live search riwayat pertanyaan, ekspansi respon AI, dan tombol tanya ulang instan.
  3. **Laba Rugi Otomatis PSAK (`/app/laba-rugi`)**: Perhitungan P&L otomatis dari arus penjualan kasir dan pemotongan stok bahan baku (BOM).
  4. **Pusat Persetujuan Tingkat Tinggi (`/app/persetujuan`)**:
     - Otorisasi pembatalan transaksi kasir (Void) yang bernilai besar.
     - Persetujuan Purchase Order (PO) pembelian bahan baku bernilai tinggi dari GM.
     - Persetujuan pengeluaran payroll gaji karyawan dan pembagian komisi.
     - Persetujuan selisih penyesuaian stok opname dan barang susut/waste.
  5. **Manajemen Multi-Cabang Paripurna (`/app/cabang`)**:
     - Pendaftaran cabang baru mandiri dengan validasi kuota paket (`plans.max_branches`).
     - **Inovasi 1-Click Branch Clone**: Menduplikasi seluruh katalog produk, varian, dan resep bahan (BOM) ke cabang baru hanya dalam 1 detik.
     - Penentuan titik koordinat GPS (Latitude/Longitude) dan radius aman geofencing (10–1000m) untuk absensi karyawan.
  6. **Laporan Malam WhatsApp Hermes (`/app/hermes`)**: Pengiriman ringkasan omzet otomatis setiap malam langsung ke nomor WhatsApp pribadi Owner.
  7. **Tijarah Capital & Pengaturan Rekening Payout (`/app/capital`)**: Pengajuan pinjaman modal kerja tanpa jaminan dan pengaturan rekening penampungan pencairan QRIS.

---

### 5.3 GENERAL MANAGER / GM (L2 MULTI-CABANG LAPANGAN)
Pemimpin operasional lapangan yang mengawasi operasional harian, dapur, gudang, staf kasir, dan akuntansi cabang.
* **Tujuan Peran**: Menjaga efisiensi operasional cabang, menekan biaya susut/waste, dan memastikan standar pelayanan terpenuhi.
* **Lingkup Kerja Multi-Cabang**: GM memiliki `branch_id: null` sehingga leluasa berpindah dan memantau seluruh cabang milik tenant tanpa hambatan.
* **Fitur & Halaman Utama**:
  1. **Dashboard Operasional Cabang (`/app/dashboard`)**: Melihat performa penjualan per cabang, kecepatan layanan kasir, dan utilisasi meja.
  2. **Master Produk, Menu & Harga (`/app/produk`)**: Mengatur katalog makanan/minuman, menetapkan varian (ukuran, tingkat kepedasan, topping), dan harga jual cabang.
  3. **Resep & Bill of Materials / BOM (`/app/resep`)**: Merumuskan takaran gramatur bahan baku per porsi menu agar pemotongan stok gudang berjalan otomatis setiap ada penjualan di POS.
  4. **Manajemen Stok, Gudang & Transfer (`/app/stok`, `/app/transfer`)**: Memantau saldo stok bahan baku, melakukan mutasi transfer barang antar-cabang, dan approval opname.
  5. **Pengadaan & Vendor Supplier (`/app/pembelian`)**: Membuat Purchase Order (PO) ke vendor pemasok bahan baku saat stok menipis mendekati reorder point.
  6. **Otorisasi Void & Diskon Cepat**: Menginput PIN Supervisor di layar POS kasir saat staf kasir meminta pembatalan transaksi salah input atau pemberian diskon khusus.
  7. **Akuntansi, Jurnal & Neraca PSAK (`/app/jurnal`, `/app/neraca`)**: Pencatatan pembukuan ganda (double-entry), penutupan buku kas harian, dan rekonsiliasi bank/QRIS.
  8. **SDM, Jadwal Kerja & Payroll (`/app/karyawan`, `/app/payroll`)**:
     - Mengatur roster jadwal kerja shift staf per cabang (jam masuk & jam pulang), menyetujui permohonan tukar shift, menghitung jam lembur, dan menyusun draf payroll gaji.
     - **Pendaftaran Staf Kasir Cabang (`/app/layanan/kasir`)**: GM berwenang mendaftarkan akun kasir/barista baru, memilih cabang penempatan staf, serta mengatur PIN otorisasi register kasir.
     - **Inspeksi Foto Presensi**: GM dapat memverifikasi foto selfie presensi kamera staf beserta stempel digital watermark untuk memastikan keabsahan kehadiran di outlet.

---

### 5.4 KASIR / BARISTA / STAF GUDANG (L3 OPERASIONAL FRONTLINE)
Garis depan pelayanan usaha yang berinteraksi langsung dengan pelanggan dan memproses pesanan di outlet.
* **Tujuan Peran**: Melayani transaksi secara cepat dan akurat, menyiapkan pesanan, serta mencatat pergerakan fisik barang.
* **Penempatan Cabang Terkunci**: Akun kasir/staf terikat secara spesifik pada satu outlet (`branch_id`). Seluruh transaksi POS, laci kas kasir, opname stok, dan presensi absensi terkunci pada outlet tersebut.
* **Fitur & Halaman Utama**:
  1. **Register Transaksi Kasir POS (`/app/kasir`)**:
     - Antarmuka kasir layar sentuh ultra-cepat: navigasi kategori produk, pemilihan varian, catatan pesanan khusus (*less sugar*, tanpa es).
     - Pembayaran multi-metode: Tunai (dengan hitung kembalian cepat) dan **QRIS Dinamis Pakasir** (tampil di layar / cetak struk dengan verifikasi webhook otomatis).
     - Cetak struk ke printer thermal (Bluetooth/USB) atau pengiriman struk digital via WhatsApp Hermes.
  2. **Permintaan Otorisasi Void / Refund (`Request`)**: Kasir tidak dapat menghapus pesanan sembarangan; wajib menekan "Minta Void" yang membutuhkan approval PIN GM atau otorisasi Owner.
  3. **Buka / Tutup Shift & Z-Report (`/app/shift`)**: Menginput kas awal modal laci, mencatat penerimaan kas selama shift, dan mencetak laporan Z-Report rekonsiliasi saat serah terima pergantian shift.
  4. **Layar Antrean Dapur / Kitchen Display System (`/app/dapur`)**: Layar visual untuk barista/koki: melihat antrean tiket pesanan masuk, menandai "Sedang Dimasak", dan mengubah status menjadi "Siap Disajikan".
  5. **Kas Kecil Cabang (`/app/kas`)**: Menginput pengeluaran kas operasional mendesak (pembelian es batu darurat, air galon, parkir) disertai bukti foto struk.
  6. **Opname Fisik & Catatan Waste (`/app/opname`)**: Menghitung stok fisik bahan baku harian dan mencatat bahan yang rusak/kedaluwarsa.
  7. **Presensi Kamera Live & Geofencing GPS Anti-Fraud (`/app/absen`)**:
     - **Webcam Viewfinder & Oval Face Guide**: Melakukan clock-in dan clock-out menggunakan video kamera langsung dengan panduan bingkai wajah oval untuk hasil foto presisi.
     - **Stempel Digital Watermark Permanen**: Sistem otomatis membubuhkan watermark permanen pada hasil jepretan (Nama Staf, Role, Cabang, Waktu Server WITA, Koordinat GPS, dan Jarak Radius Meter ke Outlet) untuk mencegah rekayasa/titip absen.
     - **Deteksi Shift Hari Ini (`work_shifts`)**: Menampilkan jadwal shift kerja hari ini dan otomatis menghitung menit keterlambatan (*late minutes*) atau lembur (*overtime minutes*).
     - **Persetujuan Biometrik & Lokasi (UU PDP)**: Dialog persetujuan pemrosesan data wajah dan geolokasi sesuai Undang-Undang Pelindungan Data Pribadi.
  8. **Komisi & Slip Gaji Pribadi (`/app/slip`)**: Kasir hanya dapat melihat riwayat absensi, rincian komisi penjualan pribadi, dan slip gaji miliknya sendiri (`scope: own`).

---

### 5.5 DOKTER / TERAPIS MEDIS (L4 HEALTH - TENAGA MEDIS RME)
Tenaga medis profesional (dokter umum, dokter gigi, dokter spesialis, fisioterapis) pada fasilitas kesehatan primer / klinik.
* **Tujuan Peran**: Memberikan pelayanan kesehatan, mendiagnosis pasien, melakukan tindakan medis, dan mendokumentasikan rekam medis legal.
* **Fitur & Halaman Utama**:
  1. **Pemeriksaan Rekam Medis Elektronik / RME SOAP (`/app/pemeriksaan`)**: Format standar medis SOAP: Subjektif (keluhan pasien), Objektif (tanda vital & fisik), Asesmen (diagnosis), dan Plan (rencana tindakan).
  2. **Odontogram Gigi Interaktif 52 Gigi (Poli Gigi)**: Sistem FDI 2-digit internasional (gigi dewasa 11–48 dan gigi susu 51–85) dengan penandaan visual karies, tambalan, missing, impaksi, dan crown.
  3. **Katalog Diagnosis ICD-10 & Tindakan ICD-9-CM**: Pencarian kode penyakit dan tindakan medis resmi standar Kementerian Kesehatan RI.
  4. **Resep Elektronik (e-Resep)**: Meresepkan obat, dosis, dan aturan pakai (*signa*) yang langsung terkirim secara real-time ke loket kasir farmasi.
  5. **Bridging SATUSEHAT Kemenkes RI**: Pembuatan berkas HL7 FHIR Bundle (*Encounter, Condition, Procedure*) siap kirim ke platform SatuSehat Kemenkes.
  6. **Jadwal Pasien & Antrean Poli (`/app/antrean`)**: Melihat daftar antrean pasien ruang tunggu.
  7. **Slip Komisi Tindakan Medis (`/app/slip`)**: Memantau bagi hasil jasa medis (Jaspel) pribadi secara transparan.

---

### 5.6 KASIR KLINIK & FARMASI (L3 HEALTH - BILLING MEDIS & OBAT)
Tenaga administrasi dan kasir loket farmasi fasilitas kesehatan.
* **Tujuan Peran**: Registrasi pasien baru, penyiapan obat e-resep, penagihan biaya tindakan medis, dan penerimaan pembayaran.
* **Fitur & Halaman Utama**:
  1. **Registrasi Pasien Baru & Ruang Tunggu (`/app/antrean`)**: Input data pasien, nomor WhatsApp, dan verifikasi Nomor Induk Kependudukan (NIK KTP 16 digit).
  2. **Billing Tagihan Medis & e-Resep (`/app/tagihan`)**:
     - Menarik otomatis seluruh rincian tindakan dan e-resep yang diterbitkan dokter.
     - Menghitung total tagihan dengan pembebasan PPN 0% sesuai UU Perpajakan Layanan Medis Indonesia.
  3. **Penerimaan Pembayaran Medis**: Menerima tunai, kartu debit/EDC, dan QRIS Dinamis Pakasir serta mencetak kwitansi rincian obat untuk klaim asuransi.

---

### 5.7 OWNER KLINIK (L1 HEALTH - FASILITAS KESEHATAN PRIMER)
Dokter spesialis/investor pengelola fasilitas pelayanan kesehatan.
* **Tujuan Peran**: Mengawasi mutu layanan klinis, legalitas rekam medis, kepatuhan Kemenkes, dan profitabilitas apotek klinik.
* **Fitur & Halaman Utama**:
  1. **Dashboard Kinerja Klinik (`/app/dashboard`)**: Pemantauan jumlah pasien harian/bulanan, rasio pasien baru vs kontrol lama, dan proporsi omzet tindakan vs obat.
  2. **Owner Copilot AI Kesehatan (`/app/copilot`)**: Analisis tren penyakit terbanyak (ICD-10 terpopuler), utilisasi alat medis, dan efisiensi obat farmasi.
  3. **Kepatuhan SATUSEHAT Kemenkes & Legalitas RME**: Memastikan rekam medis digital tersimpan minimal 25 tahun sesuai Permenkes No. 24 Tahun 2022.
  4. **Pengawasan Stok Obat & PO Farmasi (`/app/stok`, `/app/pembelian`)**: Menyetujui pembelian obat-obatan ke Pedagang Besar Farmasi (PBF).
  5. **Penggajian Dokter & Jasa Medis (`/app/payroll`)**: Menghitung dan menyetujui komisi jasa medis (*fee for service*) dokter mitra.

---

### 5.8 MEMBER / PELANGGAN (L5 CUSTOMER / LOYALTY PORTAL /M)
Pelanggan setia kafe/restoran atau pasien yang terdaftar di klinik.
* **Tujuan Peran**: Menikmati pengalaman transaksi mandiri, memantau poin hadiah, melihat riwayat pesanan, dan melakukan reservasi tanpa antre.
* **Fitur Utama (Cangkang Khusus `/m`)**:
  1. **Autentikasi Tanpa Password (OTP WhatsApp)**: Login instan hanya menggunakan nomor WhatsApp yang divalidasi via kode OTP resmi Tijarah.
  2. **Kartu Member Digital (`/m/card`)**: Menampilkan QR Code Member ID unik untuk dipindai oleh kasir saat pembayaran, status tier loyalitas (Bronze, Silver, Gold, Platinum), dan akumulasi saldo Poin.
  3. **E-Menu & Pemesanan Mandiri (`/m/order`)**: Pelanggan dapat memindai QR meja di outlet, melihat katalog menu digital beserta foto dan deskripsi, memilih varian, dan langsung memesan sendiri dari ponselnya.
  4. **Pembayaran Mandiri QRIS Pakasir**: Menampilkan QRIS dinamis langsung di layar HP pelanggan dengan nominal pas; status pesanan terkonfirmasi otomatis dalam hitungan detik setelah bayar.
  5. **Reservasi Meja & Janji Temu Dokter (`/m/reserve`)**: Reservasi meja makan untuk F&B atau booking antrean konsultasi dokter di klinik.
  6. **Riwayat Pesanan & Tagihan Medis Pribadi (`/m/history`)**: Pelanggan dapat melihat kembali e-struk transaksi lama, riwayat resep obat yang pernah diterima, dan status pesanan aktif.
  7. **Privasi & Hak Pengguna (UU PDP / GDPR - `/m/privacy`)**:
     - **Hak Akses Data**: Unduh seluruh riwayat transaksi pribadi dalam format JSON/PDF.
     - **Hak Dilupakan (Anonymization)**: Menghapus profil member secara permanen; data pesanan lama dianonimkan untuk keperluan pembukuan legal tanpa jejak identitas pribadi.

---

## 6. KATALOG MENDALAM 20 FITUR MATRIKS RBAC (BAB V LENGKAP)

Berikut adalah rincian teknis 20 modul fitur matriks RBAC:

### FITUR 1: KONFIGURASI TENANT, 9ROUTER & HERMES
* **Kode Modul**: `F1` | **Kategori**: Platform & Keamanan
* **Deskripsi**: Pusat manajemen identitas tenant, konektivitas AI Gateway 9router (LLM), API WhatsApp Gateway Hermes, dan kredensial webhook.
* **Akses**: Superadmin (`CRUD`), Owner (`R`). GM, Staf, Dokter (`-`).

### FITUR 2: DASHBOARD EKSEKUTIF & LABA RIIL (+ OWNER COPILOT AI)
* **Kode Modul**: `F2` & `F2·AI` | **Kategori**: Intelijen Bisnis
* **Deskripsi**: Pemantauan omzet kotor, laba bersih riil, rasio beban pokok penjualan (COGS), serta asisten tanya-jawab AI bisnis (Owner Copilot) berbasis data transaksi riil.
* **Akses**: Owner (`CRUD`), Superadmin (`R`), GM (`R Operasional`), Member (`-`).

### FITUR 3: MASTER PRODUK, VARIAN & HARGA JUAL
* **Kode Modul**: `F3` | **Kategori**: Katalog & Menu
* **Deskripsi**: Master basis data SKU barang/menu, penetapan ukuran/varian, kategori departemen, pengaturan harga jual per cabang, dan promo diskon.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Kasir/Staf (`R`), Dokter (`R`), Member (`R Katalog`).

### FITUR 4: RESEP & BILL OF MATERIALS (BOM)
* **Kode Modul**: `F4` | **Kategori**: Produksi & Inventori
* **Deskripsi**: Perumusan komposisi bahan mentah dari gudang untuk menghasilkan 1 porsi menu jadi. Pemotongan stok bahan baku di-trigger secara otomatis saat POS mencetak pesanan.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Staf (`R`), Dokter (`-`), Member (`-`).

### FITUR 5: REGISTER TRANSAKSI POS & STRUK
* **Kode Modul**: `F5` | **Kategori**: Penjualan Kasir
* **Deskripsi**: Layar transaksi penjualan kasir, perhitungan subtotal, diskon, pajak, pemrosesan pembayaran (Tunai & QRIS Pakasir), pembukaan/penutupan shift kasir, dan cetak Z-Report.
* **Akses**: Kasir/Staf (`CRUD`), Kasir Klinik (`CRUD Medis`), Owner (`R`), GM (`R`), Member (`R Pesanan Sendiri`).

### FITUR 6: OTORISASI VOID, REFUND & DISKON
* **Kode Modul**: `F6` | **Kategori**: Pengendalian Kasir
* **Deskripsi**: Pembatasan anti-kecurangan kasir. Pembatalan struk yang sudah tersimpan (void), pengembalian dana (refund), atau pemberian diskon di luar wewenang kasir wajib mendapat otorisasi.
* **Akses**: Owner (`Approval`), GM (`Approval dengan PIN Supervisor`), Kasir/Staf (`Request Only`).

### FITUR 7: DENAH MEJA, KIOSK & QR E-MENU
* **Kode Modul**: `F7` | **Kategori**: Layanan Meja & Self-Service
* **Deskripsi**: Pemetaan layout meja outlet, penomoran meja, status meja (kosong, terisi, reservasi), cetak stiker QR code meja, dan integrasi kiosk pemesanan mandiri.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Kasir/Staf (`RU`), Member (`Create Pesanan Sendiri`).

### FITUR 8: ANTREAN PESANAN DAPUR & STATUS MASAK (KDS)
* **Kode Modul**: `F8` | **Kategori**: Operasional Dapur
* **Deskripsi**: Layar Kitchen Display System (KDS) untuk stasiun dapur/bar. Menampilkan tiket pesanan secara berurutan, timer waktu tunggu pesanan, dan penanda selesai masak.
* **Akses**: Kasir/Staf (`CRUD`), Superadmin (`CRUD`), Owner (`R`), GM (`R`), Member (`R Status Pesanan Sendiri`).

### FITUR 9: PURCHASE ORDER (PO) & VENDOR SUPPLIER
* **Kode Modul**: `F9` | **Kategori**: Pengadaan Barang
* **Deskripsi**: Manajemen data rekanan supplier, pembuatan surat pesanan pembelian bahan baku (PO), penerimaan barang gudang (*Goods Receipt*), dan pencatatan utang usaha.
* **Akses**: GM (`CRUD`), Owner (`Approval`), Superadmin (`CRUD`), Staf (`-`).

### FITUR 10: MUTASI STOK, OPNAME & SUSUT/WASTE
* **Kode Modul**: `F10` | **Kategori**: Manajemen Gudang
* **Deskripsi**: Transparansi penuh kartu stok dan persediaan multi-cabang. Tabel stok menyajikan sinkronisasi data komprehensif: **Nama & Kode Bahan**, **Harga Modal (HPP Satuan per unit)**, **Stok Awal**, **Stok Fisik Saat Ini (Real-time)**, **Batas Minimum Stok (*Reorder Point*)**, **Nilai Total Persediaan (`Stok Saat Ini × Harga Modal`)**, dan **Status (*Aman / Pesan ulang / Minus*)**. Dilengkapi tombol pendaftaran bahan baku baru mandiri (`+ Tambah bahan`) dengan kamus 48 satuan standar multi-industri terurut abjad A-Z (F&B, Farmasi/Klinik, Retail, Grosir: ampul, botol, box, butir, galon, gram, kapsul, liter, pack, pcs, sachet, sendok, strip, tablet, vial, dll.) serta fitur penyesuaian stok fisik instan per cabang.
* **Akses**: Owner (`Approval & CRUD`), GM (`Approval & CRUD`), Superadmin (`CRUD`), Kasir/Staf (`CRUD Cabang / Opname & Waste`).

### FITUR 11: AKUNTANSI, JURNAL & NERACA PSAK
* **Kode Modul**: `F11` | **Kategori**: Keuangan & Akuntansi
* **Deskripsi**: Sistem akuntansi buku besar otomatis berbasis PSAK. Setiap transaksi POS dan pembayaran PO langsung membukukan ayat jurnal debit/kredit, menghasilkan neraca saldo dan arus kas.
* **Akses**: Superadmin (`CRUD`), GM (`CRUD`), Owner (`R`), Staf (`-`).

### FITUR 12: BUKU KAS, REKONSILIASI & SETTLEMENT
* **Kode Modul**: `F12` | **Kategori**: Keuangan & Kas
* **Deskripsi**: Buku kas kecil (petty cash) cabang, pencatatan mutasi kas bank, serta rekonsiliasi pembayaran digital QRIS dinamis Pakasir vs laporan bank.
* **Akses**: Superadmin (`CRUD`), GM (`CRUD`), Owner (`R`), Kasir/Staf (`Input Petty Cash Only`).

### FITUR 13: MASTER KARYAWAN, SHIFT & GEOFENCING (DENGAN KAMERA LIVE & WATERMARK)
* **Kode Modul**: `F13` | **Kategori**: Sumber Daya Manusia (SDM)
* **Deskripsi**: Presensi biometrik visual kamera live + GPS geofencing radius 10–1000m + watermark tamper-proof permanen + sinkronisasi roster shift kerja (`work_shifts`).
* **Akses**: Owner (`CRUD`), GM (`CRUD`), Superadmin (`CRUD`), Staf (`Absen Masuk/Pulang Milik Sendiri`).

### FITUR 14: PAYROLL, KOMISI & KASBON KARYAWAN
* **Kode Modul**: `F14` | **Kategori**: Penggajian & Remunerasi
* **Deskripsi**: Penghitungan gaji pokok, uang lembur otomatis dari data absensi, pemotongan pinjaman/kasbon, dan perhitungan komisi target penjualan atau jasa medis dokter.
* **Akses**: GM (`CRUD`), Owner (`Approval`), Staf & Dokter (`R Komisi Pribadi Milik Sendiri`).

### FITUR 15: DATABASE CRM & POIN LOYALITAS
* **Kode Modul**: `F15` | **Kategori**: Hubungan Pelanggan (CRM)
* **Deskripsi**: Database pelanggan terintegrasi nomor WhatsApp, pencatatan total belanja (LTV), aturan perolehan poin belanja (*reward points*), penukaran voucher, dan tingkat membership.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Kasir/Staf (`RU`), Member (`RU Profil & Poin Pribadi`).

### FITUR 16: INTEGRASI OMNICHANNEL & MARKETPLACE
* **Kode Modul**: `F16` | **Kategori**: Integrasi Saluran Penjualan
* **Deskripsi**: Agregasi pesanan online dari layanan pesan-antar makanan dan e-commerce ke dalam satu layar kasir tanpa perlu input ulang manual di tablet terpisah.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Kasir/Staf (`R Proses Pesanan Masuk`).

### FITUR 17: REKAM MEDIS & SATUSEHAT KEMENKES
* **Kode Modul**: `F17` | **Kategori**: Khusus Pilar Kesehatan (`health`)
* **Deskripsi**: Modul Rekam Medis Elektronik (RME) standar Permenkes 24/2022. Mencakup anamnesis SOAP, odontogram gigi FDI, kode ICD-10 & ICD-9-CM, e-resep, dan bridging HL7 FHIR SATUSEHAT.
* **Akses**: Dokter (`CRUD Penuh`), Kasir Klinik (`R Billing Obat & Tindakan`), Owner Klinik (`R Agregat Medis`), Member/Pasien (`R Jadwal & Resep Pribadi`).

### FITUR 18: RESERVASI & ANTREAN RUANG TUNGGU
* **Kode Modul**: `F18` | **Kategori**: Manajemen Antrean & Tamu
* **Deskripsi**: Pengelolaan buku reservasi meja makan atau nomor antrean pemeriksaan klinik, estimasi waktu panggil, dan notifikasi WhatsApp Hermes saat giliran tiba.
* **Akses**: Superadmin (`CRUD`), Owner (`CRUD`), GM (`CRUD`), Kasir/Staf (`CRUD`), Dokter (`RU`), Member (`CRUD Reservasi Milik Sendiri`).

### FITUR 19: PENGAJUAN TIJARAH CAPITAL & PAYOUT
* **Kode Modul**: `F19` | **Kategori**: Layanan Finansial
* **Deskripsi**: Fasilitas pengajuan pembiayaan modal usaha berdasarkan rekam jejak omzet kasir POS, serta pengaturan rekening pencairan otomatis (*automated payout*).
* **Akses**: Owner (`CRUD`), GM (`RU`), Superadmin (`CRUD`), Staf (`-`).

### FITUR 20: PENGADAAN BAHAN TIJARAH SUPPLIES
* **Kode Modul**: `F20` | **Kategori**: B2B Marketplace Bahan Baku
* **Deskripsi**: Marketplace pengadaan bahan baku grosir (biji kopi, susu, kemasan, cup, alkes klinik) langsung dari jaringan distributor resmi Tijarah dengan harga pabrik.
* **Akses**: GM (`CRUD`), Owner (`Approval`), Superadmin (`CRUD`), Staf (`-`).

---

## 7. INOVASI UNGGULAN & FITUR BARU TERKINI

### 7.1 OWNER COPILOT AI & SINKRONISASI KUOTA DATABASE REAL-TIME
- **Penyelarasan Kuota Real-Time**: Kuota token tanya AI Copilot kini dibaca langsung dari data paket tenant di basis data (`plans.ai_quota_tokens`).
  - Paket Starter: 0 Kuota/bln (fitur terkunci dan mengarahkan upgrade).
  - Paket Growth: **250 Kuota/bln** (setara 250 pertanyaan konsultasi bisnis bulanan).
  - Paket Enterprise: **Unlimited (999.999 Kuota/bln)**.
- **Model Pemotongan Transparan**: 1 pertanyaan berhasil dieksekusi = memotong tepat **1 token kuota** melalui Edge Function / RPC `owner-copilot`.
- **Panel Riwayat Analisis Paripurna**: Dilengkapi Live Search dinamis, status indikator kuota real-time, ekspansi jawaban interaktif, dan tombol tanya ulang instan.

### 7.2 PRESENSI KAMERA LIVE, WATERMARK ANTI-FRAUD & GEOFENCING GPS
- **WebRTC Camera Stream**: Integrasi kamera langsung (`getUserMedia`) dengan cermin natural (*mirror mode*) dan bingkai oval panduan wajah (*oval face guide*) untuk akurasi posisi wajah.
- **Stempel Digital Watermark Permanen (Anti-Fraud)**: Snapshot foto langsung dibubuhi pita watermark tamper-proof di kanvas gambar:
  - Nama Karyawan & Jabatan (Kasir, Barista, Dokter).
  - Nama Cabang Penugasan (misal: Cabang Panakkukang).
  - Waktu Server Presisi Waktu Indonesia Tengah (WITA).
  - Titik Koordinat GPS (Latitude, Longitude) dan jarak meter terhadap titik pusat outlet.
- **Validasi Geofencing Haversine**: Jarak staf divalidasi secara matematis dengan rumus Haversine terhadap radius aman cabang (10–1000m). Absen ditolak otomatis jika karyawan berada di luar radius outlet.

### 7.3 ROSTER SHIFT KERJA, DETEKSI KETERLAMBATAN, TOLERANSI FLEKSIBEL & AUTO CLOCK-OUT
- **Sinkronisasi Roster Jadwal Kerja (`work_shifts`)**: Sistem mencocokkan waktu clock-in dengan jadwal shift kerja hari ini (`work_date === todayIso` waktu WITA). Jika belum ada jadwal khusus untuk hari ini, antarmuka secara transparan menampilkan status Shift Reguler dengan informasi referensi jadwal shift terdaftar staf.
- **Toleransi Keterlambatan Masuk Fleksibel (`late_tolerance_min`)**:
  - Owner & GM dapat mengonfigurasi batas toleransi keterlambatan masuk dalam satuan menit atau jam (preset cepat: 0 mnt tepat, 5 mnt, 10 mnt, 15 mnt standar, 30 mnt, 1 jam).
  - Staf yang melakukan clock-in dalam rentang toleransi ini tidak akan dicatat terlambat (`late_min = 0`).
  - Nilai toleransi diperhitungkan langsung dalam fungsi basis data PostgreSQL `_att_calc`.
- **Fitur Checkbox: Otomatis Absensi Pulang dari Sistem (`auto_clockout`)**:
  - Fitur opsional (default nonaktif) yang dapat dicentang saat menambah atau mengubah jadwal shift.
  - Memiliki konfigurasi toleransi penundaan (`auto_clockout_delay_min`, preset: 15 mnt, 30 mnt standar, 1 jam, 2 jam).
  - Jika staf lupa melakukan absen pulang setelah shift berakhir, sistem otomatis mencatatkan presensi pulang dengan stempel khusus audit `[SISTEM] Auto Clock-out`.
- **Aksi Kelola Shift Paripurna (Tombol "Ubah" & "Hapus")**:
  - Menghadirkan tombol aksi **"Ubah"** di samping tombol "Hapus" pada panel Jadwal Shift Kasir.
  - Modal form secara otomatis terisi data jadwal yang dipilih untuk pembaruan instan (*real-time update*).
- **Isolasi Riwayat Absensi Berdasarkan Peran (Role Scoping)**:
  - Role staf/kasir terkunci secara ketat hanya dapat melihat riwayat absensi pada cabang penugasannya sendiri. Staf tidak diizinkan memilih atau melihat data presensi cabang lain.
  - Filter `Log Anomali & Anomali Flag` serta lencana indikator anomali disembunyikan sepenuhnya dari role staf dan hanya dapat diakses oleh Owner, GM, dan Superadmin.
- **Modal Inspeksi Pratinjau Foto**: Owner & GM dapat mengklik foto presensi karyawan untuk melihat pratinjau resolusi tinggi beserta stempel digital watermark dan koordinat peta.

### 7.4 MANAJEMEN MULTI-CABANG MANDIRI & INOVASI 1-CLICK BRANCH CLONE
- **Pendaftaran Outlet Mandiri**: Owner dapat mendaftarkan cabang baru secara mandiri di menu `/app/cabang` dengan validasi otomatis terhadap kuota paket langganan (`plans.max_branches`).
- **1-Click Branch Clone**: Fitur inovatif yang memungkinkan Owner mengkloning seluruh katalog menu, varian, dan resep bahan (BOM) dari cabang utama ke cabang baru hanya dalam 1 detik.
- **Penetapan Koordinat Cabang**: Konfigurasi titik GPS dan radius geofencing presensi per cabang.

### 7.5 MODUL KLINIK RME SOAP, ODONTOGRAM 52 GIGI & BRIDGING SATUSEHAT KEMENKES
- **Standar Permenkes 24/2022**: Format Rekam Medis Elektronik (RME) lengkap: Subjektif, Objektif, Asesmen, dan Plan.
- **Odontogram 52 Gigi Standar FDI**: Penomoran internasional gigi dewasa (11–48) dan gigi anak (51–85) dengan visualisasi grafis interaktif kondisi karies, tambalan, missing, impaksi, dan crown.
- **Interoperabilitas HL7 FHIR**: Pembuatan bundle FHIR Kunjungan, Kondisi, dan Prosedur yang siap dikirimkan ke gerbang SATUSEHAT Kemenkes RI.
- **Pajak Medis 0%**: Sistem otomatis membebaskan PPN untuk tagihan jasa medis dan obat resep klinik.

### 7.6 PORTAL MEMBER MANDIRI (/M): WHATSAPP OTP, QR SELF-ORDER & UU PDP
- **Login Tanpa Sandi**: Otentikasi instan hanya menggunakan nomor WhatsApp via OTP resmi Tijarah.
- **Kartu Member Digital**: Status tier loyalitas (Bronze, Silver, Gold, Platinum) dan akumulasi Poin.
- **Pemesanan Mandiri dari Meja**: Memindai QR meja, memilih menu, dan langsung membayar via QRIS Dinamis dari layar ponsel tanpa antre di kasir.
- **Kepatuhan Privasi (UU PDP / GDPR)**: Fasilitas unduh data transaksi pribadi dan hak penghapusan akun mandiri (*Right to be Forgotten*) dengan anonimisasi data pembukuan.

### 7.7 INTEGRASI PEMBAYARAN QRIS DINAMIS PAKASIR & REKONSILIASI OTOMATIS
- **Integrasi Langsung Pakasir v2**: Terhubung langsung ke gateway QRIS nasional dengan pembuatan QR dinamis per transaksi kasir.
- **Webhook Status Instan**: Transaksi terkonfirmasi lunas dalam hitungan detik tanpa perlu konfirmasi manual oleh kasir.
- **Rekonsiliasi Kas Otomatis**: Transaksi QRIS otomatis tercatat di modul Buku Kas dan Akuntansi PSAK.

### 7.8 INTEGRASI RESMI GOOGLE PLACES API (NEW), ADVANCEDMARKERELEMENT & ZERO-LEGACY ERROR
- **Google Places API (New) Engine (`src/lib/placesNew.js`)**:
  - Mengadopsi arsitektur API Google Maps generasi terbaru berbasis REST v1 (`https://places.googleapis.com/v1/places:autocomplete` dan `https://places.googleapis.com/v1/places/{id}`).
  - **Pencarian Alamat Indonesia Lengkap & Akurat**: Menggunakan filter parameter `includedRegionCodes: ["id"]` dan `languageCode: "id"`. Seluruh pencarian alamat cabang dari nomor jalan, lorong/gang, kelurahan, kecamatan, kabupaten/kota hingga kode pos di Indonesia tampil otomatis dan akurat secara real-time.
  - **Efisiensi Biaya Kuota (Session Token)**: Mengimplementasikan siklus `AutocompleteSessionToken` (UUID v4) sesuai standar resmi Google Cloud Billing. Pengetikan multi-karakter dalam satu sesi pencarian hanya ditagihkan sebagai 1 sesi panggilan saat pengguna memilih alamat final.
  - **FieldMask Hemat Bandwidth**: Hanya menarik data esensial yang diperlukan (`id,displayName,formattedAddress,location`) menggunakan header resmi `X-Goog-FieldMask`.
- **Modern AdvancedMarkerElement & Vector Map ID**:
  - Menggunakan `google.maps.marker.AdvancedMarkerElement` dengan konfigurasi `DEMO_MAP_ID` (`mapId`), menggantikan `google.maps.Marker` klasik yang telah didepresiasi oleh Google.
  - **Zero-Legacy Console Error**: Event listener pin marker menggunakan standar Web Components modern `marker.addEventListener("gmp-dragend", onDragEnd)`, sepenuhnya melenyapkan peringatan konsol usang `google.maps.event.addListener(marker, "dragend")`.
- **Fallback Dinamis Tanpa Gangguan**: Jika API Key Google Maps belum diatur atau offline, antarmuka otomatis beralih (*graceful fallback*) ke OpenStreetMap / Leaflet tanpa menyebabkan aplikasi *crash*.

### 7.9 ARSITEKTUR ISOLASI PILAR INDUSTRI MUTLAK: PEMISAHAN TOTAL MENU F&B VS HEALTHCARE (KLINIK)
- **Latar Belakang & Masalah Yang Diselesaikan**:
  - Pada sistem multi-tenant terpadu, akun Owner Merchant (F&B / Ritel / Jasa) tidak boleh melihat menu-menu klinis faskes (seperti Antrean Pasien, RME SOAP, Odontogram, atau Tindakan Medis), dan sebaliknya Owner Klinik Faskes tidak boleh melihat menu dapur/barista atau resep bahan mentah F&B.
  - Sebelumnya, saat aplikasi pertama kali melakukan hidrasi awal dari `localStorage`, `tenant` dimuat secara asynchronous (`null`), sehingga evaluasi `!pillar` sempat bernilai `true` selama sesaat (frame 0) yang menyebabkan kebocoran visual menu klinik ke merchant F&B.
- **Penegakan Gate Mutlak (`src/app/pages.js`)**:
  - Fungsi pengawas pilar diperketat dengan logika deterministik:
    ```javascript
    export const pillarOk = (p, pillar) => {
      if (p.pillars && p.pillars.length > 0) return Boolean(pillar && p.pillars.includes(pillar));
      if (p.notPillars && p.notPillars.length > 0) return !pillar || !p.notPillars.includes(pillar);
      return true;
    };
    ```
  - Seluruh menu modul klinis (Pasien, Antrean Pasien, Odontogram, Tindakan Medis, dsb.) dikunci dengan `pillars: ["health"]`, sehingga mutlak tidak akan pernah dirender kecuali tenant aktif terverifikasi memiliki pilar `"health"`.
  - Modul `/app/resep` (Resep & BOM Bahan Mentah) dikunci dengan `notPillars: ["health"]` sehingga tidak muncul pada ekosistem klinik medis.
- **Pemuatan Profil 0-Milidetik (Instant Frame 0 Binding)**:
  - Fungsi `getProfile(uid)` pada `src/api/supabase.js` dan `src/api/demo.js` langsung melakukan join eager `tenant:tenants(id, name, slug, pillar)` bersamaan dengan data user profile.
  - Variabel `pillar` tersimpan di auth state dan storage lokal sejak login pertama kali, mengeliminasi flicker atau keterlambatan evaluasi pilar.
- **Adaptasi Semantik Label Antarmuka (`src/app/AppShell.jsx`)**:
  - Sistem secara cerdas menyesuaikan label sidebar navigation sesuai domain bisnis tenant:
    - Pada Pilar **Healthcare (`health`)**: Group label berubah menjadi *"Gudang & Farmasi"*, *"Katalog Obat & Layanan"*, *"Staf & Paramedis"*, dan *"Pasien & Loyalitas"*.
    - Pada Pilar **F&B / Umum (`food` / default)**: Group label menggunakan *"Stok & Bahan"*, *"Katalog Produk"*, *"Karyawan & Tim"*, dan *"Pelanggan & CRM"*.
- **Integritas Kontrak RBAC 100% Terjaga**:
  - Seluruh pengujian kontrak hak akses peran (`npm test`) tetap lulus 100% (7/7 tests passed) tanpa melanggar matriks RBAC 20 fitur utama.

### 7.10 STANDAR VISUAL ANTI-AI-SLOP & SENTRALISASI DASHBOARD.CSS
- **Sentralisasi Gaya Global (`src/styles/dashboard.css`)**:
  - Seluruh deklarasi utilitas, responsivitas mobile-first, bento grid, kartu panel, status badge, dan tabel data diekstraksi ke dalam berkas `src/styles/dashboard.css` untuk mencegah penumpukan CSS inline dan duplikasi ad-hoc.
  - Mematuhi pedoman anti-slop Impeccable: palet netral bertekstur paper (`var(--color-paper-2)`), border subtle 1px (`var(--color-rule)`), radius proporsional, dan penataan hirarki tipografi mono data yang bersih dan mudah dibaca.
- **Rombak Antarmuka Presensi & Geofencing GPS (`src/app/pages/ops/Attendance.jsx`)**:
  - Penghapusan teks redundant ("Lokasi GPS & Alamat Saat Ini") yang berulang.
  - Informasi waktu, status geofence, dan shift dikelompokkan ke dalam micro-bento cards compact.
  - **Kamera Selfie Terkunci Sebelum Jam Keluar**: Tombol aktivasi kamera absen pulang terkunci otomatis jika waktu saat ini belum mencapai jam selesai shift karyawan (misal: sebelum pukul 12:00 WITA), mencegah manipulasi waktu kerja.
  - **Embed Peta Interaktif Riwayat Presensi (Owner & GM)**: Pada baris data log absensi staf/kasir, Owner dan GM dapat langsung melihat visualisasi peta Google Maps titik presensi staf bersangkutan lengkap dengan radius geofence cabang yang ditentukan secara real-time.
  - Penamaan kolom tabel standar eksekutif: *Nama Lengkap, Cabang, Foto, Waktu Masuk, Waktu Keluar, Durasi Kerja, Jarak dari Cabang (Radius Absensi / Toleransi), Catatan, Aksi*.

### 7.11 FITUR ZONA WAKTU MULTI-WILAYAH (WITA, WIB, WIT) & AKUN TAMPILAN & BAHASA
- **Pembaruan Subtab "Tampilan & Bahasa" (`src/app/pages/account/Appearance.jsx`)**:
  - Mengeliminasi pengaturan lama "Kerapatan Antarmuka & Aksesibilitas Font" yang kurang relevan bagi operasional POS ritel.
  - Menggantinya dengan kartu UI interaktif **"Zona Waktu Operasional (Timezone)"** yang mengontrol seluruh stempel waktu presensi, laporan Z-report, log audit transaksi, dan penjadwalan sistem di seluruh dashboard RBAC.
- **Dukungan 3 Zona Waktu Resmi Indonesia**:
  1. **WITA (`Asia/Makassar` - UTC+8)**: **Default Resmi Sistem Tijarah**. Mencakup wilayah Sulawesi (Makassar, Manado, Palu, Kendari, Gorontalo), Bali, Nusa Tenggara Barat (Lombok, Mataram), Nusa Tenggara Timur (Kupang), Kalimantan Timur (Samarinda, Balikpapan, IKN), Kalimantan Selatan (Banjarmasin), dan Kalimantan Utara.
  2. **WIB (`Asia/Jakarta` - UTC+7)**: Mencakup wilayah Jawa (Jakarta, Bandung, Semarang, Surabaya), Sumatera (Medan, Palembang, Padang), Kalimantan Barat (Pontianak), dan Kalimantan Tengah (Palangkaraya).
  3. **WIT (`Asia/Jayapura` - UTC+9)**: Mencakup wilayah Papua (Jayapura, Merauke, Sorong) dan Kepulauan Maluku (Ambon, Ternate).
- **Format Helper Terpadu (`src/lib/format.js`)**:
  - Fungsi `getAppTimezone()` dan `getTimezoneAbbr()` membaca preferensi dari `localStorage.getItem("tijarah:timezone")`.
  - Disparitas waktu antar-peran dan antar-cabang teratasi secara deterministik tanpa perlu me-reload peramban secara paksa (`tijarah:timezone_changed` event).

### 7.12 MATRIKS SALURAN NOTIFIKASI BERBASIS PERAN RBAC (SUPERADMIN/DEV, OWNER, GM, STAF/KASIR, PELANGGAN/MEMBER)
- **Desentralisasi Notifikasi Sesuai Matriks RBAC (`src/app/pages/account/Notifications.jsx`)**:
  - Saluran pengiriman alert bisnis (Aplikasi In-App, WhatsApp Bot Hermes, dan Email Resmi) kini dipisahkan secara spesifik berdasarkan kebutuhan unik dan tingkat kewenangan tiap peran operasional.
  - Pengguna dengan privilese tinggi (Owner, General Manager, Superadmin/Dev) dibekali navigasi *Role Switcher Tabs* untuk meninjau sekaligus mengatur preferensi pengiriman notifikasi bagi seluruh level staf dan pelanggan.

| Peran (RBAC) | Kategori Kejadian Bisnis Utama | In-App | WhatsApp | Email | Deskripsi & Tujuan Bisnis |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Superadmin / Dev** | Infrastruktur & Integritas Server | ✅ | ✅ | ✅ | Monitor uptime microservices, spike latensi Supabase, CPU load. |
| | Keamanan Kredensial & Deteksi Intrusi | ✅ | ✅ | ✅ | Peringatan brute-force, IP rate-limiting, anomali JWT session. |
| | Webhook Payment Gateway & QRIS | ✅ | ✅ | ✅ | Kegagalan callback Midtrans/Xendit/Pakasir, timeout settlement. |
| | Status WhatsApp Bot Hermes | ✅ | ✅ | ❌ | Diskoneksi gateway WA, lonjakan antrean broadcast, batas API. |
| | Error Telemetri & Crash Exception | ✅ | ❌ | ✅ | Laporan unhandled error di client POS / dashboard React. |
| | Snapshot Database & Audit Skema | ✅ | ❌ | ✅ | Laporan auto-backup database harian & audit integrity SQL. |
| **Owner Merchant** | Keamanan Akun & Kredensial Master | ✅ | ✅ | ✅ | Login dari IP/perangkat baru, rotasi kata sandi, pergantian PIN 2FA. |
| | Finansial, Payout S-Wallet & Rekening | ✅ | ✅ | ✅ | Pencairan saldo (disbursement) sukses/gagal, saldo minimum kas. |
| | Rekap Z-Report Harian Otomatis | ✅ | ✅ | ✅ | Laporan otomatis omzet, laba kotor, dan Z-Report saat kasir tutup shift. |
| | Pencegahan Fraud & Selisih Laci Kas | ✅ | ✅ | ❌ | Otorisasi pembatalan nota (Void) besar, selisih fisik kasir > limit. |
| | Approval PO & Pengeluaran Besar | ✅ | ✅ | ❌ | Permohonan persetujuan PO bahan baku di atas wewenang GM. |
| | Paket Langganan, AI Quota & Billing | ✅ | ❌ | ✅ | Peringatan jatuh tempo toko, sisa kuota AI menipis, tagihan bulanan. |
| **General Manager** | Keamanan Akun & Sesi Login Manajer | ✅ | ✅ | ✅ | Login perangkat baru manajer cabang dan verifikasi kredensial. |
| | Disiplin Shift & Kehadiran (Geofencing)| ✅ | ✅ | ❌ | Pelanggaran radius absensi cabang, keterlambatan staf > 15 mnt. |
| | Otorisasi Void Kasir, Diskon & Refund | ✅ | ✅ | ❌ | Permintaan persetujuan pembatalan nota, diskon manual, dan retur meja. |
| | Low Stock & Reorder Point (ROP) | ✅ | ✅ | ❌ | Bahan baku menipis di bawah ROP, peringatan expired, selisih opname. |
| | Pengajuan Cuti, Izin & Tukar Shift | ✅ | ✅ | ❌ | Approval cuti sakit/tahunan staf dan tukar jadwal roster kasir. |
| | Audit Laci Kas & Performa Cabang | ✅ | ❌ | ✅ | Selisih kas modal awal vs akhir shift, evaluasi target omzet cabang. |
| **Staf Kasir / Barista** | Keamanan Akun & Sesi Kasir | ✅ | ❌ | ✅ | Login akun kerja kasir, logout timeout, dan ganti PIN personal. |
| | Jadwal Kerja, Roster & Lembur | ✅ | ✅ | ❌ | Roster shift mingguan terbit, penugasan lembur darurat, reminder jam shift. |
| | Validasi Presensi & Konfirmasi Check-in | ✅ | ❌ | ❌ | Konfirmasi absensi selfie sukses di radius GPS, pengingat check-out. |
| | Pesanan Masuk & Order Dapur (KDS) | ✅ | ❌ | ❌ | Order online masuk, pesanan siap saji dari dapur, notifikasi meja. |
| | Status Permohonan Cuti & Izin | ✅ | ✅ | ❌ | Konfirmasi status pengajuan cuti disetujui / ditolak oleh GM. |
| | Slip Gaji & Pencairan Insentif Komisi | ✅ | ✅ | ✅ | Slip gaji bulanan resmi terbit siap unduh, pencairan komisi penjualan. |
| **Pelanggan / Member** | Keamanan Akun & OTP WhatsApp | ✅ | ✅ | ✅ | Kode OTP rahasia untuk login portal member tanpa kata sandi. |
| | Struk Digital (E-Receipt) | ✅ | ✅ | ✅ | Pengiriman struk nota digital otomatis via WA/email usai transaksi kasir. |
| | Poin Loyalitas & Cashback Belanja | ✅ | ✅ | ❌ | Penambahan poin Tijarah Rewards, cashback masuk, penukaran kupon. |
| | Kenaikan Level Tingkat Member (Tier) | ✅ | ✅ | ❌ | Notifikasi naik ke tingkat Silver/Gold/Platinum & bonus promo khusus. |
| | Voucer Ulang Tahun & Promo Toko | ✅ | ✅ | ❌ | Hadiah voucher ulang tahun personal dan diskon menu favorit. |
| | Panggilan Antrean & Pesanan Siap | ✅ | ✅ | ❌ | Panggilan nomor antrean pesanan siap diambil di counter pick-up. |

- **Jam Hening (Do Not Disturb) Tersinkronisasi**:
  - Penjeda pesan malam hari (DND) secara cerdas menyesuaikan dengan singkatan zona waktu aktif sistem (`WITA`, `WIB`, atau `WIT`).

### 7.13 OPTIMASI DEPENDENSI LEAFLET & TERMINAL BERSIH TANPA RELOAD RUNTIME
- **Konfigurasi Vite Pre-Bundling (`vite.config.js`)**:
  - Ditambahkan konfigurasi `optimizeDeps: { include: ["leaflet"] }` pada root konfigurasi Vite.
  - Memastikan pustaka pemetaan Leaflet telah dipaketkan sejak awal proses bootstrapping server berjalan (`npm run dev`).
  - Mencegah Vite memicu reload runtime mendadak (`[vite] ✨ new dependencies optimized: leaflet / reloading`) saat pengguna pertama kali membuka subtab Absensi atau Cabang, sehingga terminal dev server tetap bersih dan navigasi antarmuka 100% responsif tanpa delay.

---

## 8. STRUKTUR DATABASE, MIGRATIONS LEDGER & INTEGRITAS PENGUJIAN

### Mengapa Folder `supabase/migrations/` Wajib Dipertahankan?
1. **Schema Migration Ledger**: Merupakan buku besar versi skema basis data PostgreSQL standar industri (36 file migrasi berurutan dari `20261011000001_schema.sql` s/d `20261017000004_clear_attendance_rpc.sql`).
2. **Ketergantungan Unit Test**: Script pengujian kontrak RBAC ([tests/rbac-contract.test.mjs](file:///Users/m.aksaarsyad/Downloads/TIJARAH/tests/rbac-contract.test.mjs)) membaca langsung file migrasi 4 dan 21 untuk memastikan hak akses UI sinkron dengan database SQL.
3. **Database Runner**: Script migrasi otomatis `scripts/db.mjs` membandingkan file migrasi lokal dengan tabel `supabase_migrations.schema_migrations` pada PostgreSQL.
4. **File Tunggal Setup**: File gabungan seluruh migrasi tersedia di [supabase/bootstrap.sql](file:///Users/m.aksaarsyad/Downloads/TIJARAH/supabase/bootstrap.sql) (~7.300 baris SQL) untuk setup 1-klik di proyek Supabase baru.

### Status Integritas Sistem & Pengujian:
* **Unit Testing Contract (`npm test`)**: **7 dari 7 test PASSED (100% HIJAU, ~86ms)**.
* **Production Build (`npm run build`)**: **100% SUKSES dalam 1.73 detik** tanpa satupun error.
* **Workspace Higienis**: Seluruh file cache temporer, `.DS_Store`, dan duplikat lepas telah dibersihkan secara paripurna.

---
*Dokumen ini merupakan pedoman arsitektur sistem, hak akses berjenjang (RBAC), dan direktori fitur resmi Platform Tijarah Cloud OS & POS Multi-Tenant.*
