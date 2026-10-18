-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3 — Nilai tambah. Hanya logika & skrip (RPC, tabel, trigger); UI belum dibuat.
--  3.1 Menu engineering & peringatan margin   menu_engineering(), check_margin_alerts()
--  3.2 Target & KPI cabang                     branch_targets, set_branch_target(), branch_kpi()
--  3.3 Laporan terjadwal Hermes                report_schedules, save_report_schedule(), run_due_reports()
--  3.4 Checklist & serah terima shift          checklist_templates, shift_checklists, submit_checklist()
--  3.5 Promo & voucher                         promos, upsert_promo(), validate_promo(), apply_voucher()
--  3.6 Proyeksi arus kas                       cash_projection()
--  3.7 AI Copilot Owner                        copilot_snapshot(), log_copilot()
-- Tidak mengubah matriks RBAC (versi asli). Memakai fitur yang sudah ada:
--  F2 dashboard (Owner CRUD, GM R), F3 produk, F5 POS, F12 buku kas, F13 shift/karyawan.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists margin_alert_pct numeric(5,2) not null default 40 check (margin_alert_pct between 1 and 100),
  add column if not exists payroll_day smallint not null default 25 check (payroll_day between 1 and 28),
  add column if not exists require_close_checklist boolean not null default false;

-- ── Biaya resep (HPP per porsi), rekursif untuk barang setengah jadi ─────────
create or replace function public._item_cost(p_item uuid, p_depth int default 0) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c numeric; y numeric;
begin
  if p_depth < 5 and exists (select 1 from bom_lines where parent_item_id = p_item) then
    select sum(qty * _item_cost(component_id, p_depth + 1)), max(yield_qty) into c, y from bom_lines where parent_item_id = p_item;
    return coalesce(c, 0) / greatest(coalesce(y, 1), 1);
  end if;
  return coalesce((select cost_per_unit from inventory_items where id = p_item), 0);
end $$;

create or replace function public._product_cost(p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty * public._item_cost(component_id)), 0) from bom_lines where product_id = p_product $$;
revoke execute on function public._item_cost(uuid, int), public._product_cost(uuid) from public, anon, authenticated;

-- ═══ 3.1 Menu engineering (Kasavana–Smith) ═══════════════════════════════════
-- Populer  = porsi terjual ≥ 70% dari rata-rata bagi-rata; Margin tinggi = margin/porsi ≥ rata-rata tertimbang.
create or replace function public.menu_engineering(p_branch uuid default null, p_days int default 30)
returns table (product_id uuid, name text, category text, price numeric, unit_cost numeric, cost_pct numeric, margin numeric,
               qty bigint, revenue numeric, contribution numeric, class text, advice text)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id();
