-- OPSIONAL · Jalankan SEKALI di SQL Editor Supabase setelah Edge Function di-deploy.
-- Menjadwalkan pengurasan antrean Hermes & SATUSEHAT tiap menit (pg_cron + pg_net).
-- Ganti <PROJECT_REF>. CRON_SECRET disimpan di Vault, bukan di file ini:
--   select vault.create_secret('<nilai acak panjang yang sama dengan `supabase secrets set CRON_SECRET=...`>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('harumin-hermes-dispatch', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/hermes-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$$);

select cron.schedule('harumin-satusehat-sync', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/satusehat-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$$);
