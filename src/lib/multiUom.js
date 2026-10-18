// ───────── Multi-UoM Presets & Calculations for F&B and Retail ─────────
// Membantu Owner / GM mengonversi satuan kemasan kulakan (Galon, Botol, Dus, Karung)
// ke satuan dasar terkecil (ml, g, pcs) untuk Resep & BOM serta Kasir POS.

export const MULTI_UOM_CATEGORIES = [
  { id: "liquid", label: "Cairan (Bahan Cair)", baseUnit: "ml", icon: "fa-solid fa-droplet" },
  { id: "solid", label: "Padat & Bubuk", baseUnit: "g", icon: "fa-solid fa-scale-balanced" },
  { id: "count", label: "Kemasan & Hitungan", baseUnit: "pcs", icon: "fa-solid fa-box" },
];

export const MULTI_UOM_TEMPLATES = [
  // ── 1. Bahan Cair (Base: ml) ──
  {
    id: "galon_19l",
    category: "liquid",
    name: "Air Galon Besar (19 Liter)",
    purchaseUnit: "galon",
    baseUnit: "ml",
    ratio: 19000,
    example: "Air mineral galon besar",
    desc: "1 Galon = 19.000 ml",
  },
  {
    id: "galon_15l",
    category: "liquid",
    name: "Air Galon Sedang (15 Liter)",
    purchaseUnit: "galon",
    baseUnit: "ml",
    ratio: 15000,
    example: "Air mineral sedang / sekali pakai",
    desc: "1 Galon = 15.000 ml",
  },
  {
    id: "jerigen_20l",
    category: "liquid",
    name: "Jerigen Curah (20 Liter)",
    purchaseUnit: "jerigen",
    baseUnit: "ml",
    ratio: 20000,
    example: "Minyak goreng curah, kecap grosir",
    desc: "1 Jerigen = 20.000 ml",
  },
  {
    id: "jerigen_5l",
    category: "liquid",
    name: "Jerigen Sedang (5 Liter)",
    purchaseUnit: "jerigen",
    baseUnit: "ml",
    ratio: 5000,
    example: "Minyak / sirup 5L, sabun cair",
    desc: "1 Jerigen = 5.000 ml",
  },
  {
    id: "pouch_2l",
    category: "liquid",
    name: "Pouch Refill Besar (2 Liter)",
    purchaseUnit: "pouch",
    baseUnit: "ml",
    ratio: 2000,
    example: "Minyak goreng kemasan refill 2L",
    desc: "1 Pouch = 2.000 ml",
  },
  {
    id: "kotak_1l",
    category: "liquid",
    name: "Susu UHT / Oat Milk (1 Liter)",
    purchaseUnit: "kotak",
    baseUnit: "ml",
    ratio: 1000,
    example: "Susu Fresh Milk, Full Cream, Oat Milk 1L",
    desc: "1 Kotak = 1.000 ml",
  },
  {
    id: "botol_750ml",
    category: "liquid",
    name: "Botol Sirup Kafe (750 ml)",
    purchaseUnit: "botol",
    baseUnit: "ml",
    ratio: 750,
    example: "Sirup Monin, Denali, Toffin 750ml",
    desc: "1 Botol = 750 ml",
  },
  {
    id: "botol_700ml",
    category: "liquid",
    name: "Botol Sirup Import (700 ml)",
    purchaseUnit: "botol",
    baseUnit: "ml",
    ratio: 700,
    example: "Sirup import 700ml",
    desc: "1 Botol = 700 ml",
  },
  {
    id: "botol_460ml",
    category: "liquid",
    name: "Botol Sirup Kaca Lokal (460 ml)",
    purchaseUnit: "botol",
    baseUnit: "ml",
    ratio: 460,
    example: "Sirup Marjan / ABC botol kaca",
    desc: "1 Botol = 460 ml",
  },
  {
    id: "kotak_200ml",
    category: "liquid",
    name: "Kotak Mini UHT / Santan (200 ml)",
    purchaseUnit: "kotak",
    baseUnit: "ml",
    ratio: 200,
    example: "Susu kotak mini, santan cair 200ml",
    desc: "1 Kotak = 200 ml",
  },

  // ── 2. Bahan Padat & Bubuk (Base: g) ──
  {
    id: "karung_50kg",
    category: "solid",
    name: "Karung / Sak Besar (50 kg)",
    purchaseUnit: "karung",
    baseUnit: "g",
    ratio: 50000,
    example: "Gula pasir karungan, tepung terigu 50kg",
    desc: "1 Karung = 50.000 g",
  },
  {
    id: "karung_25kg",
    category: "solid",
    name: "Karung / Sak Sedang (25 kg)",
    purchaseUnit: "karung",
    baseUnit: "g",
    ratio: 25000,
    example: "Beras karung 25kg, gula pasir",
    desc: "1 Karung = 25.000 g",
  },
  {
    id: "sak_10kg",
    category: "solid",
    name: "Sak Beras / Es Batu (10 kg)",
    purchaseUnit: "sak",
    baseUnit: "g",
    ratio: 10000,
    example: "Es batu kristal 10kg, beras 10kg",
    desc: "1 Sak = 10.000 g",
  },
  {
    id: "sak_5kg",
    category: "solid",
    name: "Kemasan Beras / Tepung (5 kg)",
    purchaseUnit: "sak",
    baseUnit: "g",
    ratio: 5000,
    example: "Beras 5kg kemasan supermarket",
    desc: "1 Sak = 5.000 g",
  },
  {
    id: "pail_5kg",
    category: "solid",
    name: "Ember / Pail Selai / Mayones (5 kg)",
    purchaseUnit: "pail",
    baseUnit: "g",
    ratio: 5000,
    example: "Selai olesan, mayones, margarin bulk",
    desc: "1 Pail = 5.000 g",
  },
  {
    id: "pack_1kg",
    category: "solid",
    name: "Pack Biji Kopi / Powder (1 kg)",
    purchaseUnit: "pack",
    baseUnit: "g",
    ratio: 1000,
    example: "Biji kopi roasted 1kg, bubuk cokelat 1kg",
    desc: "1 Pack = 1.000 g",
  },
  {
    id: "pack_500g",
    category: "solid",
    name: "Pouch Sedang / Keju Blok (500 g)",
    purchaseUnit: "pouch",
    baseUnit: "g",
    ratio: 500,
    example: "Biji kopi 500g, keju blok 500g",
    desc: "1 Pouch = 500 g",
  },
  {
    id: "pack_250g",
    category: "solid",
    name: "Pack Kecil / Margarin (250 g)",
    purchaseUnit: "pack",
    baseUnit: "g",
    ratio: 250,
    example: "Biji kopi 250g, margarin sachet besar",
    desc: "1 Pack = 250 g",
  },
  {
    id: "kaleng_skm",
    category: "solid",
    name: "Kaleng Kental Manis / SKM (370 g)",
    purchaseUnit: "kaleng",
    baseUnit: "g",
    ratio: 370,
    example: "SKM Frisian Flag, Indomilk kaleng",
    desc: "1 Kaleng = 370 g",
  },
  {
    id: "kaleng_skm_490",
    category: "solid",
    name: "Kaleng SKM Besar (490 g)",
    purchaseUnit: "kaleng",
    baseUnit: "g",
    ratio: 490,
    example: "Kental manis kaleng jumbo 490g",
    desc: "1 Kaleng = 490 g",
  },
  {
    id: "kaleng_evaporasi",
    category: "solid",
    name: "Kaleng Susu Evaporasi (380 g)",
    purchaseUnit: "kaleng",
    baseUnit: "g",
    ratio: 380,
    example: "Susu F&N, Carnation, Sunbay 380g",
    desc: "1 Kaleng = 380 g",
  },
  {
    id: "sachet_40g",
    category: "solid",
    name: "Sachet Serbuk / SKM (40 g)",
    purchaseUnit: "sachet",
    baseUnit: "g",
    ratio: 40,
    example: "Kopi instan sachet, SKM sachet",
    desc: "1 Sachet = 40 g",
  },

  // ── 3. Kemasan, Alat Makan & Barang Hitungan (Base: pcs / butir / lembar) ──
  {
    id: "dus_cup_1000",
    category: "count",
    name: "Dus / Karton Cup Minuman (1.000 pcs)",
    purchaseUnit: "dus",
    baseUnit: "pcs",
    ratio: 1000,
    example: "Dus besar cup plastik/kertas (20 slop @ 50 pcs)",
    desc: "1 Dus = 1.000 pcs",
  },
  {
    id: "slop_cup_50",
    category: "count",
    name: "Slop / Sleeve Cup 16oz (50 pcs)",
    purchaseUnit: "slop",
    baseUnit: "pcs",
    ratio: 50,
    example: "1 slop cup 16 oz, paper bowl",
    desc: "1 Slop = 50 pcs",
  },
  {
    id: "slop_cup_25",
    category: "count",
    name: "Slop Cup / Paper Bowl (25 pcs)",
    purchaseUnit: "slop",
    baseUnit: "pcs",
    ratio: 25,
    example: "Slop mangkok kertas mini",
    desc: "1 Slop = 25 pcs",
  },
  {
    id: "dus_air_gelas",
    category: "count",
    name: "Dus Air Mineral Gelas (48 gelas)",
    purchaseUnit: "dus",
    baseUnit: "pcs",
    ratio: 48,
    example: "Air mineral gelas 220ml kartonan",
    desc: "1 Dus = 48 pcs",
  },
  {
    id: "dus_air_botol",
    category: "count",
    name: "Dus Air Mineral Botol (24 botol)",
    purchaseUnit: "dus",
    baseUnit: "pcs",
    ratio: 24,
    example: "Air mineral botol 600ml kartonan",
    desc: "1 Dus = 24 pcs",
  },
  {
    id: "dus_mie",
    category: "count",
    name: "Dus Mie Instan (40 bungkus)",
    purchaseUnit: "dus",
    baseUnit: "pcs",
    ratio: 40,
    example: "Indomie / Mie Sedap kartonan",
    desc: "1 Dus = 40 pcs",
  },
  {
    id: "bal_sedotan",
    category: "count",
    name: "Bal Sedotan Steril Grosir (2.500 pcs)",
    purchaseUnit: "bal",
    baseUnit: "pcs",
    ratio: 2500,
    example: "Sedotan steril bungkusan besar",
    desc: "1 Bal = 2.500 pcs",
  },
  {
    id: "pack_sedotan",
    category: "count",
    name: "Pack Sedotan / Kantong Kresek (250 pcs)",
    purchaseUnit: "pack",
    baseUnit: "pcs",
    ratio: 250,
    example: "Sedotan plastik, kresek takeaway",
    desc: "1 Pack = 250 pcs",
  },
  {
    id: "tray_telur",
    category: "count",
    name: "Ikat / Papan / Tray Telur Ayam (30 butir)",
    purchaseUnit: "tray",
    baseUnit: "butir",
    ratio: 30,
    example: "1 piring / tray telur ayam ras",
    desc: "1 Tray = 30 butir",
  },
  {
    id: "renceng_10",
    category: "count",
    name: "Renceng Minuman Sachet (10 sachet)",
    purchaseUnit: "renceng",
    baseUnit: "pcs",
    ratio: 10,
    example: "Kopi sachet / serbuk rencengan",
    desc: "1 Renceng = 10 pcs",
  },
  {
    id: "lusin_12",
    category: "count",
    name: "Lusin Piring / Gelas / Sendok (12 pcs)",
    purchaseUnit: "lusin",
    baseUnit: "pcs",
    ratio: 12,
    example: "Alat makan, gelas, toples",
    desc: "1 Lusin = 12 pcs",
  },
  {
    id: "rim_500",
    category: "count",
    name: "Rim Kertas Nasi / HVS (500 lembar)",
    purchaseUnit: "rim",
    baseUnit: "lembar",
    ratio: 500,
    example: "Kertas nasi cokelat, kertas HVS",
    desc: "1 Rim = 500 lembar",
  },
  {
    id: "roll_1000",
    category: "count",
    name: "Roll Stiker Label / Kertas Kasir (1.000 pcs)",
    purchaseUnit: "roll",
    baseUnit: "pcs",
    ratio: 1000,
    example: "Stiker logo cup, kertas struk thermal",
    desc: "1 Roll = 1.000 pcs",
  },
];