begin
  perform _need(2, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'Rentang hari harus 1–365'; end if;
  if p_branch is not null then perform _branch_guard(p_branch); end if;
  return query
  with me as (
    select p.id pid, p.name::text nm, p.category::text cat, p.price pr, _product_cost(p.id) uc, coalesce(s.q, 0)::bigint q, coalesce(s.rev, 0) rev
    from products p
    left join lateral (
      select sum(oi.qty) q, sum(oi.qty * oi.price) rev
      from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = p.id and o.status = 'paid' and o.paid_at >= now() - make_interval(days => p_days)
        and branch_ok(o.branch_id) and (p_branch is null or o.branch_id = p_branch)) s on true
    where p.tenant_id = t),
  agg as (
    select case when count(*) filter (where q > 0) > 0 then 0.7 * sum(q)::numeric / count(*) filter (where q > 0) else 0 end pop_cut,
           case when sum(q) > 0 then sum(q * (pr - uc)) / sum(q) else 0 end avg_margin from me)
  select m.pid, m.nm, m.cat, m.pr, round(m.uc, 2), case when m.pr > 0 then round(m.uc / m.pr * 100, 1) else null end,
         round(m.pr - m.uc, 2), m.q, m.rev, round(m.q * (m.pr - m.uc), 2),
         case when m.q = 0 then 'belum_laku'
              when m.q >= g.pop_cut and (m.pr - m.uc) >= g.avg_margin then 'star'
              when m.q >= g.pop_cut then 'plowhorse'
              when (m.pr - m.uc) >= g.avg_margin then 'puzzle'
              else 'dog' end,
         case when m.q = 0 then 'Belum terjual pada periode ini; tinjau posisi di menu atau hapus.'
              when m.q >= g.pop_cut and (m.pr - m.uc) >= g.avg_margin then 'Pertahankan kualitas, tampilkan menonjol.'
              when m.q >= g.pop_cut then 'Laris tapi margin tipis: naikkan harga sedikit atau kurangi porsi/bahan.'
              when (m.pr - m.uc) >= g.avg_margin then 'Margin bagus tapi jarang dipesan: promosikan atau ubah posisi di menu.'
              else 'Kurang laris dan margin rendah: pertimbangkan hapus atau resep ulang.' end
  from me m cross join agg g order by (m.q * (m.pr - m.uc)) desc, m.nm;
end $$;

-- Produk yang HPP-nya melewati ambang tenant → Hermes (satu kali per produk per 7 hari).
create or replace function public._margin_alerts(p_tenant uuid) returns int
language plpgsql security definer set search_path = public as $$
declare lim numeric; n int := 0; r record;
begin
  select margin_alert_pct into lim from tenants where id = p_tenant;
  for r in select p.id, p.name, p.price, _product_cost(p.id) as uc from products p where p.tenant_id = p_tenant and p.is_available and p.price > 0
  loop
    if r.uc > 0 and r.uc / r.price * 100 > lim
       and not exists (select 1 from hermes_events h where h.tenant_id = p_tenant and h.kind = 'margin_drop'
                       and h.payload->>'product_id' = r.id::text and h.created_at > now() - interval '7 days') then
      perform _hermes(p_tenant, 'whatsapp', 'Owner', 'margin_drop',
        format('Margin menu "%s" menipis: HPP %s%% dari harga jual (batas %s%%).', r.name, round(r.uc / r.price * 100, 1), lim),
        jsonb_build_object('product_id', r.id, 'cost_pct', round(r.uc / r.price * 100, 1)));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public._margin_alerts(uuid) from public, anon, authenticated;

create or replace function public.check_margin_alerts() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'r');
  if current_tenant_id() is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  return _margin_alerts(current_tenant_id());
end $$;

-- ═══ 3.2 Target & KPI cabang ═════════════════════════════════════════════════
create table if not exists public.branch_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  revenue_target numeric(14,2) not null check (revenue_target >= 0),
  max_cogs_pct numeric(5,2) not null default 35 check (max_cogs_pct between 1 and 100),
  max_void_pct numeric(5,2) not null default 2 check (max_void_pct between 0 and 100),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (branch_id, month)
);
alter table public.branch_targets enable row level security;
create policy branch_targets_read on public.branch_targets for select using (tenant_ok(tenant_id) and branch_ok(branch_id) and has_perm(2, 'r'));

create or replace function public.set_branch_target(p_branch uuid, p_month date, p_revenue numeric, p_max_cogs_pct numeric default 35, p_max_void_pct numeric default 2)
returns branch_targets language plpgsql security definer set search_path = public as $$
declare t uuid; r branch_targets; m date := date_trunc('month', p_month)::date;
begin
  perform _need(2, 'c');                         -- matriks asli: hanya Owner CRUD di fitur 2
  t := _branch_guard(p_branch);
  if p_revenue is null or p_revenue < 0 then raise exception 'Target omzet tidak valid'; end if;
  insert into branch_targets (tenant_id, branch_id, month, revenue_target, max_cogs_pct, max_void_pct, created_by)
  values (t, p_branch, m, p_revenue, coalesce(p_max_cogs_pct, 35), coalesce(p_max_void_pct, 2), auth.uid())
  on conflict (branch_id, month) do update set revenue_target = excluded.revenue_target, max_cogs_pct = excluded.max_cogs_pct,
        max_void_pct = excluded.max_void_pct, updated_at = now()
  returning * into r;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'target_set', 'branch_targets', r.id::text, jsonb_build_object('month', m, 'revenue', p_revenue));
  return r;
end $$;

