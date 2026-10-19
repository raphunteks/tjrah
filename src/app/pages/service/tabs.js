// Sub-tab "Layanan & Akses" per peran. Satu sumber untuk sidebar (pages.js) dan bilah sub-tab.
export const SERVICE_TABS = {
  superadmin: [
    { path: "/app/layanan/owner", label: "Kelola Owner Merchant" },
    { path: "/app/layanan/aktivitas", label: "Monitoring Aktivitas Owner" },
    { path: "/app/layanan/tiket", label: "Tiket Bantuan CS" },
  ],
  owner: [
    { path: "/app/layanan/tim", label: "Kelola GM & Kasir/Staf" },
    { path: "/app/layanan/kebijakan", label: "Kebijakan Berjenjang (3 Lapis)" },
    { path: "/app/layanan/pantau", label: "Monitoring GM & Kasir/Staf" },
    { path: "/app/layanan/bantuan", label: "Tiket ke Dukungan Tijarah" },
  ],
  gm: [
    { path: "/app/layanan/kasir", label: "Kelola Kasir Cabang" },
    { path: "/app/layanan/kebijakan", label: "Kebijakan Cabang" },
    { path: "/app/layanan/bertugas", label: "Monitoring Kasir Bertugas" },
  ],
};
