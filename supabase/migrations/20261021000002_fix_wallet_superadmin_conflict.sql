-- ============================================================================
-- Migrasi: Idempotensi Dompet Superadmin & Pencegahan HTTP 409
-- Mengamankan get_or_create_wallet dari duplikasi SW-PLATFORM-REVENUE
-- dan ketiadaan profil pada public.profiles
-- ============================================================================

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
  -- 1. Cek apakah dompet sudah pernah dibuat
  select * into v_wallet from public.wallets where user_id = p_user_id;
  if found then
    return v_wallet;
  end if;

  -- 2. Cek profil pengguna
  select tenant_id, role into v_tenant_id, v_role from public.profiles where id = p_user_id;
  if not found then
    -- Profil belum ada, kembalikan null secara aman tanpa melempar eksepsi
    return null;
  end if;

  -- 3. Tentukan nomor rekening dompet secara unik
  if v_role = 'superadmin' then
    if not exists (select 1 from public.wallets where wallet_number = 'SW-PLATFORM-REVENUE') then
      v_num := 'SW-PLATFORM-REVENUE';
    else
      v_num := 'SW-ADMIN-' || upper(substring(gen_random_uuid()::text from 1 for 8));
    end if;
  else
    v_num := 'SW-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));
  end if;

  -- 4. Simpan dengan perlindungan ON CONFLICT
  insert into public.wallets (user_id, tenant_id, wallet_number, balance, locked_balance)
  values (p_user_id, v_tenant_id, v_num, 0, 0)
  on conflict (user_id) do update set updated_at = now()
  returning * into v_wallet;

  -- 5. Hubungkan ke wallet_platform_settings jika ini revenue wallet pertama
  if v_role = 'superadmin' and v_num = 'SW-PLATFORM-REVENUE' then
    update public.wallet_platform_settings
    set platform_revenue_wallet_id = v_wallet.id
    where id = 1 and platform_revenue_wallet_id is null;
  end if;

  return v_wallet;
end;
$$;

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

  if v_wallet.id is null then
    return jsonb_build_object(
      'wallet_id', null,
      'wallet_number', 'SW-BELUM-AKTIF',
      'balance', 0,
      'locked_balance', 0,
      'currency', 'IDR',
      'is_frozen', false,
      'in_month', 0,
      'out_month', 0
    );
  end if;

  -- Hitung arus kas bulan berjalan
  select coalesce(sum(amount), 0) into v_in_month
  from public.wallet_transactions
  where to_wallet_id = v_wallet.id
    and status = 'success'
    and created_at >= date_trunc('month', now());

  select coalesce(sum(amount), 0) into v_out_month
  from public.wallet_transactions
  where from_wallet_id = v_wallet.id
    and status = 'success'
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