create or replace function public._kpi(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (branch_id uuid, revenue numeric, orders bigint, cogs numeric, discount numeric, void_count bigint, all_count bigint)
language sql stable security definer set search_path = public as $$
  select o.branch_id,
         coalesce(sum(o.total) filter (where o.status = 'paid'), 0), count(*) filter (where o.status = 'paid'),
         coalesce(sum(o.cogs) filter (where o.status = 'paid'), 0), coalesce(sum(o.discount) filter (where o.status = 'paid'), 0),
         count(*) filter (where o.status = 'void'), count(*) filter (where o.status in ('paid', 'void'))
  from orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to group by o.branch_id $$;
revoke execute on function public._kpi(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.branch_kpi(p_month date default null)
returns table (branch_id uuid, branch text, revenue numeric, orders bigint, avg_ticket numeric, cogs_pct numeric, void_pct numeric,
               discount_pct numeric, revenue_target numeric, attainment_pct numeric, projected_revenue numeric, status text, flags text[])
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); tz timestamp; m date; d_pass int; d_all int;
begin
  perform _need(2, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  tz := _tenant_now(t);
  m := date_trunc('month', coalesce(p_month, tz::date))::date;
  d_all := extract(day from (m + interval '1 month' - interval '1 day'))::int;
  d_pass := case when m = date_trunc('month', tz)::date then greatest(extract(day from tz)::int, 1) else d_all end;
  return query
  select b.id, b.name::text, coalesce(k.revenue, 0), coalesce(k.orders, 0),
         case when coalesce(k.orders, 0) > 0 then round(k.revenue / k.orders, 0) else 0 end,
         case when coalesce(k.revenue, 0) > 0 then round(k.cogs / k.revenue * 100, 1) else 0 end,
         case when coalesce(k.all_count, 0) > 0 then round(k.void_count::numeric / k.all_count * 100, 1) else 0 end,
         case when coalesce(k.revenue + k.discount, 0) > 0 then round(k.discount / (k.revenue + k.discount) * 100, 1) else 0 end,
         g.revenue_target,
         case when coalesce(g.revenue_target, 0) > 0 then round(coalesce(k.revenue, 0) / g.revenue_target * 100, 1) end,
         round(coalesce(k.revenue, 0) / d_pass * d_all, 0),
         case when g.id is null then 'tanpa_target'
              when coalesce(k.revenue, 0) / d_pass * d_all >= g.revenue_target then 'on_track' else 'di_bawah_target' end,
         array_remove(array[
           case when g.id is not null and coalesce(k.revenue, 0) > 0 and k.cogs / k.revenue * 100 > g.max_cogs_pct then 'HPP di atas batas' end,
           case when g.id is not null and coalesce(k.all_count, 0) > 0 and k.void_count::numeric / k.all_count * 100 > g.max_void_pct then 'Void di atas batas' end
         ], null)
  from branches b
  left join lateral (select * from _kpi(t, m::timestamptz, (m + interval '1 month')::timestamptz) x where x.branch_id = b.id) k on true
  left join branch_targets g on g.branch_id = b.id and g.month = m
  where b.tenant_id = t and branch_ok(b.id) order by b.name;
end $$;

-- ═══ 3.3 Laporan terjadwal Hermes ════════════════════════════════════════════
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('daily_sales', 'weekly_kpi', 'margin_watch')),
  freq text not null check (freq in ('daily', 'weekly')),
  hour smallint not null check (hour between 0 and 23),
  weekday smallint check (weekday between 0 and 6),     -- 0 = Minggu (untuk weekly)
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'discord')),
  target text not null default 'Owner',
  active boolean not null default true,
  last_run_at timestamptz,
  unique (tenant_id, kind),
  check (freq = 'daily' or weekday is not null)
);
alter table public.report_schedules enable row level security;
create policy report_schedules_read on public.report_schedules for select using (tenant_ok(tenant_id) and has_perm(2, 'r'));

create or replace function public.save_report_schedule(p_kind text, p_freq text, p_hour int, p_weekday int default null,
                                                       p_channel text default 'whatsapp', p_active boolean default true)
returns report_schedules language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r report_schedules;
begin
  perform _need(2, 'c');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_freq = 'weekly' and p_weekday is null then raise exception 'Laporan mingguan butuh hari'; end if;
  insert into report_schedules (tenant_id, kind, freq, hour, weekday, channel, active)
  values (t, p_kind, p_freq, p_hour, case when p_freq = 'weekly' then p_weekday end, p_channel, p_active)
  on conflict (tenant_id, kind) do update set freq = excluded.freq, hour = excluded.hour, weekday = excluded.weekday,
        channel = excluded.channel, active = excluded.active
  returning * into r;
  return r;
