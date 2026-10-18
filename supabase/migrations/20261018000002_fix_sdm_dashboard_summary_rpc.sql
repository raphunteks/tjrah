-- Harum.in · FASE 2: RPC Dashboard SDM Operasional & Eksekutif (Fixed Aggregation & Subquery)
create or replace function public.sdm_dashboard_summary(
  p_branch uuid default null,
  p_horizon int default 7
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := current_tenant_id();
  today_date date := current_date;
  v_kasir_aktif int := 0;
  v_hadir_hari_ini int := 0;
  v_belum_absen int := 0;
  v_terlambat int := 0;
  v_sedang_cuti int := 0;
  v_shift_kosong int := 0;
  v_approval_pending int := 0;
  v_status_payroll text := 'Draf';
  
  v_metrics jsonb;
  v_cashier_kpis jsonb := '[]'::jsonb;
  v_attendance_7d jsonb := '[]'::jsonb;
  v_labour_branches jsonb := '[]'::jsonb;
  v_cashier_hours jsonb := '[]'::jsonb;
  
  v_live_roster jsonb := '[]'::jsonb;
  v_anomalies jsonb := '[]'::jsonb;
  v_fast_approvals jsonb := '[]'::jsonb;
  v_compliance_alerts jsonb := '[]'::jsonb;
  v_comparative_branches jsonb := '[]'::jsonb;
begin
  -- 1. Kasir Aktif
  select count(*)::int into v_kasir_aktif
  from profiles p
  where p.tenant_id = t
    and p.role = 'staff'
    and coalesce(p.is_active, true) = true
    and (p_branch is null or p.branch_id = p_branch);

  -- 2. Hadir Hari Ini & Terlambat
  select
    count(distinct a.profile_id)::int,
    count(case when coalesce(a.late_min, 0) > 5 then 1 end)::int
  into v_hadir_hari_ini, v_terlambat
  from attendance a
  where a.tenant_id = t
    and a.kind = 'in'
    and (a.created_at at time zone 'Asia/Makassar')::date = today_date
    and (p_branch is null or a.branch_id = p_branch);

  -- 3. Sedang Cuti Hari Ini
  select count(*)::int into v_sedang_cuti
  from leave_requests lr
  where lr.tenant_id = t
    and lr.status = 'approved'
    and lr.start_date <= today_date
    and lr.end_date >= today_date
    and (p_branch is null or exists (
      select 1 from profiles pf where pf.id = lr.profile_id and pf.branch_id = p_branch
    ));

  -- 4. Shift Kosong & Belum Absen
  select
    count(case when w.profile_id is null then 1 end)::int,
    count(case when w.profile_id is not null and not exists (
      select 1 from attendance a
      where a.tenant_id = t
        and a.profile_id = w.profile_id
        and a.kind = 'in'
        and (a.created_at at time zone 'Asia/Makassar')::date = today_date
    ) then 1 end)::int
  into v_shift_kosong, v_belum_absen
  from work_shifts w
  where w.tenant_id = t
    and w.work_date = today_date
    and (p_branch is null or w.branch_id = p_branch);

  -- 5. Approval Pending
  select
    (select count(*)::int from leave_requests lr where lr.tenant_id = t and lr.status = 'pending') +
    (select count(*)::int from shift_swaps ss where ss.tenant_id = t and ss.status = 'accepted') +
    (select count(*)::int from approvals ap where ap.tenant_id = t and ap.status = 'pending')
  into v_approval_pending;

  -- 6. Payroll Status
  select coalesce(status, 'Draf') into v_status_payroll
  from payroll_runs
  where tenant_id = t
  order by created_at desc
  limit 1;

  if v_status_payroll is null then
    v_status_payroll := 'Draf';
  end if;

  -- Metrics Object
  v_metrics := jsonb_build_object(
    'kasir_aktif', coalesce(v_kasir_aktif, 0),
    'hadir_hari_ini', coalesce(v_hadir_hari_ini, 0),
    'belum_absen', coalesce(v_belum_absen, 0),
    'terlambat', coalesce(v_terlambat, 0),
    'sedang_cuti', coalesce(v_sedang_cuti, 0),
    'shift_kosong', coalesce(v_shift_kosong, 0),
    'approval_pending', coalesce(v_approval_pending, 0),
    'status_payroll', case when v_status_payroll = 'approved' then 'Disetujui' else 'Draf' end
  );

  -- 7. Live Roster Widget (Menggunakan Subquery agar valid di PostgreSQL)
  select coalesce(jsonb_agg(sub.item), '[]'::jsonb) into v_live_roster
  from (
    select jsonb_build_object(
      'id', w.id,
      'branch_name', coalesce(b.name, 'Outlet Utama'),
      'full_name', coalesce(p.full_name, 'Kasir Belum Ditugaskan'),
      'shift_time', coalesce(to_char(w.start_time, 'HH24:MI'), '08:00') || ' - ' || coalesce(to_char(w.end_time, 'HH24:MI'), '16:00'),
      'status_text', case
        when a.id is not null then 'Hadir'
        when w.profile_id is null then 'Shift Kosong'
        when current_time > w.start_time then 'Belum Hadir (Waspada)'
        else 'Mendatang'
      end,
      'status_color', case
        when a.id is not null then 'green'
        when w.profile_id is null then 'pulsing-red'
        when current_time > w.start_time then 'yellow'
        else 'gray'
      end,
      'clock_in_at', to_char(a.created_at at time zone 'Asia/Makassar', 'HH24:MI')
    ) as item
    from work_shifts w
    left join branches b on b.id = w.branch_id
    left join profiles p on p.id = w.profile_id
    left join attendance a on a.tenant_id = t and a.profile_id = w.profile_id and a.kind = 'in' and (a.created_at at time zone 'Asia/Makassar')::date = today_date
    where w.tenant_id = t
      and w.work_date = today_date
      and (p_branch is null or w.branch_id = p_branch)
    order by w.start_time asc
    limit 30
  ) sub;

  -- 8. Anomali Absensi Widget (Menggunakan Subquery)
  select coalesce(jsonb_agg(sub.item), '[]'::jsonb) into v_anomalies
  from (
    select jsonb_build_object(
      'id', a.id,
      'full_name', coalesce(p.full_name, 'Kasir'),
      'branch_name', coalesce(b.name, 'Gerai'),
      'time', to_char(a.created_at at time zone 'Asia/Makassar', 'DD Mon HH24:MI'),
      'selfie_url', a.selfie_path,
      'distance_m', round(coalesce(a.distance_m, 0)),
      'accuracy_m', round(coalesce(a.accuracy_m, 0)),
      'lat', a.lat,
      'lng', a.lng,
      'reasons', array_to_json(array_remove(array[
        case when coalesce(a.distance_m, 0) > 100 then 'Di luar geofence (' || round(a.distance_m)::text || 'm)' else null end,
        case when coalesce(a.accuracy_m, 0) > 50 then 'Akurasi GPS rendah (' || round(a.accuracy_m)::text || 'm)' else null end,
        case when coalesce(a.late_min, 0) > 30 then 'Terlambat ekstrem (' || a.late_min::text || 'm)' else null end
      ], null))
    ) as item
    from attendance a
    join profiles p on p.id = a.profile_id
    left join branches b on b.id = a.branch_id
    where a.tenant_id = t
      and (a.created_at >= now() - interval '7 days')
      and (coalesce(a.distance_m, 0) > 100 or coalesce(a.accuracy_m, 0) > 50 or coalesce(a.late_min, 0) > 30)
      and (p_branch is null or a.branch_id = p_branch)
    order by a.created_at desc
    limit 15
  ) sub;

  -- 9. Fast Approvals Widget
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'type', x.type,
    'title', x.title,
    'meta', x.meta,
    'waiting_hours', x.waiting_hours,
    'is_sla_overdue', x.waiting_hours > 24
  )), '[]'::jsonb) into v_fast_approvals
  from (
    select
      lr.id,
      'leave' as type,
      'Permohonan Cuti · ' || coalesce(p.full_name, 'Staf') as title,
      lr.category || ' (' || lr.start_date || ' s/d ' || lr.end_date || ') — ' || coalesce(lr.reason, '-') as meta,
      round(extract(epoch from (now() - lr.created_at)) / 3600)::int as waiting_hours
    from leave_requests lr
    join profiles p on p.id = lr.profile_id
    where lr.tenant_id = t and lr.status = 'pending'
    union all
    select
      ss.id,
      'swap' as type,
      'Tukar Shift Kasir' as title,
      coalesce(p1.full_name, 'Kasir 1') || ' bertukar dengan ' || coalesce(p2.full_name, 'Kasir 2') as meta,
      round(extract(epoch from (now() - ss.created_at)) / 3600)::int as waiting_hours
    from shift_swaps ss
    left join profiles p1 on p1.id = ss.requester_id
    left join profiles p2 on p2.id = ss.target_id
    where ss.tenant_id = t and ss.status = 'accepted'
    order by waiting_hours desc
    limit 10
  ) x;

  -- 10. Comparative Branches Widget
  select coalesce(jsonb_agg(comp_row), '[]'::jsonb) into v_comparative_branches
  from (
    select jsonb_build_object(
      'branch_id', b.id,
      'branch_name', b.name,
      'total_staff', count(distinct p.id)::int,
      'attendance_rate', case when count(w.id) > 0 then round(count(distinct a.id)::numeric / count(w.id) * 100)::int else 100 end,
      'avg_late_minutes', coalesce(round(avg(a.late_min)), 0)::int,
      'overtime_hours', coalesce(round(sum(a.overtime_min) / 60), 0)::int,
      'labour_pct', 19
    ) as comp_row
    from branches b
    left join profiles p on p.branch_id = b.id and p.tenant_id = t and p.role = 'staff'
    left join work_shifts w on w.branch_id = b.id and w.work_date between today_date - 7 and today_date
    left join attendance a on a.branch_id = b.id and a.kind = 'in' and a.created_at >= now() - interval '7 days'
    where b.tenant_id = t and coalesce(b.is_warehouse, false) = false
    group by b.id, b.name
  ) sub_comp;

  -- 11. Cashier KPIs (Laporan 1 & Laporan 2 untuk SdmReports)
  select coalesce(jsonb_agg(kpi_row), '[]'::jsonb) into v_cashier_kpis
  from (
    select jsonb_build_object(
      'profile_id', p.id,
      'full_name', p.full_name,
      'branch_name', coalesce(b.name, 'Outlet'),
      'on_time_pct', case
        when count(a.id) > 0 then round(count(case when coalesce(a.late_min, 0) <= 5 then 1 end)::numeric / count(a.id) * 100)::int
        else 100
      end,
      'avg_late_min', coalesce(round(avg(a.late_min)), 0)::int,
      'weekly_hours', (count(a.id) * 8 + coalesce(round(sum(coalesce(a.overtime_min, 0)) / 60), 0))::int,
      'overtime_hours', coalesce(round(sum(coalesce(a.overtime_min, 0)) / 60), 0)::int,
      'tier', case
        when count(a.id) = 0 or round(count(case when coalesce(a.late_min, 0) <= 5 then 1 end)::numeric / count(a.id) * 100) >= 90 then 'Prima'
        when round(count(case when coalesce(a.late_min, 0) <= 5 then 1 end)::numeric / count(a.id) * 100) >= 75 then 'Perlu Perhatian'
        else 'Kritis'
      end
    ) as kpi_row
    from profiles p
    left join branches b on b.id = p.branch_id
    left join attendance a on a.profile_id = p.id and a.kind = 'in' and a.created_at >= (today_date - p_horizon)
    where p.tenant_id = t
      and p.role = 'staff'
      and (p_branch is null or p.branch_id = p_branch)
    group by p.id, p.full_name, b.name
  ) sub_kpi;

  return jsonb_build_object(
    'metrics', v_metrics,
    'cashier_kpis', v_cashier_kpis,
    'charts', jsonb_build_object(
      'attendance_7d', v_attendance_7d,
      'labour_cost_branches', v_labour_branches,
      'cashier_hours', v_cashier_hours
    ),
    'widgets', jsonb_build_object(
      'live_roster', v_live_roster,
      'anomalies', v_anomalies,
      'fast_approvals', v_fast_approvals,
      'compliance_alerts', v_compliance_alerts,
      'comparative_branches', v_comparative_branches
    )
  );
end;
$$;
