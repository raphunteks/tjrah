-- ═══════════ DATA DEMO ═══════════
-- Semua angka di bawah adalah DATA DEMO untuk mencoba dashboard, bukan data bisnis nyata.
select setseed(0.42);

insert into public.plans (id, code, name, price_month, max_branches, modules) values
  ('00000000-0000-0000-0000-0000000000a1', 'starter',    'Starter (1 Bulan)',    500000,  1, '{M1,M2,M3,M6}'),
  ('00000000-0000-0000-0000-0000000000a2', 'growth',     'Growth (6 Bulan)',     2500000, 5, '{M1,M2,M3,M4,M5,M6,M7,M8}'),
  ('00000000-0000-0000-0000-0000000000a3', 'enterprise', 'Enterprise (1 Tahun)', 3500000, 99, '{M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12}');

insert into public.tenants (id, name, slug, pillar, status, plan_id, current_period_end, owner_email) values
  ('00000000-0000-0000-0000-000000000001', 'Kopi Harum Makassar', 'kopi-harum', 'fnb', 'active',
   '00000000-0000-0000-0000-0000000000a2', '2027-04-12', 'owner@demo.harum.in'),
  ('00000000-0000-0000-0000-000000000002', 'Klinik Gigi Senyum', 'klinik-senyum', 'health', 'trial',
   '00000000-0000-0000-0000-0000000000a3', '2027-10-12', 'drg@klinik-senyum.test'),
  ('00000000-0000-0000-0000-000000000003', 'Toko Bangunan Jaya', 'tb-jaya', 'retail', 'past_due',
   '00000000-0000-0000-0000-0000000000a1', current_date - 4, 'admin@tbjaya.test'),
  ('00000000-0000-0000-0000-000000000004', 'Salon Ayu', 'salon-ayu', 'service', 'suspended',
   '00000000-0000-0000-0000-0000000000a1', current_date - 40, 'ayu@salon.test');

insert into public.invoices (tenant_id, period, amount, status) values
  ('00000000-0000-0000-0000-000000000001', '2026-10-12'::date, 2500000, 'paid'),
  ('00000000-0000-0000-0000-000000000003', '2026-10-12'::date, 500000, 'unpaid'),
  ('00000000-0000-0000-0000-000000000004', '2026-09-12'::date, 500000, 'unpaid');

insert into public.branches (id, tenant_id, name, city, address, lat, lng) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'Cabang Pettarani', 'Makassar', 'Jl. A. P. Pettarani', -5.1561, 119.4363),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 'Cabang Panakkukang', 'Makassar', 'Jl. Boulevard', -5.1530, 119.4470),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000002', 'Klinik Utama', 'Makassar', 'Jl. Sam Ratulangi', -5.1460, 119.4150);

insert into public.platform_settings (key, value) values
  ('ai_gateway', jsonb_build_object(
     'base_url', 'http://127.0.0.1:20128/v1',
     'default_model', 'auto',
     'fallback_chain', jsonb_build_array('claude', 'gemini', 'openai', 'deepseek'),
     'timeout_ms', 20000,
     'secret_name', 'NINEROUTER_API_KEY')),
  ('hermes', jsonb_build_object(
     'webhook_url_secret', 'HERMES_WEBHOOK_URL',
     'token_secret', 'HERMES_TOKEN',
     'z_report_hour', 23,
     'low_stock_alert', true));

insert into public.tenant_integrations (tenant_id, hermes_enabled, whatsapp_owner, whatsapp_gm, ai_enabled) values
  ('00000000-0000-0000-0000-000000000001', true, '+62 811-0000-0001 (demo)', '+62 811-0000-0002 (demo)', true),
  ('00000000-0000-0000-0000-000000000002', false, null, null, false);

-- Bagan akun ringkas (PSAK) untuk tenant demo utama.
insert into public.accounts (id, tenant_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', '1101', 'Kas & Bank', 'asset'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '1301', 'Persediaan Bahan Baku', 'asset'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000001', '2101', 'Utang Dagang', 'liability'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000001', '3101', 'Modal Pemilik', 'equity'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000001', '4101', 'Pendapatan Penjualan', 'revenue'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000001', '5101', 'Harga Pokok Penjualan', 'cogs'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-000000000001', '6101', 'Beban Gaji', 'expense'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-000000000001', '6102', 'Beban Sewa', 'expense'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-000000000001', '6103', 'Beban Listrik & Internet', 'expense');

-- 60 hari transaksi demo per cabang.
insert into public.orders (tenant_id, branch_id, code, status, channel, subtotal, discount, tax, total, cogs, created_at, paid_at)
select '00000000-0000-0000-0000-000000000001', b.id,
       'ORD-' || to_char(d, 'YYMMDD') || '-' || right(b.id::text, 2) || '-' || lpad(n::text, 3, '0'),
       'paid', (array['dine_in','takeaway','online'])[1 + floor(random() * 3)::int],
       sub, disc, round((sub - disc) * 0.10), round((sub - disc) * 1.10), round(sub * (0.34 + random() * 0.08)),
       ts.at, ts.at
