# Harum.in — dashboard per peran (RBAC asli)

POS/ERP multi-tenant untuk F&B dan klinik. Stack: Vite + React 18, GSAP 3.13, Supabase (Postgres + RLS + Edge Functions) dan Upstash Redis.
Matriks RBAC **versi asli** (20 fitur × 5 peran) di `src/lib/rbac-matrix.js` menjadi satu-satunya sumber kebenaran. Matriks yang sama di-generate ke tabel `rbac_matrix`, lalu dibaca oleh RLS dan RPC.

## 1. Jalankan mode demo (tanpa Supabase)

```bash
npm install        # wajib: memasang @supabase/supabase-js, gsap, react
npm run dev        # buka http://localhost:5173 → Masuk → pilih akun demo
```

Selama `.env` belum diisi, data disimpan di browser dan berlabel DEMO. Mode demo **otomatis dibuang** dari `npm run build`, kecuali `VITE_ALLOW_DEMO=1`.

| Akun demo | Peran | Tenant | Yang bisa dicoba |
|---|---|---|---|
| Superadmin | L0 | semua (pilih di bilah atas) | platform, tenant, blueprint privat, audit akses |
| Owner | L1 | Kopi Harum | dashboard laba riil, approval PO/payroll, capital |
| GM (PIN 246810) | L2 | Kopi Harum | void ber-PIN, STO, PO, BOM, jurnal, payroll |
| Staff | L3 | Kopi Harum · Pettarani | kasir, dapur, shift, opname, absen GPS |
| Dokter | L4 | Klinik Gigi Senyum | RME SOAP, odontogram FDI, ICD-10/9-CM, e-resep |
| Kasir klinik | L3 | Klinik Gigi Senyum | antrean NIK, tagihan & e-resep |
| Owner klinik | L1 | Klinik Gigi Senyum | baca rekam medis (R), dashboard |

Panduan langkah demi langkah 4 alur Bab V ada di menu **Alur kerja** setelah masuk.

## 2. Pasang ke Supabase (tanpa psql, tanpa Supabase CLI)

Cukup Node 20.6+. Isi `.env.local` (jangan di-commit):

| Kunci | Sumber di Dashboard Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | API → anon public (**bukan** service_role) |
| `SUPABASE_SERVICE_ROLE_KEY` | API → service_role (rahasia; hanya untuk skrip lokal) |
| `DATABASE_URL_DIRECT` | **Connect → Session pooler** (`…pooler.supabase.com:5432`, user `postgres.<ref>`). Host `db.<ref>.supabase.co` hanya IPv6 dan sering gagal di jaringan rumah |
| `DEMO_PASSWORD` | bebas, ≥ 8 karakter; sama untuk semua akun demo |

```bash
npm install
npm run db:doctor      # diagnosis (hanya membaca): koneksi, skema, seed, akun demo — dan langkah berikutnya
npm run setup:demo     # = db:setup (migrasi + data demo) lalu demo:users (7 akun + verifikasi login)
npm run dev            # http://localhost:5173/masuk
```

| Perintah | Fungsi |
|---|---|
| `db:doctor` | Diagnosis lengkap, aman dijalankan kapan saja |
| `db:migrate` | Pasang migrasi yang belum terpasang (1 berkas = 1 transaksi; gagal = tidak ada yang berubah). Dicatat di `supabase_migrations.schema_migrations`, kompatibel dengan `supabase db push` |
| `db:seed` | Data demo (dilewati bila sudah ada) |
| `db:audit` | Audit RLS akun demo × tabel (pengganti `psql -f rls_audit.sql`; `npm run test:rls` memanggil ini) |
| `db:reload` | Muat ulang schema cache PostgREST (mengatasi `Could not find the … column … in the schema cache`) |
| `db:wipe -- --confirm=<ref>` | Hapus skema `public`. Menolak bila ada tabel berisi data, kecuali `--drop-data` |
| `demo:users` | Buat/samakan 7 akun demo (kata sandi = `DEMO_PASSWORD` saat ini) lalu uji login tiap akun |

### Satu perintah: buat proyek Supabase baru + pasang semuanya

```bash
# 1) Buat Personal Access Token: https://supabase.com/dashboard/account/tokens
# 2) Pastikan DEMO_PASSWORD (≥ 8 karakter) ada di .env.local, lalu:
read -s "?Token (sbp_…): " T; echo; SUPABASE_ACCESS_TOKEN=$T npm run supabase:create
```

