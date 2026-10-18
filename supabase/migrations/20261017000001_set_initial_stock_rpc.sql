-- Fitur 4 & 10: RPC penetapan stok awal / penyesuaian fisik bahan baku secara instan
create or replace function public.set_initial_stock(p_branch uuid, p_item uuid, p_qty numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  cur numeric;
  delta numeric;
begin
  if not (has_perm(4, 'c') or has_perm(4, 'u') or has_perm(10, 'u') or has_perm(10, 'c')) then
    raise exception 'Akses ditolak: butuh hak pengelola bahan baku atau stok';
  end if;
  select coalesce(qty, 0) into cur from stock_levels where branch_id = p_branch and item_id = p_item;
  delta := p_qty - coalesce(cur, 0);
  if delta <> 0 then
    perform _move(t, p_branch, p_item, delta, case when cur is null or cur = 0 then 'purchase' else 'opname' end, case when cur is null or cur = 0 then 'Stok Awal' else 'Penyesuaian Fisik' end, 'Penetapan stok bahan baku');
  end if;
  return p_qty;
end $$;

grant execute on function public.set_initial_stock(uuid, uuid, numeric) to authenticated;
