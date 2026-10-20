# SPESIFIKASI ARSITEKTUR & IMPLEMENTASI SISTEM S-WALLET
## Platform Dompet Digital Multi-Pengguna Terproteksi TOTP 2FA (RFC 6238)
### Tijarah Operating System

---

## 1. PENDAHULUAN & LANDASAN KONSEPTUAL

### 1.1 Latar Belakang & Tujuan
S-Wallet adalah sistem kantong digital internal terintegrasi di dalam platform Tijarah OS yang memberikan setiap pengguna (Superadmin, Owner, GM, Kasir/Staf, Dokter, hingga Member) rekening saldo digital mandiri. 

Sistem ini memungkinkan transfer saldo instan, aman, dan tanpa biaya antar sesama pengguna platform dengan menerapkan prinsip perbankan modern:
1. **Zero-Trust Access Control**: Mengunci akses masuk modul S-Wallet menggunakan verifikasi 6-Digit TOTP dinamis.
2. **Double-Entry Ledger Integrity**: Setiap perpindahan dana dicatat secara berpasangan (debit dan kredit) dalam transaksi atomik basis data guna mencegah selisih atau manipulasi saldo.
3. **Idempotency & Anti-Double-Spend**: Transaksi transfer dilindungi oleh kunci idempoten dan penguncian baris (*Row-Level Locking*) untuk mengeliminasi celah transfer ganda saat terjadi latensi jaringan.

---

## 2. MEKANISME DUA FAKTOR (TOTP 2FA) & INTEGRASI GERBANG S-WALLET

### 2.1 Penjelasan Siklus Hidup Pendaftaran 2FA (Setup vs Akses Harian)
Sesuai dengan implementasi pada modul **Keamanan & Kredensial** (`src/app/pages/account/Security.jsx`), terdapat pembedaan tegas antara tahap pendaftaran dan tahap otorisasi transaksi:

1. **Tahap Pendaftaran (Hanya Dilakukan 1 Kali Saja)**:
   - Pengguna membuka tab **Akun > Keamanan & Kredensial > Aktifkan Autentikasi Dua Faktor (TOTP 2FA)**.
   - Sistem menghasilkan *Secret Key Base32* unik (contoh: `JBSW Y3DP EHPK 3PXP`) dan memvisualisasikannya ke dalam QR Code standar ISO/IEC 18004.
   - Pengguna memindai QR Code tersebut menggunakan aplikasi pilihan mereka:
     - **Google Authenticator**
     - **Microsoft Authenticator**
     - **Authy**
   - Setelah kunci rahasia tersimpan di aplikasi ponsel pengguna dan diverifikasi satu kali, status 2FA menjadi **AKTIF**.
   - **Catatan Penting**: Pengguna **TIDAK PERLU** lagi memindai QR Code atau memasukkan Secret Key untuk kedua kalinya. Secret Key tersebut sudah tersimpan permanen di dalam ponsel pengguna.

2. **Tahap Penggunaan Harian untuk S-Wallet (Otorisasi 6-Digit Dinamis)**:
   - Aplikasi authenticator di ponsel secara otomatis menghitung kode 6-digit baru setiap 30 detik berdasarkan algoritma HMAC-SHA1 (RFC 6238) secara offline tanpa memerlukan koneksi internet.
   - Untuk fitur **S-Wallet**, sistem Tijarah hanya memerlukan **6-Digit Kode OTP yang sedang aktif** di layar ponsel pengguna sebagai token otorisasi pembuka brankas.

---

### 2.2 Arsitektur Gerbang Keamanan S-Wallet (Step-Up Authentication)

```
[ PENGGUNA KLIK SUBTAB "S-WALLET" ]
                |
                v
     [ Cek Status 2FA Pengguna ]
       /                       \
  (Belum Aktif)              (Sudah Aktif)
     /                           \
    v                             v
[ Blokir Akses ]           [ Tampilkan Modal Verifikasi TOTP ]
"Wajib Aktifkan 2FA        "Masukkan 6-Digit Kode Authenticator"
di Tab Keamanan"                  |
                                  v
                       [ Validasi Kode RFC 6238 ]
                         /                   \
                    (Salah)                (Benar)
                      /                         \
                     v                           v
              [ Tolak Akses ]        [ Terbitkan Sesi S-Wallet (15 Menit) ]
              Catat Failure Log                  |
                                                 v
                                     [ Tampilkan Dasbor S-Wallet ]
                                     Saldo & Tombol Transfer Terbuka
```

