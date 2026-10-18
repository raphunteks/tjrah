-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Harum.in · VERIFIKASI DATABASE ASLI (read-only)
-- Jalankan di Supabase → SQL Editor (peran postgres) SETELAH migrasi 1–19 (atau bootstrap.sql) diterapkan.
-- Skrip ini hanya SELECT: tidak mengubah apa pun. Hasil: satu baris per pemeriksaan, kolom `hasil` = OK / GAGAL / INFO.
-- Semua baris harus OK; INFO hanya keterangan untuk dibaca. Kirim baris GAGAL bila ada.
-- ════════════════════════════════════════════════════════════════════════════════════════════
with
exp_tables(t) as (values ('tenants'),('profiles'),('branches'),('orders'),('order_items'),('payments'),('journal_entries'),('rbac_matrix'),('audit_logs'),
  ('promos'),('promo_redemptions'),('branch_targets'),('report_schedules'),('checklist_templates'),('shift_checklists'),('copilot_logs'),
  ('resellers'),('reseller_commissions'),('feature_flags'),('tenant_flag_overrides'),('ai_usage'),('industry_templates'),('benchmark_monthly'),('shift_swaps')),
exp_funcs(f) as (values ('has_perm'),('tenant_ok'),('branch_ok'),('pay_order'),('apply_order_discount'),('menu_engineering'),('branch_kpi'),('upsert_promo'),('apply_voucher'),
  ('cash_projection'),('copilot_snapshot'),('generate_invoices'),('run_dunning'),('mark_invoice_paid'),('has_flag'),('ai_quota_check'),('sync_offline_orders'),
  ('my_benchmark'),('request_swap'),('decide_swap'),('swap_candidates'),('my_swaps'),('labour_cost_estimate'),('_pin_authorizer')),
c(urut, pemeriksaan, hasil, detail) as (

  select 1, 'Tabel yang diharapkan ada', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(t, ', '), '—')
    from exp_tables where to_regclass('public.' || t) is null
  union all
  select 2, 'Fungsi yang diharapkan ada', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(f, ', '), '—')
    from exp_funcs where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f)
  union all
  select 3, 'Semua tabel publik memakai RLS', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(c.relname, ', '), '—')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  select 4, 'Tabel ber-RLS tanpa satu pun policy (akses tertutup total, pastikan memang disengaja)', case when count(*) = 0 then 'OK' else 'INFO' end, coalesce(string_agg(c.relname, ', '), '—')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  union all
  select 5, 'anon tidak boleh menjalankan fungsi publik apa pun', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(p.proname, ', '), '—')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  union all
  select 6, 'SECURITY DEFINER wajib set search_path', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(p.proname, ', '), '—')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')
  union all
  select 7, 'Fungsi internal tidak dapat dipanggil pengguna', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(p.proname, ', '), '—')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('_pin_authorizer','_item_cost','_product_cost','_kpi','_build_report','_promo_check','_promo_discount','_mark_paid','_swap_check','_shift_overlap')
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 8, 'Matriks RBAC asli utuh (100 baris = 20 fitur × 5 peran)', case when (select count(*) from rbac_matrix) = 100 then 'OK' else 'GAGAL' end, (select count(*)::text from rbac_matrix) || ' baris'
  union all
  select 9, 'Sidik jari matriks RBAC tidak berubah', case when (select md5(string_agg(r::text, '|' order by r::text)) from rbac_matrix r) = 'cba47e61a42f63c897189b480ab20eb3' then 'OK' else 'GAGAL' end,
         (select md5(string_agg(r::text, '|' order by r::text)) from rbac_matrix r)
  union all
  select 10, 'Feature flag bawaan (6) & template industri (4)', case when (select count(*) from feature_flags) >= 6 and (select count(*) from industry_templates) >= 4 then 'OK' else 'GAGAL' end,
         (select count(*) from feature_flags) || ' flag, ' || (select count(*) from industry_templates) || ' template'
  union all
  select 11, 'Kuota AI paket: starter 0 / growth > 0 (null berarti TANPA batas — jangan biarkan)', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(code, ', '), '—')
    from plans where ai_quota_tokens is null or (code = 'starter' and ai_quota_tokens <> 0)
  union all
  select 12, 'Setiap tenant punya paket', case when count(*) = 0 then 'OK' else 'GAGAL' end, coalesce(string_agg(name, ', '), '—') from tenants where plan_id is null
  union all
  select 13, 'Tidak ada baris tanpa tenant di tabel sensitif', case when (select count(*) from orders where tenant_id is null) + (select count(*) from journal_entries where tenant_id is null) = 0 then 'OK' else 'GAGAL' end, '—'
  union all
  select 14, 'Saklar penagihan otomatis (bawaan MATI)', 'INFO', coalesce((select value::text from platform_settings where key = 'billing'), 'belum diatur = mati')
  union all
  select 15, 'Jadwal pg_cron untuk hermes-dispatch', 'INFO',
         case when to_regclass('cron.job') is null then 'pg_cron belum aktif' else coalesce((xpath('/row/j/text()', query_to_xml('select string_agg(jobname || '' ['' || schedule || '']'', '', '') as j from cron.job', false, true, '')))[1]::text, 'tidak ada job') end
  union all
  select 16, 'Penugasan reseller yatim (reseller dinonaktifkan tapi masih terpasang)', case when count(*) = 0 then 'OK' else 'INFO' end, coalesce(string_agg(t.name, ', '), '—')
    from tenants t join resellers r on r.id = t.reseller_id where r.status <> 'active'
  union all
  select 17, 'Tagihan menunggak > 14 hari yang tenant-nya belum ditangguhkan', case when count(*) = 0 then 'OK' else 'INFO' end, coalesce(string_agg(t.name, ', '), '—')
    from invoices i join tenants t on t.id = i.tenant_id where i.status = 'unpaid' and i.due_date < current_date - 14 and t.status not in ('suspended')
)
select pemeriksaan, hasil, detail from c order by urut;
