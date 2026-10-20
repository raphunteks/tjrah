-- ============================================================================
-- TIJARAH OS · MIGRATION: S-WALLET CORE REKENING, BUKU BESAR & RPC ATOMIK
-- Fase 1 Implementasi S-Wallet (Database Layer & Stored Procedures)
-- ============================================================================

create extension if not exists pgcrypto;

-- ───────── 1. Enum Kategori Transaksi S-Wallet ─────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wallet_txn_category') then
    create type public.wallet_txn_category as enum (
      'p2p_transfer',
      'pos_payment',
      'online_order_payment',
      'saas_subscription',
      'ai_quota_purchase',
      'topup_gateway',
      'topup_pakasir',
      'bank_withdrawal',
      'clinic_doctor_split',
      'payroll_salary',
      'pos_refund',
      'admin_adjustment',
      'platform_fee_revenue'
    );
  end if;
end $$;

-- ───────── 2. Tabel Rekening Dompet (public.wallets) ─────────
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  wallet_number varchar(32) not null unique,
  balance bigint not null default 0 check (balance >= 0),
  locked_balance bigint not null default 0 check (locked_balance >= 0),
  currency varchar(3) not null default 'IDR',
  daily_transfer_limit bigint not null default 25000000,
  is_frozen boolean not null default false,
  frozen_reason text,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallets_user on public.wallets(user_id);
create index if not exists idx_wallets_number on public.wallets(wallet_number);
create index if not exists idx_wallets_tenant on public.wallets(tenant_id);

