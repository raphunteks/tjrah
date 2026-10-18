-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4 — Pertumbuhan platform. Logika & skrip (tabel, RPC, trigger, Edge); UI belum dibuat.
--  4.1 Tagihan & dunning otomatis      generate_invoices(), run_dunning(), mark_invoice_paid(), billing_status()
--  4.2 Feature flags                    feature_flags, has_flag(), my_flags(), set_feature_flag(), set_flag_override()
--  4.3 Metering AI                      ai_usage, ai_quota_check(), ai_record_usage(), ai_usage_summary()
--  4.4 Template industri                industry_templates, apply_industry_template()
--  4.5 Mode offline                     orders.client_ref, sync_offline_orders()  (+ src/lib/offlineQueue.js)
--  4.6 Benchmark anonim                 benchmark_monthly, refresh_benchmark(), my_benchmark()  (opt-in, kohort ≥ 5)
--  4.7 Reseller                         resellers, reseller_commissions, assign_reseller(), reseller_statement()
-- Tidak mengubah matriks RBAC. Operasi platform = Superadmin (is_superadmin()); jalur sistem = auth.uid() null / service_role.
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ 4.7 (lebih dulu: dirujuk tagihan) Reseller ══════════════════════════════
create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{3,20}$'),
  name text not null,
  contact_email text,
  commission_pct numeric(5,2) not null default 20 check (commission_pct between 0 and 50),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
alter table public.tenants add column if not exists reseller_id uuid references public.resellers(id) on delete set null;
create table if not exists public.reseller_commissions (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  base_amount numeric(14,2) not null,
  pct numeric(5,2) not null,
  amount numeric(14,2) not null,
  status text not null default 'accrued' check (status in ('accrued', 'paid', 'void')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.resellers enable row level security;
alter table public.reseller_commissions enable row level security;
create policy resellers_sa on public.resellers for select using (is_superadmin());
create policy reseller_comm_sa on public.reseller_commissions for select using (is_superadmin());

create or replace function public.create_reseller(p_code text, p_name text, p_email text default null, p_pct numeric default 20)
returns resellers language plpgsql security definer set search_path = public as $$
declare r resellers;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola reseller'; end if;
  insert into resellers (code, name, contact_email, commission_pct) values (upper(btrim(p_code)), btrim(p_name), p_email, p_pct) returning * into r;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'reseller_created', 'resellers', r.id::text, jsonb_build_object('code', r.code, 'pct', r.commission_pct));
  return r;
end $$;

create or replace function public.assign_reseller(p_tenant uuid, p_reseller uuid) returns tenants
language plpgsql security definer set search_path = public as $$
declare t tenants;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola reseller'; end if;
  if p_reseller is not null and not exists (select 1 from resellers where id = p_reseller and status = 'active') then raise exception 'Reseller tidak aktif'; end if;
  update tenants set reseller_id = p_reseller where id = p_tenant returning * into t;
  if not found then raise exception 'Tenant tidak ditemukan'; end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'reseller_assigned', 'tenants', p_tenant::text, jsonb_build_object('reseller', p_reseller));
  return t;
end $$;

create or replace function public.reseller_statement(p_reseller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang melihat laporan reseller'; end if;
  return jsonb_build_object(
    'reseller', (select to_jsonb(r) - 'contact_email' from resellers r where r.id = p_reseller),
    'tenants_aktif', (select count(*) from tenants where reseller_id = p_reseller and status in ('active', 'past_due')),
    'accrued', coalesce((select sum(amount) from reseller_commissions where reseller_id = p_reseller and status = 'accrued'), 0),
    'paid', coalesce((select sum(amount) from reseller_commissions where reseller_id = p_reseller and status = 'paid'), 0),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('tenant', t.name, 'invoice_period', i.period, 'base', c.base_amount, 'pct', c.pct, 'amount', c.amount, 'status', c.status) order by c.created_at desc)
                       from reseller_commissions c join tenants t on t.id = c.tenant_id join invoices i on i.id = c.invoice_id where c.reseller_id = p_reseller), '[]'));
end $$;

create or replace function public.pay_reseller_commissions(p_reseller uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare total numeric;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang membayar komisi'; end if;
  with u as (update reseller_commissions set status = 'paid', paid_at = now() where reseller_id = p_reseller and status = 'accrued' returning amount)
  select coalesce(sum(amount), 0) into total from u;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'reseller_paid', 'resellers', p_reseller::text, jsonb_build_object('amount', total));
  return total;
end $$;

-- ═══ 4.1 Tagihan & dunning ═══════════════════════════════════════════════════
alter table public.invoices
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_ref text,
  add column if not exists reminder_stage smallint not null default 0;
alter table public.plans add column if not exists ai_quota_tokens bigint not null default 0 check (ai_quota_tokens >= 0),
  add column if not exists ai_unlimited boolean not null default false;   -- paket baru: AI mati sampai kuota diisi (aman secara bawaan)
