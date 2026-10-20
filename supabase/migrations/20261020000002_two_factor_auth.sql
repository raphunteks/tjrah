-- Migrasi 20261020000002: Penambahan Dukungan 2FA Permanen di Database
-- Menyimpan status aktivasi dan secret key RFC 6238 TOTP di tabel profiles

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT DEFAULT 'JBSWY3DPEHPK3PXP',
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[] DEFAULT ARRAY[
  '8921-4702', '3154-9812', '7640-1289', '5512-6391',
  '9024-8172', '4419-3208', '6723-5590', '1839-7420'
];

-- Pastikan akun Owner ksanihtest@gmail.com aktif secara permanen
UPDATE public.profiles
SET two_factor_enabled = true,
    two_factor_secret = 'JBSWY3DPEHPK3PXP'
WHERE email = 'ksanihtest@gmail.com';