end $$;

create or replace function public._build_report(p_tenant uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare nowl timestamp := _tenant_now(p_tenant); d0 timestamptz; d1 timestamptz; k record; k0 record; top text; low text; n int;
begin
  if p_kind = 'daily_sales' then
    d1 := date_trunc('day', nowl)::timestamptz; d0 := d1 - interval '1 day';
    select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord, coalesce(sum(cogs), 0) cogs, coalesce(sum(void_count), 0) v into k from _kpi(p_tenant, d0, d1);
    return format('Laporan harian %s: omzet %s dari %s transaksi (rata-rata %s), HPP %s%%, void %s.',
      to_char(nowl::date - 1, 'DD Mon YYYY'), _rp(k.rev), k.ord, _rp(case when k.ord > 0 then k.rev / k.ord else 0 end),
      case when k.rev > 0 then round(k.cogs / k.rev * 100, 1) else 0 end, k.v);
  elsif p_kind = 'weekly_kpi' then
    d1 := date_trunc('day', nowl)::timestamptz; d0 := d1 - interval '7 days';
    select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord into k from _kpi(p_tenant, d0, d1);
    select coalesce(sum(revenue), 0) rev into k0 from _kpi(p_tenant, d0 - interval '7 days', d0);
    select string_agg(nm || ' (' || q || ')', ', ') into top from (
      select p.name nm, sum(oi.qty) q from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
      where o.tenant_id = p_tenant and o.status = 'paid' and o.paid_at >= d0 and o.paid_at < d1 group by p.name order by sum(oi.qty) desc limit 3) s;
    return format('Ringkasan mingguan: omzet %s (%s dibanding minggu sebelumnya), %s transaksi. Menu terlaris: %s.',
      _rp(k.rev), case when k0.rev > 0 then (case when k.rev >= k0.rev then '+' else '' end) || round((k.rev - k0.rev) / k0.rev * 100, 1) || '%' else 'tanpa pembanding' end,
      k.ord, coalesce(top, 'belum ada penjualan'));
  else
    select count(*) into n from products p, lateral (select _product_cost(p.id) c) x
     where p.tenant_id = p_tenant and p.is_available and p.price > 0 and x.c > 0 and x.c / p.price * 100 > (select margin_alert_pct from tenants where id = p_tenant);
    perform _margin_alerts(p_tenant);
    return format('Pantauan margin: %s menu aktif melewati batas HPP.', n);
  end if;
end $$;
revoke execute on function public._build_report(uuid, text) from public, anon, authenticated;

-- Dipanggil cron (hermes-dispatch, service role). Idempoten: tiap jadwal jalan sekali per hari/minggu lokal tenant.
create or replace function public.run_due_reports() returns int
language plpgsql security definer set search_path = public as $$
declare s record; nowl timestamp; n int := 0; last_local date;
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  for s in select r.*, t.status as tenant_status from report_schedules r join tenants t on t.id = r.tenant_id where r.active loop
    continue when s.tenant_status is distinct from 'active';
    nowl := _tenant_now(s.tenant_id);
    last_local := case when s.last_run_at is null then null else (s.last_run_at at time zone (select timezone from tenants where id = s.tenant_id))::date end;
    continue when extract(hour from nowl)::int < s.hour;
    continue when s.freq = 'weekly' and extract(dow from nowl)::int <> s.weekday;
    continue when last_local = nowl::date;
    perform _hermes(s.tenant_id, s.channel, s.target, case when s.kind = 'margin_watch' then 'margin_drop' else 'z_report' end,
                    _build_report(s.tenant_id, s.kind), jsonb_build_object('report_kind', s.kind));
    update report_schedules set last_run_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.run_due_reports() from public, anon, authenticated;

-- ═══ 3.4 Checklist & serah terima shift ══════════════════════════════════════
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  kind text not null check (kind in ('open', 'close', 'handover')),
  items jsonb not null default '[]',                    -- [{"key":"kulkas","label":"Suhu kulkas aman","required":true}]
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists checklist_tpl_uq on public.checklist_templates (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);
create table if not exists public.shift_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  kind text not null check (kind in ('open', 'close', 'handover')),
  answers jsonb not null default '{}',
  note text,
  submitted_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shift_id, kind)
);
alter table public.checklist_templates enable row level security;
alter table public.shift_checklists enable row level security;
create policy checklist_tpl_read on public.checklist_templates for select using (tenant_ok(tenant_id) and (branch_id is null or branch_ok(branch_id)) and has_perm(5, 'r'));
create policy shift_checklists_read on public.shift_checklists for select using (tenant_ok(tenant_id) and branch_ok(branch_id) and has_perm(5, 'r'));

