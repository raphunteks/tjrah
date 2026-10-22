-- Migrasi: Sakelar Master Reservasi Meja pada Tenants
-- Mengontrol ketersediaan subtab Reservasi (/app/antrean) untuk kasir operasional

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS reservation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tenants.reservation_enabled IS 'Sakelar master Reservasi Meja: jika FALSE, subtab Reservasi disembunyikan dari staf/kasir non-klinik';