alter table public.tenants add column if not exists ai_quota_override bigint check (ai_quota_override >= 0);
update public.plans set ai_quota_tokens = case code when 'growth' then 500000 else 0 end, ai_unlimited = (code = 'enterprise') where code in ('starter', 'growth', 'enterprise');

-- Saklar penagihan otomatis (bawaan MATI). Aktifkan hanya setelah tagihan manual yang ada dirapikan:
--   insert into platform_settings(key,value) values ('billing','{"enabled":true}') on conflict (key) do update set value = excluded.value;
create or replace function public._billing_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean from platform_settings where key = 'billing'), false) $$;
revoke execute on function public._billing_on() from public, anon, authenticated;

-- Satu tagihan per tenant per bulan (idempotent); hanya tenant berbayar dengan harga paket terisi.
create or replace function public.generate_invoices(p_period date default null) returns int
language plpgsql security definer set search_path = public as $$
declare per date; n int := 0; r record;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  if not _billing_on() then return 0; end if;
  per := date_trunc('month', coalesce(p_period, current_date))::date;
  perform pg_advisory_xact_lock(hashtext('generate_invoices'));
  for r in select t.id, p.price_month from tenants t join plans p on p.id = t.plan_id
           where t.status in ('active', 'past_due') and p.price_month is not null and p.price_month > 0
             and not exists (select 1 from invoices i where i.tenant_id = t.id and i.period = per and i.status <> 'void') loop
    insert into invoices (tenant_id, period, amount, due_date) values (r.id, per, r.price_month, greatest(per + 7, current_date + 7));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._suspend_for_dunning(p_tenant uuid, p_inv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tenants set status_before_suspend = status, status = 'suspended', suspended_reason = 'Tagihan menunggak (otomatis)', suspended_at = now()
   where id = p_tenant and status <> 'suspended';
  insert into audit_logs (tenant_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, 'superadmin', 'tenant_suspended_dunning', 'invoices', p_inv::text, '{}');
end $$;
revoke execute on function public._suspend_for_dunning(uuid, uuid) from public, anon, authenticated;

-- Jadwal: H+1 pengingat · H+3 tenant 'past_due' · H+7 peringatan akhir · H+14 ditangguhkan. Tiap tahap sekali.
create or replace function public.run_dunning() returns int
language plpgsql security definer set search_path = public as $$
declare r record; d int; stage int; n int := 0; msg text;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  if not _billing_on() then return 0; end if;
  for r in select i.id, i.tenant_id, i.amount, i.period, i.reminder_stage, coalesce(i.due_date, i.period + 7) as due, t.name, t.status as tstatus
           from invoices i join tenants t on t.id = i.tenant_id
           where i.status = 'unpaid' and t.status in ('active', 'past_due') for update of i skip locked loop
    d := _tenant_now(r.tenant_id)::date - r.due;
    stage := case when d >= 14 then 4 when d >= 7 then 3 when d >= 3 then 2 when d >= 1 then 1 else 0 end;
    continue when stage <= r.reminder_stage;
    msg := case stage
      when 1 then format('Pengingat: tagihan Harum.in %s sebesar %s jatuh tempo %s. Mohon segera dibayar.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), to_char(r.due, 'DD Mon'))
      when 2 then format('Tagihan %s (%s) terlambat %s hari. Akun masuk status tertunggak.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), d)
      when 3 then format('PERINGATAN AKHIR: tagihan %s (%s) terlambat %s hari. Akun akan ditangguhkan pada H+14 jika belum dibayar.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), d)
      else format('Akun %s ditangguhkan karena tagihan %s (%s) belum dibayar. Hubungi tim Harum.in untuk mengaktifkan kembali.', r.name, to_char(r.period, 'Mon YYYY'), _rp(r.amount)) end;
    perform _hermes(r.tenant_id, 'whatsapp', 'Owner', 'dunning', msg, jsonb_build_object('invoice_id', r.id, 'stage', stage));
    update invoices set reminder_stage = stage where id = r.id;
    if stage >= 2 and r.tstatus = 'active' then update tenants set status = 'past_due' where id = r.tenant_id; end if;
    if stage = 4 then perform _suspend_for_dunning(r.tenant_id, r.id); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._mark_paid(p_inv uuid, p_ref text) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices; t tenants; rs resellers;
begin
  select * into i from invoices where id = p_inv for update;
  if not found then raise exception 'Tagihan tidak ditemukan'; end if;
  if i.status = 'paid' then return i; end if;                              -- idempotent (webhook bisa terkirim ulang)
  if i.status = 'void' then raise exception 'Tagihan sudah dibatalkan'; end if;
  update invoices set status = 'paid', paid_at = now(), payment_ref = left(p_ref, 120) where id = i.id returning * into i;
  select * into t from tenants where id = i.tenant_id for update;
  update tenants set current_period_end = greatest(coalesce(current_period_end, current_date), (i.period + interval '1 month')::date) where id = t.id;
  if not exists (select 1 from invoices x where x.tenant_id = t.id and x.status = 'unpaid' and coalesce(x.due_date, x.period + 7) < _tenant_now(t.id)::date) then
    if t.status = 'past_due' then update tenants set status = 'active' where id = t.id;
    elsif t.status = 'suspended' and t.suspended_reason like 'Tagihan menunggak%' then
      update tenants set status = case when status_before_suspend in ('active', 'trial') then status_before_suspend else 'active' end,
             suspended_reason = null, suspended_at = null, status_before_suspend = null where id = t.id;
    end if;
  end if;
  if t.reseller_id is not null then
    select * into rs from resellers where id = t.reseller_id;
    if found and rs.status = 'active' then
      insert into reseller_commissions (reseller_id, tenant_id, invoice_id, base_amount, pct, amount)
      values (rs.id, t.id, i.id, i.amount, rs.commission_pct, round(i.amount * rs.commission_pct / 100, 0)) on conflict (invoice_id) do nothing;
    end if;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t.id, auth.uid(), current_app_role(), 'invoice_paid', 'invoices', i.id::text, jsonb_build_object('ref', p_ref, 'amount', i.amount));
  return i;
end $$;
revoke execute on function public._mark_paid(uuid, text) from public, anon, authenticated;

create or replace function public.mark_invoice_paid(p_invoice uuid, p_ref text default null) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengonfirmasi pembayaran'; end if;
  return _mark_paid(p_invoice, coalesce(p_ref, 'manual'));
end $$;

-- Untuk webhook payment gateway (Edge Function billing-webhook, service_role). Tidak diberikan ke authenticated.
create or replace function public.mark_invoice_paid_system(p_invoice uuid, p_ref text) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  return _mark_paid(p_invoice, p_ref);
end $$;
revoke execute on function public.mark_invoice_paid_system(uuid, text) from public, anon, authenticated;

create or replace function public.void_invoice(p_invoice uuid, p_reason text) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Alasan pembatalan wajib'; end if;
  select * into i from invoices where id = p_invoice for update;
  if not found or i.status = 'void' then raise exception 'Tagihan tidak ditemukan'; end if;
  if i.status = 'paid' then raise exception 'Tagihan lunas tidak bisa dibatalkan'; end if;
  update invoices set status = 'void' where id = i.id returning * into i;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (i.tenant_id, auth.uid(), current_app_role(), 'invoice_void', 'invoices', i.id::text, jsonb_build_object('reason', p_reason));
  return i;
end $$;

create or replace function public.billing_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id();
begin
  perform _need(1, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  return jsonb_build_object(
    'status', (select status from tenants where id = t), 'period_end', (select current_period_end from tenants where id = t),
    'unpaid', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'period', i.period, 'amount', i.amount, 'due', coalesce(i.due_date, i.period + 7),
                'days_overdue', greatest(_tenant_now(t)::date - coalesce(i.due_date, i.period + 7), 0),
                'suspend_on', coalesce(i.due_date, i.period + 7) + 14) order by i.period) from invoices i where i.tenant_id = t and i.status = 'unpaid'), '[]'));