create or replace function public.save_checklist_template(p_branch uuid, p_kind text, p_items jsonb, p_active boolean default true)
returns checklist_templates language plpgsql security definer set search_path = public as $$
declare t uuid; r checklist_templates; it jsonb;
begin
  perform _need(13, 'u');
  if current_app_role()::text not in ('owner', 'gm') then raise exception 'Hanya Owner/GM yang mengatur checklist'; end if;
  t := case when p_branch is null then current_tenant_id() else _branch_guard(p_branch) end;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Daftar butir harus berupa array'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'key'), '') = '' or coalesce(btrim(it->>'label'), '') = '' then raise exception 'Setiap butir wajib punya key dan label'; end if;
  end loop;
  insert into checklist_templates (tenant_id, branch_id, kind, items, active) values (t, p_branch, p_kind, p_items, p_active)
  on conflict (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  do update set items = excluded.items, active = excluded.active, updated_at = now()
  returning * into r;
  return r;
end $$;

create or replace function public.submit_checklist(p_shift uuid, p_kind text, p_answers jsonb, p_note text default null)
returns shift_checklists language plpgsql security definer set search_path = public as $$
declare s shifts; tpl checklist_templates; it jsonb; missing text[] := '{}'; r shift_checklists;
begin
  perform _need(5, 'c');
  select * into s from shifts where id = p_shift;
  if not found or not tenant_ok(s.tenant_id) or not branch_ok(s.branch_id) then raise exception 'Shift tidak ditemukan'; end if;
  if s.cashier_id <> auth.uid() and current_app_role()::text not in ('owner', 'gm') then raise exception 'Checklist hanya diisi kasir shift ini atau GM'; end if;
  if p_kind not in ('open', 'close', 'handover') then raise exception 'Jenis checklist tidak valid'; end if;
  if s.status = 'closed' and p_kind <> 'close' then raise exception 'Shift sudah ditutup'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Jawaban harus berupa objek'; end if;
  select * into tpl from checklist_templates
   where tenant_id = s.tenant_id and kind = p_kind and active and (branch_id = s.branch_id or branch_id is null)
   order by branch_id nulls last limit 1;
  if found then
    for it in select * from jsonb_array_elements(tpl.items) loop
      if coalesce((it->>'required')::boolean, true) and coalesce(p_answers->>(it->>'key'), 'false') in ('false', '') then
        missing := missing || (it->>'label');
      end if;
    end loop;
    if array_length(missing, 1) > 0 then raise exception 'Butir wajib belum dipenuhi: %', array_to_string(missing, ', '); end if;
  end if;
  if p_kind = 'handover' and length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Catatan serah terima minimal 10 karakter'; end if;
  insert into shift_checklists (tenant_id, branch_id, shift_id, kind, answers, note, submitted_by)
  values (s.tenant_id, s.branch_id, s.id, p_kind, coalesce(p_answers, '{}'), nullif(btrim(p_note), ''), auth.uid())
  on conflict (shift_id, kind) do update set answers = excluded.answers, note = excluded.note, submitted_by = auth.uid(), created_at = now()
  returning * into r;
  return r;
end $$;

-- Opsional per tenant (require_close_checklist): shift tidak bisa ditutup tanpa checklist tutup bila templatnya ada.
create or replace function public._shift_close_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status = 'open' and auth.uid() is not null
     and (select require_close_checklist from tenants where id = new.tenant_id)
     and exists (select 1 from checklist_templates c where c.tenant_id = new.tenant_id and c.kind = 'close' and c.active and (c.branch_id = new.branch_id or c.branch_id is null))
     and not exists (select 1 from shift_checklists sc where sc.shift_id = new.id and sc.kind = 'close') then
    raise exception 'Isi checklist tutup shift terlebih dahulu';
  end if;
  return new;
end $$;
drop trigger if exists shifts_close_guard on public.shifts;
create trigger shifts_close_guard before update on public.shifts for each row execute function public._shift_close_guard();

-- ═══ 3.5 Promo & voucher ═════════════════════════════════════════════════════
create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('pct', 'amount')),
  value numeric(14,2) not null check (value > 0),
  min_spend numeric(14,2) not null default 0 check (min_spend >= 0),
  max_discount numeric(14,2) check (max_discount > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int check (usage_limit > 0),
  used_count int not null default 0,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (kind <> 'pct' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);
create unique index if not exists promos_code_uq on public.promos (tenant_id, upper(code));
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  promo_id uuid not null references public.promos(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  discount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
alter table public.promos enable row level security;
alter table public.promo_redemptions enable row level security;
create policy promos_read on public.promos for select using (tenant_ok(tenant_id) and has_perm(3, 'r'));
create policy promo_red_read on public.promo_redemptions for select using (tenant_ok(tenant_id) and has_perm(2, 'r'));
alter table public.orders add column if not exists voucher_code text;

create or replace function public.upsert_promo(p_code text, p_name text, p_kind text, p_value numeric, p_min_spend numeric default 0,
  p_max_discount numeric default null, p_starts timestamptz default null, p_ends timestamptz default null, p_limit int default null,
  p_branch uuid default null, p_active boolean default true, p_id uuid default null)
returns promos language plpgsql security definer set search_path = public as $$
declare t uuid; r promos;
begin
  perform _need(3, 'c');                                 -- Owner/GM/Superadmin CRUD; kasir hanya baca
  t := case when p_branch is null then current_tenant_id() else _branch_guard(p_branch) end;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if coalesce(btrim(p_code), '') !~ '^[A-Za-z0-9_-]{3,20}$' then raise exception 'Kode promo 3–20 karakter (huruf, angka, - atau _)'; end if;
  if p_id is null then
    insert into promos (tenant_id, branch_id, code, name, kind, value, min_spend, max_discount, starts_at, ends_at, usage_limit, active)
    values (t, p_branch, upper(btrim(p_code)), p_name, p_kind, p_value, coalesce(p_min_spend, 0), p_max_discount, coalesce(p_starts, now()), p_ends, p_limit, p_active)
    returning * into r;
  else
    update promos set name = p_name, kind = p_kind, value = p_value, min_spend = coalesce(p_min_spend, 0), max_discount = p_max_discount,
           starts_at = coalesce(p_starts, starts_at), ends_at = p_ends, usage_limit = p_limit, active = p_active
     where id = p_id and tenant_id = t returning * into r;
    if not found then raise exception 'Promo tidak ditemukan'; end if;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'promo_saved', 'promos', r.id::text, jsonb_build_object('code', r.code, 'kind', r.kind, 'value', r.value));
  return r;
end $$;

create or replace function public._promo_discount(p promos, p_subtotal numeric) returns numeric
language plpgsql immutable as $$
declare d numeric;
begin
  d := case when p.kind = 'pct' then round(p_subtotal * p.value / 100, 0) else p.value end;
  if p.max_discount is not null then d := least(d, p.max_discount); end if;
  return least(d, p_subtotal);
end $$;

create or replace function public._promo_check(p_tenant uuid, p_branch uuid, p_code text, p_subtotal numeric) returns promos
language plpgsql stable security definer set search_path = public as $$
declare p promos;
begin
  select * into p from promos where tenant_id = p_tenant and upper(code) = upper(btrim(coalesce(p_code, '')));
  if not found or not p.active then raise exception 'Kode promo tidak dikenal atau tidak aktif'; end if;
  if p.branch_id is not null and p.branch_id <> p_branch then raise exception 'Promo tidak berlaku di cabang ini'; end if;
  if now() < p.starts_at then raise exception 'Promo belum dimulai'; end if;
  if p.ends_at is not null and now() > p.ends_at then raise exception 'Promo sudah berakhir'; end if;
  if p.usage_limit is not null and p.used_count >= p.usage_limit then raise exception 'Kuota promo sudah habis'; end if;
  if p_subtotal < p.min_spend then raise exception 'Belanja minimal % untuk promo ini', _rp(p.min_spend); end if;
  return p;
end $$;
revoke execute on function public._promo_check(uuid, uuid, text, numeric) from public, anon, authenticated;

create or replace function public.validate_promo(p_code text, p_subtotal numeric, p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid; p promos;
begin
  perform _need(5, 'r');
  t := _branch_guard(p_branch);
  p := _promo_check(t, p_branch, p_code, p_subtotal);
  return jsonb_build_object('code', p.code, 'name', p.name, 'discount', _promo_discount(p, p_subtotal));
end $$;

-- Terapkan ke pesanan terbuka. Catatan: pay_order tetap menerapkan batas diskon kebijakan (PIN bila persentase melewati batas).
create or replace function public.apply_voucher(p_order uuid, p_code text) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; p promos; d numeric; v_taxable numeric; v_tax numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  p := _promo_check(o.tenant_id, o.branch_id, p_code, o.subtotal);
  d := _promo_discount(p, o.subtotal);
  v_taxable := o.subtotal - d;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = d, tax = v_tax, total = v_taxable + v_tax, voucher_code = p.code where id = o.id returning * into o;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (o.tenant_id, auth.uid(), current_app_role(), 'voucher_applied', 'orders', o.id::text, jsonb_build_object('code', p.code, 'discount', d));
  return o;
end $$;

create or replace function public.remove_voucher(p_order uuid) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; v_tax numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = 0, tax = v_tax, total = o.subtotal + v_tax, voucher_code = null where id = o.id returning * into o;
  return o;
end $$;

-- Diskon dari voucher sudah diotorisasi Owner/GM saat promo dibuat, jadi tidak lagi memicu PIN kebijakan di kasir.
-- Syarat pengecualian: voucher_code terisi (hanya apply_voucher yang mengisinya), kasir tidak menimpa nominal diskon,
-- dan diskon yang tersimpan = hasil hitung voucher. Diskon manual (apply_order_discount) menghapus voucher_code.
-- (Salinan pay_order & apply_order_discount dari migrasi 14 dengan satu perubahan syarat tiap fungsi.)
create or replace function public.apply_order_discount(p_order uuid, p_discount numeric, p_pin text default null) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pol jsonb; pct numeric; mx numeric; auth_id uuid; v_tax numeric; v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    pct := round(p_discount / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = p_discount, tax = v_tax, total = v_taxable + v_tax, voucher_code = null where id = o.id returning * into o;
  return o;
end $$;

create or replace function public.pay_order(
  p_order uuid, p_payments jsonb, p_customer_phone text default null, p_discount numeric default null, p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric; v_taxable numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
        disc numeric; pct numeric; mx numeric; pol jsonb; auth_id uuid; jl jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Diskon: di atas batas efektif (Tenant → Cabang → Peran) wajib PIN GM cabang / Owner
  disc := coalesce(p_discount, o.discount, 0);
  if disc < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if disc > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  if disc > 0 and o.subtotal > 0 then
    pct := round(disc / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx and not (o.voucher_code is not null and p_discount is null and disc = o.discount) then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  -- Pajak dari pengaturan tenant (Fase 0.8) atas nilai setelah diskon; tagihan klinik selalu tanpa pajak.
  v_taxable := o.subtotal - disc;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  v_total := v_taxable + v_tax;

  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), discount = disc, tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000 dari total yang dibayar; poin hanya naik lewat transaksi (customers_guard).
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  -- Jurnal: diskon dicatat sebagai potongan penjualan (4102) agar pendapatan kotor tetap = subtotal.
  jl := jsonb_build_array(jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash));
  if disc > 0 then jl := jl || jsonb_build_array(jsonb_build_object('code', '4102', 'dr', disc)); end if;
  jl := jl || jsonb_build_array(
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp)));
  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jl);
  return o;
