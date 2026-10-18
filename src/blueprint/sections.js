// Indeks navigasi & palet ⌘K. `chapter` mengelompokkan sub-bagian ke satu tautan nav.
export const CHAPTERS = [
  { id: "ringkasan", label: "Arsitektur", bab: "I" },
  { id: "modul", label: "12 Modul", bab: "II" },
  { id: "peran", label: "5 Peran", bab: "III" },
  { id: "rbac", label: "RBAC", bab: "IV" },
  { id: "alur", label: "Alur", bab: "V" },
  { id: "kesimpulan", label: "Kesimpulan", bab: "VI" },
];

export const SECTIONS = [
  { id: "ringkasan", label: "Ringkasan", bab: "I", chapter: "ringkasan" },
  { id: "pilar", label: "6 pilar industri", bab: "1.1", chapter: "ringkasan" },
  { id: "topologi", label: "Topologi arsitektur", bab: "1.2", chapter: "ringkasan" },
  { id: "keputusan", label: "Keputusan terbuka", bab: "1.3", chapter: "ringkasan" },
  { id: "modul", label: "Dekomposisi 12 modul", bab: "II", chapter: "modul" },
  { id: "peran", label: "Struktur 5 peran", bab: "III", chapter: "peran" },
  { id: "rbac", label: "Matriks hak akses", bab: "IV", chapter: "rbac" },
  { id: "alur", label: "Alur kerja antar-peran", bab: "V", chapter: "alur" },
  { id: "kesimpulan", label: "Kesimpulan & buku revisi", bab: "VI", chapter: "kesimpulan" },
];
