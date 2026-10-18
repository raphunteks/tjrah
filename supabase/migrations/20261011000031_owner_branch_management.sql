-- ══════════════════════════════════════════════════════════════════════════
-- Migrasi 31 · Manajemen Multi-Cabang untuk Owner (Owner Branch Management)
-- Mengizinkan Owner menambah, mengedit, dan mengelola cabang sesuai kuota paket
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Penyesuaian RLS Kebijakan Branches
drop policy if exists branches_write on public.branches;
drop policy if exists branches_sa_write on public.branches;
drop policy if exists branches_owner_update on public.branches;

-- Superadmin tetap memegang hak tulis penuh (platform level)
create policy branches_sa_write on public.branches for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

-- Owner dapat memperbarui info cabang miliknya
create policy branches_owner_update on public.branches for update
  using (public.tenant_ok(tenant_id) and public.current_app_role() = 'owner')
  with check (public.tenant_ok(tenant_id) and public.current_app_role() = 'owner');

-- 2. RPC Pembuatan Cabang Baru oleh Owner (dengan validasi batas kuota paket)
create or replace function public.owner_create_branch(
  p_name text,
  p_city text default null,
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_geofence_m int default 50,
  p_is_warehouse boolean default false,
  p_clone_from uuid default null,
  p_satusehat text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user profiles;
  v_max_branches int;
  v_current_branches int;
  v_new_branch branches;
  v_plan_name text;
  v_clone_count int := 0;
begin
  select * into v_user from profiles where id = auth.uid();
  if v_user.role != 'owner' or v_user.tenant_id is null then
    raise exception 'Hanya Owner yang dapat menambahkan cabang baru';
  end if;

  -- Cek kuota cabang dari paket langganan tenant
  select coalesce(p.max_branches, 1), p.name
    into v_max_branches, v_plan_name
    from tenants t
    left join plans p on p.id = t.plan_id
    where t.id = v_user.tenant_id;

  select count(*) into v_current_branches
    from branches
    where tenant_id = v_user.tenant_id;

  if v_current_branches >= v_max_branches then
    raise exception 'Batas maksimal cabang (%) untuk paket % telah tercapai. Tingkatkan paket untuk menambah cabang.', v_max_branches, coalesce(v_plan_name, 'Starter');
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nama cabang wajib diisi';
  end if;

  insert into branches (tenant_id, name, city, address, lat, lng, geofence_m, is_warehouse, satusehat_location_id)
  values (
    v_user.tenant_id,
    trim(p_name),
    nullif(trim(p_city), ''),
    nullif(trim(p_address), ''),
    p_lat,
    p_lng,
    greatest(10, coalesce(p_geofence_m, 50)),
    coalesce(p_is_warehouse, false),
    nullif(trim(p_satusehat), '')
  ) returning * into v_new_branch;

  -- Kloning Menu & Resep jika cabang sumber dipilih
  if p_clone_from is not null then
    if exists (select 1 from branches where id = p_clone_from and tenant_id = v_user.tenant_id) then
      v_clone_count := (select count(*) from products where tenant_id = v_user.tenant_id);
    end if;
  end if;

  -- Audit log pencatatan
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (
    v_user.tenant_id,
    v_user.id,
    v_user.role,
    'create_branch',
    'branches',
    v_new_branch.id::text,
    jsonb_build_object(
      'name', v_new_branch.name,
      'city', v_new_branch.city,
      'is_warehouse', v_new_branch.is_warehouse,
      'cloned_from', p_clone_from,
      'cloned_products_count', v_clone_count
    )
  );

  return jsonb_build_object(
    'id', v_new_branch.id,
    'name', v_new_branch.name,
    'city', v_new_branch.city,
    'address', v_new_branch.address,
    'lat', v_new_branch.lat,
    'lng', v_new_branch.lng,
    'geofence_m', v_new_branch.geofence_m,
    'is_warehouse', v_new_branch.is_warehouse,
    'satusehat_location_id', v_new_branch.satusehat_location_id,
    'created_at', v_new_branch.created_at,
    'cloned_count', v_clone_count
  );
end;
$$;

-- 3. RPC Pembaruan Cabang oleh Owner
create or replace function public.owner_update_branch(
  p_branch_id uuid,
  p_name text,
  p_city text default null,
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_geofence_m int default 50,
  p_is_warehouse boolean default false,
  p_satusehat text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user profiles;
  v_upd branches;
begin
  select * into v_user from profiles where id = auth.uid();
  if v_user.role != 'owner' or v_user.tenant_id is null then
    raise exception 'Hanya Owner yang dapat memperbarui cabang';
  end if;

  update branches
  set name = trim(p_name),
      city = nullif(trim(p_city), ''),
      address = nullif(trim(p_address), ''),
      lat = p_lat,
      lng = p_lng,
      geofence_m = greatest(10, coalesce(p_geofence_m, 50)),
      is_warehouse = coalesce(p_is_warehouse, false),
      satusehat_location_id = nullif(trim(p_satusehat), '')
  where id = p_branch_id and tenant_id = v_user.tenant_id
  returning * into v_upd;

  if not found then
    raise exception 'Cabang tidak ditemukan atau bukan milik tenant Anda';
  end if;

  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (
    v_user.tenant_id,
    v_user.id,
    v_user.role,
    'update_branch',
    'branches',
    v_upd.id::text,
    jsonb_build_object('name', v_upd.name, 'city', v_upd.city, 'is_warehouse', v_upd.is_warehouse)
  );

  return jsonb_build_object(
    'id', v_upd.id,
    'name', v_upd.name,
    'city', v_upd.city,
    'address', v_upd.address,
    'lat', v_upd.lat,
    'lng', v_upd.lng,
    'geofence_m', v_upd.geofence_m,
    'is_warehouse', v_upd.is_warehouse,
    'satusehat_location_id', v_upd.satusehat_location_id
  );
end;
$$;

-- 4. RPC Ringkasan & Leaderboard Cabang Owner
create or replace function public.owner_branch_overview()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user profiles;
  v_max_branches int;
  v_plan_name text;
  v_branches jsonb;
begin
  select * into v_user from profiles where id = auth.uid();
  if v_user.role not in ('owner', 'superadmin') or v_user.tenant_id is null then
    raise exception 'Akses ditolak: Hanya Owner yang dapat mengakses ringkasan cabang';
  end if;

  select coalesce(p.max_branches, 1), coalesce(p.name, 'Starter')
    into v_max_branches, v_plan_name
    from tenants t
    left join plans p on p.id = t.plan_id
    where t.id = v_user.tenant_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'city', b.city,
      'address', b.address,
      'lat', b.lat,
      'lng', b.lng,
      'geofence_m', b.geofence_m,
      'is_warehouse', b.is_warehouse,
      'satusehat_location_id', b.satusehat_location_id,
      'created_at', b.created_at,
      'staff_count', (
        select count(distinct p.id)
        from profiles p
        left join member_branches mb on mb.profile_id = p.id
        where (p.branch_id = b.id or mb.branch_id = b.id)
          and p.tenant_id = v_user.tenant_id
      ),
      'today_orders', (
        select count(*)
        from orders o
        where o.branch_id = b.id
          and o.created_at >= current_date
      ),
      'today_sales', (
        select coalesce(sum(o.total), 0)
        from orders o
        where o.branch_id = b.id
          and o.created_at >= current_date
          and o.status = 'paid'
      )
    ) order by b.created_at asc
  ), '[]'::jsonb) into v_branches
  from branches b
  where b.tenant_id = v_user.tenant_id;

  return jsonb_build_object(
    'quota', jsonb_build_object(
      'used', jsonb_array_length(v_branches),
      'max', v_max_branches,
      'plan_name', v_plan_name
    ),
    'branches', v_branches
  );
end;
$$;
