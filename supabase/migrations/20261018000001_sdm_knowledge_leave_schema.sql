-- =========================================================================
-- TIJARAH FASE 2: SKEMA DATABASE KNOWLEDGE FORMS, SOP, DAN CUTI STAF
-- =========================================================================

-- 1. Tabel Leave Requests (Pengajuan Cuti & Izin Kasir/Staf)
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  category text not null default 'CT',
  leave_type text generated always as (category) stored,
  start_date date not null,
  end_date date not null,
  days_count int not null default 1,
  reason text,
  attachment_url text,
  status text not null default 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Tabel Leave Balances (Saldo Kuota Cuti Karyawan)
create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  year int not null default extract(year from current_date),
  balance int not null default 12,
  used int not null default 0,
  updated_at timestamptz not null default now(),
  constraint uq_leave_balances unique(tenant_id, profile_id, year)
);

-- 3. Tabel Knowledge Forms (Instrumen Formulir, Checklist Shift & Kuis)
create table if not exists public.knowledge_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  form_type text not null default 'checklist', -- 'checklist', 'quiz', 'sop', 'survey'
  target_type text not null default 'all', -- 'all', 'branch'
  target_branch_id uuid references public.branches(id) on delete set null,
  passing_grade int default 80,
  frequency text default 'daily', -- 'daily', 'weekly', 'one_off'
  deadline timestamptz,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'active', -- 'active', 'draft', 'archived'
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Tabel Knowledge Responses (Hasil Pengisian Formulir & Kuis Kasir)
create table if not exists public.knowledge_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.knowledge_forms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  score int default 100,
  passed boolean default true,
  submitted_at timestamptz not null default now()
);

-- 5. Tabel Knowledge Reads (Konfirmasi Pemahaman & Baca SOP / Acknowledge Engine)
create table if not exists public.knowledge_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sop_id uuid not null references public.knowledge_forms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint uq_knowledge_reads unique(sop_id, profile_id)
);

-- RLS & Kebijakan Isolasi Multi-Tenant
alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;
alter table public.knowledge_forms enable row level security;
alter table public.knowledge_responses enable row level security;
alter table public.knowledge_reads enable row level security;

drop policy if exists "leave_requests_tenant_isolation" on public.leave_requests;
create policy "leave_requests_tenant_isolation" on public.leave_requests
  for all using (tenant_id = current_tenant_id() or is_superadmin());

drop policy if exists "leave_balances_tenant_isolation" on public.leave_balances;
create policy "leave_balances_tenant_isolation" on public.leave_balances
  for all using (tenant_id = current_tenant_id() or is_superadmin());

drop policy if exists "knowledge_forms_tenant_isolation" on public.knowledge_forms;
create policy "knowledge_forms_tenant_isolation" on public.knowledge_forms
  for all using (tenant_id = current_tenant_id() or is_superadmin());

drop policy if exists "knowledge_responses_tenant_isolation" on public.knowledge_responses;
create policy "knowledge_responses_tenant_isolation" on public.knowledge_responses
  for all using (tenant_id = current_tenant_id() or is_superadmin());

drop policy if exists "knowledge_reads_tenant_isolation" on public.knowledge_reads;
create policy "knowledge_reads_tenant_isolation" on public.knowledge_reads
  for all using (tenant_id = current_tenant_id() or is_superadmin());