Skrip membuat proyek `harum-in` (Singapura, paket gratis) lewat Management API, menunggu aktif, memasang skema + data demo, membuat 7 akun demo dan menguji login tiap akun. Koneksi ditulis ke berkas **baru** `.env.development.local` (izin 600, di-ignore git) yang dimuat Vite di atas `.env.local`; `.env.local` dan `.env.example` tidak disentuh. Hapus berkas itu untuk kembali ke proyek di `.env.local`. Opsi: `--org=<slug>`, `--region=<kode>`, `--name=<nama>`, `--force`. Bila gagal di tengah, lanjutkan dengan `npm run setup:demo` (jangan jalankan `supabase:create` lagi — itu membuat proyek kedua).

### Alternatif tanpa terminal: `supabase/bootstrap.sql`

Satu berkas SQL (migrasi + data demo + 7 akun demo) untuk **proyek Supabase baru**. Ganti `GANTI-PASSWORD-DEMO` di bagian atas, tempel seluruhnya di Dashboard → SQL Editor → Run (Mac: `pbcopy < supabase/bootstrap.sql`). Berhenti otomatis bila `public` sudah berisi tabel apa pun, dan berjalan sebagai satu transaksi. Dibuat ulang dengan `npm run gen:bootstrap`. Akun Auth dibuat langsung lewat SQL (`auth.users` + `auth.identities`); jalur `npm run demo:users` memakai Admin API dan lebih tahan terhadap perubahan versi Supabase.

> **Jangan jalankan di proyek Supabase yang dipakai aplikasi lain.** Bila `public.profiles` sudah ada dengan kolom berbeda (mis. milik HARUMINS), `db:migrate` berhenti tanpa mengubah apa pun dan menyarankan proyek baru. Fungsi Edge dideploy terpisah (lihat bawah) dan tidak dibutuhkan untuk login.

```bash
# Fungsi Edge (opsional untuk login; wajib untuk undangan, kunci meja, AI, Hermes, SATUSEHAT)
npx supabase@latest login
npx supabase@latest link --project-ref <ref>
npx supabase@latest functions deploy table-lock ai-gateway hermes-dispatch satusehat-sync invite-member owner-copilot billing-webhook
npx supabase@latest secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
  CRON_SECRET=... WEBHOOK_SECRET=... ALLOWED_ORIGINS=https://domain-anda APP_URL=https://domain-anda
# opsional: HERMES_WEBHOOK_URL, HERMES_TOKEN, NINEROUTER_API_KEY
```

- **Antrean Hermes & SATUSEHAT:** jalankan `supabase/sql/schedule_dispatch.sql` sekali (pg_cron, per menit). Bisa juga dengan membuat Database Webhook INSERT ke kedua fungsi itu, dengan header `x-webhook-secret`.
- **Pemeriksa rahasia:** `npm run secret:scan` memeriksa semua berkas terlacak; hook `pre-commit` (dipasang otomatis oleh `npm install`) menolak commit yang berisi kunci asli. `.env.example` hanya berisi nilai pengganti; nilai asli hanya di `.env.local`. Bila kunci pernah ter-commit, **rotasi** kuncinya (menghapus berkas tidak menghapus riwayat Git).
- **9router:** `platform_settings.ai_gateway.base_url` wajib HTTPS; jangan `http://` ke alamat IP.
- **Secret:** service role key, token Upstash, kredensial SATUSEHAT, dan token Hermes **tidak pernah** masuk ke frontend atau ke repo.

## 2b. Layanan & Akses (Fase 1)

Migrasi `20261011000011_access.sql` ikut terpasang oleh `db:setup`. Fungsi `invite-member` butuh secret `APP_URL` (tujuan tautan undangan, `/masuk`; tidak diambil dari request).

- Undangan dikirim lewat Supabase Auth (`inviteUserByEmail`). **Masa berlaku tautan mengikuti OTP expiry proyek Supabase** (Auth → Providers → Email; bawaan ±24 jam), bukan 48 jam di kolom `expires_at`. Samakan pengaturannya bila ingin 48 jam.
- Akun nonaktif / tenant ditangguhkan langsung ditolak oleh RLS; sesi di browser keluar otomatis ≤60 detik.
- Bobot skor kesehatan dan ambang anomali ada di `src/lib/watch.js` dan belum dikalibrasi dengan data nyata.

### 2c. Fase 1 → Fase 2: migrasi 12–15 (kebijakan, persetujuan, void, absensi, payroll, CRM, kas kecil, capital)

