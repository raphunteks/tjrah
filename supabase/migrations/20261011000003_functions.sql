-- Harum.in · Audit trail + RPC dashboard & persetujuan

-- ───────── Audit trigger generik ─────────
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  t_id uuid;
begin
  t_id := case when rec ? 'tenant_id' then (rec->>'tenant_id')::uuid
               when tg_table_name = 'tenants' then (rec->>'id')::uuid end;
  -- Jangan pernah salin hash PIN ke log.
  rec := rec - 'pin_hash';
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t_id, auth.uid(), public.current_app_role(), lower(tg_op), tg_table_name, rec->>'id',
          case when tg_op = 'UPDATE' then jsonb_build_object('after', rec) else rec end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['tenants','plans','platform_settings','tenant_integrations','branches','profiles',
                           'approvals','capital_applications','payout_accounts','journal_entries','invoices']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Superadmin membuka konteks tenant → dicatat (hak akses tetap sesuai matriks asli).
create or replace function public.log_superadmin_access(p_tenant uuid, p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then return; end if;
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, detail)
  values (p_tenant, auth.uid(), 'superadmin', 'access', 'tenant_context', jsonb_build_object('area', p_area));
end $$;

-- Tenant efektif: Superadmin wajib menyebut tenant, role lain selalu tenant-nya sendiri.
create or replace function public.effective_tenant(p_tenant uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_superadmin() then
    if p_tenant is null then raise exception 'Superadmin harus memilih tenant'; end if;
    return p_tenant;
  end if;
  return public.current_tenant_id();
end $$;

-- ───────── Fitur 2 · Dashboard harian per cabang ─────────
create or replace function public.dashboard_daily(p_from date, p_to date, p_tenant uuid default null, p_branch uuid default null)
returns table (day date, branch_id uuid, branch_name text, orders bigint, revenue numeric, discount numeric, cogs numeric, opex numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(2, 'r') then raise exception 'Akses ditolak: fitur 2'; end if;
  return query
  with days as (select generate_series(p_from, p_to, interval '1 day')::date d),
  sales as (
    select o.paid_at::date d, o.branch_id b, count(*) n, sum(o.total) rev, sum(o.discount) disc, sum(o.cogs) hpp
    from public.orders o
    where o.tenant_id = t and o.status = 'paid' and o.paid_at::date between p_from and p_to
      and (p_branch is null or o.branch_id = p_branch)
    group by 1, 2
  ),
  costs as (
    select e.entry_date d, e.branch_id b, sum(l.debit - l.credit) amt
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
    join public.accounts a on a.id = l.account_id and a.type = 'expense'
    where e.tenant_id = t and e.entry_date between p_from and p_to
      and (p_branch is null or e.branch_id = p_branch)
    group by 1, 2
  )
  select days.d, br.id, br.name,
         coalesce(s.n, 0), coalesce(s.rev, 0), coalesce(s.disc, 0), coalesce(s.hpp, 0), coalesce(c.amt, 0)
  from days
  cross join public.branches br
  left join sales s on s.d = days.d and s.b = br.id
  left join costs c on c.d = days.d and c.b = br.id
  where br.tenant_id = t and (p_branch is null or br.id = p_branch)
  order by 1, 3;
end $$;

-- ───────── Fitur 11 · Laba rugi per akun ─────────
create or replace function public.profit_loss(p_from date, p_to date, p_tenant uuid default null)
returns table (type public.account_type, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(11, 'r') then raise exception 'Akses ditolak: fitur 11'; end if;
  return query
  select a.type, a.code, a.name,
         case when a.type = 'revenue' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end
  from public.accounts a
  join public.journal_lines l on l.account_id = a.id
  join public.journal_entries e on e.id = l.entry_id and e.entry_date between p_from and p_to
  where a.tenant_id = t and a.type in ('revenue', 'cogs', 'expense')
  group by a.type, a.code, a.name
  order by a.code;
end $$;

-- ───────── Superadmin · ringkasan platform ─────────
create or replace function public.platform_overview()
returns table (tenants bigint, active bigint, trial bigint, past_due bigint, suspended bigint, mrr numeric, unpaid numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_superadmin() and public.has_perm(1, 'r')) then raise exception 'Akses ditolak'; end if;
  return query
  select count(*),
         count(*) filter (where t.status = 'active'),
         count(*) filter (where t.status = 'trial'),
         count(*) filter (where t.status = 'past_due'),
         count(*) filter (where t.status = 'suspended'),
         coalesce(sum(p.price_month) filter (where t.status = 'active'), 0),
         (select coalesce(sum(amount), 0) from public.invoices where status = 'unpaid')
  from public.tenants t left join public.plans p on p.id = t.plan_id;
end $$;

-- ───────── Persetujuan ─────────
create or replace function public.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

create or replace function public.decide_approval(p_id uuid, p_decision public.approval_status, p_note text default null, p_pin text default null)
returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.approvals;
  needs_pin boolean;
  my_hash text;
begin
  select * into a from public.approvals where id = p_id for update;
  if not found or not public.tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not public.has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;

  -- Matriks asli: GM pada fitur 6 = "Approval (PIN/Otorisasi)".
  select label like '%PIN%' into needs_pin from public.rbac_matrix where feature = a.feature and role = public.current_app_role();
  if needs_pin then
    select pin_hash into my_hash from public.profiles where id = auth.uid();
    if my_hash is null or p_pin is null or crypt(p_pin, my_hash) <> my_hash then
      raise exception 'PIN otorisasi salah';
    end if;
  end if;
  if a.kind = 'void' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Catatan alasan wajib diisi untuk void';
  end if;

  update public.approvals
     set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_id returning * into a;
  return a;
end $$;

grant execute on function public.dashboard_daily, public.profit_loss, public.platform_overview,
  public.decide_approval, public.set_my_pin, public.log_superadmin_access to authenticated;

-- PIN GM untuk akun demo — hanya bisa dipanggil service_role (scripts/create-demo-users.mjs).
create or replace function public.admin_set_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_user;
end $$;
revoke all on function public.admin_set_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_pin(uuid, text) to service_role;