end $$;

-- ═══ 4.2 Feature flags ═══════════════════════════════════════════════════════
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  description text,
  default_enabled boolean not null default false,
  plans text[] not null default '{}',                    -- kode paket yang otomatis mendapat fitur ini
  rollout_pct smallint not null default 100 check (rollout_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
create table if not exists public.tenant_flag_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null references public.feature_flags(key) on delete cascade,
  enabled boolean not null,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
alter table public.feature_flags enable row level security;
alter table public.tenant_flag_overrides enable row level security;
create policy flags_read on public.feature_flags for select using (auth.uid() is not null);
create policy flag_over_sa on public.tenant_flag_overrides for select using (is_superadmin());

insert into public.feature_flags (key, description, default_enabled, plans) values
  ('menu_engineering', 'Menu engineering & peringatan margin', true, '{}'),
  ('vouchers', 'Promo & voucher', true, '{}'),
  ('cash_projection', 'Proyeksi arus kas', false, '{growth,enterprise}'),
  ('ai_copilot', 'AI Copilot Owner', false, '{growth,enterprise}'),
  ('benchmark', 'Benchmark anonim antar-tenant', false, '{growth,enterprise}'),
  ('offline_pos', 'Mode offline kasir', false, '{growth,enterprise}')
on conflict (key) do nothing;

-- Urutan: override tenant → (default atau paket) → persentase rollout (hash stabil per tenant).
create or replace function public.has_flag(p_tenant uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f feature_flags; o boolean; pc text;
begin
  select enabled into o from tenant_flag_overrides where tenant_id = p_tenant and key = p_key;
  if found then return o; end if;
  select * into f from feature_flags where key = p_key;
  if not found then return false; end if;
  select p.code into pc from tenants t join plans p on p.id = t.plan_id where t.id = p_tenant;
  if not (f.default_enabled or (pc is not null and pc = any(f.plans))) then return false; end if;
  return ((hashtextextended(p_tenant::text || p_key, 0) & 2147483647) % 100) < f.rollout_pct;
end $$;

create or replace function public.my_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, case when current_tenant_id() is null then false else has_flag(current_tenant_id(), key) end), '{}') from feature_flags $$;

