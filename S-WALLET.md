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
|   Saldo Aktif: {rupiah(wallet.balance)}          Nomor Rekening: {wallet.wallet_number}  [Salin] [QR]|
|   Saldo Tertahan: {rupiah(wallet.locked_balance)} Status Keamanan: [ 2FA Aktif (RFC 6238) ]      |
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

### 3.2 Fitur 2: Top-Up Saldo Instan Terintegrasi Gateway Pembayaran Digital (QRIS & Virtual Account)
Pengguna dapat mengisi ulang kantong S-Wallet mereka kapan saja dengan verifikasi otomatis tanpa perlu konfirmasi manual admin:
1. **Kanal Pembayaran Otomatis**:
   - **QRIS Dinamis Nasional**: Tampil instan di layar, dapat dipindai oleh semua aplikasi m-Banking (BCA, Mandiri Livin, BRImo, BNI) dan e-Wallet (GoPay, OVO, ShopeePay, DANA, LinkAja).
   - **Virtual Account 24 Jam**: Mendukung 9 bank nasional (BRI, BNI, CIMB Niaga, Maybank, Danamon, Neo Commerce, BSI, Muamalat, OCBC) dengan verifikasi otomatis 24/7.
   - **Payment Link**: Pembayaran kartu debit atau tautan *checkout* instan.
2. **Kalkulator Nominal Cepat**: Pilihan nominal instan (Rp 50rb, Rp 100rb, Rp 250rb, Rp 500rb, Rp 1jt, Rp 2,5jt) atau bebas input nominal kustom (minimal Rp 10.000).
3. **Penyelesaian Otomatis (< 2 Detik)**: Begitu pembayaran selesai di gateway bank, webhook serverless (`/api/webhook/pakasir`) secara otomatis memicu stored procedure `process_wallet_topup` untuk mengkreditkan saldo ke S-Wallet pengguna secara *real-time*.

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
  - Mengisi saldo (*Top-Up*) mandiri melalui QRIS Dinamis dan Virtual Account di portal pelanggan `/m`.
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
[ Owner Merchant ] --(Alokasi Kas Operasional Cabang)--> [ General Manager (GM) ]
                                                                     |
                                                       (Kas Awal Shift Kasir)
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
[ Owner Merchant ] --(1-Klik Payroll Massal: sum(take_home_pay))--> [ Terdistribusi ke S-Wallet Staf ]

2. Alur Kas Bon Darurat Staf:
[ Staf / Kasir ] --(Ajukan Nominal Kas Bon)--> [ GM: Verifikasi Sisa Limit Gaji ]
                                                         |
                                                  (Rekomendasikan)
                                                         v
[ Staf: Saldo S-Wallet Bertambah ] <--(Disetujui & Dicairkan Langsung)-- [ Owner Merchant ]
```

### 5.4 Alur 4: Pembatalan Pesanan Kasir (Anti-Fake Void Auto-Refund)
```
[ Kasir Ajukan Void Nota ] ---> [ GM Masukkan PIN Otorisasi Supervisor ]
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
|   Total Saldo Beredar : {sum(wallets.balance)}      Cadangan Riil Pakasir : {gateway.balance}        |
|   Selisih Moneter     : Rp 0 (100% Klop: Delta Saldo = Debit - Kredit = 0)                           |
|   Breakdown Saldo Peran:                                                                             |
|   - Dompet Owner  : {sum(owner.balance)}            - Dompet GM     : {sum(gm.balance)}              |
|   - Dompet Staf   : {sum(staff.balance)}            - Dompet Dokter : {sum(dokter.balance)}          |
|   - Dompet Member : {sum(member.balance)}           - Brankas Platform: {sum(platform.revenue)}      |
+------------------------------------------------------------------------------------------------------+
| [ TOMBOL DARURAT & CIRCUIT BREAKER ]                                                                 |
|   [!] GLOBAL CIRCUIT BREAKER: [ NORMAL / BERJALAN ]  (Klik untuk bekukan transfer platform darurat)  |
|   [ Radar Deteksi Anomali AI: AKTIF (0 Ancaman Terdeteksi) ]     [ Rekonsiliasi Gateway Real-Time ]  |
+------------------------------------------------------------------------------------------------------+
| [ TABEL MONITORING OMNI-WALLET & SEARCH ]                                                            |
|   Cari Dompet Pengguna: [ Masukkan Nama / Email / No SW / Tenant... ]       Filter: [ Semua Role v ] |
|   -------------------------------------------------------------------------------------------------  |
|   Nomor Rekening   Nama Pengguna       Role       Tenant          Saldo Aktif      Status    Aksi    |
|   {wallet_number}  {profile.full_name} {role}     {tenant.name}   {rupiah(balance)} Normal    [Kelola]|
+------------------------------------------------------------------------------------------------------+
| [ LIVE ACTIVITY FEED - TRANSAKSI REAL-TIME DETIK DEMI DETIK ]                                       |
|   {timestamp} - {txn.reference_no}: {sender.name} ({role}) -> {receiver.name} [{cat}] -> {amount}   |
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

## 9. PANDUAN EKSEKUSI BERTAHAP IMPLEMENTASI PRODUKSI (FASE 1 HINGGA FASE 6)

Untuk memastikan implementasi berjalan sistematis, aman, teruji, dan tanpa menimbulkan tumpang tindih logika, seluruh pekerjaan dibagi menjadi **6 Fase Berjenjang**:

```
[ FASE 1: Basis Data & RPC Atomik ]
                 |
                 v
[ FASE 2: Routing, RBAC & Bento Dock ]
                 |
                 v
[ FASE 3: Frontend S-Wallet & 2FA Gate ]
                 |
                 v
[ FASE 4: Superadmin Command Center & Profit Engine ]
                 |
                 v
[ FASE 5: Ekosistem Touchpoints Integrasi (8 Modul) ]
                 |
                 v
[ FASE 6: Audit Keamanan, Stress Test & Produksi ]
```

---

### 9.1 FASE 1: REGISTRASI SKEMA BASIS DATA & STORED PROCEDURES ATOMIK (DATABASE LAYER)
* **Tujuan**: Membangun fondasi moneter perbankan yang kokoh, atomik, anti-cheat, dan anti-minus pada level PostgreSQL.
* **Berkas Target**: `supabase/migrations/20261020_swallet_core.sql`
* **Logika yang Ditegakkan**:
  1. Tabel `public.wallets`: Rekening dompet per pengguna dengan kolom `balance`, `locked_balance`, `wallet_number` (format `SW-YYYYMM-XXXXXXXX`), `is_frozen`.
  2. Database Invariant Constraints: `CHECK (balance >= 0)` dan `CHECK (locked_balance >= 0)`.
  3. Tabel `public.wallet_transactions`: Riwayat transaksi keuangan dengan `reference_no` dan `idempotency_key` unik (mencegah *network retry duplicate*).
  4. Tabel `public.wallet_ledger`: Pembukuan berpasangan (*double-entry bookkeeping*) mencatat `balance_before` dan `balance_after` untuk setiap mutasi debit/kredit.
  5. Tabel `public.wallet_payment_tokens`: Penyimpanan token pembayaran dinamis kasir POS (6 digit, masa kedaluwarsa 60 detik, satu kali pakai).
  6. Tabel `public.wallet_withdrawals`: Antrean penarikan dana ke rekening bank beserta pencatatan split biaya pokok Pakasir dan margin keuntungan platform.
  7. Tabel `public.wallet_platform_settings`: Konfigurasi tarif penarikan otomatis per tier dan margin profit yang dapat diubah oleh Superadmin.
  8. Stored Procedures Atomik dengan Penguncian Baris (`SELECT ... FOR UPDATE`):
     - `execute_wallet_transfer`: Pemindahan saldo antar pengguna P2P.
     - `execute_pos_wallet_payment`: Validasi kode bayar 60 detik kasir POS dan transfer dana ke dompet toko.
     - `request_wallet_withdrawal`: Isolasi saldo dari `balance` ke `locked_balance` dengan validasi jam kerja (Senin-Sabtu 09.00-16.00 WIB).
     - `execute_approved_payout`: Pemotongan permanen `locked_balance` dan kredit otomatis profit platform ke dompet Superadmin `SW-PLATFORM-REVENUE`.
     - `admin_adjust_wallet_balance`: Intervensi saldo darurat oleh Superadmin dengan berita acara audit resmi.
* **Kriteria Selesai (Definition of Done)**: Skrip migrasi tervalidasi sintaks SQL-nya, constraint anti-minus terpasang, dan stored procedures siap dieksekusi via RPC Supabase.

---

### 9.2 FASE 2: REGISTRASI RUTE, RBAC GUARD & NAVIGASI BENTO DOCK (ROUTING LAYER)
* **Tujuan**: Mendaftarkan jalur navigasi pengguna dan hak akses peran berstandar RBAC Tijarah OS.
* **Berkas Target**:
  - `src/app/pages.js`
  - `src/app/pages/account/AccountTabs.jsx`
  - `src/member/MemberShell.jsx`
  - `src/app/pages/superadmin/Plans.jsx`
* **Logika yang Ditegakkan**:
  1. Daftarkan rute `/app/akun/wallet` di `src/app/pages.js` dengan guard yang mengizinkan seluruh pengguna berotentikasi (Superadmin L0, Owner L1, GM L2, Staf L3, Dokter L4).
  2. Tambahkan kartu navigasi bento ke-8 pada dock akun di `src/app/pages/account/AccountTabs.jsx` dengan ikon `fa-wallet`, warna tema `#0d9488`, judul *"S-Wallet Digital"*, dan deskripsi *"Brankas Saldo, Top-Up & Transfer"*.
  3. Daftarkan rute `/m/wallet` pada portal mandiri Member L5 di `src/member/MemberShell.jsx`.
  4. Daftarkan subtab *"S-Wallet Master Command Center"* pada konsol Superadmin di `src/app/pages/superadmin/Plans.jsx` (khusus peran Superadmin L0).
