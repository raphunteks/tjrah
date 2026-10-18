-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 18: Publikasi Supabase Realtime & Sinkronisasi Platform Settings
-- Mengaktifkan event WebSocket real-time untuk semua tabel operasional & master,
-- memastikan tidak ada ketergantungan pada localStorage / cache lokal usang.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Pastikan platform_settings tersinkronisasi dengan konfigurasi 9router
insert into public.platform_settings (key, value, updated_at)
values (
  'ai_gateway',
  jsonb_build_object(
    'base_url', 'http://43.134.43.146:20128/v1',
    'default_model', 'harumin-combos',
    'fallback_chain', jsonb_build_array('hermes-combos', 'bemfkgumi-combos'),
    'timeout_ms', 10000,
    'secret_name', 'NINEROUTER_API_KEY'
  ),
  now()
)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- 2. Atur REPLICA IDENTITY FULL untuk tabel-tabel utama agar payload UPDATE/DELETE lengkap di Realtime
alter table public.orders replica identity full;
alter table public.order_items replica identity full;
alter table public.tables replica identity full;
alter table public.queue_entries replica identity full;
alter table public.approvals replica identity full;
alter table public.shifts replica identity full;
alter table public.attendance replica identity full;
alter table public.stock_levels replica identity full;
alter table public.platform_settings replica identity full;
alter table public.tenant_integrations replica identity full;
alter table public.tenant_policies replica identity full;
alter table public.support_tickets replica identity full;
alter table public.ticket_messages replica identity full;
alter table public.support_sessions replica identity full;

-- 3. Tambahkan semua tabel operasional & master ke publikasi supabase_realtime
do $$
declare
  t text;
  pub_tables text[] := array[
    'orders', 'order_items', 'tables', 'products', 'customers',
    'stock_levels', 'stock_counts', 'stock_movements', 'stock_transfers', 'purchase_orders',
    'profiles', 'member_branches', 'staff_invites', 'tenants', 'branches',
    'shifts', 'attendance', 'approvals', 'petty_cash', 'payments',
    'support_tickets', 'ticket_messages', 'support_sessions', 'tenant_policies',
    'platform_settings', 'tenant_integrations', 'hermes_events',
    'queue_entries', 'visits', 'patients', 'prescriptions', 'prescription_items',
    'odontogram_entries', 'visit_diagnoses', 'visit_procedures', 'satusehat_outbox',
    'invoices', 'plans', 'resellers', 'reseller_commissions'
  ];
begin
  foreach t in array pub_tables loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end if;
  end loop;
end $$;