from generate_series(current_date - 59, current_date, interval '1 day') d
cross join public.branches b
cross join lateral generate_series(1, (case when b.name like '%Pettarani%' then 55 else 38 end)
                                      + floor(random() * 25)::int
                                      + (case when extract(isodow from d) >= 6 then 18 else 0 end)) n
cross join lateral (select round((28000 + random() * 160000) / 500) * 500 as sub) s
cross join lateral (select case when random() < 0.12 then round(s.sub * 0.1) else 0 end as disc) dd
cross join lateral (select d + interval '8 hours' + random() * interval '13 hours' as at) ts
where b.tenant_id = '00000000-0000-0000-0000-000000000001';

-- Jurnal harian otomatis dari penjualan (Dr Kas / Cr Pendapatan; Dr HPP / Cr Persediaan).
with daily as (
  select paid_at::date d, branch_id b, sum(total - tax) rev, sum(cogs) hpp
  from public.orders where tenant_id = '00000000-0000-0000-0000-000000000001' group by 1, 2
), je as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  select '00000000-0000-0000-0000-000000000001', b, d, 'Rekap penjualan POS', 'pos' from daily
  returning id, branch_id, entry_date
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000001', je.id, x.acc, x.dr, x.cr
from je join daily on daily.d = je.entry_date and daily.b = je.branch_id
cross join lateral (values
  ('00000000-0000-0000-0000-0000000000c1'::uuid, daily.rev, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c5'::uuid, 0::numeric, daily.rev),
  ('00000000-0000-0000-0000-0000000000c6'::uuid, daily.hpp, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c2'::uuid, 0::numeric, daily.hpp)) x(acc, dr, cr);

-- Beban operasional harian per cabang (gaji, sewa, listrik) dibagi rata.
with je as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  select '00000000-0000-0000-0000-000000000001', b.id, d::date, 'Alokasi beban harian', 'expense'
  from generate_series(current_date - 59, current_date, interval '1 day') d
  cross join public.branches b where b.tenant_id = '00000000-0000-0000-0000-000000000001'
  returning id, branch_id
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000001', je.id, x.acc, x.dr, x.cr
from je cross join lateral (values
  ('00000000-0000-0000-0000-0000000000c7'::uuid, 1450000::numeric, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c8'::uuid, 600000, 0),
  ('00000000-0000-0000-0000-0000000000c9'::uuid, 180000, 0),
  ('00000000-0000-0000-0000-0000000000c1'::uuid, 0, 2230000)) x(acc, dr, cr);

-- Void menunggu otorisasi, terhubung ke transaksi nyata hari ini di Cabang Panakkukang.
insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail)
select o.tenant_id, o.branch_id, 6, 'void', o.code, 'Void transaksi · salah input kasir', o.total,
       jsonb_build_object('order_id', o.id, 'alasan', 'Salah Input Kasir', 'catatan', 'Jumlah es kopi tertulis 3, seharusnya 2')
from public.orders o where o.branch_id = '00000000-0000-0000-0000-0000000000b2' and o.paid_at::date = current_date
order by o.paid_at desc limit 1;

insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail) values
  ('00000000-0000-0000-0000-000000000001', null, 20, 'supplies', 'SUP-0031',
   'Harum.in Supplies · cup 16oz 2.000 pcs', 1900000, '{"distributor": "demo"}');

insert into public.capital_applications (tenant_id, amount, tenor_months, purpose, status) values
  ('00000000-0000-0000-0000-000000000001', 75000000, 12, 'Renovasi cabang ketiga (demo)', 'review');

insert into public.payout_accounts (tenant_id, bank, account_name, account_last4, verified) values
  ('00000000-0000-0000-0000-000000000001', 'BCA', 'PT Kopi Harum (demo)', '4821', true);

insert into public.hermes_events (tenant_id, channel, target, kind, message, status, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'whatsapp', 'Owner', 'z_report', 'Z-Report kemarin terkirim: ringkasan 2 cabang.', 'simulated', now() - interval '9 hours'),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp', 'GM', 'low_stock', 'Sirup Kopi Cabang Panakkukang tersisa 2 botol (minimum 5).', 'simulated', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-000000000001', 'discord', '#alert-sistem', 'void_alert', 'Permintaan void ORD-HARUM-9102 Rp 185.000 menunggu otorisasi.', 'simulated', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', 'discord', '#laporan-harian', 'margin_drop', 'Marjin kotor Cabang Panakkukang turun dibanding rata-rata 7 hari.', 'simulated', now() - interval '40 minutes');