-- ───────── 3. Tabel Token Pembayaran Dinamis Kasir POS (public.wallet_payment_tokens) ─────────
create table if not exists public.wallet_payment_tokens (
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

create index if not exists idx_pay_tokens_lookup on public.wallet_payment_tokens(token_code, is_used, expires_at);
create index if not exists idx_pay_tokens_wallet on public.wallet_payment_tokens(wallet_id);

-- ───────── 4. Tabel Transaksi Finansial (public.wallet_transactions) ─────────
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_no varchar(36) not null unique,
  idempotency_key varchar(64) not null unique,
  sender_wallet_id uuid references public.wallets(id),
  receiver_wallet_id uuid references public.wallets(id),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  total_deducted bigint not null check (total_deducted >= amount),
  category public.wallet_txn_category not null,
  status varchar(24) not null default 'completed' check (status in ('completed', 'pending', 'processing', 'failed', 'reversed', 'scheduled_in_queue')),
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_txns_sender on public.wallet_transactions(sender_wallet_id);
create index if not exists idx_wallet_txns_receiver on public.wallet_transactions(receiver_wallet_id);
create index if not exists idx_wallet_txns_cat on public.wallet_transactions(category);
create index if not exists idx_wallet_txns_created on public.wallet_transactions(created_at desc);
create index if not exists idx_wallet_txns_ref on public.wallet_transactions(reference_no);

-- ───────── 5. Tabel Buku Besar Ganda (public.wallet_ledger) ─────────
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  txn_id uuid not null references public.wallet_transactions(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  entry_type varchar(6) not null check (entry_type in ('DEBIT', 'CREDIT')),
  amount bigint not null check (amount > 0),
  balance_before bigint not null,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_ledger_wallet on public.wallet_ledger(wallet_id);
create index if not exists idx_wallet_ledger_txn on public.wallet_ledger(txn_id);
create index if not exists idx_wallet_ledger_created on public.wallet_ledger(created_at desc);

-- ───────── 6. Tabel Antrean Penarikan Dana Bank (public.wallet_withdrawals) ─────────
create table if not exists public.wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  reference_no varchar(36) not null unique,
  bank_name varchar(50) not null,
  account_number varchar(50) not null,
  account_holder varchar(100) not null,
  amount bigint not null check (amount >= 15000),
  base_fee bigint not null default 3000,
  platform_fee bigint not null default 2000,
  total_user_fee bigint not null default 5000,
  total_deducted bigint not null check (total_deducted = amount + total_user_fee),
  status varchar(30) not null default 'pending' check (status in ('pending', 'scheduled_in_queue', 'processing', 'completed', 'rejected', 'failed')),
  gateway_payout_id text,
  notes text,
  metadata jsonb default '{}'::jsonb,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withdrawals_wallet on public.wallet_withdrawals(wallet_id);
create index if not exists idx_withdrawals_status on public.wallet_withdrawals(status);
create index if not exists idx_withdrawals_ref on public.wallet_withdrawals(reference_no);

-- ───────── 7. Tabel Pengaturan Platform & Monetisasi Tarif (public.wallet_platform_settings) ─────────
create table if not exists public.wallet_platform_settings (
  id int primary key default 1 check (id = 1),
  tier1_max bigint not null default 4999999,
  tier1_base_fee bigint not null default 3000,
  tier1_platform_margin bigint not null default 2000,
  tier2_max bigint not null default 9999999,
  tier2_base_fee bigint not null default 5000,
  tier2_platform_margin bigint not null default 3000,
  tier3_base_fee bigint not null default 7000,
  tier3_platform_margin bigint not null default 5000,
  is_auto_payout_enabled boolean not null default true,
  operating_hours_start time not null default '09:00:00',
  operating_hours_end time not null default '16:00:00',
  operating_days int[] not null default array[1,2,3,4,5,6],
  circuit_breaker_active boolean not null default false,
  platform_revenue_wallet_id uuid references public.wallets(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.wallet_platform_settings (id)
values (1)
on conflict (id) do nothing;

-- ───────── 8. STORED PROCEDURES ATOMIK ─────────

-- 8.1 Inisialisasi / Ambil Rekening Dompet Pengguna
create or replace function public.get_or_create_wallet(p_user_id uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_tenant_id uuid;
  v_role public.app_role;
  v_num varchar(32);
begin
  select * into v_wallet from public.wallets where user_id = p_user_id;
  if found then
    return v_wallet;
  end if;

  select tenant_id, role into v_tenant_id, v_role from public.profiles where id = p_user_id;

  if v_role = 'superadmin' then
    v_num := 'SW-PLATFORM-REVENUE';
  else
    v_num := 'SW-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));
  end if;

  insert into public.wallets (user_id, tenant_id, wallet_number, balance, locked_balance)
  values (p_user_id, v_tenant_id, v_num, 0, 0)
  returning * into v_wallet;

  -- Jika superadmin, tautkan ke tabel pengaturan platform
  if v_role = 'superadmin' then
    update public.wallet_platform_settings
    set platform_revenue_wallet_id = v_wallet.id
    where id = 1 and platform_revenue_wallet_id is null;
  end if;

  return v_wallet;
end;
$$;

-- 8.2 Terbitkan Token Pembayaran Dinamis Kasir POS (Masa Aktif 60 Detik)
create or replace function public.generate_wallet_payment_token(
  p_user_id uuid,
  p_amount_limit bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_token_code varchar(6);
  v_token_id uuid;
  v_expires_at timestamptz;
begin
  select * into v_wallet from public.wallets where user_id = p_user_id;
  if not found then
    v_wallet := public.get_or_create_wallet(p_user_id);
  end if;

  if v_wallet.is_frozen then
    raise exception 'Dompet Anda sedang dibekukan: %', coalesce(v_wallet.frozen_reason, 'Hubungi administrator.');
  end if;

  -- Hasilkan kode 6 digit acak
  v_token_code := lpad((floor(random() * 900000 + 100000)::int)::text, 6, '0');
  v_expires_at := now() + interval '60 seconds';

  insert into public.wallet_payment_tokens (
    wallet_id, token_code, amount_limit, expires_at
  ) values (
    v_wallet.id, v_token_code, p_amount_limit, v_expires_at
  ) returning id into v_token_id;

  return jsonb_build_object(
    'ok', true,
    'token_code', v_token_code,
    'wallet_number', v_wallet.wallet_number,
    'expires_at', v_expires_at,
    'seconds_valid', 60
  );
end;
$$;

-- 8.3 Eksekusi Pembayaran Kasir POS Tanpa Fraud (Anti-Fake Void)
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
set search_path = public
as $$
declare
  v_token public.wallet_payment_tokens%rowtype;
  v_customer_wallet public.wallets%rowtype;
  v_merchant_wallet public.wallets%rowtype;
  v_merchant_user_id uuid;
  v_ref_no varchar(36);
  v_txn_id uuid;
  v_existing_id uuid;
begin
  -- Idempotency Guard
  select id into v_existing_id
  from public.wallet_transactions
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'txn_id', v_existing_id);
  end if;

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

  if v_customer_wallet.is_frozen then
    raise exception 'Dompet pelanggan sedang dibekukan.';
  end if;

  if v_customer_wallet.balance < p_amount then
    raise exception 'Saldo S-Wallet pelanggan tidak mencukupi untuk pembayaran ini.';
  end if;

  -- 3. Cari dompet merchant (Owner dari tenant tempat kasir bertugas)
  select p.id into v_merchant_user_id
  from public.profiles cashier
  join public.profiles p on p.tenant_id = cashier.tenant_id and p.role = 'owner'
  where cashier.id = p_cashier_user_id
  limit 1;

  if v_merchant_user_id is null then
    raise exception 'Owner merchant penerima pembayaran tidak ditemukan.';
  end if;

  select * into v_merchant_wallet
  from public.wallets
  where user_id = v_merchant_user_id
  for update;

  if not found then
    v_merchant_wallet := public.get_or_create_wallet(v_merchant_user_id);
    select * into v_merchant_wallet from public.wallets where id = v_merchant_wallet.id for update;
  end if;

  -- 4. Eksekusi pemindahan saldo
  update public.wallets
  set balance = balance - p_amount, updated_at = now()
  where id = v_customer_wallet.id;

  update public.wallets
  set balance = balance + p_amount, updated_at = now()
  where id = v_merchant_wallet.id;

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
    'Pembayaran Pesanan POS #' || p_order_id,
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
    'merchant_wallet', v_merchant_wallet.wallet_number,
    'created_at', now()
  );
end;
$$;

-- 8.4 Transfer Saldo Antar Pengguna P2P (Peer-to-Peer)
create or replace function public.execute_wallet_transfer(
  p_sender_user_id uuid,
  p_receiver_identifier text,
  p_amount bigint,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.wallet_platform_settings%rowtype;
  v_sender_wallet public.wallets%rowtype;
  v_receiver_wallet public.wallets%rowtype;
  v_receiver_profile public.profiles%rowtype;
  v_today_transferred bigint;
  v_ref_no varchar(36);
  v_txn_id uuid;
  v_existing_id uuid;
  v_idem_key varchar(64);
begin
  v_idem_key := coalesce(p_idempotency_key, 'p2p_' || gen_random_uuid()::text);

  select id into v_existing_id
  from public.wallet_transactions
  where idempotency_key = v_idem_key;

  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'txn_id', v_existing_id);
  end if;

  -- Cek Circuit Breaker
  select * into v_settings from public.wallet_platform_settings where id = 1;
  if v_settings.circuit_breaker_active then
    raise exception 'Sistem transfer sedang ditangguhkan sementara oleh administrator (Circuit Breaker).';
  end if;

  if p_amount <= 0 then
    raise exception 'Nominal transfer harus lebih besar dari Rp 0.';
  end if;

  -- Kunci sender wallet
  select * into v_sender_wallet
  from public.wallets
  where user_id = p_sender_user_id
  for update;

  if not found then
    raise exception 'Dompet pengirim tidak ditemukan.';
  end if;

  if v_sender_wallet.is_frozen then
    raise exception 'Dompet pengirim sedang dibekukan.';
  end if;

  if v_sender_wallet.balance < p_amount then
    raise exception 'Saldo S-Wallet tidak mencukupi untuk transfer.';
  end if;

  -- Cek limit harian transfer
  select coalesce(sum(amount), 0) into v_today_transferred
  from public.wallet_transactions
  where sender_wallet_id = v_sender_wallet.id
    and category = 'p2p_transfer'
    and status = 'completed'
    and created_at >= date_trunc('day', now());

  if (v_today_transferred + p_amount) > v_sender_wallet.daily_transfer_limit then
    raise exception 'Transfer melebihi batas limit harian dompet (Maksimal Rp % per hari).', v_sender_wallet.daily_transfer_limit;
  end if;

  -- Cari penerima berdasarkan wallet_number, email, atau profile id
  select p.* into v_receiver_profile
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
  where w.wallet_number = trim(p_receiver_identifier)
     or lower(p.email) = lower(trim(p_receiver_identifier))
     or p.id::text = trim(p_receiver_identifier)
  limit 1;

  if not found then
    raise exception 'Akun penerima (%) tidak ditemukan.', p_receiver_identifier;
  end if;

  if v_receiver_profile.id = p_sender_user_id then
    raise exception 'Anda tidak dapat mentransfer dana ke diri sendiri.';
  end if;

  select * into v_receiver_wallet
  from public.wallets
  where user_id = v_receiver_profile.id
  for update;

  if not found then
    v_receiver_wallet := public.get_or_create_wallet(v_receiver_profile.id);
    select * into v_receiver_wallet from public.wallets where id = v_receiver_wallet.id for update;
  end if;

  if v_receiver_wallet.is_frozen then
    raise exception 'Dompet penerima sedang dibekukan.';
  end if;

  -- Eksekusi debet-kredit
  update public.wallets set balance = balance - p_amount, updated_at = now() where id = v_sender_wallet.id;
  update public.wallets set balance = balance + p_amount, updated_at = now() where id = v_receiver_wallet.id;

  v_ref_no := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, v_idem_key, v_sender_wallet.id, v_receiver_wallet.id,
    p_amount, 0, p_amount, 'p2p_transfer', 'completed',
    coalesce(p_notes, 'Transfer Saldo S-Wallet P2P'),
    jsonb_build_object('receiver_name', v_receiver_profile.full_name, 'receiver_email', v_receiver_profile.email)
  ) returning id into v_txn_id;

  insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
  values
    (v_txn_id, v_sender_wallet.id, 'DEBIT', p_amount, v_sender_wallet.balance, v_sender_wallet.balance - p_amount),
    (v_txn_id, v_receiver_wallet.id, 'CREDIT', p_amount, v_receiver_wallet.balance, v_receiver_wallet.balance + p_amount);

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'amount', p_amount,
    'receiver_name', v_receiver_profile.full_name,
    'receiver_wallet', v_receiver_wallet.wallet_number,
    'new_balance', v_sender_wallet.balance - p_amount
  );
end;
$$;

-- 8.5 Pengajuan Penarikan Dana Bank & Isolasi Saldo Escrow
create or replace function public.request_wallet_withdrawal(
  p_user_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_amount bigint,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.wallet_platform_settings%rowtype;
  v_wallet public.wallets%rowtype;
  v_base_fee bigint;
  v_margin bigint;
  v_total_fee bigint;
  v_total_deducted bigint;
  v_ref_no varchar(36);
  v_withdrawal_id uuid;
  v_txn_id uuid;
  v_wib_time time;
  v_wib_dow int;
  v_is_within_hours boolean;
  v_status varchar(30);
  v_idem_key varchar(64);
begin
  v_idem_key := coalesce(p_idempotency_key, 'wd_' || gen_random_uuid()::text);

  if p_amount < 15000 then
    raise exception 'Batas minimum penarikan dana adalah Rp 15.000.';
  end if;

  select * into v_settings from public.wallet_platform_settings where id = 1;
  if not v_settings.is_auto_payout_enabled then
    raise exception 'Layanan penarikan dana otomatis sedang dinonaktifkan sementara oleh Superadmin.';
  end if;

  -- Hitung biaya penarikan berdasarkan tier konfigurasi
  if p_amount <= v_settings.tier1_max then
    v_base_fee := v_settings.tier1_base_fee;
    v_margin := v_settings.tier1_platform_margin;
  elsif p_amount <= v_settings.tier2_max then
    v_base_fee := v_settings.tier2_base_fee;
    v_margin := v_settings.tier2_platform_margin;
  else
    v_base_fee := v_settings.tier3_base_fee;
    v_margin := v_settings.tier3_platform_margin;
  end if;

  v_total_fee := v_base_fee + v_margin;
  v_total_deducted := p_amount + v_total_fee;

  -- Kunci saldo dompet
  select * into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Dompet pengguna tidak ditemukan.';
  end if;

  if v_wallet.is_frozen then
    raise exception 'Dompet pengguna sedang dibekukan.';
  end if;

  if v_wallet.balance < v_total_deducted then
    raise exception 'Saldo tidak mencukupi (Dibutuhkan Rp % termasuk biaya admin Rp %).', v_total_deducted, v_total_fee;
  end if;

  -- Pengecekan Waktu Nyata WIB (UTC +7)
  v_wib_time := (now() at time zone 'Asia/Jakarta')::time;
  v_wib_dow := extract(dow from (now() at time zone 'Asia/Jakarta'))::int;

  v_is_within_hours := (v_wib_dow = any(v_settings.operating_days))
                   and (v_wib_time >= v_settings.operating_hours_start)
                   and (v_wib_time <= v_settings.operating_hours_end);

  if v_is_within_hours then
    v_status := 'processing';
  else
    v_status := 'scheduled_in_queue';
  end if;

  -- Isolasi saldo: pindahkan dari balance ke locked_balance
  update public.wallets
  set balance = balance - v_total_deducted,
      locked_balance = locked_balance + v_total_deducted,
      updated_at = now()
  where id = v_wallet.id;

  v_ref_no := 'WD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  insert into public.wallet_withdrawals (
    wallet_id, reference_no, bank_name, account_number, account_holder,
    amount, base_fee, platform_fee, total_user_fee, total_deducted,
    status, notes, metadata
  ) values (
    v_wallet.id, v_ref_no, p_bank_name, p_account_number, p_account_holder,
    p_amount, v_base_fee, v_margin, v_total_fee, v_total_deducted,
    v_status,
    case when v_is_within_hours then 'Diproses langsung jam operasional' else 'Antrean penarikan luar jam operasional (Diproses hari kerja berikutnya)' end,
    jsonb_build_object('wib_time', v_wib_time, 'wib_dow', v_wib_dow)
  ) returning id into v_withdrawal_id;

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, v_idem_key, v_wallet.id, null,
    p_amount, v_total_fee, v_total_deducted, 'bank_withdrawal', v_status,
    'Penarikan Dana ke ' || p_bank_name || ' (' || p_account_number || ')',
    jsonb_build_object('withdrawal_id', v_withdrawal_id, 'account_holder', p_account_holder)
  ) returning id into v_txn_id;

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'amount', p_amount,
    'fee', v_total_fee,
    'total_deducted', v_total_deducted,
    'status', v_status,
    'is_within_hours', v_is_within_hours,
    'message', case when v_is_within_hours
      then 'Permintaan penarikan sedang diproses ke bank tujuan Anda.'
      else 'Permintaan dicatat dalam antrean aman dan akan dikliring otomatis pada jam operasional berikutnya (09.00 - 16.00 WIB).'
    end
  );