`npm run db:migrate` memasang migrasi yang belum tercatat. Migrasi **14** memperbaiki migrasi 13 (pembayaran gagal karena kolom
`orders.updated_at` tidak ada; pajak/CRM/resep/struk WhatsApp hilang dari `pay_order`; jam shift memakai zona waktu server) dan
mengerjakan Fitur 6: kasir mengajukan void → PIN GM → eskalasi Owner. Pengaturan per tenant (kolom `tenants`):
`timezone`, `void_owner_threshold` (default Rp500.000), `void_escalate_minutes` (default 30). Ubah lewat SQL Editor, mis.:

```sql
update tenants set void_owner_threshold = 1000000, void_escalate_minutes = 15 where id = '<tenant>';
```

Catatan: `max_void_without_pin` pada Policy Builder belum dipakai oleh alur void (matriks asli mewajibkan PIN GM untuk semua void).

Migrasi **15** menutup celah Fase 2.2–2.6 yang ditemukan saat audit (semua sebelumnya bisa dilewati lewat API langsung):
- **Absensi:** `clock` memeriksa akurasi GPS (≤100 m), radius (kebijakan lapis atau `branches.geofence_m`), urutan masuk→pulang, selfie bila diwajibkan, dan menghitung telat/lembur. Selfie butuh persetujuan karyawan (`give_attendance_consent`). Koreksi oleh GM lewat `correct_attendance` (alasan wajib, masuk audit). Koordinat berasal dari perangkat, sehingga masih bisa dipalsukan dengan mock-GPS; selfie dan koreksi audit adalah penangkalnya, bukan jaminan.
- **Payroll:** komisi dokter, lembur, denda telat, dan cicilan kasbon masuk otomatis; baris payroll terkunci setelah diajukan; pengesahan Owner menjurnal gaji dan piutang karyawan (akun 1104).
- **CRM:** poin hanya berubah lewat transaksi atau `redeem_points`; tidak bisa diedit manual.
- **Kas kecil:** foto nota wajib, batas per pengajuan, GM memvalidasi lewat `validate_petty` (tolak wajib beralasan, tidak boleh memvalidasi pengajuan sendiri).
- **Capital:** hanya Superadmin yang memutuskan (`decide_capital`); nominal beku setelah diajukan.

Pengaturan baru per tenant (kolom `tenants`): `attendance_selfie_required` (false), `attendance_before_shift` (false), `late_grace_min` (10), `late_penalty_per_min` (0), `overtime_rate_per_hour` (0), `petty_limit` (500000), `loan_max_multiple` (1).

```sql
update tenants set attendance_selfie_required = true, late_penalty_per_min = 1000, overtime_rate_per_hour = 15000 where id = '<tenant>';
```

Belum dibangun: tukar shift antar kasir, estimasi labour cost, kalender roster drag-and-drop, slip gaji PDF, pembatasan percobaan PIN diskon.

### 2d. Fase 3: migrasi 16 (logika; halaman UI ada di 2f)

Semua lewat `api.rpc(nama, params)`; hak akses tetap mengikuti matriks asli.

| Fitur | RPC | Siapa |
|---|---|---|
| Menu engineering | `menu_engineering(p_branch, p_days)`, `check_margin_alerts()` | Owner, GM (F2 R) |
| Target & KPI | `set_branch_target(...)`, `branch_kpi(p_month)` | set: Owner; baca: Owner/GM |
| Laporan terjadwal | `save_report_schedule(kind, freq, hour, weekday)`; `run_due_reports()` dipanggil cron | Owner |
| Checklist shift | `save_checklist_template`, `submit_checklist`; `tenants.require_close_checklist` | template: Owner/GM; isi: kasir |
| Promo & voucher | `upsert_promo`, `validate_promo`, `apply_voucher`, `remove_voucher` | buat: Owner/GM; pakai: kasir |
| Proyeksi kas | `cash_projection(p_days, p_ap_days)` | Owner/GM |
| Copilot | `copilot_snapshot()`, `log_copilot()`; Edge Function `owner-copilot` | Owner |

Pasang: `npm run db:migrate`, lalu `npx supabase functions deploy owner-copilot hermes-dispatch`. Laporan terjadwal butuh cron yang sudah
memanggil `hermes-dispatch` dengan `x-cron-secret` (fungsi itu kini memanggil `run_due_reports()` lebih dulu). Pengaturan tenant baru:
`margin_alert_pct` (40), `payroll_day` (25), `require_close_checklist` (false).

Batasan yang perlu diketahui:
- Kelas menu memakai metode Kasavana–Smith: butuh BOM terisi; produk tanpa resep dianggap HPP 0 sehingga tampak bermargin penuh.
- Proyeksi kas adalah ekstrapolasi sederhana (rata-rata 28 hari per hari-dalam-minggu), bukan prediksi; asumsinya dikembalikan di kolom `assumptions`.
- Diskon voucher tidak memicu PIN kebijakan di kasir (sudah diotorisasi saat promo dibuat); diskon manual menghapus voucher. Setelah voucher
  persentase diterapkan lalu item ditambah, diskon tidak dihitung ulang otomatis; terapkan ulang voucher.

