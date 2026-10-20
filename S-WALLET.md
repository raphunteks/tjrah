# SPESIFIKASI MASTER ARSITEKTUR & INTEGRASI SISTEM S-WALLET
## Ekosistem Dompet Digital Multi-Pengguna, Pembelanjaan Terpadu, Zero Fraud Kasir & Otorisasi TOTP 2FA (RFC 6238)
### Tijarah Operating System

---

## 1. PENDAHULUAN & PRINSIP DASAR ARSITEKTUR

### 1.1 Visi & Latar Belakang
S-Wallet adalah infrastruktur dompet digital *closed-loop* internal terintegrasi di dalam ekosistem **Tijarah OS**. S-Wallet memberikan setiap pengguna berotentikasi (Superadmin, Owner Merchant, General Manager, Kasir/Staf, Dokter/Tenaga Medis, hingga Member Pelanggan) rekening saldo digital mandiri berstandar perbankan modern.

Fitur ini dirancang untuk menyelesaikan empat pilar krusial operasional bisnis:
1. **Otorisasi Tanpa Kompromi (Zero-Trust Security)**: Perlindungan brankas saldo menggunakan dua lapis otentikasi: verifikasi dinamis **6-Digit TOTP (RFC 6238)** saat mengakses subtab dan **PIN Transaksi 6-Digit** saat eksekusi dana.
2. **Pemberantasan Kecurangan Kasir (Zero Fraud POS)**: Mengeliminasi risiko manipulasi uang tunai (*cash pocketing*), nota fiktif, selisih hitung kas kasir, serta pembatalan sepihak (*fake void*) melalui transaksi digital nirsentuh dengan kode otorisasi dinamis sekali pakai (*Dynamic Single-Use Token*).
3. **Ekosistem Pembelanjaan Terintegrasi**: Saldo S-Wallet dapat langsung digunakan untuk belanja menu/produk di POS Kasir, pesanan daring (*Online Orders*), pembayaran perpanjangan paket langganan SaaS Tijarah, pembelian kuota AI Copilot, hingga pencairan bagi hasil (*split revenue*) dokter dan penggajian karyawan (*payroll*).
4. **Buku Besar Berpasangan (Double-Entry Ledger Accounting)**: Menjamin integritas saldo secara matematis (`Delta Saldo = Debit - Kredit = 0`). Tidak ada saldo yang dapat diubah secara sepihak tanpa jurnal berimbang dalam transaksi atomik PostgreSQL/Supabase.

---

## 2. MEKANISME DUA FAKTOR (TOTP 2FA) & GERBANG MASUK SUBTAB S-WALLET

### 2.1 Perbedaan Mendasar: Pendaftaran 1 Kali vs Otorisasi Harian
Sesuai implementasi pada modul **Keamanan & Kredensial** (`src/app/pages/account/Security.jsx`), alur otentikasi dibagi menjadi dua fase yang tegas:

1. **Fase Pendaftaran / Setup (Cukup Dilakukan 1 Kali Saja)**:
   - Pengguna membuka tab **Akun > Keamanan & Kredensial > Aktifkan Autentikasi Dua Faktor (TOTP 2FA)**.
   - Sistem menampilkan Secret Key Base32 unik (contoh: `JBSW Y3DP EHPK 3PXP`) beserta QR Code standar ISO/IEC 18004.
   - Pengguna memindai QR Code tersebut menggunakan aplikasi di ponsel:
     - **Google Authenticator**
     - **Microsoft Authenticator**
     - **Authy**
   - Kunci rahasia tersimpan permanen di dalam ruang penyimpanan aman (*secure enclave*) ponsel pengguna.
   - **Prinsip**: Pengguna **TIDAK PERLU** lagi memindai ulang QR Code atau memasukkan Secret Key untuk hari-hari berikutnya.

2. **Fase Penggunaan Dinamis Harian untuk S-Wallet (Token 6-Digit)**:
   - Aplikasi authenticator di ponsel secara mandiri menghasilkan 6 digit angka baru setiap 30 detik secara *offline*.
   - Saat pengguna ingin masuk ke subtab S-Wallet atau mengeksekusi transfer bernilai besar, sistem hanya meminta **6 digit angka yang sedang tampil di layar aplikasi authenticator**.

---

### 2.2 Arsitektur Gerbang Keamanan Masuk Subtab (Step-Up Challenge)

```
[ PENGGUNA MEMILIH SUBTAB "S-WALLET" (/app/akun/wallet) ]
                            |
                            v
             [ Evaluasi Status 2FA Profil Akun ]
               /                             \
        (Belum Aktif)                    (Sudah Aktif)
             /                                 \
            v                                   v
  [ Kunci Akses Total ]               [ Cek Masa Aktif Sesi S-Wallet ]
Tampilkan Layar Edukasi:              (sessionStorage: swallet_auth_token)
"Wajib Aktivasi 2FA Dahulu                    /                 \
di Tab Keamanan & Kredensial"           (Masih Aktif)       (Kadaluarsa / Baru)
            |                                 /                     \
            v                                v                       v
  [ Tombol CTA Cepat Ke ]            [ Buka Penuh ]      [ Tampilkan Modal Tantangan ]
  /app/akun/keamanan                   Dasbor S-Wallet    "Masukkan 6-Digit Kode OTP
                                                         Google/Microsoft Authenticator"
                                                                     |
                                                                     v
                                                          [ Verifikasi RFC 6238 ]
                                                            /                 \
                                                       (Tidak Valid)        (Valid)
                                                          /                     \
                                                         v                       v
                                                 [ Tolak & Log ]       [ Terbitkan Tiket Sesi ]
                                                 Maksimal 5x Gagal     Berlaku 15 Menit Aman
                                                                                 |
                                                                                 v
                                                                       [ Buka Dasbor S-Wallet ]
```