end;
$$;

-- 8.6 Eksekusi Persetujuan Payout & Pembagian Profit Platform
create or replace function public.execute_approved_payout(
  p_admin_user_id uuid,
  p_withdrawal_id uuid,
  p_gateway_payout_id text default null,
  p_status text default 'completed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role public.app_role;
  v_wd public.wallet_withdrawals%rowtype;
  v_user_wallet public.wallets%rowtype;
  v_platform_wallet public.wallets%rowtype;
  v_settings public.wallet_platform_settings%rowtype;
  v_ref_profit varchar(36);
  v_txn_profit_id uuid;
begin
  select role into v_admin_role from public.profiles where id = p_admin_user_id;
  if v_admin_role != 'superadmin' then
    raise exception 'Unauthorized: Hanya Superadmin yang berhak mengeksekusi payout.';
  end if;

  select * into v_wd
  from public.wallet_withdrawals
  where id = p_withdrawal_id
  for update;

  if not found then
    raise exception 'Data penarikan dana tidak ditemukan.';
  end if;

  if v_wd.status = 'completed' then
    return jsonb_build_object('ok', true, 'message', 'Penarikan sudah diselesaikan sebelumnya.');
  end if;

  select * into v_user_wallet
  from public.wallets
  where id = v_wd.wallet_id
  for update;

  select * into v_settings from public.wallet_platform_settings where id = 1;

  if p_status = 'completed' then
    -- 1. Potong permanen saldo tertahan (locked_balance)
    update public.wallets
    set locked_balance = locked_balance - v_wd.total_deducted,
        updated_at = now()
    where id = v_user_wallet.id;

    -- 2. Alokasikan profit margin platform ke SW-PLATFORM-REVENUE
    select * into v_platform_wallet
    from public.wallets
    where id = v_settings.platform_revenue_wallet_id
    for update;

    if found and v_wd.platform_fee > 0 then
      update public.wallets
      set balance = balance + v_wd.platform_fee,
          updated_at = now()
      where id = v_platform_wallet.id;

      v_ref_profit := 'PRF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

      insert into public.wallet_transactions (
        reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
        amount, fee, total_deducted, category, status, notes, metadata
      ) values (
        v_ref_profit, 'profit_' || v_wd.reference_no, null, v_platform_wallet.id,
        v_wd.platform_fee, 0, v_wd.platform_fee, 'platform_fee_revenue', 'completed',
        'Keuntungan Bersih Website dari Penarikan ' || v_wd.reference_no,
        jsonb_build_object('source_withdrawal_id', v_wd.id, 'base_fee', v_wd.base_fee)
      ) returning id into v_txn_profit_id;

      insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
      values (v_txn_profit_id, v_platform_wallet.id, 'CREDIT', v_wd.platform_fee, v_platform_wallet.balance, v_platform_wallet.balance + v_wd.platform_fee);
    end if;

    update public.wallet_withdrawals
    set status = 'completed',
        gateway_payout_id = coalesce(p_gateway_payout_id, v_wd.gateway_payout_id),
        approved_by = p_admin_user_id,
        approved_at = now(),
        updated_at = now()
    where id = v_wd.id;

    update public.wallet_transactions
    set status = 'completed'
    where reference_no = v_wd.reference_no;

  else
    -- Jika Ditolak / Gagal: Kembalikan locked_balance ke balance
    update public.wallets
    set balance = balance + v_wd.total_deducted,
        locked_balance = locked_balance - v_wd.total_deducted,
        updated_at = now()
    where id = v_user_wallet.id;

    update public.wallet_withdrawals
    set status = 'rejected',
        approved_by = p_admin_user_id,
        approved_at = now(),
        updated_at = now()
    where id = v_wd.id;

    update public.wallet_transactions
    set status = 'failed'
    where reference_no = v_wd.reference_no;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status, 'reference_no', v_wd.reference_no);
