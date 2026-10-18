// Menyusun supabase/bootstrap.sql: SATU berkas SQL untuk ditempel di Supabase → SQL Editor pada proyek BARU.
//   node scripts/gen-bootstrap.mjs       (atau: npm run gen:bootstrap)
// Isi berurutan: penjaga (menolak bila skema public sudah berisi tabel) → kata sandi demo → 11 migrasi → seed → 7 akun demo → verifikasi.
// Seluruh skrip berjalan sebagai satu transaksi: gagal di mana pun = tidak ada yang berubah.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "supabase", "migrations");
const files = readdirSync(MIG).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const seed = readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8");
const bar = (t) => `\n-- ${"═".repeat(70)}\n-- ${t}\n-- ${"═".repeat(70)}\n`;

const head = `-- Harum.in — BOOTSTRAP proyek Supabase BARU (di-generate oleh scripts/gen-bootstrap.mjs; jangan diedit manual).
--
-- CARA PAKAI
--   1. Buat proyek Supabase BARU khusus Harum.in (jangan proyek yang dipakai aplikasi lain).
--   2. Ganti 'GANTI-PASSWORD-DEMO' di bawah ini dengan kata sandi demo Anda (min. 8 karakter). Hanya itu yang perlu diubah.
--   3. Tempel SELURUH berkas di Dashboard → SQL Editor → Run.  (Mac: pbcopy < supabase/bootstrap.sql)
--   4. Samakan DEMO_PASSWORD di .env.local dengan kata sandi tadi, dan isi URL/anon/service_role proyek baru.
--
-- KEAMANAN: berhenti otomatis bila schema public sudah berisi tabel apa pun. Seluruhnya satu transaksi.
begin;

-- ▼▼▼ SATU-SATUNYA YANG PERLU DIUBAH ▼▼▼
create temp table _demo_cfg on commit drop as select 'GANTI-PASSWORD-DEMO'::text as pw;
-- ▲▲▲ ─────────────────────────────── ▲▲▲

do $$
declare n int; names text;
begin
  if (select pw from _demo_cfg) = 'GANTI-PASSWORD-DEMO' or length((select pw from _demo_cfg)) < 8 then
    raise exception 'Ganti ''GANTI-PASSWORD-DEMO'' di bagian atas berkas dengan kata sandi demo Anda (min. 8 karakter), lalu jalankan ulang.';
  end if;
  select count(*), string_agg(table_name, ', ' order by table_name) into n, names
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
  if n > 0 then
    raise exception 'DIBATALKAN: schema public sudah berisi % tabel (%). Ini proyek yang dipakai aplikasi lain. Jalankan berkas ini hanya di proyek Supabase BARU.', n, left(names, 160);
  end if;
end $$;
`;

const mig = files.map((f) => `${bar(`MIGRASI ${f}`)}${readFileSync(path.join(MIG, f), "utf8").trim()}\n`).join("");

const track = `${bar("PENCATATAN MIGRASI (kompatibel dengan Supabase CLI & npm run db:migrate)")}
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name, statements) values
${files.map((f) => `  ('${f.split("_")[0]}', '${f.replace(/^\d+_/, "").replace(/\.sql$/, "")}', '{}')`).join(",\n")}
on conflict do nothing;
`;

const users = `${bar("AKUN DEMO — 7 akun (Auth + identitas + profil), kata sandi = nilai di bagian atas berkas")}
set local search_path = public, extensions, pg_catalog;  -- pgcrypto (crypt, gen_salt) ada di schema extensions pada Supabase

do $$
declare
  pw text := (select pw from _demo_cfg);
  r record;
  now_ timestamptz := now();
begin
  -- Bersihkan akun demo lama dengan email sama tetapi id berbeda (mis. sisa percobaan sebelumnya).
  delete from auth.users where email in ('superadmin@demo.harum.in','owner@demo.harum.in','gm@demo.harum.in','staff@demo.harum.in','dokter@demo.harum.in','kasir.klinik@demo.harum.in','owner.klinik@demo.harum.in')
    and id::text not like '00000000-0000-0000-0000-0000000000e_';

  for r in select * from (values
    ('00000000-0000-0000-0000-0000000000e0'::uuid, 'superadmin@demo.harum.in', 'superadmin'::public.app_role, 'Superadmin Demo', null::uuid, null::uuid, 0::numeric, null::text, null::text),
    ('00000000-0000-0000-0000-0000000000e1', 'owner@demo.harum.in',        'owner',  'Owner Demo',        '00000000-0000-0000-0000-000000000001', null, 0, null, null),
    ('00000000-0000-0000-0000-0000000000e2', 'gm@demo.harum.in',           'gm',     'GM Demo',           '00000000-0000-0000-0000-000000000001', null, 0, null, '246810'),
    ('00000000-0000-0000-0000-0000000000e3', 'staff@demo.harum.in',        'staff',  'Staff Demo',        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 0, null, null),
    ('00000000-0000-0000-0000-0000000000e4', 'dokter@demo.harum.in',       'dokter', 'drg. Demo',         '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 0.3, '7371990101800009', null),
    ('00000000-0000-0000-0000-0000000000e5', 'kasir.klinik@demo.harum.in', 'staff',  'Kasir Klinik Demo', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 0, null, null),
    ('00000000-0000-0000-0000-0000000000e6', 'owner.klinik@demo.harum.in', 'owner',  'Owner Klinik Demo', '00000000-0000-0000-0000-000000000002', null, 0, null, null)
  ) as t(id, email, role, full_name, tenant_id, branch_id, commission_rate, nik, pin)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email, crypt(pw, gen_salt('bf')), now_,
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.full_name), now_, now_, '', '', '', '')
    on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = now_, updated_at = now_;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.id, r.id::text, jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true, 'phone_verified', false), 'email', now_, now_, now_)
    on conflict (provider_id, provider) do nothing;

    insert into public.profiles (id, email, role, full_name, tenant_id, branch_id, commission_rate, nik, pin_hash, is_active)
    values (r.id, r.email, r.role, r.full_name, r.tenant_id, r.branch_id, r.commission_rate, r.nik,
            case when r.pin is null then null else crypt(r.pin, gen_salt('bf')) end, true)
    on conflict (id) do update set email = excluded.email, role = excluded.role, full_name = excluded.full_name, tenant_id = excluded.tenant_id,
      branch_id = excluded.branch_id, is_active = true, deactivated_at = null, deactivation_reason = null;
  end loop;
end $$;
`;

const verify = `${bar("VERIFIKASI — harus 7 baris, semua kolom 'siap' = true")}
commit;

select u.email, p.role, (u.encrypted_password is not null) as sandi, (u.email_confirmed_at is not null) as terkonfirmasi,
       exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as identitas,
       p.is_active as profil_aktif,
       (u.encrypted_password is not null and u.email_confirmed_at is not null and p.is_active
        and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')) as siap
from auth.users u join public.profiles p on p.id = u.id
where u.email like '%@demo.harum.in' order by p.role, u.email;
`;

const out = head + mig + bar("DATA DEMO (supabase/seed.sql)") + seed.trim() + "\n" + track + users + verify;
writeFileSync(path.join(ROOT, "supabase", "bootstrap.sql"), out);
console.log(`supabase/bootstrap.sql ditulis: ${out.split("\n").length} baris, ${(out.length / 1024).toFixed(0)} KB`);