### 2e. Fase 4: migrasi 17 (logika; halaman UI ada di 2f)

| Fitur | RPC / objek | Siapa |
|---|---|---|
| Tagihan & dunning | `generate_invoices`, `run_dunning` (cron), `mark_invoice_paid`, `void_invoice`, `billing_status` | Superadmin / sistem; Owner baca status |
| Webhook bayar | Edge Function `billing-webhook` (HMAC `x-signature`, secret `BILLING_WEBHOOK_SECRET`) → `mark_invoice_paid_system` | gateway |
| Feature flags | `has_flag`, `my_flags`, `set_feature_flag`, `set_flag_override` | Superadmin atur; semua baca |
| Metering AI | `ai_quota_check`/`ai_record_usage` (dipakai `ai-gateway` & `owner-copilot`), `ai_usage_summary`, `set_ai_quota` | Owner baca; Superadmin atur |
| Template industri | `apply_industry_template(key, apply_settings)`: `fnb_cafe`, `retail_toko`, `service_salon`, `health_klinik_gigi` | Owner |
| Mode offline | `sync_offline_orders` + `src/lib/offlineQueue.js` (`enqueue`, `flush`, `autoSync`) | Kasir |
| Benchmark anonim | `set_benchmark_opt_in`, `refresh_benchmark` (cron), `my_benchmark` | Owner (opt-in, kohort ≥ 5) |
| Reseller | `create_reseller`, `assign_reseller`, `reseller_statement`, `pay_reseller_commissions` | Superadmin |

**Sebelum mengaktifkan penagihan otomatis:** saklar bawaannya MATI. Rapikan dulu tagihan manual yang ada, lalu:

```sql
insert into platform_settings(key,value) values ('billing','{"enabled":true}')
on conflict (key) do update set value = excluded.value;
```

Jadwal dunning: H+1 pengingat, H+3 status `past_due`, H+7 peringatan akhir, H+14 tenant ditangguhkan; pembayaran mengaktifkan kembali
(hanya bila penangguhan berasal dari tagihan). Tagihan dibuat dengan jatuh tempo minimal 7 hari ke depan. Cron `hermes-dispatch` sudah memanggil
`generate_invoices`, `run_dunning`, dan `refresh_benchmark`.

Paket baru: kuota AI bawaan 0 (AI mati) sampai `plans.ai_quota_tokens` diisi atau `plans.ai_unlimited = true`. Flag per paket ada di `feature_flags.plans`
(`ai_copilot`, `cash_projection`, `benchmark`, `offline_pos` hanya growth/enterprise). **Perubahan:** proyeksi kas dan Copilot dari Fase 3 kini
ikut flag paket.

Batasan: tidak ada peran Reseller untuk login (menambahnya mengubah matriks RBAC asli), jadi komisi dikelola Superadmin; format `billing-webhook`
generik, sesuaikan tanda tangan dengan gateway sungguhan; offline memakai harga server saat sinkron (selisih dilaporkan di `total_diff`); metering AI
adalah batas lunak (satu panggilan terakhir bisa melewati kuota); pembagian bulan benchmark/AI memakai UTC.

### 2f. Fase 5: migrasi 19, halaman UI Fase 3–4, dan verifikasi database asli

**Migrasi 19 (`20261011000019_fase5_hardening.sql`)**
- **PIN otorisasi:** satu penyetor PIN per tenant (advisory lock) dan tebakan salah ditahan ±1,5 detik; 4 tebakan paralel ≈ 6 detik. Ini *bukan*
  penguncian permanen setelah N kali salah: `RAISE` membatalkan transaksi sehingga penghitung tak bisa disimpan tanpa transaksi otonom (dblink/pg_background).
  Untuk lockout sungguhan, tambahkan rate limit di Edge Function.
- **Tukar shift:** `request_swap` → rekan `respond_swap` → GM/Owner `decide_swap`; `cancel_swap`. Menolak bentrok jam, shift lampau, beda cabang/peran.
  `swap_candidates(p_my_shift)` dan `my_swaps()` (SECURITY DEFINER, tanpa gaji/kontak) dibutuhkan karena Staff tak boleh membaca jadwal rekan lewat RLS.