end $$;

-- Hitung pemakaian hanya saat transaksi LUNAS; kembalikan kuota bila di-void/refund.
create or replace function public._voucher_redeem() returns trigger language plpgsql security definer set search_path = public as $$
declare p promos;
begin
  if new.voucher_code is null then return new; end if;
  select * into p from promos where tenant_id = new.tenant_id and upper(code) = upper(new.voucher_code);
  if not found then return new; end if;
  if new.status = 'paid' and old.status <> 'paid' then
    insert into promo_redemptions (tenant_id, promo_id, order_id, discount) values (new.tenant_id, p.id, new.id, new.discount) on conflict (order_id) do nothing;
    if found then update promos set used_count = used_count + 1 where id = p.id; end if;
  elsif new.status in ('void', 'refunded') and old.status = 'paid' then
    delete from promo_redemptions where order_id = new.id;
    if found then update promos set used_count = greatest(used_count - 1, 0) where id = p.id; end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_voucher_redeem on public.orders;
create trigger orders_voucher_redeem after update of status on public.orders for each row execute function public._voucher_redeem();

-- ═══ 3.6 Proyeksi arus kas ═══════════════════════════════════════════════════
-- Model sederhana & transparan: penjualan = rata-rata per hari-dalam-minggu 28 hari terakhir; HPP/pembelian = persentase HPP historis;
-- beban tetap = rata-rata beban 6xxx (di luar gaji & waste) per hari; gaji = jurnal gaji terakhir pada tanggal gaji tenant;
-- utang dagang berjalan dibayar pada hari ke-p_ap_days. Saldo awal = akun kas + bank.
create or replace function public.cash_projection(p_days int default 30, p_ap_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); today date; opening numeric; ap numeric; payroll numeric; pday int; sales28 numeric; cogs28 numeric;
        fixed_day numeric; cogs_ratio numeric; bal numeric; i int; d date; inflow numeric; outflow numeric; wd numeric[] := array_fill(0::numeric, array[7]);
        wdn int[] := array_fill(0, array[7]); rows jsonb := '[]'; minbal numeric; first_neg date; r record; assumptions jsonb;
