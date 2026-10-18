-- 20261011000030_copilot_token_model.sql
-- Penyelarasan Model Kuota AI: 1 Pertanyaan = 1 Token/Kredit Kuota Bulanan
-- Paket Growth mendapatkan kuota 500 pertanyaan per bulan (di-reset tiap tanggal 1 awal bulan).
-- Paket Enterprise mendapatkan kuota tanpa batas (ai_unlimited = true).
-- Superadmin dapat memberikan kuota kustom per tenant via set_ai_quota(tenant_id, kuota).

update public.plans
set ai_quota_tokens = 250, ai_unlimited = false
where code = 'growth';

update public.plans
set ai_quota_tokens = 0, ai_unlimited = false
where code = 'starter';

update public.plans
set ai_quota_tokens = 0, ai_unlimited = true
where code = 'enterprise';

-- Selaraskan data bulan berjalan
update public.ai_usage
set tokens = calls
where month = date_trunc('month', now())::date;

update public.copilot_logs
set tokens = 1
where tokens is not null;
