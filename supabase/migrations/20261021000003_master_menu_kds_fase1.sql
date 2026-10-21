-- Migrasi Fase 1: Master Menu, Pengaturan Dapur & KDS Multi-Cabang
-- Menambahkan kolom gambar WebP, deskripsi menu, dan preferensi dapur KDS

-- 1. Penambahan kolom gambar WebP dan deskripsi produk pada tabel products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Penambahan konfigurasi operasional dapur & KDS pada tabel tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS kds_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kitchen_stations_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kitchen_stations JSONB NOT NULL DEFAULT '["dapur", "barista", "grill", "pastry"]'::jsonb,
ADD COLUMN IF NOT EXISTS kds_sla_minutes INTEGER NOT NULL DEFAULT 15;

-- 3. Beri komentar pada kolom baru untuk dokumentasi schema
COMMENT ON COLUMN public.products.image_url IS 'URL thumbnail WebP terkompresi (<50KB) untuk kasir POS visual';
COMMENT ON COLUMN public.products.description IS 'Deskripsi menu: komposisi bahan, catatan rasa, dan peringatan alergen';
COMMENT ON COLUMN public.tenants.kds_enabled IS 'Sakelar master KDS (Display Dapur): jika FALSE, subtab KDS disembunyikan dari kasir/staf';
COMMENT ON COLUMN public.tenants.kitchen_stations_enabled IS 'Sakelar multi-stasiun dapur: jika FALSE, dropdown stasiun disembunyikan dan pesanan masuk dapur umum';
COMMENT ON COLUMN public.tenants.kitchen_stations IS 'Daftar nama stasiun kerja dapur aktif dalam format JSONB array';
COMMENT ON COLUMN public.tenants.kds_sla_minutes IS 'Target waktu penyelesaian pesanan dapur dalam menit sebelum status menjadi merah (overdue SLA)';