* **Kriteria Selesai (Definition of Done)**: Navigasi bento tampil elegan, rute terlindungi oleh guard RBAC, dan `npm test` lulus 100% tanpa pelanggaran matriks izin.

---

### 9.3 FASE 3: FRONTEND CORE S-WALLET & 2FA SECURITY LAYER (CLIENT & UI LAYER)
* **Tujuan**: Membangun modul klien engine dan antarmuka brankas pengguna yang modern, aman, dan intuitif.
* **Berkas Target**:
  - `src/api/swallet.js`
  - `src/app/pages/account/Wallet.jsx`
* **Logika yang Ditegakkan**:
  1. Klien API `src/api/swallet.js`:
     - Fungsi `getWalletProfile`, `verifyTotpChallenge`, `generatePaymentToken`, `executeP2PTransfer`, `requestBankWithdrawal`, `getPayoutPricingConfig`.
     - Terintegrasi dengan mesin RFC 6238 TOTP di `src/lib/totp.js` dan Pakasir Gateway di `src/api/pakasir.js`.
  2. Komponen UI `src/app/pages/account/Wallet.jsx`:
     - **Gerbang Keamanan 2FA (Step-Up Challenge)**: Jika pengguna belum membuka brankas dalam 15 menit terakhir, sistem menampilkan layar tantangan kode 6-digit OTP authenticator. Tiket sesi disimpan aman di `sessionStorage` (kedaluwarsa otomatis dalam 15 menit).
     - **Kartu Brankas Bento Dinamis**: Menampilkan saldo aktif, saldo tertahan (*locked balance*), nomor rekening unik `SW-YYYYMM-XXXXXXXX`, tombol salin, dan kode QR personal.
     - **Modal Top-Up Saldo Gateway**: Pemilihan nominal cepat atau input bebas, terhubung langsung ke gateway pembayaran digital terintegrasi (QRIS Dinamis & Virtual Account 9 bank).
     - **Modal Transfer P2P**: Validasi penerima (menampilkan kartu identitas nama, peran, dan foto untuk mencegah salah kirim) serta otorisasi PIN 6-digit.
     - **Modal Tarik Dana Bank (Withdrawal)**: Pilihan rekening bank terdaftar, validasi KYC, kalkulasi biaya admin (modal pokok + Profit Platform), pengecekan jam kerja (Senin-Sabtu 09.00-16.00 WIB), otorisasi ganda TOTP 2FA + PIN transaksi.
     - **Generator Kode Bayar Dinamis Kasir**: Tampilan hitung mundur visual 60 detik dengan tombol salin angka OTP sekali pakai.
     - **Tabel Mutasi Buku Besar**: Filter riwayat lengkap (Top-up, Belanja POS, Bagi Hasil, Transfer, Penarikan) dan tombol cetak resi digital resmi Tijarah OS.
* **Kriteria Selesai (Definition of Done)**: Seluruh aksi finansial pengguna berjalan lancar, brankas terkunci otomatis setelah 15 menit, dan tidak ada data fiktif statis.

---

### 9.4 FASE 4: SUPERADMIN COMMAND CENTER & MONETIZATION PROFIT ENGINE (GOVERNANCE LAYER)
* **Tujuan**: Memberikan kendali moneter mutlak dan instrumen monetisasi keuntungan platform bagi Superadmin/Developer.
* **Berkas Target**: `src/app/pages/superadmin/WalletMaster.jsx`
* **Logika yang Ditegakkan**:
  1. **Pengatur Tarif & Margin Keuntungan Website**:
     - Form dinamis untuk mengatur tarif penarikan pengguna pada Tier 1, Tier 2, dan Tier 3.
     - Penghitungan otomatis margin keuntungan platform: `Profit Platform = Biaya Ditagihkan ke User - Biaya Modal Pokok Pakasir`.
     - Akumulasi profit platform langsung dialirkan ke kantong `SW-PLATFORM-REVENUE`.
  2. **Radar Likuiditas Platform Terpusat**:
     - Agregat moneter real-time: `Total Saldo Sistem = Dompet Owner + Dompet GM + Dompet Staf + Dompet Dokter + Dompet Member + Brankas Revenue Platform`.
     - Validasi sinkronisasi dengan mutasi saldo masuk akun Pakasir (indikator selisih Rp 0).
  3. **Antrean Eksekusi Penarikan Dana (*Payout Processing Queue*)**:
     - Daftar permohonan penarikan dana berstatus `pending` atau `scheduled`.
     - Penanda jam kerja resmi (Senin-Sabtu 09.00-16.00 WIB).
     - Tombol aksi: `[Eksekusi Payout & Masukkan Ref Bank]` atau `[Tolak & Auto-Reversal Saldo]`.
  4. **Omni-Wallet Explorer**:
     - Pencarian menyeluruh semua dompet pengguna lintas tenant.
     - Tombol 1-klik `[Freeze / Bekukan]` untuk mengunci dompet bermasalah dan `[Unfreeze]`.
     - Tombol intervensi darurat `[Koreksi Saldo Sistem]` dengan kolom wajib berita acara audit resmi.
  5. **Global Circuit Breaker**:
     - Saklar darurat satu tombol untuk menghentikan seluruh aktivitas transfer platform seketika jika terdeteksi ancaman keamanan.
* **Kriteria Selesai (Definition of Done)**: Superadmin dapat mengubah tarif penarikan kapan saja, profit platform terhitung akurat, dan kontrol darurat berfungsi 100%.

---

### 9.5 FASE 5: INTEGRASI WORKFLOWS EKOSISTEM TIJARAH (8 TOUCHPOINTS LENGKAP)
* **Tujuan**: Menghubungkan S-Wallet ke seluruh proses bisnis toko, restoran, klinik, dan administrasi tanpa duplikasi logika.
* **Berkas Target**:
  - `src/app/pages/ops/Payment.jsx` & `Pos.jsx`: Menambahkan opsi bayar `["swallet", "S-Wallet"]` pada modal pembayaran kasir. Kasir memvalidasi 6-digit OTP dinamis pelanggan. Auto-refund seketika jika transaksi di-void (Zero Fraud Kasir).
  - `src/member/pages/Wallet.jsx` & `Order.jsx`: Dompet mandiri member portal `/m` untuk memunculkan kode bayar kasir dan belanja pesanan online 1-klik tanpa input kartu manual.
  - `src/app/pages/growth/PaymentModal.jsx`: Menambahkan kanal S-Wallet untuk pembayaran tagihan langganan SaaS (Starter, Growth, Enterprise) dan pembelian kuota token AI Copilot.
  - `src/app/pages/ops/Payroll.jsx` & `MyPay.jsx`: Tombol pencairan gaji massal (*1-Click Bulk Payroll Disbursement*) dari S-Wallet Owner ke S-Wallet staf, serta pencairan kas bon staf langsung ke dompet setelah disetujui GM/Owner.
  - `src/app/pages/clinic/Billing.jsx`: Auto-split revenue jasa medis dokter klinik (30% jasa medis dokter langsung cair detik itu juga ke dompet dokter saat tagihan tindakan odontogram lunas).
  - `src/app/pages/ops/Recon.jsx` & `Journal.jsx`: Penambahan kanal *S-Wallet Digital Settlement* pada rekonsiliasi kas kasir (selisih kas Rp 0) dan pencatatan otomatis jurnal akuntansi berpasangan berimbang.
* **Kriteria Selesai (Definition of Done)**: 8 titik sentuh integrasi berfungsi mulus menggunakan RPC yang sama tanpa ada logika perhitungan ganda.

---

### 9.6 FASE 6: VALIDASI KEAMANAN, STRESS TEST & PERSIAPAN PRODUKSI (PRODUCTION READINESS)
* **Tujuan**: Memastikan sistem 100% bebas celah keamanan, bebas kebocoran rahasia, dan siap melayani transaksi riil pengguna.
* **Prosedur Validasi**:
  1. **Pemindaian Rahasia Lingkungan**: Jalankan `npm run secret:scan` untuk memastikan tidak ada API key, token rahasia, atau kredensial yang bocor di kode sumber.
  2. **Pengujian Unit RBAC & Integritas Matriks**: Jalankan `npm test` untuk memverifikasi seluruh pembatas peran RBAC tetap patuh pada matriks resmi 20 fitur x 5 peran.
  3. **Uji Konkurensi & Anti-Cheat (Race Condition Simulation)**: Menjalankan skrip simulasi multi-request penarikan dan transfer serentak untuk membuktikan bahwa database lock `FOR UPDATE` berhasil menggagalkan upaya *double-spending*.
  4. **Uji Alur Jam Kerja Penarikan**: Menguji pengajuan penarikan pada jam operasional (09.00-16.00 WIB) vs di luar jam operasional (masuk antrean terjadwal).
  5. **Verifikasi Struk POS & Jurnal Akuntansi**: Memastikan setiap transaksi S-Wallet mencetak struk dengan nomor referensi unik dan membukukan jurnal debet-kredit yang seimbang.
* **Kriteria Selesai (Definition of Done)**: Zero warning, zero secret leak, 100% test passing, dan sistem siap diluncurkan ke lingkungan produksi (*Production Ready*).

---

## 10. INTEGRASI PENARIKAN OTOMATIS PAKASIR, ATURAN RESMI, DAN PENGATURAN TARIF & KEUNTUNGAN WEBSITE DI SUPERADMIN

### 10.1 Fakta & Aturan Resmi Penarikan Otomatis Pakasir (Berdasarkan Sistem Pakasir)
Sesuai rilis dan pengumuman resmi platform penarikan Pakasir:
1. **Definisi Penarikan Otomatis**:
   - Penarikan otomatis dilakukan di mana saldo ditransfer langsung ke rekening bank atau e-wallet pengguna melalui API pihak ketiga (disbursement network perbankan nasional).