1. **Gerbang Masuk Subtab (Step-Up Challenge)**:
   - Jika pengguna belum mengaktifkan 2FA: Halaman menampilkan layar peringatan keamanan (*Security Gate Banner*) yang melarang akses dan menyajikan tombol pintas menuju aktivasi 2FA.
   - Jika pengguna sudah mengaktifkan 2FA: Sistem menampilkan dialog verifikasi instan meminta 6-digit kode otentikator.
2. **Jendela Waktu Sesi Terotentikasi (Elevated Session Token)**:
   - Verifikasi sukses menghasilkan tiket sesi keamanan (`tijarah:swallet_session`) dengan masa berlaku 15 menit.
   - Bila pengguna tidak melakukan aktivitas selama 15 menit atau menutup tab peramban, brankas S-Wallet otomatis terkunci kembali (*auto-lock*) untuk melindungi saldo jika perangkat ditinggalkan tanpa pengawasan.
3. **Otorisasi Eksekusi Transfer Dana**:
   - Setiap kali melakukan pengiriman saldo keluar, pengguna wajib mengonfirmasi aksi dengan **PIN Transaksi 6-Digit** atau tantangan ulang TOTP demi mencegah eksekusi tidak sengaja.

---

## 3. STRUKTUR DATA BASIS DATA (POSTGRESQL / SUPABASE)

### 3.1 Tabel Rekening Dompet (`public.wallets`)
Menyimpan identitas rekening dompet untuk setiap profil pengguna:

```sql
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  wallet_number varchar(20) not null unique, -- Format: SW-YYYYMM-XXXXXX
  balance bigint not null default 0 check (balance >= 0),
  locked_balance bigint not null default 0 check (locked_balance >= 0),
  currency varchar(3) not null default 'IDR',
  is_frozen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indeks untuk pencarian cepat nomor dompet dan user_id
create index idx_wallets_user on public.wallets(user_id);
create index idx_wallets_number on public.wallets(wallet_number);
```

### 3.2 Tabel Buku Besar Mutasi (`public.wallet_transactions`)
Merekam seluruh riwayat transaksi pengiriman dana, top-up, dan penarikan:

```sql
create type public.wallet_txn_type as enum (
  'transfer_in',
  'transfer_out',
  'topup_gateway',
  'withdrawal',
  'adjustment'
);

create type public.wallet_txn_status as enum (
  'pending',
  'completed',
  'failed',
  'reversed'
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_no varchar(32) not null unique,
  idempotency_key varchar(64) not null unique,
  sender_wallet_id uuid references public.wallets(id),
  receiver_wallet_id uuid references public.wallets(id),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  total_deducted bigint not null check (total_deducted >= amount),
  txn_type public.wallet_txn_type not null,
  status public.wallet_txn_status not null default 'completed',
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_wallet_txns_sender on public.wallet_transactions(sender_wallet_id);
create index idx_wallet_txns_receiver on public.wallet_transactions(receiver_wallet_id);
create index idx_wallet_txns_created on public.wallet_transactions(created_at desc);
```

### 3.3 Tabel Pembukuan Berpasangan (`public.wallet_ledger`)
Menjamin akuntabilitas audit finansial secara matematis (*Audit Trail*):

```sql
create type public.ledger_entry_type as enum ('DEBIT', 'CREDIT');

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  txn_id uuid not null references public.wallet_transactions(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  entry_type public.ledger_entry_type not null,
  amount bigint not null check (amount > 0),
  balance_before bigint not null,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create index idx_wallet_ledger_wallet on public.wallet_ledger(wallet_id);
create index idx_wallet_ledger_txn on public.wallet_ledger(txn_id);
```

---

## 4. FUNGSI STORED PROCEDURE ATOMIK (RPC TRANSFER DANA)

Untuk menjamin tidak akan pernah terjadi kondisi *Race Condition* atau saldo minus, eksekusi pemindahan dana dilakukan di tingkat basis data menggunakan isolasi transaksi ketat dan klausa `FOR UPDATE`:

