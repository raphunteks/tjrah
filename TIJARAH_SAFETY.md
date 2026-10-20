# REKOMENDASI KEAMANAN & SAFETY-FIRST (HARUM.IN / TIJARAH)
**Target URL:** `https://www.harumin.my.id`  
**Metode Analisis:** REA (Reverse Engineer Anything) CDP Passive Observation & Header Security Check  
**Tanggal:** 20 Oktober 2026  

---

## 1. Ringkasan Evaluasi Keamanan
Berdasarkan hasil inspeksi CDP pasif via REA pada `https://www.harumin.my.id/masuk`, platform menunjukkan pertahanan transport dasar yang baik (HTTPS, HSTS, X-Frame-Options), namun memerlukan penguatan pada lapisan *Application Security* dan *Edge Policies* untuk memastikan standar enterprise-grade safety.

---

## 2. Poin Kerentanan Potensial & Analisis Risiko

### A. Ketiadaan Header Content-Security-Policy (CSP)
- **Risiko:** Rentan terhadap serangan *Cross-Site Scripting (XSS)* tingkat lanjut dan injeksi skrip berbahaya dari pihak ketiga yang menyusup ke browser pengguna.
- **Rekomendasi / Solusi:** Terapkan header CSP ketat pada konfigurasi Vercel:
  ```http
  Content-Security-Policy: default-src 'self' https://qtokrvloisrwjmxtyvzn.supabase.co https://*.vercel-storage.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://qtokrvloisrwjmxtyvzn.supabase.co;
  ```

### B. Proteksi Form Login & Sesi Autentikasi (`/masuk`)
- **Risiko:** Endpoint `/masuk` berpotensi menjadi sasaran serangan *Brute-Force* atau *Credential Stuffing* terhadap akun uji coba (Superadmin, Owner, GM, Staf).
- **Rekomendasi / Solusi:**
  - Aktifkan *Rate Limiting* berbasis IP atau *reCAPTCHA / Turnstile* pada endpoint autentikasi.
  - Pastikan token JWT yang dikeluarkan Supabase memiliki masa berlaku (TTL) yang wajar dan dienkripsi aman di cookies dengan atribut `HttpOnly`, `Secure`, dan `SameSite=Strict`.

### C. Penegakan Otorisasi Server-Side (Row Level Security / RLS)
- **Risiko:** Pengendalian akses RBAC (L0 s.d L3) yang hanya mengandalkan penyembunyian tombol di sisi frontend (UI) dapat dibypass melalui manipulasi *direct URL routing* atau pemanggilan API langsung.
- **Rekomendasi / Solusi:** 
  - Validasi setiap query Supabase menggunakan *Stored Procedure / RPC* berbasis `SECURITY DEFINER` yang memastikan klausa `tenant_id` dan `branch_id` selalu disaring berdasarkan sesi pengguna di tingkat database.

---

## 3. Checklist Kesiapan Operasional (Safety-First Checklist)
1. **Pasang Header CSP** di level Vercel.
2. **Aktifkan Rate Limiting** untuk mencegah eksploitasi halaman login.
3. **Audit Supabase RLS Policies** untuk semua tabel sensitif (transaksi, gaji, resep/BOM).
4. **Batasi Akses Akun Demo** agar tidak memiliki hak akses destruktif di lingkungan produksi.
