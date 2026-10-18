-- Audit RLS otomatis: setiap akun uji × setiap tabel.
-- Aturan: peran tanpa hak R (matriks rbac_matrix) pada fitur sebuah tabel HARUS melihat 0 baris.
--
-- Jalankan sebagai pemilik database (bukan dari aplikasi):
--   psql "$DATABASE_URL_DIRECT" -v emails="'%@demo.harum.in'" -f supabase/tests/rls_audit.sql
-- Tanpa -v, memakai pola akun demo. Semua dijalankan di dalam transaksi lalu di-ROLLBACK (tidak ada data berubah).
\if :{?emails}
\else
  \set emails '''%@demo.harum.in'''
\endif
begin;
select set_config('harumin.audit_emails', :emails, true) \g /dev/null
create temp table _rls_map (tbl text primary key, features int[], roles text[]) on commit drop;
insert into _rls_map values
  ('orders','{5}',null),('order_items','{8,5}',null),('payments','{5}',null),('products','{3}',null),('inventory_items','{4,10}',null),('bom_lines','{4}',null),
  ('stock_levels','{10}',null),('stock_movements','{10}',null),('stock_counts','{10}',null),('waste_logs','{10}',null),('stock_transfers','{10}',null),
  ('vendors','{9}',null),('purchase_orders','{9}',null),('tables','{7}',null),('shifts','{5,12}',null),('petty_cash','{12}',null),('work_shifts','{13}',null),
  ('attendance','{13}',null),('payroll_runs','{14}',null),('payroll_lines','{14}',null),('journal_entries','{11}',null),('accounts','{11}',null),
  ('capital_applications','{19}',null),('payout_accounts','{19}',null),('hermes_events','{2}',null),('customers','{15}',null),('queue_entries','{18}',null),
  ('patients','{17}',null),('visits','{17}',null),('odontogram_entries','{17}',null),('visit_diagnoses','{17}',null),('visit_procedures','{17}',null),
  ('prescriptions','{17}',null),('prescription_items','{17}',null),('satusehat_outbox','{17}',null),('audit_logs','{1}',null),
  ('tenant_integrations','{1}',null),('invoices','{1}',null),('member_branches','{13}',null),('platform_settings','{}',null),('blueprint_docs','{}',null),
  ('staff_invites','{13}','{superadmin,owner,gm}'),('tenant_notes','{}','{superadmin}'),
  ('support_tickets','{}','{superadmin,owner}'),('ticket_messages','{}','{superadmin,owner}');
create temp table _rls_result (email text, role text, tbl text, visible bigint, allowed boolean) on commit drop;
grant insert, select on _rls_result to authenticated;
grant select on _rls_map to authenticated;

-- Fixture: tabel Fase 1 harus berisi baris agar uji "0 baris" bermakna (semua dibatalkan oleh ROLLBACK).
do $$
declare t uuid; tk uuid;
begin
  select id into t from public.tenants where status <> 'suspended' order by created_at limit 1;
  insert into public.staff_invites (tenant_id, email, full_name, role, branch_ids, invited_by)
    values (t, 'audit.invite@example.test', 'Audit Invite', 'owner', '{}', null),
           (t, 'audit.gm@example.test', 'Audit GM', 'gm', '{}', null);
  insert into public.tenant_notes (tenant_id, body, author_id) values (t, 'catatan internal audit', null);
  insert into public.support_tickets (tenant_id, category, subject, sla_due_at, opened_by) values (t, 'Data', 'Tiket audit RLS', now(), null) returning id into tk;
  insert into public.ticket_messages (ticket_id, tenant_id, author_role, body, internal, author_id) values
    (tk, t, 'owner', 'pesan publik', false, null), (tk, t, 'superadmin', 'pesan internal', true, null);
end $$;

do $$
declare p record; m record; n bigint; ok boolean;
begin
  for p in select id, email, role from public.profiles where email like current_setting('harumin.audit_emails') order by role loop
    for m in select * from _rls_map loop
      ok := case when m.roles is not null then p.role::text = any (m.roles)
                 when m.features = '{}' then p.role = 'superadmin'
                 else exists (select 1 from public.rbac_matrix r where r.role = p.role and r.feature = any (m.features) and r.can_read) end;
      perform set_config('request.jwt.claim.sub', p.id::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      execute format('select count(*) from public.%I', m.tbl) into n;
      execute 'reset role';
      insert into _rls_result values (p.email, p.role, m.tbl, n, ok);
    end loop;
  end loop;
end $$;

\echo '── Ringkasan per akun (baris terlihat; tanda * = tidak punya R, harus 0)'
select tbl,
       string_agg(role || '=' || visible || case when allowed then '' else '*' end, '  ' order by role, email) as hasil
from _rls_result group by tbl order by tbl;

\echo '── KEBOCORAN (harus kosong)'
select email, role, tbl, visible from _rls_result where not allowed and visible > 0 order by email, tbl;

do $$
declare p record; n bigint; bad int := 0;
begin
  for p in select id, email, role from public.profiles where email like current_setting('harumin.audit_emails') and role in ('owner', 'gm') loop
    perform set_config('request.jwt.claim.sub', p.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.ticket_messages where internal;
    if n > 0 then bad := bad + 1; raise warning 'BOCOR: % melihat % pesan internal', p.email, n; end if;
    select count(*) into n from public.staff_invites where role = 'owner' and p.role = 'gm';
    if n > 0 then bad := bad + 1; raise warning 'BOCOR: GM % melihat undangan Owner', p.email; end if;
    execute 'reset role';
  end loop;
  if bad > 0 then raise exception 'GAGAL: % kebocoran khusus Fase 1', bad; end if;
end $$;

do $$
declare leaks int; accounts int;
begin
  select count(*) filter (where not allowed and visible > 0), count(distinct email) into leaks, accounts from _rls_result;
  if accounts = 0 then raise exception 'Tidak ada akun uji yang cocok dengan pola email'; end if;
  if leaks > 0 then raise exception 'GAGAL: % kebocoran RLS', leaks; end if;
  raise notice 'LULUS: % akun × % tabel, tanpa kebocoran', accounts, (select count(*) from _rls_map);
end $$;
rollback;