```sql
create or replace function public.execute_wallet_transfer(
  p_sender_user_id uuid,
  p_receiver_identifier text, -- Bisa berupa wallet_number atau email
  p_amount bigint,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sender_wallet public.wallets%rowtype;
  v_receiver_wallet public.wallets%rowtype;
  v_receiver_profile public.profiles%rowtype;
  v_ref_no varchar(32);
  v_txn_id uuid;
begin
  -- 1. Validasi nominal transfer
  if p_amount <= 0 then
    raise exception 'Nominal transfer harus lebih besar dari Rp 0.';
  end if;

  -- 2. Cek idempotency agar transaksi tidak dieksekusi ganda
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_idempotency_key) then
    raise exception 'Transaksi ini telah diproses sebelumnya (duplikasi transaksi).';
  end if;

  -- 3. Kunci dan ambil dompet pengirim (Row-Level Locking)
  select * into v_sender_wallet
  from public.wallets
  where user_id = p_sender_user_id
  for update;

  if not found then
    raise exception 'Dompet pengirim tidak ditemukan.';
  end if;

  if v_sender_wallet.is_frozen then
    raise exception 'Dompet Anda sedang dibekukan oleh sistem.';
  end if;

  if v_sender_wallet.balance < p_amount then
    raise exception 'Saldo S-Wallet tidak mencukupi untuk melakukan transfer ini.';
  end if;

  -- 4. Cari dan kunci dompet penerima berdasarkan nomor dompet atau email
  select w.* into v_receiver_wallet
  from public.wallets w
  join public.profiles p on p.id = w.user_id
  where (w.wallet_number = trim(p_receiver_identifier) or lower(p.email) = lower(trim(p_receiver_identifier)))
  for update;

  if not found then
    raise exception 'Rekening atau email penerima tidak terdaftar di sistem Tijarah.';
  end if;

  if v_receiver_wallet.id = v_sender_wallet.id then
    raise exception 'Tidak dapat mengirim saldo ke rekening dompet sendiri.';
  end if;

  if v_receiver_wallet.is_frozen then
    raise exception 'Dompet penerima sedang dibekukan.';
  end if;

  -- 5. Buat nomor referensi unik transaksi
  v_ref_no := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  -- 6. Potong saldo pengirim dan tambah saldo penerima
  update public.wallets
  set balance = balance - p_amount, updated_at = now()
  where id = v_sender_wallet.id;

  update public.wallets
  set balance = balance + p_amount, updated_at = now()
  where id = v_receiver_wallet.id;

  -- 7. Catat transaksi utama
  insert into public.wallet_transactions (
    reference_no,
    idempotency_key,
    sender_wallet_id,
    receiver_wallet_id,
    amount,
    fee,
    total_deducted,
    txn_type,
    status,
    notes
  ) values (
    v_ref_no,
    p_idempotency_key,
    v_sender_wallet.id,
    v_receiver_wallet.id,
    p_amount,
    0,
    p_amount,
    'transfer_out',
    'completed',
    p_notes
  ) returning id into v_txn_id;

  -- 8. Tulis buku besar ganda (Double-Entry Ledger)
  -- Baris 1: DEBIT pengirim
  insert into public.wallet_ledger (
    txn_id, wallet_id, entry_type, amount, balance_before, balance_after
  ) values (
    v_txn_id, v_sender_wallet.id, 'DEBIT', p_amount, v_sender_wallet.balance, v_sender_wallet.balance - p_amount
  );

  -- Baris 2: CREDIT penerima
  insert into public.wallet_ledger (
    txn_id, wallet_id, entry_type, amount, balance_before, balance_after
  ) values (
    v_txn_id, v_receiver_wallet.id, 'CREDIT', p_amount, v_receiver_wallet.balance, v_receiver_wallet.balance + p_amount
  );

  -- 9. Kembalikan detail respon keberhasilan
  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'amount', p_amount,
    'remaining_balance', v_sender_wallet.balance - p_amount,
    'created_at', now()
  );
end;
$$;
```

---

## 5. RANCANGAN PENGALAMAN PENGGUNA (UI / UX DASHBOARD S-WALLET)

### 5.1 Struktur Navigasi Akun
Subtab **S-Wallet** diintegrasikan ke dalam navigasi tab Akun pada berkas `src/app/pages/account/AccountTabs.jsx`:
- **Rute URL**: `/app/akun/wallet`
- **Ikon Navigasi**: `fa-wallet`
- **Tone Warna**: Sky / Emerald Gradasi
- **Label Bento Card**: *"S-Wallet Digital"*
- **Deskripsi**: *"Kantong saldo internal, transfer sesama pengguna, dan proteksi transaksi 2FA"*

