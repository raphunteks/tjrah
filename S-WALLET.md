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
1. **Saldo Tersedia (Available Balance)**: Dana likuid yang siap ditransfer, dibelanjakan di kasir, atau ditarik.
2. **Saldo Tertahan (Locked / Escrow Balance)**: Dana yang dialokasikan untuk transaksi pesanan berjalan atau proses penarikan yang menunggu penyelesaian kliring bank.
3. **Nomor Rekening S-Wallet Unik**: Format terstandar internasional `SW-YYYYMM-XXXXXXXX` yang dapat dijadikan tujuan transfer instan tanpa membagikan nomor rekening bank pribadi.
4. **My QR Code S-Wallet**: Menampilkan kode QR personal pengguna yang dapat dipindai oleh sesama pengguna atau kasir untuk pengiriman dana kilat.

---

### 3.2 Fitur 2: Top-Up Saldo Instan Terintegrasi Gateway Pakasir API v2
Pengguna dapat mengisi saldo S-Wallet kapan saja melalui gerbang pembayaran resmi Pakasir yang telah terkonfigurasi pada sistem Tijarah:
1. **Metode Pembayaran Lengkap**:
   - **QRIS Dinamis**: Tampil otomatis di layar, dapat dipindai melalui BCA Mobile, Livin Mandiri, BRImo, BNI Mobile, GoPay, OVO, ShopeePay, DANA, LinkAja.
   - **Virtual Account 24/7**: 9 Bank nasional (BRI, BNI, CIMB Niaga, Maybank, Danamon, Neo Commerce, BSI, Bank Muamalat, Bank OCBC).
   - **Payment Link**: Pembayaran kartu debit atau tautan *checkout* instan.
2. **Kalkulator Nominal Cepat**: Tombol nominal instan (Rp 50.000, Rp 100.000, Rp 250.000, Rp 500.000, Rp 1.000.000, Rp 2.500.000) atau input bebas (minimal Rp 10.000).
3. **Penyelesaian Otomatis (< 2 Detik)**: Begitu pembayaran diterima oleh Pakasir, webhook serverless (`/api/webhook/pakasir`) secara otomatis memicu stored procedure `process_pakasir_wallet_topup` untuk mengkreditkan saldo ke S-Wallet pengguna tanpa intervensi manual superadmin.

---

### 3.3 Fitur 3: Transfer Saldo Antar Pengguna P2P (Peer-to-Peer)
Memungkinkan perpindahan saldo instan antar pengguna Tijarah (Superadmin, Owner, GM, Staf, Dokter, Member) dengan ketentuan:
1. **Multi-Identifier Lookup**: Pengirim dapat mencari penerima menggunakan:
   - Nomor Rekening S-Wallet (`SW-XXXX-XXXX`)
   - Alamat Email Terdaftar
   - Nomor WhatsApp / Handphone Terverifikasi
2. **Kartu Validasi Identitas Penerima**: Sebelum dana terkirim, sistem memunculkan pop-up konfirmasi yang menampilkan Foto Avatar, Nama Lengkap, Peran Akun, dan Nama Merchant/Cabang penerima guna mencegah salah kirim.
3. **Bebas Biaya Admin (Rp 0)**: Pengiriman saldo antar kantong Tijarah 100% gratis.
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
2. **Belanja Mandiri di Pesanan Online & Portal Member (`/m`)**:
   - Member yang memesan menu atau obat klinik dapat langsung memilih metode bayar S-Wallet dengan pemotongan saldo seketika tanpa perlu unggah struk transfer bank manual.
3. **Pembayaran Langganan SaaS & Kuota Copilot AI**:
   - Merchant Owner dapat memperpanjang paket aplikasi Tijarah OS atau menambah kuota AI Copilot langsung menggunakan saldo S-Wallet hasil penjualan toko.
4. **Otomatisasi Bagi Hasil Dokter & Terapis Klinik**:
   - Setiap invoice tindakan medis gigi/umum yang diselesaikan di kasir secara otomatis membagi dana: komisi dokter (misal 30%) langsung masuk ke S-Wallet pribadi dokter, dan sisanya (70%) masuk ke S-Wallet klinik secara *real-time*.