end;
$$;

-- 8.7 Kredit Saldo Masuk dari Webhook Gateway Pembayaran Digital (Top-Up)
create or replace function public.process_wallet_topup(
  p_order_id text,
  p_amount bigint,
  p_user_id uuid,
  p_method text default 'qris',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_ref_no varchar(36);
  v_txn_id uuid;
  v_existing_id uuid;
  v_idem_key varchar(64);
begin
  v_idem_key := coalesce(p_idempotency_key, 'topup_' || p_order_id);

  select id into v_existing_id
  from public.wallet_transactions
  where idempotency_key = v_idem_key;

  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'txn_id', v_existing_id);
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    v_wallet := public.get_or_create_wallet(p_user_id);
    select * into v_wallet from public.wallets where id = v_wallet.id for update;
  end if;

  -- Tambahkan saldo riil
  update public.wallets
  set balance = balance + p_amount, updated_at = now()
  where id = v_wallet.id;

  v_ref_no := 'TOP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  insert into public.wallet_transactions (
    reference_no, idempotency_key, sender_wallet_id, receiver_wallet_id,
    amount, fee, total_deducted, category, status, notes, metadata
  ) values (
    v_ref_no, v_idem_key, null, v_wallet.id,
    p_amount, 0, p_amount, 'topup_gateway', 'completed',
    'Pengisian Saldo S-Wallet via ' || upper(p_method) || ' (' || p_order_id || ')',
    jsonb_build_object('order_id', p_order_id, 'payment_method', p_method)
  ) returning id into v_txn_id;

  insert into public.wallet_ledger (txn_id, wallet_id, entry_type, amount, balance_before, balance_after)
  values (v_txn_id, v_wallet.id, 'CREDIT', p_amount, v_wallet.balance, v_wallet.balance + p_amount);

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_ref_no,
    'amount', p_amount,
    'new_balance', v_wallet.balance + p_amount
  );