### 5.2 Komponen Layar S-Wallet
1. **Layar 1: Gerbang Verifikasi TOTP (Gate Modal)**:
   - Input 6 digit angka terpisah (*segmented digit input*) dengan autofokus.
   - Indikator sisa waktu sinkronisasi (RFC 6238 counter bar 30 detik).
   - Tombol *"Verifikasi & Buka S-Wallet"*.
2. **Layar 2: Dasbor Saldo Utama**:
   - Kartu Saldo Modern: Jumlah saldo IDR format mata uang besar, nomor rekening dompet `SW-XXXX-XXXX`, tombol salin nomor, dan tombol QR Terima Dana.
   - Tombol Aksi Cepat:
     - **Kirim Saldo (Transfer)**
     - **Isi Saldo (Top-Up via Pakasir QRIS/VA)**
     - **Tarik Dana (Payout ke Bank)**
3. **Layar 3: Modal Formulir Kirim Saldo Antar Pengguna**:
   - Input pencarian tujuan: Nomor S-Wallet atau Alamat Email Pengguna.
   - Kartu Verifikasi Penerima (Menampilkan Nama Lengkap & Peran/Cabang sebelum kirim agar tidak salah sasaran).
   - Input Nominal Transfer + Pilihan Cepat (Rp 50.000, Rp 100.000, Rp 500.000, Rp 1.000.000).
   - Input Catatan Transfer (Opsional).
   - Input Otorisasi PIN Transaksi 6-Digit.
4. **Layar 4: Riwayat & Resi Digital Mutasi**:
   - Tab filter: *Semua*, *Dana Masuk*, *Dana Keluar*, *Top-Up*.
   - Setiap transaksi memiliki modal detail resi digital yang dapat diunduh atau dicetak langsung.

---

## 6. MATRIKS PERLINDUNGAN & PENCEGAHAN SERANGAN KEAMANAN

| Potensi Ancaman | Vektor Serangan | Mekanisme Pencegahan di S-Wallet |
|:---|:---|:---|
| **Pencurian Akun** | Password bocor / phising | **Step-Up 2FA**: Pelaku tidak bisa masuk ke S-Wallet karena butuh kode 6-digit dinamis dari ponsel fisik korban. |
| **Double Spending** | Menekan tombol kirim berkali-kali secara simultan | **Idempotency Key & Row-Locking**: Basis data PostgreSQL mengunci baris dompet (`FOR UPDATE`), hanya transaksi pertama yang berhasil. |
| **Manipulasi Saldo di Frontend** | Mengubah nilai state di browser DevTools | **Enforce di Database**: Seluruh mutasi dihitung di server Supabase via fungsi RPC `SECURITY DEFINER`, bukan kalkulasi lokal di peramban. |
| **Penembakan Brute Force OTP** | Menembak kode 6 digit secara masif | **Rate Limiting**: Maksimal 5 kali percobaan gagal per 15 menit, setelah itu akun dikunci sementara. |
| **Transfer ke Diri Sendiri** | Mengirim dana ke nomor dompet sendiri | **Pengecekan Relasional**: Fungsi transfer menolak eksekusi jika `sender_id == receiver_id`. |
| **Saldo Negatif** | Menarik saldo melebihi saldo akun | **Check Constraint SQL**: Kolom saldo memiliki aturan `CHECK (balance >= 0)`. |

---

## 7. RENCANA KERJA TAHAP IMPLEMENTASI (ROADMAP)

1. **Tahap 1: Migrasi Database & RPC**:
   - Eksekusi skrip tabel `public.wallets`, `public.wallet_transactions`, dan `public.wallet_ledger`.
   - Menerapkan fungsi RPC `execute_wallet_transfer`.
2. **Tahap 2: Registrasi Rute & Navigasi**:
   - Menambahkan rute `/app/akun/wallet` ke dalam `src/app/pages.js`.
   - Menambahkan kartu navigasi S-Wallet ke dalam `src/app/pages/account/AccountTabs.jsx`.
3. **Tahap 3: Pembuatan Halaman UI S-Wallet**:
   - Membuat berkas `src/app/pages/account/Wallet.jsx`.
   - Mengintegrasikan modal gerbang TOTP 2FA step-up authentication.
   - Membangun antarmuka transfer instan dan riwayat buku besar mutasi.
4. **Tahap 4: Pengujian & Validasi Mutasi**:
   - Uji transfer antar akun demo (`owner@demo.harum.in` ke `staff@demo.harum.in`, `gm@demo.harum.in`, dsb.).
   - Verifikasi isolasi saldo dan konsistensi buku besar.
