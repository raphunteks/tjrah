-- Migrasi 20261021000001: Penambahan Dukungan transaction_pin di Tabel Profiles
-- Menyimpan PIN Transaksi 6-Digit secara aman di database untuk otorisasi S-Wallet dan POS

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS transaction_pin TEXT DEFAULT NULL;

-- Indeks opsional untuk query performa
CREATE INDEX IF NOT EXISTS idx_profiles_transaction_pin ON public.profiles (id) WHERE transaction_pin IS NOT NULL;

-- Konfigurasi PIN awal untuk akun pengujian ksanihtest@gmail.com
UPDATE public.profiles
SET transaction_pin = '123456'
WHERE email = 'ksanihtest@gmail.com' AND transaction_pin IS NULL;