2. **Jadwal & Waktu Pengajuan**:
   - Pengajuan penarikan otomatis dapat diajukan pada: **Senin - Sabtu, pukul 09.00 - 16.00 WIB**.
   - Pengajuan di luar jam operasional (hari Minggu atau malam hari) akan diantrekan oleh sistem dan diproses secara berurutan pada jendela jam operasional berikutnya.
3. **Struktur Biaya Pokok Admin Pakasir (Base Cost Modal)**:
   Pakasir mengenakan biaya pokok administrasi penarikan berdasarkan tingkatan (tier) nominal penarikan:
   - **Tier 1 (Rp 15.000 s/d Rp 4.999.999)**: Biaya pokok Pakasir = **Rp 3.000**
   - **Tier 2 (Rp 5.000.000 s/d Rp 9.999.999)**: Biaya pokok Pakasir = **Rp 5.000**
   - **Tier 3 (Rp 10.000.000 ke atas)**: Biaya pokok Pakasir = **Rp 7.000**

---

### 10.2 Fitur Pengaturan Tarif di Superadmin & Model Keuntungan Platform (Platform Profit Engine)

Agar pemilik platform Tijarah OS dapat memperoleh aliran pendapatan baru (*monetization revenue stream*) dari setiap aktivitas penarikan saldo, sistem S-Wallet dilengkapi dengan **Modul Pengaturan Tarif Penarikan Dinamis di Konsol Superadmin**:

```
+-------------------------------------------------------------------------------------------------------+
| SUPERADMIN: PENGATURAN BIAYA PENARIKAN DANA OTOMATIS & MARGIN KEUNTUNGAN WEBSITE                      |
+-------------------------------------------------------------------------------------------------------+
| [ FORMULA MONETISASI PENARIKAN OTOMATIS ]                                                             |
|   Biaya Dikenakan ke User = Biaya Modal Pokok Pakasir + Margin Keuntungan Bersih Platform            |
+-------------------------------------------------------------------------------------------------------+
| TIER NOMINAL PENARIKAN      | BIAYA POKOK PAKASIR | MARGIN PROFIT PLATFORM | BIAYA DITAMPILKAN KE USER |
| --------------------------- | ------------------- | ---------------------- | ------------------------- |
| Tier 1: Rp 15rb - Rp 4,99jt | Rp 3.000 (Tetap)    | [ Rp 2.000 ] (Ubah)    | Rp 5.000 (Otomatis)       |
| Tier 2: Rp 5jt - Rp 9,99jt  | Rp 5.000 (Tetap)    | [ Rp 3.000 ] (Ubah)    | Rp 8.000 (Otomatis)       |
| Tier 3: Rp 10jt ke atas     | Rp 7.000 (Tetap)    | [ Rp 5.000 ] (Ubah)    | Rp 12.000 (Otomatis)      |
+-------------------------------------------------------------------------------------------------------+
| [ KONTROL OPERASIONAL ]                                                                               |
|   Status Penarikan Otomatis Platform : [ AKTIF / DIIZINKAN ]                                          |
|   Mode Jam Operasional               : [ IKUTI JADWAL PAKASIR (Senin-Sabtu 09.00 - 16.00 WIB) ]       |
|   Tindakan di Luar Jam Operasional   : [ TAMPUNG DI ANTREAN TERJADWAL & BERI NOTIFIKASI ]             |
|   Rekening Penampung Profit Platform : SW-PLATFORM-REVENUE (Superadmin Master Wallet)                 |
|                                                                                                       |
|   [ SIMPAN KONFIGURASI TARIF ]               [ RESET KE TARIF DEFAULT ]                               |
+-------------------------------------------------------------------------------------------------------+
```

#### Mekanisme Pembagian Dana (*Split Allocation*) Saat Penarikan Dieksekusi:
Misalkan seorang Dokter atau Owner Merchant menarik dana sebesar Rp 2.000.000 (Tier 1):
1. **Total Saldo yang Dipotong dari Dompet Pengguna**:
   - Nominal Penarikan: Rp 2.000.000
   - Biaya Admin Pengguna: Rp 5.000
   - Total Terpotong: **Rp 2.005.000**
2. **Penyaluran Finansial Real-Time**:
   - Dana Ditransfer ke Rekening Bank Pengguna: **Rp 2.000.000** (Utuh)
   - Biaya Pokok Dibayarkan ke Gateway Pakasir: **Rp 3.000** (Via API Pihak Ketiga)
   - Margin Keuntungan Website: **Rp 2.000** langsung otomatis masuk ke kantong `SW-PLATFORM-REVENUE` milik Superadmin platform.
3. **Pencatatan Buku Besar Ganda Akuntansi**:
   - Debit: `2105 - Utang Saldo Dompet Digital Pengguna` sebesar Rp 2.005.000
   - Kredit: `1101 - Kas/Bank Penampung Platform` sebesar Rp 2.003.000 (Rp 2jt ke user + Rp 3rb ke Pakasir)
   - Kredit: `4201 - Pendapatan Administrasi Penarikan Platform` sebesar Rp 2.000 (Keuntungan Bersih Website)

---

### 10.3 Manajemen Jam Operasional & Antrean Cerdas (*Smart Queue Window*)
1. **Pengecekan Waktu Nyata Berbasis Zona Waktu Indonesia Barat (WIB)**:
   - Sistem membaca jam server saat permintaan penarikan dikirim.
   - **Kondisi A (Di Dalam Jam Operasional: Senin - Sabtu, 09.00 - 16.00 WIB)**:
     - Permintaan langsung diteruskan ke API penarikan otomatis pihak ketiga.
     - Status transaksi langsung berubah menjadi `processing` dan berhasil dalam hitungan menit (*Instant Real-Time Payout*).
   - **Kondisi B (Di Luar Jam Operasional: Hari Minggu, Hari Libur Tertentu, atau Pukul 16.01 - 08.59 WIB)**:
     - Sistem memunculkan banner informatif transparan di modal penarikan:
       *"Pengajuan penarikan di luar jam operasional resmi (Senin - Sabtu, 09.00 - 16.00 WIB). Saldo Anda telah diamankan dan transaksi akan diproses otomatis saat jam operasional buka kembali pada hari kerja berikutnya pukul 09.00 WIB."*
     - Saldo pengguna langsung dipindahkan secara atomik ke `locked_balance` agar tidak dapat dibelanjakan ganda.
     - Tiket masuk ke status `scheduled_in_queue`.
     - *Cron Job* / Scheduler platform otomatis memicu eksekusi antrean tepat pada pukul 09.05 WIB di hari kerja berikutnya.

---

### 10.4 Arsitektur Safety-First Anti-Cheat & Anti-Hack Penarikan Saldo

Untuk menjamin agar pengguna tidak dapat melakukan kecurangan (*cheat*), manipulasi angka saldo (*balance hacking*), maupun eksploitasi celah jaringan (*network race attack*), sistem menerapkan 8 benteng perlindungan:

1. **Row-Level Database Locking (`SELECT ... FOR UPDATE`)**:
   - Setiap kali terjadi penarikan dana, baris rekening pengguna di tabel `public.wallets` dikunci seketika dalam transaksi atomik PostgreSQL.
   - Jika pengguna sengaja membuka 10 tab peramban sekaligus atau menjalankan bot multi-thread untuk menekan tombol tarik dana serentak, transaksi ke-2 hingga ke-10 akan antre secara serial dan langsung digagalkan karena saldo telah dipindahkan ke `locked_balance` pada milidetik pertama.
2. **Integritas Kendala Tingkat Basis Data (Database Invariant Constraints)**:
   - Kolom `balance` dan `locked_balance` dilindungi oleh constraint ketat di level PostgreSQL:
     ```sql
     check (balance >= 0)
     check (locked_balance >= 0)
     ```
   - Tidak ada celah bagi injeksi API, script peretas, atau modifikasi DevTools untuk membuat saldo pengguna menjadi minus. Setiap mutasi yang melanggar ketentuan matematis ini akan otomatis di-*rollback* oleh database engine.
3. **Pemisahan Saldo Terisolasi (Escrow Isolation Model)**:
   - Begitu permohonan penarikan diajukan, nominal tersebut langsung ditarik dari `balance` aktif dan diamankan di brankas `locked_balance`.
   - Pengguna tidak dapat membelanjakan atau mentransfer nominal yang sedang dalam proses penarikan.
4. **Idempotency Key Unik (UUID v4 Enforcement)**:
   - Setiap pengajuan penarikan dana wajib mengikutsertakan header `idempotency_key`. Jika jaringan internet pengguna mengalami *timeout* dan melakukan pengiriman ulang (*network retry*), basis data menolak duplikasi transaksi berkat indeks unik `unique(idempotency_key)`.
5. **Verifikasi Identitas Rekening Bank (AML & KYC Whitelist)**:
   - Pengguna hanya diperbolehkan menarik dana ke rekening bank yang nama pemiliknya telah terverifikasi cocok dengan nama resmi profil pengguna.
   - Hal ini mencegah pelaku peretasan akun mengalihkan dana ke rekening pihak ketiga atau rekening penampung anonim.
6. **Limit Nominal Penarikan Harian & Jeda Waktu Pengamanan (Cooling-off Period)**:
   - Limit penarikan default dibatasi maksimal Rp 25.000.000 per hari per akun (dapat disesuaikan oleh Superadmin).
   - Diterapkan jeda waktu minimal 15 menit antara satu pengajuan penarikan dengan pengajuan berikutnya pada akun yang sama guna mencegah pengurasan saldo kilat.
7. **Jejak Audit Buku Besar Abadi (Immutable Double-Entry Ledger)**:
   - Tidak ada mutasi yang dapat dihapus (`No DELETE operations allowed`).
   - Setiap pergerakan saldo mencatat saldo awal (`balance_before`) dan saldo akhir (`balance_after`) yang wajib klop dengan selisih mutasi.