// Menghitung harga modal per satuan dasar
export function calculateBaseCost(purchasePrice, packRatio) {
  const p = parseFloat(String(purchasePrice ?? "").replace(/[^\d.]/g, "")) || 0;
  const r = parseFloat(String(packRatio ?? "").replace(/[^\d.]/g, "")) || 1;
  if (r <= 0) return 0;
  return Math.round((p / r) * 10000) / 10000;
}

// Deteksi kemasan cerdas berdasarkan atribut item atau nama bahan
export function detectSmartPack(item) {
  if (!item) return null;
  const name = (item.name || "").toLowerCase();
  const unit = (item.unit || "").toLowerCase();

  // Jika item memiliki pack_ratio dan pack_unit secara eksplisit:
  if (item.pack_ratio && Number(item.pack_ratio) > 1 && item.pack_unit) {
    return {
      packUnit: item.pack_unit,
      ratio: Number(item.pack_ratio),
      packPrice: Number(item.pack_price || 0),
      templateId: item.template_id || null,
      desc: `1 ${item.pack_unit} = ${Number(item.pack_ratio).toLocaleString("id-ID")} ${item.unit}`,
    };
  }

  // Heuristik cerdas berdasarkan nama bahan dan unit dasarnya:
  if (unit === "ml" || unit === "liter") {
    if (name.includes("galon")) return { packUnit: "galon", ratio: 19000, desc: "1 Galon = 19.000 ml" };
    if (name.includes("sirup") || name.includes("syrup") || name.includes("monin") || name.includes("denali") || name.includes("toffin")) {
      return { packUnit: "botol", ratio: 750, desc: "1 Botol = 750 ml" };
    }
    if (name.includes("susu") && !name.includes("kental")) {
      return { packUnit: "kotak", ratio: 1000, desc: "1 Kotak = 1.000 ml" };
    }
    if (name.includes("minyak")) {
      return { packUnit: "pouch", ratio: 2000, desc: "1 Pouch = 2.000 ml" };
    }
  }

  if (unit === "g" || unit === "kg") {
    if (name.includes("kopi") || name.includes("arabika") || name.includes("robusta")) {
      return { packUnit: "pack", ratio: 1000, desc: "1 Pack = 1.000 g" };
    }
    if (name.includes("skm") || name.includes("kental manis")) {
      return { packUnit: "kaleng", ratio: 370, desc: "1 Kaleng = 370 g" };
    }
    if (name.includes("evaporasi")) {
      return { packUnit: "kaleng", ratio: 380, desc: "1 Kaleng = 380 g" };
    }
    if (name.includes("beras") || name.includes("gula")) {
      return { packUnit: "karung", ratio: 25000, desc: "1 Karung = 25.000 g" };
    }
    if (name.includes("tepung") || name.includes("terigu")) {
      return { packUnit: "karung", ratio: 25000, desc: "1 Karung = 25.000 g" };
    }
  }

  if (unit === "pcs" || unit === "butir") {
    if (name.includes("cup") && (name.includes("dus") || name.includes("karton"))) {
      return { packUnit: "dus", ratio: 1000, desc: "1 Dus = 1.000 pcs" };
    }
    if (name.includes("cup") || name.includes("lid") || name.includes("bowl")) {
      return { packUnit: "slop", ratio: 50, desc: "1 Slop = 50 pcs" };
    }
    if (name.includes("sedotan")) {
      return { packUnit: "pack", ratio: 250, desc: "1 Pack = 250 pcs" };
    }
    if (name.includes("telur")) {
      return { packUnit: "tray", ratio: 30, desc: "1 Tray = 30 butir" };
    }
  }

  return null;
}