- **Masa Berlaku Sesi Keamanan**: Tiket sesi otorisasi S-Wallet berdurasi **15 menit**. Jika pengguna tidak aktif (*idle*) atau menutup tab peramban, brankas otomatis terkunci kembali (*auto-lock*) untuk melindungi aset pengguna dari penyusupan saat perangkat ditinggal.

---

## 3. PETA FITUR LENGKAP PADA SUBTAB / TAB "S-WALLET"

Subtab S-Wallet dirancang sebagai pusat kendali finansial mandiri dengan 7 modul fitur terpadu:

```
+--------------------------------------------------------------------------------------------------+
|                                    PUSAT KENDALI S-WALLET                                       |
+--------------------------------------------------------------------------------------------------+
| [ KARTU BRANKAS UTAMA ]                                                                          |
|   Saldo Aktif: Rp 12.850.000       Nomor Rekening: SW-2026-8809124      [ Salin ] [ Tampilkan QR ]|
|   Saldo Tertahan: Rp 250.000       Status Akun: Terverifikasi 2FA Aktif                          |
+--------------------------------------------------------------------------------------------------+
| [ AKSI CEPAT ]                                                                                   |
|   [+ Top-Up Saldo Gateway]   [-> Transfer Sesama User]   [QR Bayar Kasir]   [<- Tarik Dana Bank] |
+--------------------------------------------------------------------------------------------------+
| [ SUB-PANEL KONTEN AKTIF ]                                                                       |
|   (1) Ringkasan & Grafik  | (2) Riwayat Mutasi Buku Besar | (3) Rekening Bank | (4) Limit & Izin |
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Fitur 1: Dasbor Brankas & Saldo Real-Time
1. **Saldo Tersedia (Available Balance)**: Dana likuid riil yang siap digunakan untuk transfer, belanja di kasir, atau ditarik.
2. **Saldo Tertahan (Locked / Escrow Balance)**: Dana yang dialokasikan sementara saat ada pesanan yang sedang diproses atau penarikan dana yang menunggu kliring perbankan.
3. **Nomor Rekening S-Wallet Unik**: Format terstandarisasi perbankan `SW-YYYYMM-XXXXXXXX` (bisa disalin dengan 1-klik untuk menerima transfer tanpa harus menyebarkan nomor rekening bank pribadi).
4. **My QR Code S-Wallet**: Kode QR personal berstempel resmi Tijarah yang bisa langsung dipindai oleh sesama pengguna atau kasir untuk pengiriman dana seketika.

---

### 3.2 Fitur 2: Top-Up Saldo Instan Terintegrasi Gateway Pakasir API v2
Pengguna dapat mengisi ulang kantong S-Wallet mereka kapan saja dengan verifikasi otomatis tanpa perlu konfirmasi manual admin:
1. **Kanal Pembayaran Otomatis**:
   - **QRIS Dinamis**: Tampil instan di layar, dapat dipindai oleh semua aplikasi m-Banking (BCA, Mandiri Livin, BRImo, BNI) dan e-Wallet (GoPay, OVO, ShopeePay, DANA, LinkAja).
   - **Virtual Account 24 Jam**: Mendukung 9 bank nasional (BRI, BNI, CIMB Niaga, Maybank, Danamon, Neo Commerce, BSI, Muamalat, OCBC) dengan verifikasi otomatis 24/7.
   - **Payment Link**: Pembayaran kartu debit atau tautan *checkout* instan.
2. **Kalkulator Nominal Cepat**: Pilihan nominal instan (Rp 50rb, Rp 100rb, Rp 250rb, Rp 500rb, Rp 1jt, Rp 2,5jt) atau bebas input nominal kustom (minimal Rp 10.000).
3. **Penyelesaian Otomatis (< 2 Detik)**: Begitu pembayaran selesai di Pakasir, webhook serverless (`/api/webhook/pakasir`) secara otomatis memicu stored procedure `process_pakasir_wallet_topup` untuk mengkreditkan saldo ke S-Wallet pengguna secara *real-time*.

---

### 3.3 Fitur 3: Transfer Saldo Antar Pengguna P2P (Peer-to-Peer)
Memungkinkan perpindahan saldo instan antar pengguna Tijarah (Superadmin, Owner, GM, Staf, Dokter, Member) dengan ketentuan:
1. **Multi-Identifier Lookup**: Pengirim dapat mencari penerima menggunakan:
   - Nomor Rekening S-Wallet (`SW-XXXX-XXXX`)
   - Alamat Email Terdaftar
   - Nomor WhatsApp / Handphone Terverifikasi
2. **Kartu Validasi Identitas Penerima**: Sebelum dana terkirim, sistem memunculkan pop-up konfirmasi yang menampilkan Foto Avatar, Nama Lengkap, Peran Akun, dan Nama Merchant/Cabang penerima guna mencegah salah kirim.
3. **Bebas Biaya Admin (Rp 0)**: Seluruh transfer internal antar kantong S-Wallet bebas biaya administrasi.
4. **Catatan Transaksi**: Pengirim dapat menyertakan pesan (contoh: *"Bagi hasil shift pagi"*, *"Uang muka pesanan katering"*, *"Pelunasan invoice"*).
5. **Otorisasi Eksekusi**: Wajib memasukkan **PIN Transaksi 6-Digit** pengirim untuk mencegah eksekusi sepihak.

---

### 3.4 Fitur 4: Ekosistem Pembelanjaan Terintegrasi di Website

S-Wallet terhubung langsung ke seluruh alur belanja dan operasional bisnis:

```
                              [ S-WALLET SALDO PENGGUNA ]
                                           |
         +---------------------------------+---------------------------------+
         |                                 |                                 |
         v                                 v                                 v
