// Bab I — Executive Summary & Arsitektur Sistem Global
// Sumber: Harum_in_Ecosystem_Architecture_RBAC_Matrix (BAB I). Catatan bertanda `revisi`
// adalah koreksi atas inkonsistensi dokumen asli, bukan teks asli.

export const MODULES = {
  M1: "Kasir POS",
  M2: "Dapur & KDS",
  M3: "Inventori & BOM",
  M4: "Akuntansi PSAK",
  M5: "SDM & Payroll",
  M6: "CRM & Loyalti",
  M7: "Omnichannel",
  M8: "Reservasi Jasa",
  M9: "RME & SATUSEHAT",
  M10: "Ritel & Grosir",
  M11: "Manufaktur",
  M12: "Capital & Supplies",
};

export const PILLARS = [
  {
    id: "fnb",
    code: "P1",
    name: "Food & Beverages",
    segments: "Restoran kasual, fine dining, kafe, bakery, bar, fast food, food court, cloud kitchen",
    modules: ["M1", "M2", "M3", "M6", "M7"],
    signature: "Denah meja real-time, tiket dapur per stasiun, potong stok berbasis resep",
  },
  {
    id: "retail",
    code: "P2",
    name: "Retail & Distribusi",
    segments: "Kelontong, minimarket, fashion, toko bangunan, pet shop, elektronik, grosir",
    modules: ["M1", "M3", "M10", "M6"],
    signature: "Scan barcode, harga bertingkat kuantitas, barang konsinyasi",
  },
  {
    id: "service",
    code: "P3",
    name: "Hospitality & Personal Care",
    segments: "Salon, barbershop, spa, refleksi, car wash, detailing, bengkel",
    modules: ["M8", "M1", "M5", "M6"],
    signature: "Booking slot, pilih terapis favorit, komisi per layanan",
  },
  {
    id: "health",
    code: "P4",
    name: "Healthcare & Medis Pratama",
    segments: "Praktik dokter gigi/umum, klinik estetika, klinik pratama",
    modules: ["M9", "M8", "M1", "M3"],
    signature: "RME SOAP, odontogram FDI, ICD-10/ICD-9-CM, bridging SATUSEHAT",
  },
  {
    id: "mfg",
    code: "P5",
    name: "Manufaktur & Produksi Ringan",
    segments: "Central kitchen, makanan beku, perakitan, konveksi, katering korporat",
    modules: ["M11", "M3", "M4"],
    signature: "Work order, HPP bahan + upah + overhead",
  },
  {
    id: "omni",
    code: "P6",
    name: "E-Commerce & Omnichannel",
    segments: "Toko online domain kustom, e-menu QR meja, kurir, marketplace & food aggregator",
    modules: ["M7", "M6", "M1"],
    signature: "Satu monitor kasir untuk GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee",
  },
];

// Peta topologi. `area` = nama grid-area pada diagram desktop.
export const NODES = [
  {
    id: "edge",
    area: "edge",
    layer: "Perimeter",
    title: "Cloudflare Edge",
    tag: "WAF · TLS 1.3",
    specs: [
      "Cloudflare Edge WAF dan TLS 1.3 strict",
      "Enkripsi at-rest AES-256 dan in-transit",
      "CSP dengan nonce kriptografis dinamis",
      "Proteksi SQL injection, XSS, CSRF",
      "Rate-limiting API granular",
    ],
  },
  {
    id: "hal",
    area: "hal",
    layer: "Perangkat",
    title: "Hardware Abstraction Layer",
    tag: "ESC/POS · HAL",
    specs: [
      "Printer struk ESC/POS: Bluetooth, USB, LAN, Wi-Fi",
      "Customer Facing Display (monitor ganda)",
      "Laci kasir elektronik, scanner 1D/2D QR",
      "Timbangan digital, soundbox audio QRIS",
      "Kitchen / production display",
    ],
  },
  {
    id: "spa",
    area: "spa",
    layer: "Presentation",
    title: "React SPA · harum-ui",
    tag: "wss:// · code-split",
    specs: [
      "Single Page Application React dengan komponen modular harum-ui",
      "Code-splitting dinamis per bundel fitur",
      "Cache lokal untuk respons tanpa jeda",
      "WebSocket dua arah (wss://) untuk sinkron meja & antrean",
      "Dua domain: harum.in (publik) dan dashboard.harum.in (aplikasi)",
    ],
  },
  {
    id: "ext",
    area: "ext",
    layer: "Integrasi eksternal",
    title: "Gateway & Mitra",
    tag: "QRIS · FHIR · Marketplace",
    specs: [
      "Payment gateway: QRIS dinamis, EDC bank, e-wallet via webhook",
      "SATUSEHAT Kemenkes RI (HL7 FHIR JSON)",
      "GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee",
      "Kurir: GoSend, GrabExpress, JNE, SiCepat",
    ],
  },
  {
    id: "ai",
    area: "ai",
    layer: "AI Gateway",
    title: "9router",
    tag: "/v1 · failover",
    specs: [
      "Base API http://127.0.0.1:20128/v1 atau proxy resmi, autentikasi API key",
      "Load balancer antar-LLM: OpenAI, Claude, Gemini, DeepSeek",
      "Failover otomatis bila satu penyedia gagal",
      "Dipakai untuk NLP, ekstraksi struk/nota, peramalan inventori",
    ],
    revisi:
      "127.0.0.1 hanya valid bila 9router satu host dengan API. Pada kluster multi-node, pakai endpoint jaringan privat + API key; jangan pernah diekspos publik.",
  },
  {
    id: "api",
    area: "api",
    layer: "Services",
    title: "API Cluster",
    tag: "REST · BullMQ",
    specs: [
      "Kluster API RESTful terdistribusi (Node.js & Go)",
      "Antrean asinkron Redis Streams / BullMQ",
      "Latensi rendah dan efisiensi RAM untuk antrean transaksi kasir",
      "Webhook dua arah ke Hermes Agent",
    ],
    revisi:
      "Dua runtime (Node.js + Go) berarti dua toolchain, dua pipeline CI, dua set ORM. Mulai dengan satu runtime; pecah ke Go hanya untuk worker yang terbukti bottleneck.",
  },
  {
    id: "hermes",
    area: "hermes",
    layer: "Agentic Ops",
    title: "Hermes Agent",
    tag: "WhatsApp · Discord",
    specs: [
      "WhatsApp Executive Bot: Z-Report, stok menipis, penurunan marjin",
      "Discord #alert-sistem dan #laporan-harian: void, perubahan BOM, selisih kas",
      "Tanya-jawab: \"Hermes, berapa omset cabang Makassar hari ini?\"",
      "Struk digital ke WhatsApp pelanggan",
    ],
    revisi:
      "Pesan ke Discord membawa nominal & nama staf. Batasi channel privat, masking PII, dan catat setiap pertanyaan Owner di audit log.",
  },
  {
    id: "data",
    area: "data",
    layer: "Data",
    title: "PostgreSQL + Redis",
    tag: "RLS · locks",
    specs: [
      "PostgreSQL relasional, isolasi tenant via Row-Level Security",
      "Redis in-memory: distributed lock transaksi",
      "State denah meja dan keranjang kasir di cache",
    ],
    revisi:
      "Dokumen menyebut RLS dan schema isolation sekaligus — pilih satu. Proyek berjalan memakai Supabase: RLS shared-schema adalah pilihan alaminya.",
  },
];

