-- Peran Member (L5). Nilai enum ditambahkan di berkas sendiri agar sudah ter-commit sebelum dipakai migrasi berikutnya.
alter type public.app_role add value if not exists 'member';