[ KASIR POS OFFLINE ]            [ PESANAN ONLINE / /m ]           [ LANGGANAN SAAS TIJARAH ]
- Bayar makanan/minuman          - Checkout menu dari HP           - Bayar Starter/Growth/Enterprise
- Bayar tindakan medis klinik    - Reservasi meja / odontogram     - Beli kuota token AI Copilot
- Kode Bayar 60 detik (OTP)      - 1-Klik potong saldo langsung    - Auto-debit perpanjangan bulanan
         |                                 |                                 |
         +---------------------------------+---------------------------------+
                                           |
                                           v
                             [ PEMBAGIAN REVENUE OTOMATIS ]
                             - Bagi hasil dokter klinik (30%)
                             - Setoran kas kasir ke Owner
                             - Gaji karyawan / Payroll bulanan
```

1. **Pembayaran di Layar Kasir POS (`src/app/pages/ops/Pos.jsx`)**:
   - Pada metode pembayaran kasir, tersedia opsi **"S-Wallet Tijarah"**.
   - Pelanggan/Member menunjukkan kode bayar dinamis atau memindai QR Kasir.
   - Saldo berpindah seketika ke dompet merchant, struk kasir tercetak dengan rincian non-tunai.
2. **Belanja Mandiri di Pesanan Online & Portal Member (`/m` / `src/app/pages/ops/Online.jsx`)**:
   - Member yang memesan menu atau obat klinik dapat langsung memilih metode bayar S-Wallet dengan pemotongan saldo seketika tanpa perlu unggah struk transfer bank manual.
3. **Pembayaran Langganan SaaS & Kuota Copilot AI (`src/app/pages/growth/Subscription.jsx`)**:
   - Merchant Owner dapat memperpanjang paket aplikasi Tijarah OS atau menambah kuota AI Copilot langsung menggunakan saldo S-Wallet hasil penjualan toko mereka.
4. **Otomatisasi Bagi Hasil Dokter & Terapis Klinik (`src/app/pages/service/Team.jsx`)**:
   - Setiap invoice tindakan medis gigi/umum yang diselesaikan di kasir secara otomatis membagi dana: komisi dokter (misal 30%) langsung masuk ke S-Wallet pribadi dokter, dan sisanya (70%) masuk ke S-Wallet klinik secara *real-time*.
5. **Payroll & Kas Bon Staf Terintegrasi (`src/app/pages/service/Payroll.jsx`)**:
   - Owner dapat mendistribusikan gaji bulanan ke seluruh S-Wallet staf secara massal (*1-Click Bulk Payroll Disbursement*), dan staf dapat mengajukan kas bon yang dicairkan langsung ke S-Wallet mereka setelah disetujui GM.

---

### 3.5 Fitur 5: Arsitektur Zero Fraud di Kasir POS (Anti-Kecurangan Toko)

Kelemahan terbesar operasional toko fisik konvensional adalah kebocoran uang tunai oleh staf kasir. S-Wallet menghapus celah tersebut hingga ke akarnya:

1. **Eliminasi Uang Kas Fisik**:
   - Transaksi non-tunai via S-Wallet langsung tercatat secara digital di server cloud. Kasir tidak memegang uang tunai, sehingga potensi penggelapan kas (*cash skimming*) menjadi **0%**.
2. **Token Pembayaran Dinamis Sekali Pakai (Single-Use 60s OTP)**:
   - Saat pelanggan membayar di kasir, pelanggan membuka S-Wallet dan menekan tombol *"Tampilkan Kode Bayar Kasir"*.
   - Sistem menerbitkan **6-Digit Token Dinamis** yang hanya berlaku **60 detik** dan hanya bisa digunakan **satu kali**.
   - Kasir mengetikkan 6 digit tersebut di aplikasi POS. Jika waktu habis atau kode pernah dipakai, sistem menolak transaksi. Kasir tidak bisa mencatat atau menyalahgunakan kode pelanggan di kemudian hari.
3. **Pencegahan Pembatalan Transaksi Palsu (Anti-Fake Void Protection)**:
   - Modus umum kasir curang: menerima uang pelanggan, mencetak struk, lalu membatalkan (*void*) transaksi di sistem saat pelanggan pergi agar uang tunai bisa dikantongi.
   - Pada S-Wallet: Jika transaksi POS di-void, saldo S-Wallet otomatis dikembalikan ke rekening pelanggan (*Auto-Refund by System*), bukan ke tangan kasir. Setiap *void* wajib diverifikasi oleh PIN Supervisor/GM dan tercatat pada audit log.
4. **Audit Trail Digital Kasir**:
   - Setiap transaksi mencatat: `cashier_id`, `shift_id`, `terminal_id`, `order_id`, dan penanda waktu berpresisi milidetik.

---

### 3.6 Fitur 6: Penarikan Dana ke Rekening Bank (Withdrawal / Payout)
1. **Dukungan Bank Nasional Lengkap**: Pengguna dapat mendaftarkan nomor rekening bank (BCA, Mandiri, BRI, BNI, BSI, Bank Jago, Permata, CIMB).
2. **Verifikasi Nama Pemilik Rekening**: Rekening bank harus sesuai dengan identitas profil pengguna untuk mencegah pencucian uang (*AML Compliance*).
3. **Otorisasi Penarikan Berlapis**: Permintaan penarikan dana wajib mengonfirmasi:
   - Validasi **6-Digit TOTP Authenticator** saat mengajukan penarikan.
   - Input **PIN Transaksi 6-Digit**.
4. **Mekanisme Saldo Tertahan (Escrow Hold)**: Saldo yang ditarik dipindahkan dari `balance` ke `locked_balance` hingga proses transfer kliring bank berstatus berhasil.

---

### 3.7 Fitur 7: Mutasi Buku Besar & Resi Transaksi Digital
1. **Filter Mutasi Komprehensif**: Filter riwayat berdasarkan *Semua*, *Dana Masuk*, *Dana Keluar*, *Top-Up*, *Belanja POS*, dan *Bagi Hasil*.
2. **Pencarian Riwayat**: Cari berdasarkan Nomor Referensi, Nama Pengirim/Penerima, atau Rentang Tanggal.
3. **Resi Digital Resmi Tijarah**: Setiap transaksi dapat diklik untuk menampilkan lembar resi digital lengkap dengan cap digital (*digital seal*), stempel waktu, dan tombol cetak bukti transfer (format PDF/Thermal POS).

---

## 4. PERSPEKTIF FITUR TIAP PERAN (ROLE-BASED POV MATRIKS RBAC)

Sesuai dengan matriks RBAC resmi Tijarah OS (BAB IV Blueprint: 20 Fitur x 5 Peran + Member L5), setiap tingkatan peran memiliki wewenang, batasan fungsional, dan perspektif antarmuka yang presisi:

```
+----------------------------------------------------------------------------------------------------+
| MATRIKS HAK AKSES FINANSIAL S-WALLET BERDASARKAN TINGKATAN PERAN (RBAC)                           |
+----------------------------------------------------------------------------------------------------+
| Peran (Level)       | Top-Up | P2P Transfer  | Belanja POS | Tarik Bank | Bulk Payroll | Freeze/God |
+---------------------+--------+---------------+-------------+------------+--------------+------------+
| Superadmin (L0)     | CRUD   | Global Bebas  | -           | Approval   | Platform     | OVERPOWER  |
| Owner Merchant (L1) | CRUD   | Antar Akun    | Merchant In | CRUD       | Eksekusi Full| Tenant Ctr |
| General Mgr (L2)    | RU     | Cabang & Staf | Merchant In | RU (Limit) | Verifikasi   | Kas Cabang |
| Cashier/Staff (L3)  | R      | Kasir & Owner | Input Bayar | -          | Terima Gaji  | -          |
| Dokter/Medis (L4)   | R      | Terima Komisi | -           | Mandiri    | Terima Share | -          |
| Member (L5)         | CRUD   | Sesama Member | 1-Klik Bayar| Saldo Sisa | -            | -          |
+----------------------------------------------------------------------------------------------------+
```

### 4.1 POV 1: Superadmin / Developer (Level L0 - Platform God-Mode)
- **Perspektif**: Pengawas moneter platform tertinggi, memantau total likuiditas sistem, perputaran uang antar tenant, dan rekonsiliasi gateway.
- **Wewenang Spesifik**:
  - Membuka konsol **Master Financial Control Center** (seluruh transaksi platform terpantau dalam 1 tab).
  - Melakukan audit investigasi terhadap rekening dompet manapun tanpa batasan tenant.
  - Membekukan (*Freeze*) dompet yang terindikasi *fraud*, *money laundering*, atau sengketa pembayaran.
  - Melakukan penyesuaian saldo sistemik (*System Balance Correction / Emergency Inject/Deduct*) dengan alasan audit resmi yang tercatat di *immutable ledger*.
  - Menyetujui atau menolak permohonan penarikan dana berskala besar (*High-Volume Payout Approval*).

### 4.2 POV 2: Owner Merchant (Level L1 - Master Business Wallet)
- **Perspektif**: Pemilik modal dan pengendali kas bisnis merchant.
- **Wewenang Spesifik**:
  - Rekening penampung utama seluruh omset masuk dari penjualan kasir POS seluruh cabang dan pesanan daring.
  - Eksekusi pembayaran langganan paket SaaS Tijarah OS (Starter, Growth, Enterprise) & top-up kuota token AI Copilot.
  - Melakukan transfer alokasi kas operasional cabang ke GM.
  - Eksekusi penggajian bulanan staf (*Bulk 1-Click Salary Disbursement*) ke seluruh S-Wallet karyawan.
  - Mengajukan penarikan dana omset usaha (*Withdrawal*) ke rekening bank perusahaan/pribadi.
  - Menyetujui permohonan kas bon staf yang diajukan oleh GM.

### 4.3 POV 3: General Manager / GM (Level L2 - Operational Branch Wallet)
- **Perspektif**: Manajer operasional harian cabang toko atau klinik.
- **Wewenang Spesifik**:
  - Menerima alokasi dana operasional cabang (*Petty Cash*) dari Owner ke S-Wallet operasional cabang.
  - Mendistribusikan kas kecil awal (*Float Cash*) ke kasir pada awal shift pagi/sore.
  - Memeriksa dan memverifikasi setoran kasir saat penutupan shift (*Shift Settlement Reconcile*).
  - Menerima pengajuan kas bon staf, memeriksa sisa limit, dan meneruskannya ke Owner dengan rekomendasi persetujuan.
  - Otorisasi *Void/Refund* transaksi kasir menggunakan PIN Supervisor.

### 4.4 POV 4: Cashier / Staf Operasional (Level L3 - Register & Personal Wallet)
- **Perspektif**: Petugas kasir garis depan yang memproses penjualan tanpa menyentuh uang tunai berisiko.
- **Wewenang Spesifik**:
  - Menerima input kode bayar dinamis (OTP 60s) dari pelanggan di mesin POS.
  - Memiliki kantong dompet pribadi untuk menerima pencairan gaji bulanan, bonus penjualan, dan tip digital langsung dari pelanggan.
  - Melakukan transfer setoran hasil kasir ke dompet GM/Owner saat penutupan register.
  - Mengajukan kas bon darurat ke GM langsung dari dasbor akun staf.
  - Tidak memiliki akses untuk mentransfer dana operasional toko ke luar merchant tanpa otorisasi GM.

### 4.5 POV 5: Dokter / Tenaga Medis Klinik (Level L4 - Professional Commission Wallet)
- **Perspektif**: Praktisi medis yang berhak atas pembagian jasa medis secara transparan.
- **Wewenang Spesifik**:
  - Menerima otomatisasi bagi hasil (*Automated Split Revenue*) setiap kali billing pasien odontogram/tindakan medis lunas di kasir klinik (misal: 30% jasa medis dokter langsung masuk detik itu juga).
  - Memantau rincian pembagian hasil per pasien, per tindakan medis, dan per tanggal.
  - Mentransfer saldo hasil jasa medis ke rekening bank pribadi dokter kapan pun diinginkan tanpa harus menunggu rekap manual bulanan staf akunting.

### 4.6 POV 6: Member Pelanggan / Pasien (Level L5 - Customer Loyalty & Shopping Wallet)
- **Perspektif**: Konsumen yang berbelanja produk makanan/minuman, retail, atau perawatan klinik.
- **Wewenang Spesifik**:
  - Mengisi saldo (*Top-Up*) mandiri melalui QRIS/VA Pakasir di portal pelanggan `/m`.
  - Menerbitkan **Kode Bayar 60 Detik** saat berada di depan meja kasir toko untuk transaksi nirsentuh.
  - Melakukan *Checkout 1-Klik* pesanan online di web portal tanpa perlu konfirmasi manual WhatsApp.
  - Mengirim saldo ke sesama teman/keluarga pengguna Tijarah (contoh: patungan belanja / *split bill*).
  - Menerima pengembalian dana (*instant refund*) secara utuh detik itu juga jika pesanan dibatalkan.

---

## 5. INTER-ROLE FINANCIAL WORKFLOWS (ALUR KERJA FINANSIAL ANTAR PERAN)

S-Wallet menyatukan operasional multi-peran ke dalam alur kerja finansial yang terhubung otomatis:

### 5.1 Alur 1: Pembayaran Belanja Kasir POS & Split Bagi Hasil Dokter Real-Time
```
[ Pasien / Member ] --(Tunjukkan Kode Bayar 60s)--> [ Kasir POS ]
                                                          |
                                           [ Eksekusi RPC di Database ]
                                                          |
                      +-----------------------------------+-----------------------------------+
                      |                                                                       |
                      v (70% Omset Toko/Klinik)                                               v (30% Jasa Medis)
          [ S-Wallet Owner Merchant ]                                             [ S-Wallet Dokter Medis ]
        Tercatat di Omset Hari Ini                                              Tercatat di Komisi Tindakan
