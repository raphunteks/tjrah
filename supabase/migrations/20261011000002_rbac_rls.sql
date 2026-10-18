-- Harum.in · Fungsi RBAC + Row-Level Security
-- Setiap policy memanggil has_perm(fitur, aksi) yang membaca tabel rbac_matrix (versi ASLI dokumen).

-- ───────── Helper identitas (security definer → aman dari rekursi RLS profiles) ─────────
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid()), false)
$$;

-- has_perm(7, 'r') → apakah role pengguna saat ini punya aksi tsb pada fitur 7.
create or replace function public.has_perm(p_feature int, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_action
      when 'c' then can_create when 'r' then can_read when 'u' then can_update
      when 'd' then can_delete when 'a' then can_approve when 'q' then can_request
      else false end
    from public.rbac_matrix
    where feature = p_feature and role = public.current_app_role()
  ), false)
$$;

create or replace function public.perm_scope(p_feature int) returns text
language sql stable security definer set search_path = public as $$
  select scope from public.rbac_matrix where feature = p_feature and role = public.current_app_role()
$$;

-- Superadmin melihat lintas tenant; role lain hanya tenant-nya.
create or replace function public.tenant_ok(p_tenant uuid) returns boolean
language sql stable as $$
  select public.is_superadmin() or p_tenant = public.current_tenant_id()
$$;

-- Staff & Dokter terbatas pada cabangnya; Owner/GM/Superadmin seluruh cabang.
create or replace function public.branch_ok(p_branch uuid) returns boolean
language sql stable as $$
  select public.current_app_role() in ('superadmin', 'owner', 'gm')
      or p_branch is null or p_branch = public.current_branch_id()
$$;

-- ───────── Aktifkan RLS ─────────
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.invoices enable row level security;
alter table public.platform_settings enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_integrations enable row level security;
alter table public.rbac_matrix enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.approvals enable row level security;
alter table public.capital_applications enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.hermes_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.blueprint_docs enable row level security;

-- ───────── Fitur 1 · Konfigurasi Tenant, 9router & Hermes ─────────
-- plans: paket aktif terbaca publik (landing page); tulis hanya pemilik CRUD fitur 1.
create policy plans_read on public.plans for select using (is_active or public.has_perm(1, 'r'));
create policy plans_write on public.plans for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy tenants_read on public.tenants for select using (public.tenant_ok(id));
create policy tenants_insert on public.tenants for insert with check (public.is_superadmin() and public.has_perm(1, 'c'));
create policy tenants_update on public.tenants for update using (public.is_superadmin() and public.has_perm(1, 'u'));
create policy tenants_delete on public.tenants for delete using (public.is_superadmin() and public.has_perm(1, 'd'));

create policy invoices_read on public.invoices for select using (public.tenant_ok(tenant_id) and public.has_perm(1, 'r'));
create policy invoices_write on public.invoices for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy settings_all on public.platform_settings for all
  using (public.is_superadmin() and public.has_perm(1, 'r'))
  with check (public.is_superadmin() and public.has_perm(1, 'u'));

create policy integrations_read on public.tenant_integrations for select using (public.tenant_ok(tenant_id) and public.has_perm(1, 'r'));
create policy integrations_write on public.tenant_integrations for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy branches_read on public.branches for select using (public.tenant_ok(tenant_id));
create policy branches_write on public.branches for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

-- ───────── Fitur 13 · Master Karyawan (profiles) ─────────
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or (public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null));
create policy profiles_insert on public.profiles for insert
  with check (public.tenant_ok(tenant_id) and public.has_perm(13, 'c'));
create policy profiles_update on public.profiles for update
  using (public.tenant_ok(tenant_id) and public.has_perm(13, 'u'));
create policy profiles_delete on public.profiles for delete
  using (public.tenant_ok(tenant_id) and public.has_perm(13, 'd') and id <> auth.uid());