-- RPC: save_knowledge_form
create or replace function public.save_knowledge_form(p_form jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := current_tenant_id();
  u uuid := auth.uid();
  v_id uuid;
  v_record jsonb;
begin
  if p_form->>'id' is not null and (p_form->>'id')::text != '' then
    v_id := (p_form->>'id')::uuid;
    update public.knowledge_forms
    set
      title = p_form->>'title',
      description = p_form->>'description',
      form_type = coalesce(p_form->>'form_type', 'checklist'),
      target_type = coalesce(p_form->>'target_type', 'all'),
      target_branch_id = nullif(p_form->>'target_branch_id', '')::uuid,
      passing_grade = coalesce((p_form->>'passing_grade')::int, 80),
      frequency = coalesce(p_form->>'frequency', 'daily'),
      deadline = case when p_form->>'deadline' is not null and p_form->>'deadline' != '' then (p_form->>'deadline')::timestamptz else null end,
      questions = coalesce(p_form->'questions', '[]'::jsonb),
      status = coalesce(p_form->>'status', 'active'),
      updated_at = now()
    where id = v_id and tenant_id = t
    returning to_jsonb(knowledge_forms.*) into v_record;
  else
    insert into public.knowledge_forms (
      tenant_id, title, description, form_type, target_type, target_branch_id,
      passing_grade, frequency, deadline, questions, status, created_by
    ) values (
      t,
      p_form->>'title',
      p_form->>'description',
      coalesce(p_form->>'form_type', 'checklist'),
      coalesce(p_form->>'target_type', 'all'),
      nullif(p_form->>'target_branch_id', '')::uuid,
      coalesce((p_form->>'passing_grade')::int, 80),
      coalesce(p_form->>'frequency', 'daily'),
      case when p_form->>'deadline' is not null and p_form->>'deadline' != '' then (p_form->>'deadline')::timestamptz else null end,
      coalesce(p_form->'questions', '[]'::jsonb),
      coalesce(p_form->>'status', 'active'),
      u
    )
    returning to_jsonb(knowledge_forms.*) into v_record;
  end if;
  return v_record;
end;
$$;

-- RPC: acknowledge_sop
create or replace function public.acknowledge_sop(p_sop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := current_tenant_id();
  u uuid := auth.uid();
  v_res jsonb;
begin
  insert into public.knowledge_reads (tenant_id, sop_id, profile_id, read_at)
  values (t, p_sop_id, u, now())
  on conflict (sop_id, profile_id)
  do update set read_at = now()
  returning to_jsonb(knowledge_reads.*) into v_res;
  return v_res;
end;
$$;

-- RPC: submit_knowledge_response
create or replace function public.submit_knowledge_response(p_form_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := current_tenant_id();
  u uuid := auth.uid();
  v_form record;
  v_branch uuid;
  v_score int := 100;
  v_passed boolean := true;
  v_total_points int := 0;
  v_earned_points int := 0;
  v_q jsonb;
  v_ans text;
  v_res jsonb;
begin
  select * into v_form from public.knowledge_forms where id = p_form_id and tenant_id = t;
  if not found then
    raise exception 'Formulir tidak ditemukan';
  end if;

  select branch_id into v_branch from public.profiles where id = u;

  if v_form.form_type = 'quiz' then
    for v_q in select * from jsonb_array_elements(v_form.questions) loop
      v_total_points := v_total_points + coalesce((v_q->>'points')::int, 25);
      v_ans := p_answers->>(v_q->>'id');
      if v_ans is not null and v_ans = (v_q->>'correct_index') then
        v_earned_points := v_earned_points + coalesce((v_q->>'points')::int, 25);
      end if;
    end loop;
    if v_total_points > 0 then
      v_score := round((v_earned_points::numeric / v_total_points::numeric) * 100);
    else
      v_score := 100;
    end if;
    v_passed := (v_score >= coalesce(v_form.passing_grade, 80));
  else
    v_score := 100;
    v_passed := true;
  end if;

  insert into public.knowledge_responses (tenant_id, form_id, profile_id, branch_id, answers, score, passed, submitted_at)
  values (t, p_form_id, u, v_branch, p_answers, v_score, v_passed, now())
  returning to_jsonb(knowledge_responses.*) into v_res;
  return v_res;
end;
$$;

-- Seed contoh SOP resmi untuk Kopi Harum Makassar & tenant lainnya
insert into public.knowledge_forms (
  id, tenant_id, title, description, form_type, target_type, passing_grade, frequency, questions, status
) values (
  '11111111-1111-1111-1111-111111111101',
  '00000000-0000-0000-0000-000000000001',
  'SOP Prosedur Buka & Tutup Kasir POS',
  'Instruksi standar pengecekan uang kas pembuka (float), thermal printer, dan rekonsiliasi kas closing laci kasir.',
  'sop',
  'all',
  80,
  'daily',
  '[
    {"id": "q1", "text": "Hitung uang modal kasir pembuka (float cash) sebelum melayani pelanggan pertama."},
    {"id": "q2", "text": "Pastikan kertas printer kasir thermal terpasang rapi dan status koneksi bluetooth/LAN aktif."},
    {"id": "q3", "text": "Lakukan presensi shift masuk (clock-in) tepat waktu di dalam radius geofence cabang."},
    {"id": "q4", "text": "Setiap akhir shift, lakukan serah terima kas dan setor uang fisik sesuai laporan Z-Report sistem."}
  ]'::jsonb,
  'active'
) on conflict (id) do nothing;

insert into public.knowledge_forms (
  id, tenant_id, title, description, form_type, target_type, passing_grade, frequency, questions, status
) values (
  '11111111-1111-1111-1111-111111111102',
  '00000000-0000-0000-0000-000000000001',
  'Checklist Kesiapan Pembukaan Gerai (Shift Pagi)',
  'Checklist wajib yang diselesaikan kasir & staf sebelum jam 08:00 WITA.',
  'checklist',
  'all',
  80,
  'daily',
  '[
    {"id": "c1", "text": "Area kasir dan meja etalase bersih dari debu dan noda", "type": "checkbox", "required": true},
    {"id": "c2", "text": "Mesin EDC & QRIS statis terpasang dan siap menerima pembayaran", "type": "checkbox", "required": true},
    {"id": "c3", "text": "Stok bahan cup & sedotan di counter depan terisi penuh", "type": "checkbox", "required": true}
  ]'::jsonb,
  'active'
) on conflict (id) do nothing;
