-- Migrasi 35: Penyesuaian _att_calc agar memakai toleransi keterlambatan spesifik per jadwal shift (ws.late_tolerance_min)
create or replace function public._att_calc(p_tenant uuid, p_profile uuid, p_kind text, p_at timestamptz, out late int, out ot int)
language plpgsql stable security definer set search_path = public as $$
declare tz text; grace int; loc timestamp; ws record;
begin
  late := 0; ot := 0;
  select coalesce(timezone, 'Asia/Jakarta'), coalesce(late_grace_min, 5) into tz, grace from tenants where id = p_tenant;
  loc := p_at at time zone tz;
  select start_time, end_time, late_tolerance_min into ws from work_shifts where profile_id = p_profile and work_date = loc::date order by start_time limit 1;
  if not found then return; end if;
  grace := coalesce(ws.late_tolerance_min, grace, 5);
  if p_kind = 'in' then
    late := greatest(0, floor(extract(epoch from (loc::time - ws.start_time)) / 60)::int - grace);
  elsif ws.end_time > ws.start_time then
    ot := greatest(0, floor(extract(epoch from (loc::time - ws.end_time)) / 60)::int);
  end if;
exception when others then
  late := 0; ot := 0;
end $$;

revoke execute on function public._att_calc(uuid, uuid, text, timestamptz) from public, anon, authenticated;