create or replace function public.set_feature_flag(p_key text, p_description text, p_default boolean, p_plans text[], p_rollout int default 100)
returns feature_flags language plpgsql security definer set search_path = public as $$
declare f feature_flags;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola feature flag'; end if;
  insert into feature_flags (key, description, default_enabled, plans, rollout_pct) values (p_key, p_description, p_default, coalesce(p_plans, '{}'), p_rollout)
  on conflict (key) do update set description = excluded.description, default_enabled = excluded.default_enabled, plans = excluded.plans,
        rollout_pct = excluded.rollout_pct, updated_at = now() returning * into f;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'flag_saved', 'feature_flags', p_key, to_jsonb(f));
  return f;
end $$;

create or replace function public.set_flag_override(p_tenant uuid, p_key text, p_enabled boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola feature flag'; end if;
  if p_enabled is null then
    delete from tenant_flag_overrides where tenant_id = p_tenant and key = p_key;
  else
    insert into tenant_flag_overrides (tenant_id, key, enabled, reason) values (p_tenant, p_key, p_enabled, p_reason)
    on conflict (tenant_id, key) do update set enabled = excluded.enabled, reason = excluded.reason, updated_at = now();
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'flag_override', 'feature_flags', p_key, jsonb_build_object('enabled', p_enabled, 'reason', p_reason));
end $$;

-- Terapkan flag pada fitur Fase 3/4 yang berbayar (copilot_snapshot = salinan migrasi 16 + satu syarat).
create or replace function public.copilot_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); kpi jsonb; menu jsonb; cash jsonb; pend int; lowstock int; voids7 int;
begin
  perform _need(2, 'r');
  if current_app_role()::text not in ('owner', 'superadmin') then raise exception 'Copilot hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'ai_copilot') then raise exception 'AI Copilot tidak termasuk paket tenant ini'; end if;
  select coalesce(jsonb_agg(to_jsonb(k)), '[]') into kpi from branch_kpi() k;
  select jsonb_build_object(
      'bintang', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'star' limit 5) x), '[]'),
      'laris_margin_tipis', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'plowhorse' limit 5) x), '[]'),
      'perlu_dievaluasi', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class in ('dog', 'belum_laku') limit 5) x), '[]'))
    into menu;
  cash := cash_projection(30, 14) - 'rows';
  select count(*) into pend from approvals where tenant_id = t and status = 'pending';
  select count(*) into lowstock from stock_levels s join inventory_items i on i.id = s.item_id where i.tenant_id = t and i.min_qty > 0 and s.qty < i.min_qty;
  select count(*) into voids7 from orders where tenant_id = t and status = 'void' and created_at > now() - interval '7 days';
  return jsonb_build_object('generated_at', now(), 'kpi_bulan_ini', kpi, 'menu', menu, 'kas', cash,
                            'persetujuan_menunggu', pend, 'stok_di_bawah_minimum', lowstock, 'void_7_hari', voids7);
end $$;

create or replace function public.cash_projection(p_days int default 30, p_ap_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); today date; opening numeric; ap numeric; payroll numeric; pday int; sales28 numeric; cogs28 numeric;
        fixed_day numeric; cogs_ratio numeric; bal numeric; i int; d date; inflow numeric; outflow numeric; wd numeric[] := array_fill(0::numeric, array[7]);
        wdn int[] := array_fill(0, array[7]); rows jsonb := '[]'; minbal numeric; first_neg date; r record; assumptions jsonb;