-- Cegah eskalasi peran: hanya Superadmin yang boleh membuat superadmin/owner,
-- dan tidak ada yang boleh mengubah perannya sendiri.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role();
begin
  if auth.uid() is null then return new; end if; -- service role / seed
  if tg_op = 'UPDATE' and new.id = auth.uid() and new.role <> old.role then
    raise exception 'Tidak boleh mengubah peran sendiri';
  end if;
  if me <> 'superadmin' and new.role in ('superadmin', 'owner') then
    raise exception 'Hanya Superadmin yang dapat menetapkan peran %', new.role;
  end if;
  if me = 'gm' and new.role = 'gm' and (tg_op = 'INSERT' or old.role <> 'gm') then
    raise exception 'GM tidak dapat mengangkat GM lain';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- ───────── Matriks: terbaca semua pengguna login, tidak bisa diubah dari klien ─────────
create policy rbac_read on public.rbac_matrix for select to authenticated using (true);

-- ───────── Fitur 5 · Register Transaksi POS ─────────
create policy orders_read on public.orders for select
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'r'));
create policy orders_insert on public.orders for insert
  with check (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'c'));
create policy orders_update on public.orders for update
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'u'));
create policy orders_delete on public.orders for delete
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'd'));

create policy payments_read on public.payments for select using (public.tenant_ok(tenant_id) and public.has_perm(5, 'r'));
create policy payments_write on public.payments for insert with check (public.tenant_ok(tenant_id) and public.has_perm(5, 'c'));

-- ───────── Fitur 11 · Akuntansi, Jurnal & Neraca ─────────
create policy accounts_read on public.accounts for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy accounts_write on public.accounts for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));
create policy je_read on public.journal_entries for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy je_write on public.journal_entries for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));
create policy jl_read on public.journal_lines for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy jl_write on public.journal_lines for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));

-- ───────── Persetujuan (fitur mengikuti kolom `feature`) ─────────
create policy approvals_read on public.approvals for select
  using (public.tenant_ok(tenant_id) and (
    (public.has_perm(feature, 'r') and public.perm_scope(feature) is null)
    or requested_by = auth.uid()));
create policy approvals_insert on public.approvals for insert
  with check (public.tenant_ok(tenant_id) and (public.has_perm(feature, 'c') or public.has_perm(feature, 'q')));
-- Tidak ada policy UPDATE: keputusan hanya lewat RPC decide_approval().

-- ───────── Fitur 19 · Capital & Payout ─────────
create policy capital_read on public.capital_applications for select using (public.tenant_ok(tenant_id) and public.has_perm(19, 'r'));
create policy capital_insert on public.capital_applications for insert with check (public.tenant_ok(tenant_id) and public.has_perm(19, 'c'));
create policy capital_update on public.capital_applications for update using (public.tenant_ok(tenant_id) and public.has_perm(19, 'u'));
create policy capital_delete on public.capital_applications for delete using (public.tenant_ok(tenant_id) and public.has_perm(19, 'd'));
create policy payout_read on public.payout_accounts for select using (public.tenant_ok(tenant_id) and public.has_perm(19, 'r'));
create policy payout_write on public.payout_accounts for all
  using (public.tenant_ok(tenant_id) and public.has_perm(19, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(19, 'c'));

-- ───────── Fitur 2 · Hermes feed (bagian dashboard eksekutif) ─────────
create policy hermes_read on public.hermes_events for select using (public.tenant_ok(tenant_id) and public.has_perm(2, 'r'));
-- INSERT hanya dari Edge Function (service role melewati RLS).

-- ───────── Audit log ─────────
create policy audit_read on public.audit_logs for select
  using (public.is_superadmin() or (tenant_id = public.current_tenant_id() and public.has_perm(1, 'r')));

-- ───────── Blueprint: hanya Superadmin ─────────
create policy blueprint_read on public.blueprint_docs for select using (public.is_superadmin());