8. **Circuit Breaker Darurat di Superadmin**:
   - Jika sistem mendeteksi lonjakan penarikan tidak wajar atau anomali saldo, Superadmin dapat mengaktifkan *Circuit Breaker* global dalam 1-klik untuk membekukan semua penarikan platform sementara waktu.

---

## 11. AUDIT MENYELURUH WORKSPACE: 8 FITUR INTEGRASI WORKFLOWS LENGKAP TANPA LOGIC DUPLICATE

Berdasarkan audit komprehensif terhadap seluruh file halaman, routing, RBAC, dan komponen sistem di workspace Tijarah OS, berikut adalah pemetaan 8 fitur terpadu yang wajib ditambahkan untuk melengkapi ekosistem kerja S-Wallet tanpa ada satupun duplikasi logika (*zero logic duplicate*):

```
+-------------------------------------------------------------------------------------------------------+
| PETA 8 TOUCHPOINTS INTEGRASI WORKFLOWS S-WALLET DI SELURUH WORKSPACE TIJARAH OS                       |
+-------------------------------------------------------------------------------------------------------+
| No | Modul / Lokasi File                | Fitur yang Ditambahkan            | Prinsip Anti-Duplikasi Logika |
+----+------------------------------------+-----------------------------------+-------------------------------+
| 1  | src/app/pages/account/Wallet.jsx   | Dasbor Brankas & 2FA Gate         | Menggunakan totp.js eksisting |
| 2  | src/app/pages/ops/Payment.jsx      | Opsi Bayar Kasir POS (swallet)    | Memakai pay_order via token   |
| 3  | src/member/pages/ (Portal /m)      | Member S-Wallet & 1-Klik Checkout | Reuse demoMemberOrder schema  |
| 4  | src/app/pages/superadmin/Plans.jsx | S-Wallet Master Command Center    | Sentralisasi audit likuiditas |
| 5  | src/app/pages/growth/PaymentModal  | Bayar Langganan SaaS via Saldo    | Reuse gateway state machine   |
| 6  | src/app/pages/ops/Payroll.jsx      | 1-Click Bulk Payroll Disbursement | Terhubung ke slip gaji MyPay  |
| 7  | src/app/pages/clinic/Billing.jsx   | Auto-Split Revenue Jasa Medis     | Eksekusi paralel saat lunas   |
| 8  | src/app/pages/ops/Recon.jsx        | Rekon Shift Kasir & Jurnal Ganda  | Jurnal otomatis berpasangan   |
+-------------------------------------------------------------------------------------------------------+
```

---

### 11.1 Touchpoint 1: Dasbor S-Wallet Akun Pengguna (`src/app/pages/account/Wallet.jsx`)
- **Status Saat Ini**: Berkas belum ada, navigasi bento di [AccountTabs.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/account/AccountTabs.jsx) baru memiliki 7 kartu navigasi.
- **Fitur yang Wajib Ditambahkan**:
  1. Komponen `src/app/pages/account/Wallet.jsx` dengan antarmuka Bento Grid modern dan palet tema Tijarah OS.
  2. Gerbang Otentikasi Dinamis TOTP 2FA:
     - Jika status 2FA belum aktif di profil, arahkan pengguna ke tab Keamanan dengan banner panduan.
     - Jika status 2FA sudah aktif, tampilkan modal input 6-digit kode OTP authenticator untuk menerbitkan tiket sesi brankas (berlaku 15 menit).
  3. Kartu Brankas Utama (Saldo Aktif, Saldo Tertahan, Nomor Rekening `SW-YYYYMM-XXXXXXXX`, Tombol Salin & Tampilkan QR).
  4. Modal Aksi Cepat:
     - **Top-Up Saldo Gateway**: Terhubung langsung ke gateway pembayaran digital terintegrasi (QRIS & Virtual Account).
     - **Transfer Antar Pengguna P2P**: Pencarian penerima berbasis email/no rekening, kartu preview foto & peran penerima, dan konfirmasi PIN transaksi 6-digit.
     - **Tarik Dana ke Bank (Withdrawal)**: Pilihan rekening bank terdaftar, validasi nama KYC, kalkulasi biaya admin (modal pokok + Profit Platform), pengecekan jam operasional (09.00-16.00 WIB), otorisasi TOTP + PIN, dan saldo masuk ke status *Escrow Hold*.
     - **Tampilkan Kode Bayar Kasir (Dynamic OTP 60s)**: Hitung mundur visual 60 detik dengan tombol salin cepat.
  5. Tabel Mutasi Buku Besar Lengkap & Cetak Resi Digital PDF/Thermal.
- **Integrasi Tanpa Duplikasi**:
  - Memanfaatkan fungsi verifikasi TOTP dari [src/lib/totp.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/lib/totp.js) yang sudah ada tanpa menulis ulang logika RFC 6238.
  - Memanfaatkan `getPakasirConfig()` dan `createPakasirTransaction()` dari [src/api/pakasir.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/api/pakasir.js) untuk kanal Top-Up.
  - Mendaftarkan rute di [src/app/pages.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages.js) dan kartu bento ke-8 di [src/app/pages/account/AccountTabs.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/account/AccountTabs.jsx).

---

### 11.2 Touchpoint 2: Kasir POS Non-Tunai Zero-Fraud (`src/app/pages/ops/Payment.jsx` & `Pos.jsx`)
- **Status Saat Ini**: Pilihan metode pembayaran kasir hanya `["cash", "Tunai"]`, `["card", "Kartu"]`, `["qris", "QRIS"]`, `["ewallet", "E-wallet"]`. Kasir rawan penggelapan uang tunai (*cash skimming*) dan manipulasi pembatalan nota (*fake void*).
- **Fitur yang Wajib Ditambahkan**:
  1. Menambahkan opsi metode bayar `["swallet", "S-Wallet"]` pada daftar `METHODS`.
  2. Saat metode S-Wallet dipilih:
     - Tampilkan kolom input khusus: *"Masukkan 6-Digit Kode Bayar S-Wallet Pelanggan"*.
     - Tombol cepat *"Verifikasi & Debet Saldo"*.
     - Sistem memvalidasi token ke basis data: memeriksa apakah token cocok, belum pernah digunakan, dan belum kadaluarsa (< 60 detik).
     - Saldo berpindah seketika dari dompet member ke dompet merchant/owner.
  3. Proteksi Pembatalan Nota (*Anti-Fake Void Protection*):
     - Jika transaksi berstatus S-Wallet dibatalkan atau di-void oleh kasir, sistem secara otomatis mengeksekusi pengembalian dana (*refund*) digital langsung ke saldo S-Wallet pelanggan.
     - Kasir tidak menerima maupun memegang uang tunai kembalian, memusnahkan 100% peluang penggelapan kas toko.
- **Integrasi Tanpa Duplikasi**:
  - Tidak membuat form kasir baru. S-Wallet langsung memanfaatkan alur pembayaran modal kasir `PaymentModal` di [src/app/pages/ops/Payment.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payment.jsx) dengan menambahkan baris pembayaran `{ method: "swallet", reference: tokenCode }` ke parameter `pay_order`.
  - Struk kasir, perhitungan diskon voucher, dan kalkulasi pajak restoran/klinik tetap berjalan melalui mesin kalkulasi pajak standar yang sudah teruji di [src/lib/tax.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/lib/tax.js).

---

### 11.3 Touchpoint 3: Belanja Mandiri di Member Portal (`/m/wallet` & `/m/pesan`)
- **Status Saat Ini**: Pelanggan di portal member `/m` (terisolasi di `src/member/MemberShell.jsx`) hanya memiliki menu Beranda, Pesan, Reservasi, Kartu, Riwayat, dan Profil. Belum ada dompet mandiri terintegrasi.
- **Fitur yang Wajib Ditambahkan**:
  1. Menambahkan tab navigasi `["/m/wallet", "S-Wallet", MemberWallet]` pada `MemberShell.jsx`.
  2. Halaman dompet pelanggan yang ramah ponsel pintar (*mobile-optimized*):
     - Menampilkan saldo belanja aktif dan poin loyalty reward.
     - Tombol besar: *"Tampilkan Kode Bayar Kasir"* (menghasilkan angka 6 digit dengan timer melingkar 60 detik saat pelanggan antre di depan kasir toko).
     - Tombol *"Isi Saldo Mandiri"* via QRIS Dinamis Nasional langsung di layar ponsel.
     - Fitur *"Kirim Saldo ke Teman"* (patungan belanja / *split bill*).
  3. Pembayaran 1-Klik pada Checkout Pesanan Mandiri di `/m/pesan`:
     - Pelanggan dapat memilih *"Bayar dengan S-Wallet (Saldo Cukup)"*.
     - Pemotongan saldo terjadi detik itu juga dan pesanan langsung masuk ke antrean dapur tanpa perlu verifikasi nota transfer manual.
- **Integrasi Tanpa Duplikasi**:
  - Menggunakan API pesanan yang sama di [src/api/demoMemberOrder.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/api/demoMemberOrder.js) dengan menambahkan tanda pelunasan langsung melalui saldo member.

---