end;
$$;

-- 8.8 Intervensi Penyesuaian Saldo oleh Superadmin (Audit-Logged)
create or replace function public.admin_adjust_wallet_balance(
  p_admin_user_id uuid,
  p_target_wallet_id uuid,
  p_amount bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role public.app_role;
  v_target_wallet public.wallets%rowtype;
  v_ref_no varchar(36);
  v_txn_id uuid;
begin
  select role into v_admin_role from public.profiles where id = p_admin_user_id;
  if v_admin_role != 'superadmin' then
    raise exception 'Unauthorized: Hanya Superadmin yang berhak melakukan penyesuaian saldo.';
  end if;

  if trim(p_reason) = '' or p_reason is null then
    raise exception 'Alasan audit penyesuaian saldo wajib diisi.';
  end if;

  select * into v_target_wallet
  from public.wallets
  where id = p_target_wallet_id
  for update;

  if not found then
    raise exception 'Dompet target tidak ditemukan.';
  end if;

  if (v_target_wallet.balance + p_amount) < 0 then
    raise exception 'Penyesuaian saldo ditolak: Saldo dompet tidak boleh negatif.';
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
    'Penyesuaian Saldo Superadmin: ' || p_reason,
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

-- 8.9 Ringkasan Dasbor Finansial Pengguna (KPI & Status)
create or replace function public.get_wallet_dashboard_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_in_month bigint;
  v_out_month bigint;
begin
  select * into v_wallet from public.wallets where user_id = p_user_id;
  if not found then
    v_wallet := public.get_or_create_wallet(p_user_id);
  end if;

  select coalesce(sum(amount), 0) into v_in_month
  from public.wallet_transactions
  where receiver_wallet_id = v_wallet.id
    and status = 'completed'
    and created_at >= date_trunc('month', now());

  select coalesce(sum(amount), 0) into v_out_month
  from public.wallet_transactions
  where sender_wallet_id = v_wallet.id
    and status = 'completed'
    and created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'wallet_id', v_wallet.id,
    'wallet_number', v_wallet.wallet_number,
    'balance', v_wallet.balance,
    'locked_balance', v_wallet.locked_balance,
    'currency', v_wallet.currency,
    'is_frozen', v_wallet.is_frozen,
    'in_month', v_in_month,
    'out_month', v_out_month
  );