const UOM_STORAGE_KEY = "tijarah_multi_uom_registry";

export function getStoredUomMap() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(UOM_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveItemUom(itemId, packInfo) {
  if (!itemId || typeof localStorage === "undefined") return;
  try {
    const map = getStoredUomMap();
    if (packInfo && packInfo.ratio > 1 && packInfo.packUnit) {
      map[itemId] = {
        pack_unit: packInfo.packUnit,
        pack_ratio: Number(packInfo.ratio),
        pack_price: Number(packInfo.packPrice || 0),
        template_id: packInfo.templateId || null,
      };
    } else {
      delete map[itemId];
    }
    localStorage.setItem(UOM_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("Gagal menyimpan registry Multi-UoM:", e);
  }
}

export function resolveItemPack(item) {
  if (!item) return null;
  // 1. Prioritas Utama: Kolom Database Supabase / PostgreSQL
  if (item.pack_ratio && Number(item.pack_ratio) > 1 && item.pack_unit) {
    return {
      packUnit: item.pack_unit,
      ratio: Number(item.pack_ratio),
      packPrice: Number(item.pack_price || 0),
      templateId: item.template_id || null,
      desc: `1 ${item.pack_unit} = ${Number(item.pack_ratio).toLocaleString("id-ID")} ${item.unit}`,
    };
  }
  // 2. Prioritas Kedua: Local Registry Map
  const map = getStoredUomMap();
  const stored = map[item.id];
  if (stored && stored.pack_ratio > 1 && stored.pack_unit) {
    return {
      packUnit: stored.pack_unit,
      ratio: Number(stored.pack_ratio),
      packPrice: stored.pack_price,
      templateId: stored.template_id,
      desc: `1 ${stored.pack_unit} = ${Number(stored.pack_ratio).toLocaleString("id-ID")} ${item.unit}`,
    };
  }
  // 3. Prioritas Ketiga: Heuristik Cerdas
  return detectSmartPack(item);
}

// Format dual-view untuk tabel stok fisik (Kuantitas Dasar + Kemasan Fisik)
export function formatDualStockDisplay(qty, item) {
  const q = Number(qty) || 0;
  const pack = resolveItemPack(item);
  if (!pack || !pack.ratio || pack.ratio <= 1) return null;

  const count = q / pack.ratio;
  if (count <= 0) return null;
  const rounded = Number(count.toFixed(1)).toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return `≈ ${rounded} ${pack.packUnit} (@${Number(pack.ratio).toLocaleString("id-ID")} ${item.unit})`;
}