### 11.4 Touchpoint 4: Superadmin God-Mode Financial Command Center (`src/app/pages/superadmin/Plans.jsx`)
- **Status Saat Ini**: Konsol Superadmin di [Plans.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/superadmin/Plans.jsx) hanya menampilkan daftar paket langganan dan kuota tenant. Belum ada pengawasan moneter terpusat.
- **Fitur yang Wajib Ditambahkan**:
  1. Subtab baru **"S-Wallet Master Command Center"** pada panel Superadmin.
  2. **Pengatur Tarif & Margin Keuntungan Penarikan Website**:
     - Form konfigurasi margin profit platform per tingkatan tier (Tier 1, 2, 3).
     - Monitoring total pendapatan platform dari akumulasi potongan fee penarikan.
  3. **Radar Likuiditas Platform Terpusat**:
     - Agregat saldo seluruh akun di platform: `Total Saldo Sistem = Dompet Owner + Dompet GM + Dompet Staf + Dompet Dokter + Dompet Member + Brankas Revenue Platform`.
     - Sinkronisasi dengan mutasi akun penampung Pakasir.
  4. **Antrean Persetujuan & Eksekusi Penarikan Dana (*Pending Payout Approvals & Execution*)**:
     - Tabel daftar permohonan penarikan dana ke rekening bank dari Owner, Dokter, maupun Member.
     - Status jam kerja (09.00 - 16.00 WIB) dan tombol eksekusi via gateway / transfer manual.
     - Tombol aksi: `[Eksekusi Payout & Masukkan Ref Bank]` atau `[Tolak & Kembalikan Saldo]`.
  5. **Omni-Wallet Explorer**:
     - Pencarian cepat seluruh dompet berdasarkan nama akun, email, nomor rekening `SW-XXXX`, atau tenant.
     - Tombol darurat: `[Bekukan Dompet (Freeze)]` dan `[Aktifkan Kembali (Unfreeze)]`.
     - Tombol koreksi saldo sistemik (*Balance Adjustment*) dengan modal isian berita acara audit.
  6. **Circuit Breaker Saklar Darurat Platform**:
     - Saklar pemutus sirkuit moneter darurat untuk mengunci transaksi keluar seluruh sistem dalam hitungan milidetik jika terdeteksi ancaman siber.
- **Integrasi Tanpa Duplikasi**:
  - Menempatkan antarmuka ini sebagai subtab organik di dalam tab platform Superadmin yang sudah memiliki rute guard L0 di [src/app/pages.js](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages.js).

---

### 11.5 Touchpoint 5: Pembayaran Langganan SaaS & Kuota Copilot AI (`src/app/pages/growth/PaymentModal.jsx`)
- **Status Saat Ini**: Modal pembayaran perpanjangan paket Tijarah OS di [PaymentModal.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/growth/PaymentModal.jsx) saat ini hanya mendukung saluran Pakasir (QRIS, VA Bank).
- **Fitur yang Wajib Ditambahkan**:
  1. Menambahkan kanal pembayaran **"S-Wallet Merchant"** pada daftar pilihan metode di modal tagihan langganan.
  2. Jika saldo S-Wallet Owner mencukupi untuk membayar tagihan (misal Rp 2.500.000):
     - Tampilkan kartu hijau konfirmasi: *"Saldo S-Wallet Anda: Rp 12.850.000 (Cukup)"*.
     - Tombol 1-klik: *"Bayar Sekarang Menggunakan Saldo S-Wallet"*.
     - Masukkan PIN Transaksi 6-Digit Owner untuk eksekusi pelunasan seketika.
  3. Status langganan tenant langsung diperpanjang otomatis detik itu juga tanpa perlu menunggu verifikasi transfer bank.
- **Integrasi Tanpa Duplikasi**:
  - Menggunakan komponen `PaymentModal` yang sudah ada, hanya menambahkan kanal `swallet` ke dalam seleksi metode pembayaran yang memicu RPC pelunasan langganan.

---

### 11.6 Touchpoint 6: Penggajian Karyawan & Kas Bon Terintegrasi (`src/app/pages/ops/Payroll.jsx` & `MyPay.jsx`)
- **Status Saat Ini**: Modul penggajian menghitung komponen gaji, lembur, dan absensi di [Payroll.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payroll.jsx), serta menampilkan slip gaji di [MyPay.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/MyPay.jsx), tetapi proses transfer gaji masih dilakukan manual di luar aplikasi.
- **Fitur yang Wajib Ditambahkan**:
  1. Tombol Aksi Massal di Payroll Owner: **"Cairkan Gaji ke S-Wallet Seluruh Karyawan (1-Click Bulk Payroll)"**.
  2. Saat tombol ditekan:
     - Sistem memvalidasi saldo S-Wallet Owner mencukupi total nominal payroll bersih (misal Rp 45.000.000).
     - Owner memasukkan PIN Transaksi dan kode OTP 2FA.
     - Dalam satu transaksi database atomik berpasangan, saldo Owner dipotong Rp 45.000.000 dan dikreditkan langsung ke masing-masing kantong S-Wallet karyawan sesuai nilai *take-home pay* di slip gaji mereka.
  3. Saldo karyawan langsung bertambah seketika, dan karyawan menerima notifikasi pembayaran gaji di halaman profil mereka.
  4. Pengajuan Kas Bon Staf:
     - Karyawan dapat mengajukan kas bon di [MyPay.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/MyPay.jsx).
     - Setelah disetujui GM dan Owner di [src/app/pages/owner/Approvals.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/owner/Approvals.jsx), dana kas bon langsung cair ke S-Wallet karyawan detik itu juga.
- **Integrasi Tanpa Duplikasi**:
  - Tidak merombak rumus perhitungan gaji karyawan di [Payroll.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Payroll.jsx); S-Wallet hanya bertindak sebagai mekanisme penyelesaian (*settlement rail*) pembayaran akhir.

---

### 11.7 Touchpoint 7: Automated Split Revenue Dokter & Tenaga Medis (`src/app/pages/clinic/Billing.jsx`)
- **Status Saat Ini**: Modul kasir klinik di [Billing.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/clinic/Billing.jsx) mencatat invoice tindakan dokter dan penjualan obat apotek, namun rekapitulasi jasa medis dokter dilakukan secara manual di akhir bulan.
- **Fitur yang Wajib Ditambahkan**:
  1. Saat tagihan pasien klinik dinyatakan lunas di kasir klinik (baik bayar via S-Wallet, QRIS, atau Kartu):
     - Sistem secara otomatis menghitung porsi bagi hasil jasa medis dokter sesuai persentase yang disepakati (misal 30% dari biaya tindakan odontogram/cabut gigi).
     - Sistem memicu stored procedure pembagian hasil: 70% masuk ke rekening S-Wallet klinik/owner, dan 30% langsung dikreditkan detik itu juga ke rekening S-Wallet pribadi dokter yang menangani.
  2. Dokter yang bertugas dapat langsung melihat komisi tindakan masuk di dasbor S-Wallet mereka tanpa harus menunggu staf keuangan membuat laporan bulanan.
- **Integrasi Tanpa Duplikasi**:
  - Pengait (*hook*) bagi hasil dipasang pada fungsi penutupan billing klinik di [Billing.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/clinic/Billing.jsx), memanfaatkan data `doctor_id` yang sudah tercatat pada rekam medis pasien.

---

### 11.8 Touchpoint 8: Rekonsiliasi Kas Bersih & Jurnal Akuntansi Berpasangan (`src/app/pages/ops/Recon.jsx` & `Journal.jsx`)
- **Status Saat Ini**: Tabel rekonsiliasi kasir di [Recon.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Recon.jsx) memverifikasi penerimaan uang tunai dan QRIS bank.
- **Fitur yang Wajib Ditambahkan**:
  1. Penambahan kanal **"S-Wallet Digital Settlement"** pada tabel rekonsiliasi kas kasir dan penutupan shift kasir di [src/app/pages/ops/Shift.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Shift.jsx).
  2. Karena seluruh transaksi S-Wallet tercatat secara digital dengan presisi kriptografis, kolom selisih kas (*cash discrepancy*) untuk metode S-Wallet selalu dijamin **Rp 0 (100% Klop)**.
  3. Pemetaan Otomatis ke Jurnal Umum Akuntansi (`src/app/pages/ops/Journal.jsx`):
     - **Saat Pengguna Top-Up S-Wallet**:
       - Debit: `1102 - Kas Penampung Gateway Pakasir`
       - Kredit: `2105 - Utang Saldo Dompet Digital Pengguna (S-Wallet Reserve)`
     - **Saat Pelanggan Belanja di Kasir POS**:
       - Debit: `2105 - Utang Saldo Dompet Digital Pengguna`
       - Kredit: `4101 - Pendapatan Penjualan Merchant`
     - **Saat Bagi Hasil Jasa Medis Dokter**:
       - Debit: `5102 - Beban Jasa Medis Dokter`
       - Kredit: `2106 - Utang Saldo Dompet Digital Dokter`
     - **Saat Penarikan Dana (Withdrawal) ke Rekening Bank**:
       - Debit: `2105 - Utang Saldo Dompet Digital Pengguna` (sebesar total ditarik + fee)
       - Kredit: `1101 - Kas di Bank Platform / Gateway` (sebesar nominal ditarik + modal Pakasir)
       - Kredit: `4201 - Pendapatan Administrasi Penarikan Platform` (margin keuntungan website)
