-- Migrasi 20261017000004: RPC clear_attendance untuk Owner & GM
-- Memungkinkan Owner Merchant, GM, atau Superadmin mengosongkan riwayat absensi (semua cabang atau per cabang)
-- dengan pencatatan audit log resmi.

create or replace function public.clear_attendance(p_branch_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  del_count int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if me.role not in ('owner', 'gm', 'superadmin') then
    raise exception 'Hanya Owner, GM, atau Superadmin yang diizinkan mengosongkan riwayat absensi';
  end if;

  if p_branch_id is not null then
    delete from attendance
     where tenant_id = me.tenant_id
       and branch_id = p_branch_id;
  else
    delete from attendance
     where tenant_id = me.tenant_id;
  end if;
  get diagnostics del_count = row_count;

  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (
    me.tenant_id,
    me.id,
    me.role,
    'attendance_cleared',
    'attendance',
    coalesce(p_branch_id::text, me.tenant_id::text),
    jsonb_build_object(
      'branch_id', p_branch_id,
      'deleted_count', del_count,
      'cleared_at', now()
    )
  );

  return del_count;
end $$;

grant execute on function public.clear_attendance(uuid) to authenticated;
