-- Migrasi 34: Toleransi keterlambatan presensi masuk dan fitur auto clock-out sistem pada work_shifts
alter table public.work_shifts
  add column if not exists late_tolerance_min int default 15,
  add column if not exists auto_clockout boolean default false,
  add column if not exists auto_clockout_delay_min int default 30;

alter table public.attendance
  add column if not exists auto_clockout boolean default false;

comment on column public.work_shifts.late_tolerance_min is 'Toleransi keterlambatan presensi masuk dalam satuan menit (default 15 menit)';
comment on column public.work_shifts.auto_clockout is 'Checkbox checklist otomatis absensi/presensi pulang dari sistem (default nonaktif)';
comment on column public.work_shifts.auto_clockout_delay_min is 'Toleransi waktu eksekusi auto clock-out setelah jam selesai shift dalam menit (default 30 menit)';
comment on column public.attendance.auto_clockout is 'Flag penanda apakah presensi pulang dicatat secara otomatis oleh sistem';