begin
  perform _need(12, 'r');
  if current_app_role()::text not in ('owner', 'gm', 'superadmin') then raise exception 'Proyeksi kas hanya untuk Owner/GM'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
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

-- ═══ 3.7 AI Copilot Owner ════════════════════════════════════════════════════
-- Database menyiapkan FAKTA terukur; model hanya merangkum. Edge Function owner-copilot memanggil ini dengan JWT Owner,
-- sehingga RLS dan matriks RBAC tetap berlaku. Jangan menaruh PII pelanggan/pasien di sini.
create table if not exists public.copilot_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id),
  question text not null,
  answer text,
  tokens int,
  created_at timestamptz not null default now()
);
alter table public.copilot_logs enable row level security;
create policy copilot_logs_read on public.copilot_logs for select using (tenant_ok(tenant_id) and has_perm(2, 'r') and current_app_role()::text in ('owner', 'superadmin'));

create or replace function public.copilot_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); kpi jsonb; menu jsonb; cash jsonb; pend int; lowstock int; voids7 int;
begin
  perform _need(2, 'r');
  if current_app_role()::text not in ('owner', 'superadmin') then raise exception 'Copilot hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
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

create or replace function public.log_copilot(p_question text, p_answer text, p_tokens int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'r');
  if current_app_role()::text <> 'owner' then raise exception 'Copilot hanya untuk Owner'; end if;
  insert into copilot_logs (tenant_id, question, answer, tokens) values (current_tenant_id(), left(p_question, 2000), left(p_answer, 8000), p_tokens);
end $$;

-- ═══ Hak eksekusi ════════════════════════════════════════════════════════════
grant execute on function public.menu_engineering(uuid, int), public.check_margin_alerts(), public.set_branch_target(uuid, date, numeric, numeric, numeric),
  public.branch_kpi(date), public.save_report_schedule(text, text, int, int, text, boolean), public.save_checklist_template(uuid, text, jsonb, boolean),
  public.submit_checklist(uuid, text, jsonb, text), public.upsert_promo(text, text, text, numeric, numeric, numeric, timestamptz, timestamptz, int, uuid, boolean, uuid),
  public.validate_promo(text, numeric, uuid), public.apply_voucher(uuid, text), public.remove_voucher(uuid),
  public.cash_projection(int, int), public.copilot_snapshot(), public.log_copilot(text, text, int) to authenticated;