5. **Payroll & Kas Bon Staf Terintegrasi**:
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

## 4. SKEMA BASIS DATA LENGKAP (POSTGRESQL / SUPABASE)

Berikut adalah struktur tabel basis data relasional untuk mendukung seluruh ekosistem S-Wallet:

### 4.1 Tabel Rekening Dompet (`public.wallets`)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wallets_user on public.wallets(user_id);
create index idx_wallets_number on public.wallets(wallet_number);
```

### 4.2 Tabel Token Pembayaran Dinamis Kasir (`public.wallet_payment_tokens`)
Mendukung fitur Zero Fraud di POS:
```sql
create table public.wallet_payment_tokens (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  token_code varchar(6) not null,
  amount_limit bigint, -- Opsional, jika token dibatasi nominal tertentu
  is_used boolean not null default false,
  used_at timestamptz,
  used_order_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_pay_tokens_lookup on public.wallet_payment_tokens(token_code, is_used, expires_at);
```

### 4.3 Tabel Transaksi Utama (`public.wallet_transactions`)
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
  'pos_refund'
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_no varchar(36) not null unique, -- TRF-20261020-XXXX, POS-..., TOP-...
  idempotency_key varchar(64) not null unique,
  sender_wallet_id uuid references public.wallets(id),
  receiver_wallet_id uuid references public.wallets(id),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  total_deducted bigint not null check (total_deducted >= amount),
  category public.wallet_txn_category not null,
  status varchar(20) not null default 'completed', -- completed, pending, failed, reversed
  notes text,
  metadata jsonb default '{}'::jsonb, -- detail order_id, invoice_id, pos_terminal
  created_at timestamptz not null default now()
);

create index idx_wallet_txns_sender on public.wallet_transactions(sender_wallet_id);
create index idx_wallet_txns_receiver on public.wallet_transactions(receiver_wallet_id);
create index idx_wallet_txns_cat on public.wallet_transactions(category);
create index idx_wallet_txns_created on public.wallet_transactions(created_at desc);
```

### 4.4 Tabel Buku Besar Ganda (`public.wallet_ledger`)
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

## 5. STORED PROCEDURES ATOMIK KRUSIAL (POSTGRESQL / SUPABASE)

### 5.1 Prosedur Pembayaran Kasir POS Tanpa Fraud (`execute_pos_wallet_payment`)
Memproses pembayaran di mesin kasir dengan kode bayar dinamis 60 detik:
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

  -- 3. Cari dompet merchant (Owner dari tenant tempat kasir bekerja)
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

### 5.2 Prosedur Webhook Top-Up Otomatis dari Pakasir (`process_pakasir_wallet_topup`)
Dipanggil secara aman saat serverless webhook Pakasir menerima pembayaran:
```sql
create or replace function public.process_pakasir_wallet_topup(
  p_order_id text,
  p_txn_id text,
  p_amount bigint,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_ref_no varchar(36);
  v_txn_uuid uuid;
begin
  -- Kunci baris dompet penerima
  select * into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Dompet pengguna tidak ditemukan untuk top-up.';
  end if;

  -- Tambahkan saldo
  update public.wallets
  set balance = balance + p_amount, updated_at = now()
  where id = v_wallet.id;

  v_ref_no := 'TOP-' || to_char(now(), 'YYYYMMDD') || '-' || p_txn_id;

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, 'pakasir_' || p_txn_id, null, v_wallet.id,
    p_amount, 0, p_amount, 'topup_pakasir', 'completed',
    'Top-Up Saldo S-Wallet via Pakasir Gateway',
    jsonb_build_object('order_id', p_order_id, 'pakasir_txn_id', p_txn_id)
  ) returning id into v_txn_uuid;

  insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
  values (v_txn_uuid, v_wallet.id, 'CREDIT', p_amount, v_wallet.balance, v_wallet.balance + p_amount);

  return jsonb_build_object('ok', true, 'new_balance', v_wallet.balance + p_amount);
end;
$$;
```

---

## 6. MATRIKS PERLINDUNGAN & PENCEGAHAN FRAUD DI KASIR

| Bentuk Modus Fraud Konvensional | Dampak pada Usaha | Cara S-Wallet Membasmi Fraud Hingga 0% |
|:---|:---|:---|
| **Pencurian Uang Kasir (Cash Pocketing)** | Kasir menerima uang cash pelanggan tapi tidak memasukkan ke sistem. | **Eliminasi Uang Tunai**: Pelanggan membayar via S-Wallet, saldo berpindah di database langsung ke akun Owner. Kasir tidak memegang uang fisik. |
| **Nota Fiktif / Fake Void** | Kasir membatalkan nota setelah pelanggan pergi untuk mengambil uang kas. | **Otomatisasi Refund**: Jika void dilakukan, saldo S-Wallet langsung kembali ke akun pelanggan secara digital. Kasir tidak mendapatkan uang sepeser pun. |
| **Pencurian Kode Pembayaran Pelanggan** | Kasir mencatat nomor kartu/PIN pelanggan untuk disalahgunakan nanti. | **Dynamic OTP 60 Detik**: Kode bayar yang ditunjukkan pelanggan otomatis hangus dalam 60 detik dan hanya berlaku sekali pakai. |
| **Double Spending / Lag Transaksi** | Pelanggan menekan transfer berkali-kali untuk membingungkan kasir. | **Kunci Idempotensi & Row-Level Locking**: Basis data PostgreSQL mengunci baris dompet (`FOR UPDATE`), memblokir mutasi ganda pada milidetik yang sama. |
| **Manipulasi Nilai di Layar (Inspect Element)** | Pengguna mengubah tampilan saldo lokal di browser. | **Server-Side Enforcement**: Seluruh perhitungan saldo dan transfer divalidasi oleh fungsi RPC `SECURITY DEFINER` di Supabase, mengabaikan manipulasi frontend. |

---

## 7. ROADMAP INTEGRASI KODE & IMPLEMENTASI SISTEM

1. **Fase 1: Registrasi Skema Basis Data & RPC (Database Layer)**
   - Jalankan migrasi `public.wallets`, `public.wallet_transactions`, `public.wallet_ledger`, dan `public.wallet_payment_tokens`.
   - Menerapkan fungsi stored procedure `execute_wallet_transfer` dan `execute_pos_wallet_payment`.
2. **Fase 2: Registrasi Rute & Navigasi Bento (Routing Layer)**
   - Daftarkan rute `/app/akun/wallet` di `src/app/pages.js`.
   - Tambahkan kartu navigasi S-Wallet pada komponen `src/app/pages/account/AccountTabs.jsx`.
3. **Fase 3: Pembuatan Komponen UI Dasbor S-Wallet (Frontend Layer)**
   - Buat berkas `src/app/pages/account/Wallet.jsx`:
     - Tampilan Gerbang Keamanan TOTP 2FA Step-Up Challenge (Layar Kunci).
     - Dasbor Saldo Utama & Kartu Bento Info Rekening.
     - Modal Top-Up Saldo terhubung langsung ke Pakasir Gateway.
     - Modal Kirim Saldo Antar Pengguna P2P dengan verifikasi profil penerima & PIN transaksi.
     - Generator Kode Bayar Dinamis Kasir (60 detik).
     - Tabel Mutasi Buku Besar & Resi Digital siap cetak.
4. **Fase 4: Integrasi Modul Kasir POS & Pembelanjaan Website (Ecosystem Layer)**
   - Tambahkan tombol opsi pembayaran *"S-Wallet"* di `src/app/pages/ops/Pos.jsx`.
   - Sambungkan checkout pesanan online portal member `/m` dengan pemotongan saldo S-Wallet.
5. **Fase 5: Validasi, Audit Keamanan, & Stress Test**
   - Jalankan `npm run secret:scan` dan unit testing `npm test`.
   - Uji simulasi transfer antar peran akun demo dan pengetesan anti-fraud di kasir.