begin
  perform _need(12, 'r');
  if current_app_role()::text not in ('owner', 'gm', 'superadmin') then raise exception 'Proyeksi kas hanya untuk Owner/GM'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'cash_projection') then raise exception 'Proyeksi kas tidak termasuk paket tenant ini'; end if;
  if p_days not between 7 and 90 then raise exception 'Horizon 7–90 hari'; end if;
  today := _tenant_now(t)::date;
  select coalesce(sum(l.debit - l.credit), 0) into opening from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code in ('1101', '1102');
  select coalesce(sum(l.credit - l.debit), 0) into ap from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code = '2101';
  select coalesce(max(l.debit), 0) into payroll from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.code = '6101' and e.entry_date >= today - 62;
  select payroll_day into pday from tenants where id = t;
  for r in select extract(dow from o.paid_at at time zone (select timezone from tenants where id = t))::int dw, sum(o.total) s from orders o
            where o.tenant_id = t and o.status = 'paid' and o.paid_at >= now() - interval '28 days' group by 1 loop
    wd[r.dw + 1] := r.s / 4;                             -- 28 hari = 4 kali tiap hari-dalam-minggu
  end loop;
  select coalesce(sum(total), 0), coalesce(sum(cogs), 0) into sales28, cogs28 from orders where tenant_id = t and status = 'paid' and paid_at >= now() - interval '28 days';
  cogs_ratio := case when sales28 > 0 then cogs28 / sales28 else 0 end;
  select coalesce(sum(l.debit - l.credit), 0) / 28 into fixed_day from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.type = 'expense' and a.code not in ('6101', '6104') and e.entry_date >= today - 28;
  bal := opening; minbal := opening;
  for i in 1..p_days loop
    d := today + i;
    inflow := wd[extract(dow from d)::int + 1];
    outflow := inflow * cogs_ratio + fixed_day;
    if extract(day from d)::int = pday then outflow := outflow + payroll; end if;
    if i = p_ap_days then outflow := outflow + greatest(ap, 0); end if;
    bal := bal + inflow - outflow;
    minbal := least(minbal, bal);
    if bal < 0 and first_neg is null then first_neg := d; end if;
    rows := rows || jsonb_build_array(jsonb_build_object('date', d, 'inflow', round(inflow), 'outflow', round(outflow), 'balance', round(bal)));
  end loop;
  assumptions := jsonb_build_array(
    'Penjualan = rata-rata per hari-dalam-minggu dari 28 hari terakhir (tanpa tren musiman).',
    format('Pembelian bahan = %s%% dari penjualan (HPP historis).', round(cogs_ratio * 100, 1)),
    format('Beban tetap rata-rata %s per hari, di luar gaji dan waste.', _rp(round(fixed_day))),
    format('Gaji %s dibayar tanggal %s tiap bulan (dari jurnal gaji terakhir).', _rp(payroll), pday),
    format('Utang dagang %s dibayar hari ke-%s.', _rp(greatest(ap, 0)), p_ap_days));
  return jsonb_build_object('opening', round(opening), 'min_balance', round(minbal), 'first_negative_date', first_neg,
                            'ending', round(bal), 'days', p_days, 'assumptions', assumptions, 'rows', rows);
end $$;

-- ═══ 4.3 Metering AI ═════════════════════════════════════════════════════════
-- Kuota token per bulan: tenants.ai_quota_override, kalau kosong plans.ai_quota_tokens; plans.ai_unlimited = tanpa batas.
-- Soft limit: cek sebelum panggilan, catat sesudahnya (satu panggilan terakhir boleh melewati kuota).
create table if not exists public.ai_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month date not null,
  calls int not null default 0,
  tokens bigint not null default 0,
  primary key (tenant_id, month)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_read on public.ai_usage for select using (is_superadmin() or (tenant_ok(tenant_id) and has_perm(1, 'r')));