export const EDGES = [
  { from: "edge", to: "spa", label: "HTTPS" },
  { from: "hal", to: "spa", label: "driver" },
  { from: "spa", to: "api", label: "REST · wss" },
  { from: "api", to: "ai", label: "API key" },
  { from: "api", to: "hermes", label: "webhook" },
  { from: "api", to: "data", label: "SQL · RLS" },
  { from: "api", to: "ext", label: "webhook" },
];

export const DECISIONS = [
  {
    id: "D1",
    title: "Supabase atau PostgreSQL mandiri",
    asli: "Blueprint: PostgreSQL + Redis dikelola sendiri.",
    usul: "Supabase (Postgres + RLS + Auth) sebagai data layer; Redis terpisah hanya untuk lock & antrean.",
    risiko: "Dua sumber kebenaran skema bila keduanya dibangun paralel.",
  },
  {
    id: "D2",
    title: "Satu runtime backend",
    asli: "Blueprint: kluster Node.js & Go.",
    usul: "Node.js/TypeScript dulu. Go hanya untuk worker yang terukur lambat.",
    risiko: "Biaya pemeliharaan ganda sebelum ada beban yang membenarkannya.",
  },
  {
    id: "D3",
    title: "Satu model isolasi tenant",
    asli: "Blueprint: RLS & schema isolation.",
    usul: "RLS dengan tenant_id di setiap tabel + policy per role.",
    risiko: "Migrasi skema per tenant sulit dikelola pada ratusan merchant.",
  },
  {
    id: "D4",
    title: "Data finansial di kanal chat",
    asli: "Blueprint: audit log void & selisih kas dikirim ke Discord.",
    usul: "Kirim ringkasan + tautan ke dashboard; nominal penuh hanya di aplikasi.",
    risiko: "Kebocoran data bila server Discord atau grup WhatsApp disusupi.",
  },
];

// Konten hero blueprint (dipindah dari komponen agar tidak ikut bundle publik).
export const HERO = {
  title: ["Satu", "kasir.", "Satu", "buku", "besar.", "Enam", "industri."],
  ask: "Hermes, berapa omset cabang Makassar hari ini?",
  endpoint: "http://127.0.0.1:20128/v1/chat/completions",
  lede:
    "Harum.in adalah platform POS & ERP multi-tenant untuk UMKM sampai jaringan multi-cabang. Kasir, dapur, gudang, akuntansi, SDM, CRM, sampai rekam medis berjalan di satu basis data, dengan 9router sebagai gerbang AI dan Hermes Agent yang melapor ke WhatsApp dan Discord.",
  facts: [
    { n: "2", l: "domain", d: "harum.in · dashboard.harum.in" },
    { n: "6", l: "pilar industri", d: "FnB sampai omnichannel" },
    { n: "12", l: "modul fungsional", d: "POS sampai Capital" },
    { n: "5", l: "peran pengguna", d: "Superadmin sampai Dokter" },
    { n: "4", l: "alur lintas peran", d: "Dine-in, void, pasok, medis" },
  ],
};