end;
$$;

-- ───────── 9. ROW-LEVEL SECURITY (RLS) POLICIES ─────────
alter table public.wallets enable row level security;
alter table public.wallet_payment_tokens enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.wallet_withdrawals enable row level security;
alter table public.wallet_platform_settings enable row level security;

-- Wallets
create policy "wallets_select" on public.wallets
  for select using (
    public.is_superadmin() or user_id = auth.uid()
  );

-- Payment Tokens
create policy "pay_tokens_select" on public.wallet_payment_tokens
  for select using (
    public.is_superadmin()
    or wallet_id in (select id from public.wallets where user_id = auth.uid())
    or public.current_app_role() in ('staff', 'gm', 'owner')
  );

-- Transactions
create policy "wallet_txns_select" on public.wallet_transactions
  for select using (
    public.is_superadmin()
    or sender_wallet_id in (select id from public.wallets where user_id = auth.uid())
    or receiver_wallet_id in (select id from public.wallets where user_id = auth.uid())
  );

-- Ledger
create policy "wallet_ledger_select" on public.wallet_ledger
  for select using (
    public.is_superadmin()
    or wallet_id in (select id from public.wallets where user_id = auth.uid())
  );

-- Withdrawals
create policy "wallet_withdrawals_select" on public.wallet_withdrawals
  for select using (
    public.is_superadmin()
    or wallet_id in (select id from public.wallets where user_id = auth.uid())
  );

-- Platform Settings
create policy "wallet_settings_select" on public.wallet_platform_settings
  for select using (true);

create policy "wallet_settings_update" on public.wallet_platform_settings
  for update using (public.is_superadmin());