- **Integrasi Tanpa Duplikasi**:
  - Jurnal diposting langsung menggunakan format standar entri jurnal yang telah digunakan di [Journal.jsx](file:///Users/m.aksaarsyad/Downloads/TIJARAH%202/src/app/pages/ops/Journal.jsx), menjaga keseimbangan neraca keuangan dan laba rugi bisnis tanpa membuat buku kas terpisah.

---

## 12. STRUKTUR FOLDER, BERKAS, & ARSITEKTUR KODE WORKSPACE LENGKAP (PRODUCTION-READY ARCHITECTURE)

Berikut adalah cetak biru susunan direktori dan berkas lengkap di dalam workspace `TIJARAH 2` yang mencakup implementasi S-Wallet secara modular, aman, dan siap produksi:

```
TIJARAH 2/
├── S-WALLET.MD                                # Spesifikasi Master Arsitektur S-Wallet
├── .env.local                                 # Kredensial Lingkungan Aman (Tervalidasi Nol Kebocoran)
│
├── supabase/
│   └── migrations/
│       └── 20261020_swallet_core.sql          # Migrasi DDL: wallets, transactions, ledger, tokens, withdrawals, settings
│
├── api/
│   ├── pakasir/
│   │   ├── fee.js                             # Kalkulator Fee Gateway Pakasir (Serverless Handler)
│   │   └── payout.js                          # Endpoint Payout Otomatis Pakasir (Disbursement Proxy)
│   └── webhook/
│       ├── pakasir.js                         # Webhook Resmi Penerimaan Dana Inbound (Top-Up S-Wallet)
│       └── pakasir-payout.js                  # Webhook Callback Notifikasi Status Penarikan Bank
│
├── src/
│   ├── api/
│   │   ├── pakasir.js                         # Klien Gateway Pakasir Inbound (API v2)
│   │   └── swallet.js                         # Klien Resmi S-Wallet Engine: RPC wrapper, 2FA Challenge, Token 60s, Payout Fee & Profit Calculator
│   │
│   ├── lib/
│   │   ├── totp.js                            # Mesin RFC 6238 TOTP (Validasi Kode 6-Digit Authenticator)
│   │   ├── rbac.js                            # Pengecekan Izin Matriks Peran RBAC (can, permOf)
│   │   └── tax.js                             # Kalkulator Pajak & Diskon Kasir POS Teruji
│   │
│   ├── member/                                # Portal Mandiri Pelanggan / Member (Level L5)
│   │   ├── MemberShell.jsx                    # Navigasi Portal Member (Penambahan Tab /m/wallet)
│   │   └── pages/
│   │       ├── Wallet.jsx                     # Dasbor S-Wallet Member: Saldo, Kode Bayar 60s Kasir, Top-up QRIS
│   │       └── Order.jsx                      # Checkout Pesanan Online (Opsi Bayar 1-Klik via S-Wallet)
│   │
│   └── app/                                   # Portal Dashboard Bisnis & Operasional (Level L0 - L4)
│       ├── pages.js                           # Registrasi Rute Aplikasi (Rute /app/akun/wallet dengan RBAC Gate)
│       └── pages/
│           ├── account/                       # Modul Tata Kelola Akun & Keamanan
│           │   ├── AccountTabs.jsx            # Bento Dock 8 Kartu Navigasi (Penambahan Kartu S-Wallet)
│           │   ├── Security.jsx               # Pengaturan TOTP 2FA & PIN Transaksi 6-Digit
│           │   └── Wallet.jsx                 # Dasbor S-Wallet Akun Pengguna (2FA Gate 15m, Topup, Transfer P2P, Tarik Bank, Mutasi)
│           │
│           ├── superadmin/                    # Modul Tata Kelola Platform God-Mode (Level L0)
│           │   ├── Plans.jsx                  # Registrasi Subtab S-Wallet Master Command Center
│           │   └── WalletMaster.jsx           # Konsol Finansial Superadmin: Pengatur Tarif & Profit Margin, Radar Likuiditas, Omni-Wallet Explorer, Antrean Payout, Circuit Breaker
│           │
│           ├── ops/                           # Modul Operasional Cabang & Kasir (Level L1 - L3)
│           │   ├── Payment.jsx                # Modal Pembayaran Kasir POS (Opsi swallet, Token 60s, Anti-Fake Void)
│           │   ├── Pos.jsx                    # Layar Kasir Penjualan Utama
│           │   ├── Payroll.jsx                # 1-Click Bulk Payroll Disbursement ke S-Wallet Staf
│           │   ├── MyPay.jsx                  # Dasbor Slip Gaji Karyawan & Pengajuan Kas Bon ke S-Wallet
│           │   ├── Shift.jsx                  # Penutupan Shift Kasir & Rekonsiliasi Saldo Digital S-Wallet
│           │   ├── Recon.jsx                  # Rekonsiliasi Kasir S-Wallet Digital Settlement (Selisih Rp 0)
│           │   └── Journal.jsx                # Pencatatan Buku Besar Berpasangan Otomatis S-Wallet
│           │
│           ├── growth/                        # Modul Pertumbuhan & Bisnis Merchant (Level L1)
│           │   └── PaymentModal.jsx           # Modal Bayar Langganan SaaS & Token AI via Saldo S-Wallet
│           │
│           └── clinic/                        # Modul Layanan Kesehatan & Dokter (Level L4)
│               └── Billing.jsx                # Kasir Tindakan Medis & Auto-Split Jasa Medis Dokter 30% Real-Time
```

---

### 12.1 Penjelasan Rinci Peran Setiap Berkas Baru

1. **`src/api/swallet.js` (S-Wallet Engine Client)**:
   - Menghubungkan frontend ke database PostgreSQL / Supabase RPC.
   - Fungsi utama:
     - `getWalletProfile(userId)`: Mengambil saldo aktif, saldo terkunci, nomor rekening unik `SW-YYYYMM-XXXXXXXX`.
     - `verifyTotpChallenge(token)`: Memvalidasi 6-digit kode authenticator untuk membuka gerbang subtab S-Wallet (tiket 15 menit).
     - `generatePaymentToken(walletId)`: Menerbitkan kode bayar dinamis 6 digit berlaku 60 detik untuk transaksi di kasir POS.
     - `executeP2PTransfer({ senderWalletId, receiverIdentifier, amount, pin, notes })`: Transfer instan antar sesama pengguna Tijarah.
     - `requestBankWithdrawal({ walletId, bankCode, accountNumber, accountName, amount, pin, totpCode })`: Mengajukan penarikan dana ke rekening bank dengan kalkulasi biaya admin tier + margin profit website.
     - `getPayoutPricingConfig()`: Mengambil tarif penarikan terkini yang dikonfigurasi Superadmin.
2. **`src/app/pages/account/Wallet.jsx` (Dasbor Brankas S-Wallet)**:
   - Memiliki 2 tampilan keadaan (*state view*):
     - *State 1 (Terkunci / 2FA Gate)*: Memeriksa apakah sesi 15 menit aktif. Jika tidak, menampilkan layar tantangan 6-digit TOTP Google/Microsoft Authenticator.
     - *State 2 (Terbuka / Brankas Aktif)*: Menampilkan kartu brankas saldo bento, tombol aksi cepat (Top-up, Transfer, Tarik Bank, Kode Bayar), serta riwayat mutasi buku besar.
3. **`src/app/pages/superadmin/WalletMaster.jsx` (Command Center God-Mode Superadmin)**:
   - Form interaktif pengatur tarif biaya penarikan otomatis (Tier 1, 2, 3) dan kalkulator proyeksi keuntungan website.
   - Radar total likuiditas sistem (membandingkan total saldo seluruh dompet vs saldo akun penampung Pakasir).
   - Tabel omni-wallet explorer untuk melihat seluruh akun pengguna dari semua tenant dengan fitur 1-klik Freeze/Unfreeze dompet dan penyesuaian saldo resmi.
   - Antrean persetujuan dan riwayat eksekusi payout bank dengan penanda jam operasional (09.00 - 16.00 WIB).
   - Saklar darurat Global Circuit Breaker.
4. **`src/member/pages/Wallet.jsx` (Dompet Member Mobile-First)**:
   - Tampilan dompet ringkas dan responsif untuk pelanggan retail, restoran, dan pasien klinik.
   - Menampilkan kartu loyalitas member, saldo koin/rupiah, generator kode bayar 60 detik kasir dengan animasi lingkaran mundur (*countdown ring*), dan tombol Top-Up mandiri QRIS Dinamis Nasional.
5. **`supabase/migrations/20261020_swallet_core.sql` (Skema Basis Data Produksi)**:
   - Tabel `public.wallets`, `public.wallet_transactions`, `public.wallet_ledger`, `public.wallet_payment_tokens`, `public.wallet_withdrawals`, dan `public.wallet_platform_settings`.
   - Stored procedures atomik:
     - `execute_wallet_transfer`: Transfer P2P berpasangan dengan penguncian baris `FOR UPDATE`.
     - `execute_pos_wallet_payment`: Validasi kode bayar 60 detik kasir POS dan pemindahan saldo ke merchant.
     - `request_wallet_withdrawal`: Pemindahan saldo ke `locked_balance` dengan validasi jam operasional (09.00-16.00 WIB) dan perhitungan split margin keuntungan platform.
     - `execute_approved_payout`: Pemotongan saldo `locked_balance` permanen dan transfer profit platform ke `SW-PLATFORM-REVENUE`.
     - `admin_adjust_wallet_balance`: Intervensi darurat saldo oleh Superadmin dengan berita acara audit.

---

## 13. PETA ROUTING LENGKAP SELURUH FITUR S-WALLET & INTEGRASI WORKFLOWS

### 13.1 Kebijakan Mutlak White-Label Frontend (Zero Pakasir di Frontend)
Sesuai arahan privasi dan arsitektur produk:
1. **Pemisahan Lapisan Identitas Gateway**:
   - **Backend / Internal Serverless (Private Superadmin Only)**: Nama modul internal seperti `api/pakasir/*`, environment variable `PAKASIR_API_KEY`, dan webhook endpoint `/api/webhook/pakasir` tetap berjalan di server dan hanya diketahui oleh Superadmin/Owner.
   - **Frontend / Client UI (100% White-Label)**: DILARANG KERAS menampilkan nama "Pakasir", "Pakasir Gateway", atau turunannya di layar pengguna kasir, dokter, staf, member, maupun merchant.
2. **Kamus Standar Terminologi UI Frontend**:
   - Saluran QRIS -> **"QRIS Dinamis Nasional"** / **"QRIS Instan"**
   - Saluran Virtual Account -> **"Virtual Account 24 Jam (BRI, BNI, Mandiri, BCA, Permata, Danamon, CIMB, BSI, Maybank)"**
   - Form Isi Saldo -> **"Top-Up Saldo Gateway Digital"**
   - Penarikan Saldo -> **"Tarik Dana ke Rekening Bank (Transfer Otomatis)"**
   - Pengaturan Gateway Superadmin -> **"Konfigurasi Payment Gateway Digital"** / **"Kredensial Merchant Provider"**
   - Validasi Struk Kasir & Invoice -> **"Gateway: Pembayaran Digital Terverifikasi"**

---

### 13.2 Tabel Peta Routing Utama (Main Application Routes)

| Rute URL (Path) | Peran (RBAC) | Komponen Berkas | Deskripsi & Tujuan Navigasi |
| :--- | :--- | :--- | :--- |
| `/app/akun/wallet` | L0, L1, L2, L3, L4 | `src/app/pages/account/Wallet.jsx` | Dasbor Brankas S-Wallet Terpadu seluruh pengguna bisnis (Owner, GM, Staf, Dokter). Terlindungi oleh gerbang 2FA Step-Up Challenge 15 menit. |
| `/app/paket?sub=wallet-master` | L0 (Superadmin) | `src/app/pages/superadmin/WalletMaster.jsx` | God-Mode Financial Command Center Superadmin: Pengatur tarif & profit margin, radar likuiditas, antrean payout, omni-explorer, circuit breaker. |
| `/m/wallet` | L5 (Member) | `src/member/pages/Wallet.jsx` | Portal Mandiri Dompet Digital Member Pelanggan: Cek saldo, kode bayar POS 60s, topup QRIS mandiri, kirim saldo teman. |
| `/app/akun/security` | L0, L1, L2, L3, L4 | `src/app/pages/account/Security.jsx` | Pengaturan Keamanan Akun: Aktivasi TOTP 2FA (Google/Microsoft/Authy Authenticator) dan pembuatan/perubahan PIN Transaksi 6-Digit. |

---

### 13.3 Peta Sub-Fitur & Query Parameters Dasbor S-Wallet (`/app/akun/wallet`)

Halaman `/app/akun/wallet` mengelola status tampilan melalui parameter URL query `?tab={id}` sehingga pengguna dapat melakukan bookmark atau navigasi langsung:

```
/app/akun/wallet
├── ?tab=ringkasan   (Default: Kartu Saldo Bento, Rekening SW-XXXX, Quick Actions, Status KYC)
├── ?tab=mutasi      (Tabel Mutasi Buku Besar Lengkap, Filter Kategori, Filter Tanggal, Cetak Resi)
├── ?tab=rekening    (Daftar Rekening Bank Penarikan, Tambah Rekening Baru, Validasi Nama Rekening)
└── ?tab=limit       (Batas Transaksi Harian, Batas Penarikan Harian, Masa Sesi 2FA, Ganti PIN)
```

#### Rincian Sub-Fitur per Tab:
1. **`?tab=ringkasan`**:
   - Saldo Aktif Dapat Ditarik `{rupiah(wallet.balance)}`
   - Saldo Tertahan / Escrow `{rupiah(wallet.locked_balance)}`
   - Nomor Rekening Brankas Unik `SW-YYYYMM-XXXXXXXX` + Tombol Salin
   - Tombol Buka Kode QR Personal untuk Terima Transfer
   - Tombol Aksi Cepat: `[Isi Saldo]`, `[Transfer Saldo]`, `[Tarik ke Bank]`, `[Kode Bayar Kasir]`
   - Kartu Status Keamanan: Status 2FA Terverifikasi & Sisa Waktu Tiket Sesi Brankas (Hitung Mundur 15 Menit)
2. **`?tab=mutasi`**:
   - Tabel Buku Besar Ganda (*Double-Entry Ledger*)
   - Filter Kategori: `all` (Semua), `topup` (Isi Saldo), `pos_payment` (Belanja POS), `transfer_in` (Transfer Masuk), `transfer_out` (Transfer Keluar), `medical_split` (Bagi Hasil Medis), `payroll` (Gaji), `withdrawal` (Penarikan Bank)
   - Filter Rentang Tanggal (Hari ini, 7 Hari Terakhir, Bulan Ini, Kustom)
   - Kolom: Waktu, No. Referensi, Kategori, Keterangan, Status, Mutasi (+ / -), Saldo Akhir, Aksi Cetak Resi
3. **`?tab=rekening`**:
   - Daftar rekening bank dan e-wallet tujuan penarikan yang telah terdaftar
   - Form penambahan rekening baru: Nama Bank (BRI, BNI, Mandiri, BCA, BSI, dll), Nomor Rekening, Nama Pemilik Rekening
   - Validasi KYC: Nama pemilik rekening bank wajib klop dengan nama profil pengguna
4. **`?tab=limit`**:
   - Indikator pemakaian limit transaksi harian: `{rupiah(used_today)}` dari limit `{rupiah(max_daily_limit)}`
   - Indikator limit penarikan otomatis harian: `{rupiah(withdrawn_today)}` dari `{rupiah(max_withdrawal_limit)}`
   - Tombol pintas: Ubah PIN Transaksi 6-Digit & Kelola Authenticator 2FA

---

### 13.4 Peta Modal Action Triggers (URL Hash & Query Action)

Untuk memudahkan pemanggilan modal dari halaman lain maupun interaksi tombol di dalam dasbor, modal aksi S-Wallet mendukung trigger query parameter `?action={nama_aksi}`:

| Trigger Action | Nama Modal | Deskripsi Alur & Validasi |
| :--- | :--- | :--- |
| `?action=topup` | Modal Isi Saldo Gateway | 1. Input nominal bebas atau pilih nominal cepat (Rp 50rb, 100rb, 250rb, 500rb, 1jt, 2.5jt).<br>2. Pilih kanal: QRIS Dinamis atau Virtual Account 9 Bank.<br>3. Kalkulasi biaya administrasi gateway real-time.<br>4. Tampilkan kode bayar / QRIS dengan countdown 15 menit.<br>5. Auto-detect pelunasan via webhook (< 2 detik). |
| `?action=transfer` | Modal Transfer P2P | 1. Input no. rekening `SW-YYYYMM-XXXXXXXX` atau email penerima.<br>2. Verifikasi instan: Tampilkan kartu identitas penerima (Nama, Peran, Tenant, Foto Profil).<br>3. Input nominal transfer & catatan.<br>4. Otorisasi PIN Transaksi 6-digit.<br>5. Eksekusi atomik RPC PostgreSQL (Saldo pengirim berkurang, saldo penerima bertambah detik itu juga). |
| `?action=withdraw` | Modal Tarik Dana Otomatis | 1. Pilih rekening bank tujuan terverifikasi.<br>2. Masukkan nominal penarikan (Min. Rp 15.000).<br>3. Sistem memeriksa jam operasional (Senin-Sabtu 09.00-16.00 WIB) dan menampilkan estimasi waktu proses.<br>4. Sistem menghitung biaya penarikan (modal pokok gateway + profit platform).<br>5. Otorisasi ganda: 6-Digit TOTP Authenticator + PIN Transaksi 6-Digit.<br>6. Saldo dipindahkan ke `locked_balance` (Escrow Hold) dan tiket disbursement diterbitkan. |
| `?action=pay-code` | Modal Kode Bayar Kasir | 1. Generate token dinamis 6 digit via stored procedure `generate_payment_token`.<br>2. Tampilan angka tebal monospaced berjarak jelas: `XXX - XXX`.<br>3. Lingkaran hitung mundur animasi 60 detik.<br>4. Tombol Salin Cepat.<br>5. Token hangus seketika setelah 60 detik atau setelah didebet oleh kasir toko. |
| `?action=security` | Modal Konfigurasi Kredensial | Pintasan cepat untuk memperbarui PIN Transaksi 6-digit atau mengonfigurasi ulang aplikasi Authenticator. |

---

### 13.5 Peta Sub-Fitur Superadmin Command Center (`/app/paket?sub=wallet-master`)

Konsol pengawasan dan kendali moneter Superadmin L0 mengelola status pengawasan melalui parameter `?view={id}`:

```
/app/paket?sub=wallet-master
├── ?view=radar      (Default: Radar Likuiditas Total, Agregat Saldo Sistem vs Cadangan Riil)
├── ?view=pricing    (Pengaturan Biaya Penarikan Otomatis Tier 1-3 & Margin Profit Website)
├── ?view=payouts    (Antrean Eksekusi Payout Bank, Status Jam Operasional, Tombol Eksekusi)
├── ?view=explorer   (Omni-Wallet Explorer, Cari Seluruh Dompet, Freeze/Unfreeze, Saldo Audit)
└── ?view=circuit    (Global Circuit Breaker: Saklar Pemutus Transaksi Darurat)
```

#### Rincian Sub-Fitur Superadmin:
1. **`?view=radar`**:
   - Total Saldo Pengguna Beredar: `{sum(wallets.balance)}`
   - Total Saldo Tertahan (Escrow Payout): `{sum(wallets.locked_balance)}`
   - Total Brankas Keuntungan Platform: `{wallets.platform_revenue.balance}`
   - Cadangan Dana Riil di Akun Gateway: `{gateway.cash_balance}`
   - Selisih Likuiditas: Menampilkan badge hijau *"100% SINKRON (Selisih Rp 0)"*.
2. **`?view=pricing`**:
   - Form konfigurasi tarif penarikan otomatis per tier:
     * Tier 1 (Rp 15rb - Rp 4,99jt): Modal pokok Rp 3.000 + Input Margin Platform -> Biaya Final User
     * Tier 2 (Rp 5jt - Rp 9,99jt): Modal pokok Rp 5.000 + Input Margin Platform -> Biaya Final User
     * Tier 3 (Rp 10jt ke atas): Modal pokok Rp 7.000 + Input Margin Platform -> Biaya Final User
   - Pengaturan jam operasional (Ikuti jadwal resmi gateway: Senin-Sabtu 09.00-16.00 WIB)
   - Tombol Simpan Konfigurasi & Reset ke Standar Default
3. **`?view=payouts`**:
   - Filter status: `all`, `pending`, `scheduled`, `completed`, `rejected`
   - Tabel antrean: ID Penarikan, Waktu Pengajuan, Pengguna/Tenant, Bank & No. Rekening, Nominal, Biaya Modal, Profit Platform, Status
   - Tombol Aksi: `[Eksekusi Payout]` (Memicu API disbursement) dan `[Tolak & Kembalikan Saldo]` (Mengembalikan dana dari `locked_balance` ke `balance`)
4. **`?view=explorer`**:
   - Pencarian dompet lintas tenant berdasarkan Nama, Email, Nomor `SW-XXXX`, atau ID Tenant
   - Tabel profil dompet: Avatar, Nama, Role, Tenant, Nomor Dompet, Saldo Aktif, Saldo Terkunci, Status (Aktif / Frozen)
   - Aksi: Tombol 1-klik `[Freeze / Bekukan]` dan `[Unfreeze]`
   - Aksi Intervensi: Tombol `[Koreksi Saldo]` dengan modal wajib pengisian berita acara audit
5. **`?view=circuit`**:
   - Status Sistem Transaksi: Normal (Hijau) / Lockdown (Merah)
   - Saklar Global Circuit Breaker: Jika diaktifkan, seluruh API transfer, penarikan, dan debet kasir POS diblokir seketika pada level database.

---

### 13.6 Peta Portal Mandiri Member Pelanggan (`/m/wallet` & `/m/pesan`)

| Rute URL (Path) | Peran | Komponen Berkas | Deskripsi Alur & Aksi |
| :--- | :--- | :--- | :--- |
| `/m/wallet` | L5 (Member) | `src/member/pages/Wallet.jsx` | Dompet mandiri pelanggan: Kartu saldo poin loyalty, saldo rupiah, generator kode bayar 60 detik kasir POS, tombol top-up QRIS mandiri, riwayat belanja. |
| `/m/pesan` | L5 (Member) | `src/member/pages/Order.jsx` | Checkout mandiri menu toko/restoran: Pada pilihan pembayaran, tampilkan opsi 1-klik *"Bayar dengan Saldo S-Wallet"*. Pesanan langsung terkonfirmasi seketika. |
| `/m/kartu` | L5 (Member) | `src/member/pages/Card.jsx` | Kartu identitas member digital: Tertera barcode / QR nomor member dan nomor rekening `SW-YYYYMM-XXXXXXXX` untuk top-up via kasir toko. |

---

### 13.7 Peta Integrasi Rute Lintas Modul (8 Touchpoints Inter-Module Routing)

Seluruh modul operasional dihubungkan secara harmonis ke S-Wallet tanpa ada logika ganda:

```
[ Modul POS Kasir: /app/kasir ] ──(method=swallet + token 60s)──> [ S-Wallet Core RPC ]
[ Portal Member : /m/pesan ]    ──(1-klik debet saldo)──────────> [ S-Wallet Core RPC ]
[ Tagihan SaaS  : /app/paket ]  ──(debet saldo merchant)────────> [ S-Wallet Core RPC ]
[ Payroll Massal: /app/gaji ]   ──(bulk disbursement)──────────> [ S-Wallet Core RPC ]
[ Kas Bon Staf  : /app/slip ]   ──(pencairan approval)──────────> [ S-Wallet Core RPC ]
[ Billing Medis : /app/medis ]  ──(auto-split jasa 30%)─────────> [ S-Wallet Core RPC ]
[ Shift Kasir   : /app/shift ]  ──(settlement saldo digital)────> [ S-Wallet Core RPC ]
[ Akuntansi     : /app/jurnal ] ──(auto-posting debit-kredit)───> [ S-Wallet Core RPC ]
```

1. **Kasir POS (`/app/kasir` -> `src/app/pages/ops/Payment.jsx`)**:
   - Trigger: Tombol bayar kasir memilih `method: "swallet"`
   - Param Input: `token: "123456"` (kode 6 digit pelanggan)
   - Handler: Memanggil RPC `execute_pos_wallet_payment(order_id, token)`
   - Auto-Refund: Jika nota di-void di `/app/pesanan`, sistem memicu RPC refund otomatis ke saldo member.
2. **Member Checkout (`/m/pesan` -> `src/member/pages/Order.jsx`)**:
   - Trigger: Tombol *"Selesaikan Pesanan & Bayar via S-Wallet"*
   - Handler: Memanggil RPC `execute_pos_wallet_payment` dengan token sesi member internal.
3. **Tagihan SaaS (`/app/langganan` -> `src/app/pages/growth/PaymentModal.jsx`)**:
   - Trigger: Modal pembayaran paket langganan memilih metode *"S-Wallet Saldo Merchant"*
   - Handler: Memotong saldo S-Wallet Owner dan memperpanjang masa aktif tenant di basis data.
4. **Payroll Penggajian (`/app/penggajian` -> `src/app/pages/ops/Payroll.jsx`)**:
   - Trigger: Tombol *"Cairkan Payroll ke S-Wallet Karyawan"*
   - Handler: Membaca rekap slip gaji dan memotong saldo Owner secara massal untuk dikreditkan ke masing-masing rekening S-Wallet staf.
5. **Kas Bon Staf (`/app/slip` -> `src/app/pages/ops/MyPay.jsx`)**:
   - Trigger: Tombol *"Ajukan Kas Bon"* di slip gaji
   - Rute Approval: Disetujui Owner di `/app/persetujuan` (`src/app/pages/owner/Approvals.jsx`)
   - Handler: Dana kas bon langsung cair ke S-Wallet staf.
6. **Billing Dokter Odontogram (`/app/tagihan` -> `src/app/pages/clinic/Billing.jsx`)**:
   - Trigger: Pelunasan tagihan rawat jalan klinik gigi/umum
   - Handler: Menghitung persentase jasa medis (misal 30%) dan mengkreditkan porsi dokter langsung ke dompet dokter yang merawat.
7. **Penutupan Shift Kasir (`/app/shift` & `/app/rekonsiliasi`)**:
   - Trigger: Kasir melakukan rekap akhir shift di `/app/shift`
   - Kolom Rekonsiliasi: Menampilkan baris penerimaan digital S-Wallet dengan selisih kas selalu Rp 0.
8. **Jurnal Umum Akuntansi (`/app/jurnal` -> `src/app/pages/ops/Journal.jsx`)**:
   - Trigger: Setiap transaksi S-Wallet yang berstatus `completed`
   - Handler: Otomatis memposting entri debet-kredit pada akun aktiva, utang saldo, dan pendapatan komisi.

---

### 13.8 Matriks Hak Akses RBAC per Rute & Sub-Fitur

| Rute / Sub-Fitur | Superadmin (L0) | Owner (L1) | GM (L2) | Staf / Kasir (L3) | Dokter (L4) | Member (L5) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/app/akun/wallet` (Dasbor Brankas) | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan | Dialihkan ke `/m` |
| `?action=topup` (Isi Saldo Gateway) | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan (via `/m`) |
| `?action=transfer` (Transfer P2P) | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan (ke Member) |
| `?action=withdraw` (Tarik Dana Bank) | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan | Dibatasi / KYC |
| `?action=pay-code` (Generate Token 60s) | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan (via `/m`) |
| `/app/paket?sub=wallet-master` | Izinkan (Penuh) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) |
| `?view=pricing` (Ubah Tarif & Profit) | Izinkan | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) |
| `?view=payouts` (Eksekusi Payout) | Izinkan | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) |
| `?view=explorer` (Freeze & Saldo Audit) | Izinkan | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) |
| `?view=circuit` (Circuit Breaker) | Izinkan | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) | Tolak (403) |
| `/m/wallet` (Portal Member) | Dialihkan ke `/app` | Dialihkan ke `/app` | Dialihkan ke `/app` | Dialihkan ke `/app` | Dialihkan ke `/app` | Izinkan |
| Opsi Bayar Kasir POS (`method=swallet`) | Izinkan | Izinkan | Izinkan | Izinkan (Kasir) | N/A | Pelanggan Bayar |
| Bulk Payroll ke S-Wallet Karyawan | N/A | Izinkan | Izinkan | Tolak (403) | Tolak (403) | Tolak (403) |
| Auto-Split Jasa Medis Dokter | N/A | Izinkan | Izinkan | N/A | Penerima Otomatis | N/A |

---

### 13.9 State Machine Keamanan Navigasi: Step-Up 2FA & Auto-Lock 15 Menit

Alur kendali akses saat pengguna membuka URL `/app/akun/wallet`:

```
                    [ Pengguna Membuka /app/akun/wallet ]
                                      |
                                      v
                      [ Apakah Pengguna Terotentikasi? ]
                           /                    \
                         (Tidak)               (Ya)
                         /                        \
           [ Redirect ke /login ]           [ Periksa Status 2FA di Profil ]
                                                 /                  \
                                            (Belum Aktif)          (Sudah Aktif)
                                               /                        \
                        [ Tampilkan Banner Wajib 2FA ]     [ Cek Tiket Sesi Brankas ]
                        [ & Tombol Buka /app/akun/security ]     /              \
                                                            (Valid <15m)    (Kedaluwarsa / Baru)
                                                                /                  \
                                                 [ Buka Dasbor Brankas ]    [ Tampilkan Tantangan 2FA ]
                                                 [ (Akses Penuh Saldo) ]    [ (Input 6-Digit OTP App) ]
                                                                                   |
                                                                             (Validasi Sukses)
                                                                                   |
                                                                                   v
                                                                       [ Terbitkan Tiket 15 Menit ]
                                                                       [ di sessionStorage ]
```

Dengan arsitektur ini, seluruh rute, sub-fitur, modal action triggers, dan hak akses RBAC telah terpetakan secara lengkap dan presisi, siap dieksekusi secara berjenjang dimulai dari **FASE 1** begitu pengguna memberikan perintah eksekusi.