- **Labour cost:** `labour_cost_estimate(from, to, branch)` = gaji pokok ÷ 173 jam × jam terjadwal, dibanding rata-rata penjualan 28 hari per hari-dalam-minggu.
- **Hardening:** `REVOKE EXECUTE` dari `public`/`anon` untuk *semua* fungsi skema `public`. Sebelumnya `generate_invoices()`, `run_dunning()` dan
  `refresh_benchmark()` bisa dipanggil tanpa login (hanya tak berdampak karena saklar billing mati). Pastikan `authenticated` dan `service_role` tetap punya
  EXECUTE (bawaan Supabase memberikannya lewat default privileges).

**Halaman baru** (menu mengikuti matriks RBAC; Edge Function `owner-copilot` perlu di-deploy untuk mode Supabase)

| Halaman | Rute | Peran |
|---|---|---|
| KPI, target & laporan terjadwal | `/app/kpi` | Owner, GM |
| Menu engineering | `/app/menu-engineering` | Owner, GM |
| Proyeksi kas & labour cost | `/app/proyeksi` | Owner, GM |
| Promo & voucher (+ kolom voucher di layar bayar) | `/app/promo` | Owner, GM |
| Checklist shift | `/app/checklist` | Kasir/Staf isi; Owner/GM atur template |
| Tukar shift | `/app/tukar-shift` | Staf/Dokter/GM ajukan; GM/Owner putuskan |
| Owner Copilot | `/app/copilot` | Owner |
| Langganan, kuota AI, benchmark, template industri | `/app/langganan` | Owner |
| Penagihan, feature flag, reseller, kuota AI | `/app/platform-ops` | Superadmin |

Juga: slip gaji cetak/PDF (`src/lib/payslip.js`, tombol di Payroll & Slip saya) dan mode offline kasir (`OfflineBar`, aktif bila flag `offline_pos`).
Mode demo memakai tiruan RPC di `src/api/demoGrowth.js` (Copilot demo = jawaban deterministik dari snapshot, bukan model).

**Verifikasi database asli:** buka SQL Editor Supabase, tempel `supabase/verify-live.sql` (read-only). Semua baris harus `OK`; `INFO` hanya keterangan.
Lalu uji manual singkat: (1) masuk sebagai Staf → buka shift → bayar dengan voucher; (2) Staf ajukan tukar shift → GM setujui; (3) Superadmin
`/app/platform-ops` → Buat tagihan (saklar billing MATI = hasil 0, itu benar); (4) panggil `select generate_invoices()` lewat REST dengan kunci anon → harus 401/403.

## 3. SATUSEHAT

- **Mode simulasi.** Tanpa kredensial, `satusehat-sync` menandai kiriman `simulated` dan tidak ada data yang keluar.
- **Mode nyata.** Butuh empat hal:
  1. `tenant_integrations.satusehat_enabled = true`.
  2. ID Organization di `satusehat_org_id`.
  3. `branches.satusehat_location_id`.
  4. NIK dokter di `profiles.nik` dan kredensial di Vault (`satusehat_client_id:<tenant_id>`, `satusehat_client_secret:<tenant_id>`).
- **Uji di sandbox dulu.** Alur nyata belum pernah dikirim ke sandbox Kemenkes.
- **Celah yang diketahui:**
  - Obat belum dipetakan ke kode KFA.
  - Katalog ICD bawaan hanya subset untuk klinik gigi. Impor tabel resmi ke `public.icd_codes` sebelum produksi.

## 4. Matriks asli vs narasi Bab V

Bila keduanya berbeda, matriks yang berlaku:

| Topik | Narasi Bab V | Yang dijalankan (matriks) |
|---|---|---|
| Penerimaan barang (PO) | Staff | GM, karena Staff tidak punya akses fitur 9 |
| PIN void | Supervisor | GM (Approval PIN); Owner juga boleh Approval |
| Registrasi pasien ke RME | Staff | Staff mendaftar antrean (fitur 18); Dokter membuat kartu RME (fitur 17) |
| Kasir & rekam medis | — | Kasir hanya membaca e-resep (R · Billing Obat), tidak bisa membaca SOAP |

## 5. Struktur

```
src/lib/rbac-matrix.js     matriks asli (sumber kebenaran)
src/app/pages.js           registri menu + guard rute dari matriks
src/app/pages/{superadmin,owner,ops,clinic}/   halaman per peran
src/api/{supabase,demo,demoOps,demoClinic}.js  adapter data (Supabase / demo)
supabase/migrations/       skema, RLS, RPC (0001–0009)
supabase/functions/        table-lock, ai-gateway, hermes-dispatch, satusehat-sync
supabase/blueprint/        isi blueprint privat (hanya Superadmin, via tabel blueprint_docs)
```