```

### 5.2 Alur 2: Alokasi Kas Operasional Cabang & Setoran Tutup Kasir
```
[ Owner Merchant ] --(Alokasi Petty Cash Bulanan Rp 5jt)--> [ General Manager (GM) ]
                                                                     |
                                                       (Kas Awal Shift Rp 300rb)
                                                                     v
                                                             [ Kasir / Staf ]
                                                                     |
                                                         (Penjualan Seharian)
                                                                     v
[ Owner Merchant ] <--(Setoran Hasil Shift via Transfer S-Wallet)-- [ Tutup Kasir ]
```

### 5.3 Alur 3: Penggajian Karyawan (Payroll) & Pengajuan Kas Bon
```
1. Alur Payroll Massal Akhir Bulan:
[ Owner Merchant ] --(1-Klik Payroll Massal Rp 45jt)--> [ Terbagi Otomatis ke 15 S-Wallet Staf ]

2. Alur Kas Bon Darurat Staf:
[ Staf / Kasir ] --(Ajukan Kas Bon Rp 500rb)--> [ GM: Verifikasi Sisa Gaji ]
                                                         |
                                                  (Rekomendasikan)
                                                         v
[ Staf: Saldo S-Wallet Bertambah ] <--(Approve & Cairkan Langsung)-- [ Owner Merchant ]
```

### 5.4 Alur 4: Pembatalan Pesanan Kasir (Anti-Fake Void Auto-Refund)
```
[ Kasir Ajukan Void Nota #1024 ] ---> [ GM Masukkan PIN Otorisasi Supervisor ]
                                                        |
                                                 (Void Disetujui)
                                                        v
                                          [ Sistem Eksekusi Auto-Refund ]
                                                        |
         +----------------------------------------------+----------------------------------------------+
         |                                                                                             |
         v                                                                                             v
[ Saldo S-Wallet Toko Berkurang ]                                                   [ Saldo Member Kembali Utuh ]
Tercatat di Audit Log Void                                                          Kasir TIDAK Terima Uang Tunai
```

---

## 6. KONSOL PUSAT KENDALI SUPERADMIN / DEV (GOD-MODE FINANCIAL CONTROL CENTER)

Bagi peran **Superadmin / Developer**, disediakan konsol terpadu (*All-in-One Command Center*) pada panel Superadmin yang memantau, mengaudit, dan mengendalikan seluruh sistem moneter platform dalam **satu layar kendali**:

```
+------------------------------------------------------------------------------------------------------+
| SUPERADMIN / DEV: MASTER FINANCIAL COMMAND CENTER (/app/paket > Subtab S-Wallet Master)              |
+------------------------------------------------------------------------------------------------------+
| [ RADAR LIKUIDITAS GLOBAL PLATFORM ]                                                                 |
|   Total Uang Beredar: Rp 482.940.000     Cadangan Riil Pakasir: Rp 482.940.000     Selisih: Rp 0     |
|   Dompet Owner: Rp 310.200.000           Dompet GM: Rp 42.100.000                  Dompet Staf: Rp 18jt|
|   Dompet Dokter: Rp 38.400.000           Dompet Member: Rp 74.240.000              Status: 100% Klop |
+------------------------------------------------------------------------------------------------------+
| [ TOMBOL DARURAT & CIRCUIT BREAKER ]                                                                 |
|   [!] GLOBAL CIRCUIT BREAKER: [ NORMAL / BERJALAN ]  (Klik untuk bekukan transfer platform darurat)  |
|   [ Radar Deteksi Anomali AI: AKTIF (0 Ancaman Terdeteksi) ]     [ Rekonsiliasi Gateway Real-Time ] |
+------------------------------------------------------------------------------------------------------+
| [ TABEL MONITORING OMNI-WALLET & SEARCH ]                                                            |
|   Cari Dompet Pengguna: [ Masukkan Nama / Email / No SW / Tenant... ]       Filter: [ Semua Role v ] |
|   -------------------------------------------------------------------------------------------------  |
|   No SW            Nama Akun           Role       Tenant          Saldo Aktif     Status     Aksi    |
|   SW-2026-001928   Budi Santoso        Owner      Kopi Harumin    Rp 45.200.000   Normal     [Kelola]|
|   SW-2026-004812   drg. Siti Sarah     Dokter     Klinik Gigi     Rp 12.800.000   Normal     [Kelola]|
|   SW-2026-009182   Rian Kasir          Staff      Kopi Harumin    Rp 1.450.000    Normal     [Kelola]|
|   SW-2026-011248   Ahmad (Member)      Member     Kopi Harumin    Rp 340.000      Normal     [Kelola]|
+------------------------------------------------------------------------------------------------------+
| [ LIVE ACTIVITY FEED - TRANSAKSI REAL-TIME DETIK DEMI DETIK ]                                       |
|   12:35:10 - TRF-20261020-A819: Ahmad (Member) bayar POS Kasir Kopi Harumin -> Rp 45.000 [Sukses]   |
|   12:34:55 - TOP-20261020-0012: Top-Up QRIS Pakasir drg. Siti Sarah -> Rp 500.000 [Settled]        |
|   12:32:18 - TRF-20261020-9941: Owner Harumin transfer petty cash GM -> Rp 2.000.000 [Sukses]       |
+------------------------------------------------------------------------------------------------------+
```

### 6.1 Fitur Unggulan Konsol Superadmin / Dev
1. **Radar Likuiditas & Reserve Gateway Pakasir (100% Sinkron)**:
   - Menghitung secara agregat total saldo seluruh dompet di database dan membandingkannya dengan dana riil yang masuk di akun merchant Pakasir.
   - Menampilkan indikator selisih (*reconciliation gap*). Jika ada selisih sekecil Rp 1, radar menyala merah memberi peringatan.
2. **Omni-Wallet Explorer & Inspector**:
   - Superadmin dapat mencari dompet milik akun manapun di seluruh cabang dan tenant.
   - Dapat menginspeksi buku besar (*ledger inspection*), histori transfer, serta mendeteksi IP address dan perangkat yang digunakan pengguna.
3. **Instrumen Intervensi God-Mode**:
   - **One-Click Freeze / Unfreeze**: Membekukan dompet tertentu jika terindikasi pembajakan akun atau transaksi mencurigakan. Dompet yang dibekukan tidak dapat melakukan transaksi keluar apa pun.
   - **Koreksi Saldo Sistemik (Balance Adjustment)**: Superadmin dapat melakukan penyesuaian saldo resmi (debit/kredit darurat) jika terjadi koreksi manual sengketa perbankan. Setiap koreksi **wajib menyertakan Berita Acara / Catatan Alasan Audit** yang tersimpan di buku besar superadmin.
   - **Global Circuit Breaker (Tombol Darurat Finansial)**: Saklar pengaman darurat yang dapat menghentikan seluruh fungsi transfer platform dalam hitungan detik jika sistem mendeteksi percobaan peretasan atau serangan DDoS terdistribusi.
4. **Radar Deteksi Anomali Anti-Fraud AI**:
   - Mendeteksi pola transaksi ganjil:
     - Transfer berulang dalam rentang waktu di bawah 10 detik.
     - Penarikan saldo dalam nominal di atas Rp 20.000.000 di luar jam operasional normal.
     - Akun yang mengalami kegagalan verifikasi OTP 2FA lebih dari 5 kali berturut-turut.
5. **Live Activity Ticker (Streaming Mutasi Real-Time)**:
   - Panel bawah menampilkan siaran langsung setiap pergerakan dana di seluruh platform detik demi detik tanpa perlu memuat ulang halaman.

---

## 7. SKEMA BASIS DATA & STORED PROCEDURES KRUSIAL (POSTGRESQL / SUPABASE)

### 7.1 Tabel Rekening Dompet (`public.wallets`)
```sql
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade, -- null untuk superadmin
  wallet_number varchar(24) not null unique, -- Format: SW-2026-XXXXXXXX
  balance bigint not null default 0 check (balance >= 0),
  locked_balance bigint not null default 0 check (locked_balance >= 0),
  currency varchar(3) not null default 'IDR',
  daily_transfer_limit bigint not null default 25000000, -- Limit Rp 25jt/hari
  is_frozen boolean not null default false,
  frozen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wallets_user on public.wallets(user_id);
create index idx_wallets_number on public.wallets(wallet_number);
create index idx_wallets_tenant on public.wallets(tenant_id);
```

### 7.2 Tabel Token Pembayaran Dinamis Kasir POS (`public.wallet_payment_tokens`)
```sql
create table public.wallet_payment_tokens (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  token_code varchar(6) not null,
  amount_limit bigint,
  is_used boolean not null default false,
  used_at timestamptz,
  used_order_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_pay_tokens_lookup on public.wallet_payment_tokens(token_code, is_used, expires_at);
```

### 7.3 Tabel Transaksi Finansial (`public.wallet_transactions`)
```sql
create type public.wallet_txn_category as enum (
  'p2p_transfer',
  'pos_payment',
  'online_order_payment',
  'saas_subscription',
  'ai_quota_purchase',
  'topup_pakasir',
  'bank_withdrawal',
  'clinic_doctor_split',
  'payroll_salary',
  'pos_refund',
  'admin_adjustment'
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_no varchar(36) not null unique,
  idempotency_key varchar(64) not null unique,
  sender_wallet_id uuid references public.wallets(id),
  receiver_wallet_id uuid references public.wallets(id),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  total_deducted bigint not null check (total_deducted >= amount),
  category public.wallet_txn_category not null,
  status varchar(20) not null default 'completed', -- completed, pending, failed, reversed
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_wallet_txns_sender on public.wallet_transactions(sender_wallet_id);
create index idx_wallet_txns_receiver on public.wallet_transactions(receiver_wallet_id);
create index idx_wallet_txns_cat on public.wallet_transactions(category);
create index idx_wallet_txns_created on public.wallet_transactions(created_at desc);
```

### 7.4 Tabel Buku Besar Ganda (`public.wallet_ledger`)
```sql
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  txn_id uuid not null references public.wallet_transactions(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  entry_type varchar(6) not null check (entry_type in ('DEBIT', 'CREDIT')),
  amount bigint not null check (amount > 0),
  balance_before bigint not null,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create index idx_wallet_ledger_wallet on public.wallet_ledger(wallet_id);
create index idx_wallet_ledger_txn on public.wallet_ledger(txn_id);
```

---

## 8. STORED PROCEDURES ATOMIK TERINTEGRASI

### 8.1 Prosedur Pembayaran Kasir POS Tanpa Fraud (`execute_pos_wallet_payment`)
```sql
create or replace function public.execute_pos_wallet_payment(
  p_cashier_user_id uuid,
  p_payment_token varchar(6),
  p_order_id text,
  p_amount bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_token public.wallet_payment_tokens%rowtype;
  v_customer_wallet public.wallets%rowtype;
  v_merchant_wallet public.wallets%rowtype;
  v_merchant_user_id uuid;
  v_ref_no varchar(36);
  v_txn_id uuid;
begin
  -- 1. Validasi token pembayaran aktif
  select * into v_token
  from public.wallet_payment_tokens
  where token_code = p_payment_token
    and is_used = false
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Kode bayar S-Wallet tidak valid atau telah kadaluarsa (berlaku 60 detik).';
  end if;

  -- 2. Ambil dompet pelanggan dan kunci saldo
  select * into v_customer_wallet
  from public.wallets
  where id = v_token.wallet_id
  for update;

  if v_customer_wallet.balance < p_amount then
    raise exception 'Saldo S-Wallet pelanggan tidak mencukupi untuk pembayaran ini.';
  end if;

  -- 3. Cari dompet merchant (Owner dari tenant tempat kasir bertugas)
  select p.id into v_merchant_user_id
  from public.profiles cashier
  join public.profiles p on p.tenant_id = cashier.tenant_id and p.role = 'owner'
  where cashier.id = p_cashier_user_id
  limit 1;

  select * into v_merchant_wallet
  from public.wallets
  where user_id = v_merchant_user_id
  for update;

  -- 4. Eksekusi pemindahan saldo
  update public.wallets set balance = balance - p_amount, updated_at = now() where id = v_customer_wallet.id;
  update public.wallets set balance = balance + p_amount, updated_at = now() where id = v_merchant_wallet.id;

  -- 5. Hanguskan token pembayaran
  update public.wallet_payment_tokens
  set is_used = true, used_at = now(), used_order_id = p_order_id
  where id = v_token.id;

  -- 6. Terbitkan nomor referensi transaksi
  v_ref_no := 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, p_idempotency_key, v_customer_wallet.id, v_merchant_wallet.id,
    p_amount, 0, p_amount, 'pos_payment', 'completed',
    'Pembayaran Pesanan POS ' || p_order_id,
    jsonb_build_object('order_id', p_order_id, 'cashier_id', p_cashier_user_id)
  ) returning id into v_txn_id;

  -- 7. Catat pembukuan berpasangan
  insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
  values
    (v_txn_id, v_customer_wallet.id, 'DEBIT', p_amount, v_customer_wallet.balance, v_customer_wallet.balance - p_amount),
    (v_txn_id, v_merchant_wallet.id, 'CREDIT', p_amount, v_merchant_wallet.balance, v_merchant_wallet.balance + p_amount);

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'amount', p_amount,
    'customer_wallet', v_customer_wallet.wallet_number,
    'created_at', now()
  );
end;
$$;
```

---

### 8.2 Prosedur Intervensi Superadmin Koreksi Saldo Berimbang (`admin_adjust_wallet_balance`)
```sql
create or replace function public.admin_adjust_wallet_balance(
  p_admin_user_id uuid,
  p_target_wallet_id uuid,
  p_amount bigint, -- positif untuk inject saldo, negatif untuk potong saldo
  p_reason text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_target_wallet public.wallets%rowtype;
  v_ref_no varchar(36);
  v_txn_id uuid;
begin
  -- Verifikasi pemanggil adalah Superadmin
  if not exists (select 1 from public.profiles where id = p_admin_user_id and role = 'superadmin') then
    raise exception 'Unauthorized: Hanya Superadmin yang berhak melakukan penyesuaian saldo sistem.';
  end if;

  if trim(p_reason) = '' or p_reason is null then
    raise exception 'Alasan audit penyesuaian saldo wajib dicantumkan.';
  end if;

  select * into v_target_wallet
  from public.wallets
  where id = p_target_wallet_id
  for update;

  if (v_target_wallet.balance + p_amount) < 0 then
    raise exception 'Penyesuaian saldo ditolak: Saldo dompet target tidak boleh menjadi negatif.';
  end if;

  update public.wallets
  set balance = balance + p_amount, updated_at = now()
  where id = v_target_wallet.id;

  v_ref_no := 'ADJ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, 'adj_' || gen_random_uuid()::text, null, v_target_wallet.id,
    abs(p_amount), 0, abs(p_amount), 'admin_adjustment', 'completed',
    'Penyesuaian Saldo oleh Superadmin: ' || p_reason,
    jsonb_build_object('admin_id', p_admin_user_id, 'direction', case when p_amount > 0 then 'INJECT' else 'DEDUCT' end)
  ) returning id into v_txn_id;

  insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
  values (
    v_txn_id, v_target_wallet.id,
    case when p_amount > 0 then 'CREDIT' else 'DEBIT' end,
    abs(p_amount), v_target_wallet.balance, v_target_wallet.balance + p_amount
  );

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'new_balance', v_target_wallet.balance + p_amount
  );
end;
$$;
```

---

## 9. ROADMAP INTEGRASI KODE & IMPLEMENTASI SISTEM

1. **Fase 1: Registrasi Skema Basis Data & RPC (Database Layer)**
   - Jalankan migrasi `public.wallets`, `public.wallet_transactions`, `public.wallet_ledger`, dan `public.wallet_payment_tokens`.
   - Terapkan stored procedure `execute_wallet_transfer`, `execute_pos_wallet_payment`, `process_pakasir_wallet_topup`, dan `admin_adjust_wallet_balance`.
2. **Fase 2: Registrasi Rute & Navigasi Bento (Routing Layer)**
   - Daftarkan rute `/app/akun/wallet` di `src/app/pages.js`.
   - Tambahkan kartu navigasi S-Wallet pada komponen `src/app/pages/account/AccountTabs.jsx`.
   - Daftarkan subtab master S-Wallet pada konsol Superadmin `/app/paket` atau `/app/platform`.
3. **Fase 3: Pembuatan Komponen UI Dasbor S-Wallet (Frontend Layer)**
   - Buat berkas `src/app/pages/account/Wallet.jsx`:
     - Tampilan Gerbang Keamanan TOTP 2FA Step-Up Challenge (Layar Kunci 6-Digit).
     - Dasbor Saldo Utama & Kartu Bento Info Rekening.
     - Modal Top-Up Saldo terhubung langsung ke Pakasir Gateway.
     - Modal Kirim Saldo Antar Pengguna P2P dengan verifikasi profil penerima & PIN transaksi.
     - Generator Kode Bayar Dinamis Kasir (60 detik).
     - Tabel Mutasi Buku Besar & Resi Digital siap cetak.
4. **Fase 4: Pembuatan Konsol Master Superadmin / Dev (Overpower Control Center)**
   - Buat komponen `src/app/pages/superadmin/WalletMaster.jsx`:
     - Radar Total Likuiditas Platform vs Saldo Gateway Pakasir.
     - Tabel Omni-Wallet Explorer dengan fitur 1-klik Freeze/Unfreeze dan Emergency Balance Correction.
     - Streaming ticker transaksi real-time seluruh tenant.
5. **Fase 5: Integrasi Modul Kasir POS & Pembelanjaan Website (Ecosystem Layer)**
   - Tambahkan tombol opsi pembayaran *"S-Wallet"* di `src/app/pages/ops/Pos.jsx`.
   - Sambungkan checkout pesanan online portal member `/m` dengan pemotongan saldo S-Wallet.
6. **Fase 6: Validasi, Audit Keamanan, & Stress Test**
   - Jalankan `npm run secret:scan` dan unit testing `npm test`.
   - Uji simulasi transfer antar peran akun demo dan pengetesan anti-fraud di kasir.