create or replace function public._ai_quota(p_tenant uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select case when t.ai_quota_override is not null then t.ai_quota_override when p.ai_unlimited then null else coalesce(p.ai_quota_tokens, 0) end
  from tenants t left join plans p on p.id = t.plan_id where t.id = p_tenant $$;
revoke execute on function public._ai_quota(uuid) from public, anon, authenticated;

create or replace function public.ai_quota_check(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q bigint; u bigint;
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  q := _ai_quota(p_tenant);
  select coalesce(tokens, 0) into u from ai_usage where tenant_id = p_tenant and month = date_trunc('month', now())::date;
  u := coalesce(u, 0);
  return jsonb_build_object('allowed', q is null or u < q, 'used', u, 'quota', q);
end $$;

create or replace function public.ai_record_usage(p_tenant uuid, p_tokens bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  insert into ai_usage (tenant_id, month, calls, tokens) values (p_tenant, date_trunc('month', now())::date, 1, greatest(coalesce(p_tokens, 0), 0))
  on conflict (tenant_id, month) do update set calls = ai_usage.calls + 1, tokens = ai_usage.tokens + greatest(coalesce(p_tokens, 0), 0);
end $$;
revoke execute on function public.ai_quota_check(uuid), public.ai_record_usage(uuid, bigint) from public, anon, authenticated;

create or replace function public.ai_usage_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); q bigint; u ai_usage;
begin
  perform _need(1, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  q := _ai_quota(t);
  select * into u from ai_usage where tenant_id = t and month = date_trunc('month', now())::date;
  return jsonb_build_object('month', date_trunc('month', now())::date, 'calls', coalesce(u.calls, 0), 'tokens', coalesce(u.tokens, 0), 'quota', q,
                            'pct', case when q is null or q = 0 then null else round(coalesce(u.tokens, 0)::numeric / q * 100, 1) end);
end $$;

create or replace function public.set_ai_quota(p_tenant uuid, p_tokens bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin'; end if;
  update tenants set ai_quota_override = p_tokens where id = p_tenant;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'ai_quota_set', 'tenants', p_tenant::text, jsonb_build_object('tokens', p_tokens));
end $$;

-- ═══ 4.4 Template industri ═══════════════════════════════════════════════════
create table if not exists public.industry_templates (
  key text primary key,
  name text not null,
  pillar public.pillar not null,
  spec jsonb not null
);
alter table public.industry_templates enable row level security;
create policy industry_tpl_read on public.industry_templates for select using (auth.uid() is not null);

insert into public.industry_templates (key, name, pillar, spec) values
 ('fnb_cafe', 'Kafe & Resto', 'fnb', $j${
   "products": [
     {"sku":"KP-001","name":"Kopi Susu","category":"Kopi","price":22000,"station":"barista"},
     {"sku":"KP-002","name":"Americano","category":"Kopi","price":18000,"station":"barista"},
     {"sku":"NM-001","name":"Teh Lemon","category":"Non-Kopi","price":15000,"station":"barista"},
     {"sku":"MK-001","name":"Nasi Goreng","category":"Makanan","price":32000,"station":"dapur"},
     {"sku":"MK-002","name":"Mie Goreng","category":"Makanan","price":30000,"station":"dapur"},
     {"sku":"SN-001","name":"Kentang Goreng","category":"Camilan","price":20000,"station":"dapur"}],
   "checklists": [
     {"kind":"open","items":[{"key":"bersih","label":"Area kasir & meja bersih"},{"key":"kulkas","label":"Suhu kulkas aman"},{"key":"modal","label":"Uang modal dihitung"}]},
     {"kind":"close","items":[{"key":"kompor","label":"Kompor & gas dimatikan"},{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"sampah","label":"Sampah dibuang"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":21},{"kind":"margin_watch","freq":"weekly","hour":9,"weekday":1}],
   "settings": {"margin_alert_pct": 38}}$j$),
 ('retail_toko', 'Toko Retail', 'retail', $j${
   "products": [
     {"sku":"UM-001","name":"Barang Contoh A","category":"Umum","price":25000},
     {"sku":"UM-002","name":"Barang Contoh B","category":"Umum","price":50000}],
   "checklists": [
     {"kind":"open","items":[{"key":"rak","label":"Rak & display rapi"},{"key":"modal","label":"Uang modal dihitung"}]},
     {"kind":"close","items":[{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"kunci","label":"Pintu & gudang terkunci"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":21}],
   "settings": {"margin_alert_pct": 70}}$j$),
 ('service_salon', 'Salon & Layanan', 'service', $j${
   "products": [
     {"sku":"SV-001","name":"Potong Rambut","category":"Layanan","price":50000},
     {"sku":"SV-002","name":"Creambath","category":"Layanan","price":90000},
     {"sku":"SV-003","name":"Manicure","category":"Layanan","price":70000}],
   "checklists": [
     {"kind":"open","items":[{"key":"alat","label":"Alat disterilisasi"},{"key":"bersih","label":"Area kerja bersih"}]},
     {"kind":"close","items":[{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"alat","label":"Alat dibersihkan"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":20}],
   "settings": {"margin_alert_pct": 50}}$j$),
 ('health_klinik_gigi', 'Klinik Gigi', 'health', $j${
   "products": [
     {"sku":"KG-001","name":"Konsultasi","category":"Layanan","price":75000},
     {"sku":"KG-002","name":"Scaling","category":"Tindakan","price":350000},
     {"sku":"KG-003","name":"Tambal Gigi","category":"Tindakan","price":300000}],
   "checklists": [
     {"kind":"open","items":[{"key":"steril","label":"Instrumen steril tersedia"},{"key":"unit","label":"Dental unit berfungsi"}]},
     {"kind":"close","items":[{"key":"limbah","label":"Limbah medis dipisah"},{"key":"kas","label":"Kas dihitung & dicocokkan"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":20}],
   "settings": {"margin_alert_pct": 60}}$j$)
on conflict (key) do nothing;

-- Idempotent: tidak menimpa data yang sudah ada (SKU/checklist/jadwal yang sama dilewati). Pengaturan hanya bila diminta.
create or replace function public.apply_industry_template(p_key text, p_apply_settings boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); tp industry_templates; pil public.pillar; it jsonb; cl jsonb; rp jsonb; np int := 0; nc int := 0; nr int := 0; k int;
begin
  perform _need(3, 'c');
  if current_app_role()::text <> 'owner' then raise exception 'Hanya Owner yang menerapkan template industri'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  select * into tp from industry_templates where key = p_key;
  if not found then raise exception 'Template tidak ditemukan'; end if;
  select pillar into pil from tenants where id = t;
  if tp.pillar <> pil then raise exception 'Template % untuk jenis usaha lain', tp.name; end if;
  for it in select * from jsonb_array_elements(tp.spec->'products') loop
    insert into products (tenant_id, sku, name, category, price, station)
    values (t, it->>'sku', it->>'name', coalesce(it->>'category', 'Umum'), (it->>'price')::numeric, coalesce(it->>'station', 'dapur')) on conflict (tenant_id, sku) do nothing;
    get diagnostics k = row_count; np := np + k;
  end loop;
  for cl in select * from jsonb_array_elements(coalesce(tp.spec->'checklists', '[]')) loop
    insert into checklist_templates (tenant_id, branch_id, kind, items) values (t, null, cl->>'kind', cl->'items') on conflict do nothing;
    get diagnostics k = row_count; nc := nc + k;
  end loop;
  for rp in select * from jsonb_array_elements(coalesce(tp.spec->'reports', '[]')) loop
    insert into report_schedules (tenant_id, kind, freq, hour, weekday) values (t, rp->>'kind', rp->>'freq', (rp->>'hour')::int, nullif(rp->>'weekday', '')::int) on conflict (tenant_id, kind) do nothing;
    get diagnostics k = row_count; nr := nr + k;
  end loop;
  if p_apply_settings and tp.spec->'settings' ? 'margin_alert_pct' then
    update tenants set margin_alert_pct = (tp.spec->'settings'->>'margin_alert_pct')::numeric where id = t;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), 'owner', 'template_applied', 'industry_templates', p_key, jsonb_build_object('products', np, 'checklists', nc, 'reports', nr));
  return jsonb_build_object('products', np, 'checklists', nc, 'reports', nr);
end $$;

-- ═══ 4.5 Mode offline ════════════════════════════════════════════════════════
-- Klien menyimpan penjualan di antrean lokal (src/lib/offlineQueue.js) lalu mengirim batch saat online.
-- Idempotent lewat client_ref; tiap transaksi diproses terpisah (satu gagal tidak menggagalkan yang lain).
alter table public.orders add column if not exists client_ref text;
create unique index if not exists orders_client_ref_uq on public.orders (tenant_id, client_ref) where client_ref is not null;

create or replace function public.sync_offline_orders(p_device text, p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; o orders; res jsonb := '[]'; ref text; ex orders; at_ timestamptz; t uuid; diff numeric; flagged boolean;
begin
  perform _need(5, 'c');
  if jsonb_typeof(p_batch) <> 'array' then raise exception 'Batch harus berupa array'; end if;
  if jsonb_array_length(p_batch) > 50 then raise exception 'Maksimal 50 transaksi per sinkronisasi'; end if;
  t := current_tenant_id();
  if t is null or not has_flag(t, 'offline_pos') then raise exception 'Mode offline tidak termasuk paket tenant ini'; end if;
  for e in select * from jsonb_array_elements(p_batch) loop
    ref := left(btrim(coalesce(e->>'client_ref', '')), 80);
    if ref = '' then res := res || jsonb_build_array(jsonb_build_object('client_ref', null, 'status', 'error', 'error', 'client_ref wajib')); continue; end if;
    select * into ex from orders where tenant_id = t and client_ref = ref;
    if found then res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'duplicate', 'code', ex.code)); continue; end if;
    begin
      o := create_order((e->>'branch_id')::uuid, e->'items', null, 'dine_in', null);
      o := pay_order(o.id, e->'payments', nullif(e->>'customer_phone', ''), nullif(e->>'discount', '')::numeric, nullif(e->>'pin', ''));
      at_ := coalesce((e->>'created_at')::timestamptz, now());
      flagged := at_ > now() or at_ < now() - interval '72 hours';
      update orders set client_ref = ref where id = o.id returning * into o;
      diff := coalesce(nullif(e->>'expected_total', '')::numeric, o.total) - o.total;
      res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'ok', 'code', o.code, 'total', o.total,
                'total_diff', diff, 'time_suspect', flagged));
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (t, auth.uid(), current_app_role(), 'offline_sync', 'orders', o.id::text, jsonb_build_object('device', left(p_device, 60), 'client_at', at_, 'diff', diff, 'suspect', flagged));
    exception when others then
      res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'error', 'error', sqlerrm));
    end;
  end loop;
  return res;
end $$;

-- ═══ 4.6 Benchmark anonim ════════════════════════════════════════════════════
-- Opt-in per tenant. Hanya rasio (bukan angka mutlak) yang dibandingkan, per jenis usaha, dan hanya bila kohort ≥ 5 tenant.
alter table public.tenants add column if not exists benchmark_opt_in boolean not null default false;
create table if not exists public.benchmark_monthly (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month date not null,
  pillar public.pillar not null,
  avg_ticket numeric, cogs_pct numeric, void_pct numeric, discount_pct numeric, revenue_per_branch numeric,
  primary key (tenant_id, month)
);
alter table public.benchmark_monthly enable row level security;      -- tanpa policy: tidak ada yang bisa membaca langsung

create or replace function public.set_benchmark_opt_in(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'c');
  if current_app_role()::text <> 'owner' then raise exception 'Hanya Owner'; end if;
  update tenants set benchmark_opt_in = coalesce(p_on, false) where id = current_tenant_id();
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (current_tenant_id(), auth.uid(), 'owner', 'benchmark_opt_in', 'tenants', current_tenant_id()::text, jsonb_build_object('on', p_on));
  return coalesce(p_on, false);
end $$;

create or replace function public.refresh_benchmark(p_month date default null) returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', coalesce(p_month, now() - interval '1 month'))::date; n int := 0; r record;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  for r in select t.id, t.pillar, count(distinct b.id) nb from tenants t join branches b on b.tenant_id = t.id where t.benchmark_opt_in and t.status in ('active', 'past_due') group by t.id, t.pillar loop
    with k as (select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord, coalesce(sum(cogs), 0) cg, coalesce(sum(discount), 0) dc,
                      coalesce(sum(void_count), 0) vc, coalesce(sum(all_count), 0) ac from _kpi(r.id, m::timestamptz, (m + interval '1 month')::timestamptz))
    insert into benchmark_monthly (tenant_id, month, pillar, avg_ticket, cogs_pct, void_pct, discount_pct, revenue_per_branch)
    select r.id, m, r.pillar, case when ord > 0 then rev / ord end, case when rev > 0 then cg / rev * 100 end, case when ac > 0 then vc::numeric / ac * 100 end,
           case when rev + dc > 0 then dc / (rev + dc) * 100 end, rev / r.nb from k where ord > 0
    on conflict (tenant_id, month) do update set avg_ticket = excluded.avg_ticket, cogs_pct = excluded.cogs_pct, void_pct = excluded.void_pct,
         discount_pct = excluded.discount_pct, revenue_per_branch = excluded.revenue_per_branch, pillar = excluded.pillar;
    n := n + 1;
  end loop;
  delete from benchmark_monthly b using tenants t where t.id = b.tenant_id and not t.benchmark_opt_in;      -- cabut opt-in → data ikut hilang
  return n;
end $$;

create or replace function public.my_benchmark(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); m date := date_trunc('month', coalesce(p_month, now() - interval '1 month'))::date; me benchmark_monthly; n int; out jsonb := '{}'; piece jsonb; col text;
begin
  perform _need(2, 'r');
  if current_app_role()::text <> 'owner' then raise exception 'Benchmark hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'benchmark') then raise exception 'Benchmark tidak termasuk paket tenant ini'; end if;
  if not (select benchmark_opt_in from tenants where id = t) then return jsonb_build_object('available', false, 'reason', 'Aktifkan partisipasi benchmark terlebih dahulu'); end if;
  select * into me from benchmark_monthly where tenant_id = t and month = m;
  if not found then return jsonb_build_object('available', false, 'reason', 'Data bulan ini belum dihitung'); end if;
  select count(*) into n from benchmark_monthly where pillar = me.pillar and month = m and tenant_id <> t;
  if n < 4 then return jsonb_build_object('available', false, 'reason', 'Kohort belum cukup (minimal 5 tenant sejenis)'); end if;
  foreach col in array array['avg_ticket', 'cogs_pct', 'void_pct', 'discount_pct', 'revenue_per_branch'] loop
    execute format($q$select jsonb_build_object('mine', round(($1).%I::numeric, 1),
        'p25', round(percentile_cont(0.25) within group (order by %I)::numeric, 1), 'median', round(percentile_cont(0.5) within group (order by %I)::numeric, 1),
        'p75', round(percentile_cont(0.75) within group (order by %I)::numeric, 1),
        'rank_pct', round(100.0 * count(*) filter (where %I < ($1).%I) / count(*), 0))
      from benchmark_monthly where pillar = ($1).pillar and month = ($1).month$q$, col, col, col, col, col, col) using me into piece;
    out := out || jsonb_build_object(col, piece);
  end loop;
  return jsonb_build_object('available', true, 'month', m, 'cohort_size', n + 1, 'metrics', out);
end $$;

-- ═══ Hak eksekusi ════════════════════════════════════════════════════════════
grant execute on function public.create_reseller(text, text, text, numeric), public.assign_reseller(uuid, uuid), public.reseller_statement(uuid),
  public.pay_reseller_commissions(uuid), public.generate_invoices(date), public.run_dunning(), public.mark_invoice_paid(uuid, text), public.void_invoice(uuid, text),
  public.billing_status(), public.my_flags(), public.set_feature_flag(text, text, boolean, text[], int), public.set_flag_override(uuid, text, boolean, text),
  public.ai_usage_summary(), public.set_ai_quota(uuid, bigint), public.apply_industry_template(text, boolean), public.sync_offline_orders(text, jsonb),
  public.set_benchmark_opt_in(boolean), public.refresh_benchmark(date), public.my_benchmark(date) to authenticated;
-- run_dunning / generate_invoices / refresh_benchmark: Superadmin atau sistem. service_role memanggil tanpa JWT (auth.uid() null).
grant execute on function public.generate_invoices(date), public.run_dunning(), public.refresh_benchmark(date), public.ai_quota_check(uuid),
  public.ai_record_usage(uuid, bigint), public.mark_invoice_paid_system(uuid, text) to service_role;
