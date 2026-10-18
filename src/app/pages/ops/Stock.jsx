import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge, Empty, Stat, clearAsyncCache } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback, useIndex, qtyFmt, useLive } from "../../ops.jsx";
import {
  MULTI_UOM_TEMPLATES,
  calculateBaseCost,
  resolveItemPack,
  formatDualStockDisplay,
  saveItemUom,
  detectSmartPack,
} from "../../../lib/multiUom.js";

const KIND = { sale: "Penjualan", waste: "Waste", opname: "Opname", transfer_in: "Transfer masuk", transfer_out: "Transfer keluar", purchase: "Pembelian", production: "Produksi", void_restock: "Void (restock)" };
const EMPTY_ITEM = { code: "", name: "", unit: "g", min_qty: "", cost_per_unit: "", is_semi: false, initial_stock: "" };
const COMMON_UNITS = [
  "ampul",
  "bag",
  "batang",
  "blister",
  "botol",
  "box",
  "bungkus",
  "butir",
  "can",
  "cup",
  "dus",
  "flacon",
  "g",
  "galon",
  "ikat",
  "jerigen",
  "kaleng",
  "kapsul",
  "karton",
  "karung",
  "kg",
  "koli",
  "lembar",
  "liter",
  "lusin",
  "meter",
  "ml",
  "pack",
  "pasang",
  "pcs",
  "porsi",
  "rim",
  "roll",
  "sachet",
  "sak",
  "scoop",
  "sdm",
  "sdt",
  "sendok",
  "set",
  "slice",
  "spuit",
  "strip",
  "supp",
  "tablet",
  "tetes",
  "tube",
  "vial",
];

const DEFAULT_GUDANGKU_TEMPLATES = [
  {
    code: "BHN-001",
    name: "Air Galon Besar (19 Liter)",
    pack_unit: "galon",
    pack_ratio: 19000,
    unit: "ml",
    pack_price: 19000,
    cost_per_unit: 1,
    pack_init_stock: 10,
    initial_stock: 190000,
    pack_min_stock: 2,
    min_qty: 38000,
    template_id: "galon_19l",
  },
  {
    code: "BHN-002",
    name: "Sirup Vanilla Botol (750 ml)",
    pack_unit: "botol",
    pack_ratio: 750,
    unit: "ml",
    pack_price: 85000,
    cost_per_unit: 113.33,
    pack_init_stock: 12,
    initial_stock: 9000,
    pack_min_stock: 3,
    min_qty: 2250,
    template_id: "botol_750ml",
  },
  {
    code: "BHN-003",
    name: "Susu UHT Fresh Milk (1 Liter)",
    pack_unit: "karton",
    pack_ratio: 1000,
    unit: "ml",
    pack_price: 22000,
    cost_per_unit: 22,
    pack_init_stock: 24,
    initial_stock: 24000,
    pack_min_stock: 6,
    min_qty: 6000,
    template_id: "kotak_1l",
  },
  {
    code: "BHN-004",
    name: "Biji Kopi Espresso Blend (1 kg)",
    pack_unit: "pack",
    pack_ratio: 1000,
    unit: "g",
    pack_price: 160000,
    cost_per_unit: 160,
    pack_init_stock: 8,
    initial_stock: 8000,
    pack_min_stock: 2,
    min_qty: 2000,
    template_id: "pack_1kg",
  },
  {
    code: "BHN-005",
    name: "Beras Pandan Wangi (25 kg)",
    pack_unit: "karung",
    pack_ratio: 25000,
    unit: "g",
    pack_price: 360000,
    cost_per_unit: 14.4,
    pack_init_stock: 5,
    initial_stock: 125000,
    pack_min_stock: 1,
    min_qty: 25000,
    template_id: "karung_25kg",
  },
];

const DEFAULT_UPLOAD_HISTORY = [
  {
    id: "batch_gudangku_initial",
    fileName: "Templat_Bahan_Baku_Multi_UoM_Gudangku.xlsx",
    uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    uploadedBy: "Owner / GM",
    branchName: "Semua Cabang (Pusat)",
    totalItems: 5,
    items: DEFAULT_GUDANGKU_TEMPLATES.map((t) => ({ ...t })),
  },
];

export default function Stock() {
  const { api, role, tenantId } = useAuth();
  const b = useBranch({ warehouses: true });
  const [tab, setTab] = useState("level");
  const [itemModal, setItemModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkTab, setBulkTab] = useState("upload"); // "upload" | "history"
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkUomCheckbox, setBulkUomCheckbox] = useState(true);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyItemModal, setHistoryItemModal] = useState(null);
  const fileInputRef = useRef(null);
  const [prefUseTemplateGudangku, setPrefUseTemplateGudangku] = useState(() => {
    try {
      const stored = localStorage.getItem(`tijarah_pref_use_template_gudangku_${tenantId}`);
      if (stored !== null) return stored === "true";
    } catch {}
    return true; // Default otomatis terceklis jika sebelumnya aktif atau pertama kali
  });
  const [gudangkuTemplates, setGudangkuTemplates] = useState(() => {
    try {
      const stored = localStorage.getItem(`tijarah_gudangku_templates_${tenantId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Gagal membaca cache template Gudangku:", e);
    }
    return DEFAULT_GUDANGKU_TEMPLATES;
  });
  const [uploadHistory, setUploadHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(`tijarah_bulk_upload_history_${tenantId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Gagal membaca cache riwayat upload:", e);
    }
    return DEFAULT_UPLOAD_HISTORY;
  });
  const a = useAction();
  const r = useAsync(async () => {
    if (!b.branchId) return null;
    const [items, levels, moves, counts, waste] = await Promise.all([
      api.list("inventory_items", { eq: { tenant_id: tenantId }, order: ["name"] }),
      api.list("stock_levels", { eq: { branch_id: b.branchId } }),
      api.list("stock_movements", { eq: { branch_id: b.branchId }, order: ["created_at", "desc"], limit: 60 }),
      api.list("stock_counts", { eq: { branch_id: b.branchId, status: "submitted" }, order: ["created_at", "desc"] }),
      api.list("waste_logs", { eq: { branch_id: b.branchId }, order: ["created_at", "desc"], limit: 40 }),
    ]);
    return { items, levels, moves, counts, waste };
  }, [api, b.branchId, tenantId], { key: `stock@${tenantId}@${b.branchId}` });
  useLive(["stock_levels", "stock_counts", "inventory_items", "stock_movements"], r.reload);
  const items = useIndex(r.data?.items);
  const lvl = (id) => r.data?.levels?.find((l) => l.item_id === id)?.qty ?? 0;
  const low = (r.data?.items ?? []).filter((i) => lvl(i.id) < i.min_qty);
  const value = (r.data?.items ?? []).reduce((s, i) => s + lvl(i.id) * i.cost_per_unit, 0);
  const canApply = can(role, 10, "u") && !permOf(role, 10)?.scope;
  const isOwnerOrGm = role === "owner" || role === "gm" || role === "superadmin" || can(role, 4, "c") || can(role, 4, "u");
  const canManageItem = can(role, 4, "c") || can(role, 4, "u") || isOwnerOrGm;

  const generateSafeCode = (extraExisting = []) => {
    const list = [...(r.data?.items ?? []), ...extraExisting];
    const existing = new Set(list.map((x) => String(x.code || "").trim().toUpperCase()).filter(Boolean));
    let max = 0;
    for (const c of existing) {
      const m = c.match(/BHN-(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    let candidate = max + 1;
    while (existing.has(`BHN-${String(candidate).padStart(3, "0")}`)) {
      candidate++;
    }
    return `BHN-${String(candidate).padStart(3, "0")}`;
  };

  const nextCode = () => generateSafeCode();

  const initQty = (id) => {
    const cur = lvl(id);
    const itemMoves = (r.data?.moves ?? []).filter((m) => m.item_id === id);
    if (!itemMoves.length) return cur;
    const initMove = itemMoves.find((m) => m.ref === "Stok Awal" || m.ref === "Stok awal" || m.note === "Stok awal" || m.ref === "Saldo Awal");
    if (initMove) return Math.abs(Number(initMove.qty_delta || 0));
    const operationalMoves = itemMoves.filter((m) => m.ref !== "Stok Awal" && m.ref !== "Stok awal" && m.ref !== "Saldo Awal");
    const netDeltas = operationalMoves.reduce((s, m) => s + Number(m.qty_delta || 0), 0);
    const initial = cur - netDeltas;
    return initial >= 0 ? initial : cur;
  };

  const deleteItem = () => {
    if (!itemModal?.id) return;
    if (!confirm(`Hapus bahan baku "${itemModal.name}" (${itemModal.code})?\n\nPerhatian: Data level stok dan mutasi bahan ini akan dihapus dari sistem.`)) return;
    a.run(async () => {
      await api.remove("inventory_items", itemModal.id);
      saveItemUom(itemModal.id, null);
      api.invalidateCache("inventory_items");
      api.invalidateCache("stock_levels");
      api.invalidateCache("stock_movements");
      clearAsyncCache();
      setItemModal(null);
      r.reload().catch((e) => console.warn("Background reload warning:", e));
    }, "Bahan baku berhasil dihapus");
  };

  const effectiveGudangkuTemplates = useMemo(() => {
    if (gudangkuTemplates && Array.isArray(gudangkuTemplates) && gudangkuTemplates.length > 0) {
      return gudangkuTemplates;
    }
    const dbPackItems = (r.data?.items ?? []).filter((i) => {
      const p = resolveItemPack(i);
      return p && p.ratio > 1;
    }).map((i) => {
      const p = resolveItemPack(i);
      return {
        code: i.code,
        name: i.name,
        pack_unit: p.packUnit,
        pack_ratio: p.ratio,
        unit: i.unit,
        pack_price: p.packPrice || (i.cost_per_unit * p.ratio),
        cost_per_unit: i.cost_per_unit,
        pack_init_stock: "",
        initial_stock: "",
        pack_min_stock: i.min_qty && p.ratio ? String(Number((i.min_qty / p.ratio).toFixed(2))) : "",
        min_qty: i.min_qty,
        template_id: p.templateId || "",
      };
    });
    if (dbPackItems.length > 0) return dbPackItems;
    return DEFAULT_GUDANGKU_TEMPLATES;
  }, [gudangkuTemplates, r.data?.items]);

  const updateGudangkuTemplatesStorage = (newTemplates) => {
    if (!Array.isArray(newTemplates) || newTemplates.length === 0) return;
    setGudangkuTemplates(newTemplates);
    try {
      localStorage.setItem(`tijarah_gudangku_templates_${tenantId}`, JSON.stringify(newTemplates));
    } catch (e) {
      console.warn("Gagal menyimpan cache template Gudangku:", e);
    }
  };

  const saveUploadHistoryToStorage = (newHistory) => {
    setUploadHistory(newHistory);
    try {
      localStorage.setItem(`tijarah_bulk_upload_history_${tenantId}`, JSON.stringify(newHistory));
    } catch (e) {
      console.warn("Gagal menyimpan cache riwayat upload:", e);
    }
  };

  const syncHistoryToTemplates = (historyList) => {
    const allItems = [];
    const seenCodes = new Set();
    for (const batch of historyList) {
      for (const it of batch.items || []) {
        const c = (it.code || "").toUpperCase();
        if (!c || !seenCodes.has(c)) {
          if (c) seenCodes.add(c);
          allItems.push({ ...it });
        }
      }
    }
    if (allItems.length > 0) {
      updateGudangkuTemplatesStorage(allItems);
    }
  };

  const filteredBatches = useMemo(() => {
    if (!historySearch.trim()) return uploadHistory;
    const q = historySearch.toLowerCase().trim();
    return uploadHistory
      .map((batch) => {
        const matchesBatch =
          (batch.fileName || "").toLowerCase().includes(q) ||
          (batch.branchName || "").toLowerCase().includes(q) ||
          (batch.uploadedBy || "").toLowerCase().includes(q);

        const matchingItems = (batch.items || []).filter(
          (it) =>
            (it.name || "").toLowerCase().includes(q) ||
            (it.code || "").toLowerCase().includes(q) ||
            (it.pack_unit || "").toLowerCase().includes(q) ||
            (it.unit || "").toLowerCase().includes(q)
        );

        if (matchesBatch) return batch;
        if (matchingItems.length > 0) return { ...batch, items: matchingItems };
        return null;
      })
      .filter(Boolean);
  }, [uploadHistory, historySearch]);

  const loadBatchToImportTable = (batch) => {
    if (!batch?.items?.length) {
      alert("Batch riwayat ini tidak memiliki data bahan baku.");
      return;
    }
    const loadedRows = batch.items.map((it) => ({
      _selected: true,
      code: it.code || generateSafeCode(),
      name: it.name,
      template_id: it.template_id || "",
      pack_unit: it.pack_unit || "pack",
      pack_ratio: it.pack_ratio || 1,
      unit: it.unit || "g",
      pack_price: it.pack_price || 0,
      cost_per_unit: it.cost_per_unit || calculateBaseCost(it.pack_price, it.pack_ratio),
      pack_init_stock: it.pack_init_stock || 0,
      initial_stock: it.initial_stock || Math.round(Number(it.pack_init_stock || 0) * Number(it.pack_ratio || 1) * 1000) / 1000,
      pack_min_stock: it.pack_min_stock || 0,
      min_qty: it.min_qty || Math.round(Number(it.pack_min_stock || 0) * Number(it.pack_ratio || 1) * 1000) / 1000,
      is_semi: Boolean(it.is_semi),
    }));
    setBulkRows(loadedRows);
    setBulkFileName(batch.fileName || "Riwayat_Impor.xlsx");
    setBulkTab("upload");
    alert(`Berhasil memuat ${loadedRows.length} bahan baku dari berkas "${batch.fileName}" ke tabel impor.`);
  };

  const deleteHistoryBatch = (batchId) => {
    if (!isOwnerOrGm) {
      alert("Akses Terbatas: Hanya Owner dan GM yang berhak menghapus riwayat impor.");
      return;
    }
    const targetBatch = uploadHistory.find((b) => b.id === batchId);
    if (!targetBatch) return;
    if (!confirm(`Hapus seluruh riwayat berkas "${targetBatch.fileName}" (${targetBatch.items?.length || 0} bahan)?\n\nTindakan ini tidak dapat dibatalkan.`)) return;

    const nextHistory = uploadHistory.filter((b) => b.id !== batchId);
    saveUploadHistoryToStorage(nextHistory);
    syncHistoryToTemplates(nextHistory);
    alert("Riwayat berkas berhasil dihapus.");
  };

  const deleteHistoryItem = (batchId, itemIdx) => {
    if (!isOwnerOrGm) {
      alert("Akses Terbatas: Hanya Owner dan GM yang berhak menghapus data riwayat.");
      return;
    }
    const targetBatch = uploadHistory.find((b) => b.id === batchId);
    const targetItem = targetBatch?.items?.[itemIdx];
    if (!targetBatch || !targetItem) return;
    if (!confirm(`Hapus bahan "${targetItem.name}" (${targetItem.code || "Tanpa Kode"}) dari riwayat ini?`)) return;

    const nextHistory = uploadHistory.map((b) => {
      if (b.id !== batchId) return b;
      const nextItems = b.items.filter((_, idx) => idx !== itemIdx);
      return { ...b, items: nextItems, totalItems: nextItems.length };
    }).filter((b) => b.items.length > 0);

    saveUploadHistoryToStorage(nextHistory);
    syncHistoryToTemplates(nextHistory);
    alert("Bahan baku berhasil dihapus dari riwayat.");
  };

  const openCreateHistoryItem = (batchId = null) => {
    if (!isOwnerOrGm) {
      alert("Akses Terbatas: Hanya Owner dan GM yang berhak menambah template ke riwayat.");
      return;
    }
    const targetBatchId = batchId || uploadHistory[0]?.id || `batch_${Date.now()}`;
    setHistoryItemModal({
      batchId: targetBatchId,
      isNew: true,
      item: {
        code: generateSafeCode(),
        name: "",
        pack_unit: "pack",
        pack_ratio: "1000",
        unit: "g",
        pack_price: "",
        pack_init_stock: "",
        pack_min_stock: "",
        is_semi: false,
        template_id: "",
      },
    });
  };

  const openEditHistoryItem = (batchId, itemIdx, item) => {
    if (!isOwnerOrGm) {
      alert("Akses Terbatas: Hanya Owner dan GM yang berhak mengedit data riwayat.");
      return;
    }
    setHistoryItemModal({
      batchId,
      itemIdx,
      isNew: false,
      item: {
        code: item.code || "",
        name: item.name || "",
        pack_unit: item.pack_unit || "pack",
        pack_ratio: String(item.pack_ratio || 1),
        unit: item.unit || "g",
        pack_price: item.pack_price !== undefined && item.pack_price !== "" ? String(item.pack_price) : "",
        pack_init_stock: item.pack_init_stock !== undefined && item.pack_init_stock !== "" ? String(item.pack_init_stock) : "",
        pack_min_stock: item.pack_min_stock !== undefined && item.pack_min_stock !== "" ? String(item.pack_min_stock) : "",
        is_semi: Boolean(item.is_semi),
        template_id: item.template_id || "",
      },
    });
  };

  const saveHistoryItem = () => {
    if (!historyItemModal || !historyItemModal.item) return;
    const item = historyItemModal.item;
    if (!item.name || !item.name.trim()) {
      alert("Nama bahan baku wajib diisi.");
      return;
    }
    const ratio = parseFloat(item.pack_ratio) || 1;
    const price = parseFloat(item.pack_price) || 0;
    const costPerUnit = calculateBaseCost(price, ratio);
    const packInitStock = parseFloat(item.pack_init_stock) || 0;
    const initialStock = Math.round(packInitStock * ratio * 1000) / 1000;
    const packMinStock = parseFloat(item.pack_min_stock) || 0;
    const minQty = Math.round(packMinStock * ratio * 1000) / 1000;

    const finalItem = {
      code: (item.code || generateSafeCode()).trim().toUpperCase(),
      name: item.name.trim(),
      pack_unit: (item.pack_unit || "pack").trim().toLowerCase(),
      pack_ratio: ratio,
      unit: (item.unit || "g").trim().toLowerCase(),
      pack_price: price,
      cost_per_unit: costPerUnit,
      pack_init_stock: packInitStock,
      initial_stock: initialStock,
      pack_min_stock: packMinStock,
      min_qty: minQty,
      is_semi: Boolean(item.is_semi),
      template_id: item.template_id || "",
    };

    let nextHistory = [];
    const existingBatch = uploadHistory.find((b) => b.id === historyItemModal.batchId);
    if (existingBatch) {
      nextHistory = uploadHistory.map((b) => {
        if (b.id !== historyItemModal.batchId) return b;
        let nextItems = [...(b.items || [])];
        if (historyItemModal.isNew) {
          nextItems = [finalItem, ...nextItems];
        } else {
          nextItems[historyItemModal.itemIdx] = finalItem;
        }
        return { ...b, items: nextItems, totalItems: nextItems.length };
      });
    } else {
      const newBatch = {
        id: historyItemModal.batchId,
        fileName: `Template_Kustom_${new Date().toLocaleDateString("id-ID").replace(/\//g, "-")}.xlsx`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: role === "owner" ? "Owner" : "General Manager",
        branchName: b.branch?.name || "Semua Cabang",
        totalItems: 1,
        items: [finalItem],
      };
      nextHistory = [newBatch, ...uploadHistory];
    }

    saveUploadHistoryToStorage(nextHistory);
    syncHistoryToTemplates(nextHistory);
    setHistoryItemModal(null);
    alert(`Bahan baku "${finalItem.name}" berhasil disimpan ke riwayat dan template Gudangku.`);
  };

  const applyExcelItemToForm = (item, customTplId = null) => {
    if (!item) return;
    a.setError(null);
    const ratio = Number(item.pack_ratio) || 1;
    const packPrice = item.pack_price !== undefined && item.pack_price !== "" ? Number(item.pack_price) : 0;
    const baseCost = item.cost_per_unit !== undefined && item.cost_per_unit !== "" ? Number(item.cost_per_unit) : calculateBaseCost(packPrice, ratio);
    const packInitStock = item.pack_init_stock !== undefined && item.pack_init_stock !== "" ? String(item.pack_init_stock) : "";
    const baseInitStock = item.initial_stock !== undefined && item.initial_stock !== "" ? String(item.initial_stock) : (packInitStock ? String(Number(packInitStock) * ratio) : "");
    const packMinStock = item.pack_min_stock !== undefined && item.pack_min_stock !== "" ? String(item.pack_min_stock) : "";
    const baseMinStock = item.min_qty !== undefined && item.min_qty !== "" ? String(item.min_qty) : (packMinStock ? String(Number(packMinStock) * ratio) : "");

    setItemModal((prev) => ({
      ...prev,
      code: item.code?.trim() || prev?.code?.trim() || generateSafeCode(),
      name: item.name?.trim() || prev?.name?.trim() || "Bahan Baku Baru",
      uom_mode: true,
      use_template_excel: true,
      template_id: customTplId || item.template_id || "",
      pack_unit: item.pack_unit || "pack",
      pack_ratio: String(ratio),
      pack_price: packPrice > 0 ? String(packPrice) : "",
      unit: item.unit || "g",
      cost_per_unit: baseCost > 0 ? String(baseCost) : "",
      pack_init_stock: packInitStock,
      initial_stock: baseInitStock,
      current_stock: baseInitStock,
      pack_min_stock: packMinStock,
      min_qty: baseMinStock,
      is_semi: Boolean(item.is_semi),
    }));
  };

  const openNewItem = () => {
    a.setError(null);
    a.setOk(null);
    setItemModal({
      ...EMPTY_ITEM,
      code: generateSafeCode(),
      uom_mode: true,
      use_template_excel: prefUseTemplateGudangku,
      template_id: "",
      pack_unit: "botol",
      pack_ratio: "750",
      pack_price: "",
      pack_init_stock: "",
      pack_min_stock: "",
      unit: "ml",
      cost_per_unit: "",
      min_qty: "",
      initial_stock: "",
    });
  };

  const openEditItem = (item) => {
    a.setError(null);
    a.setOk(null);
    const currentQty = lvl(item.id);
    const pack = resolveItemPack(item);
    const hasPack = Boolean(pack && pack.ratio > 1);
    setItemModal({
      ...item,
      current_stock: currentQty,
      uom_mode: hasPack,
      use_template_excel: false,
      template_id: pack?.templateId || "",
      pack_unit: pack?.packUnit || "botol",
      pack_ratio: pack?.ratio ? String(pack.ratio) : "750",
      pack_price: pack?.packPrice ? String(pack.packPrice) : (pack?.ratio ? String(Math.round(item.cost_per_unit * pack.ratio)) : ""),
      pack_init_stock: "",
      pack_min_stock: pack?.ratio && item.min_qty ? String(Number((item.min_qty / pack.ratio).toFixed(2))) : "",
    });
  };

  const applyTemplate = (tplId) => {
    a.setError(null);
    const tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) {
      setItemModal({ ...itemModal, template_id: "" });
      return;
    }
    const newRatio = String(tpl.ratio);
    const newUnit = tpl.baseUnit;
    const newPackUnit = tpl.purchaseUnit;
    const newCost = itemModal.pack_price ? String(calculateBaseCost(itemModal.pack_price, newRatio)) : itemModal.cost_per_unit;
    const newInit = itemModal.pack_init_stock ? String(Number(itemModal.pack_init_stock) * tpl.ratio) : itemModal.initial_stock;
    const newMin = itemModal.pack_min_stock ? String(Number(itemModal.pack_min_stock) * tpl.ratio) : itemModal.min_qty;
    const autoName = tpl.name.split("(")[0].trim();

    setItemModal((prev) => ({
      ...prev,
      template_id: tplId,
      name: prev?.name?.trim() ? prev.name : autoName,
      code: prev?.code?.trim() ? prev.code : generateSafeCode(),
      pack_unit: newPackUnit,
      pack_ratio: newRatio,
      unit: newUnit,
      cost_per_unit: newCost,
      initial_stock: newInit,
      min_qty: newMin,
    }));
  };

  const handlePackPriceChange = (val) => {
    const clean = val.replace(/[^\d.]/g, "");
    const baseCost = itemModal.pack_ratio ? calculateBaseCost(clean, itemModal.pack_ratio) : 0;
    setItemModal({
      ...itemModal,
      pack_price: clean,
      cost_per_unit: clean ? String(baseCost) : "",
    });
  };

  const handlePackInitStockChange = (val) => {
    const clean = val.replace(/[^\d.]/g, "");
    const r = Number(itemModal.pack_ratio) || 1;
    const baseQty = clean ? String(Number(clean) * r) : "";
    setItemModal({
      ...itemModal,
      pack_init_stock: clean,
      initial_stock: baseQty,
      current_stock: baseQty,
    });
  };

  const handlePackMinStockChange = (val) => {
    const clean = val.replace(/[^\d.]/g, "");
    const r = Number(itemModal.pack_ratio) || 1;
    const baseQty = clean ? String(Number(clean) * r) : "";
    setItemModal({
      ...itemModal,
      pack_min_stock: clean,
      min_qty: baseQty,
    });
  };

  const saveItem = () => a.run(async () => {
    const safeName = (itemModal.name || "").trim();
    if (!safeName) {
      throw new Error("Nama bahan baku wajib diisi!");
    }
    const safeCode = (itemModal.code || generateSafeCode()).trim().toUpperCase();
    const row = {
      code: safeCode,
      name: safeName,
      unit: (itemModal.unit || "g").trim().toLowerCase(),
      cost_per_unit: Number(itemModal.cost_per_unit) || 0,
      min_qty: Number(itemModal.min_qty) || 0,
      is_semi: Boolean(itemModal.is_semi),
      pack_unit: itemModal.uom_mode && itemModal.pack_unit ? itemModal.pack_unit.trim().toLowerCase() : null,
      pack_ratio: itemModal.uom_mode && Number(itemModal.pack_ratio) > 0 ? Number(itemModal.pack_ratio) : null,
      pack_price: itemModal.uom_mode && Number(itemModal.pack_price) > 0 ? Number(itemModal.pack_price) : null,
      template_id: itemModal.uom_mode && itemModal.template_id ? itemModal.template_id : null,
    };
    let targetId = itemModal.id;
    if (itemModal.id) {
      const { id, created_at, tenant_id, initial_stock, current_stock, ...patch } = itemModal;
      try {
        await api.update("inventory_items", itemModal.id, row);
      } catch (err) {
        if (err?.code === "PGRST204" || String(err?.message || "").includes("column")) {
          const { pack_unit, pack_ratio, pack_price, template_id, ...coreRow } = row;
          await api.update("inventory_items", itemModal.id, coreRow);
        } else {
          throw err;
        }
      }
      if (current_stock !== undefined && current_stock !== "" && b.branchId) {
        const targetQty = Number(current_stock);
        const curLvl = lvl(itemModal.id);
        if (!isNaN(targetQty) && targetQty !== curLvl) {
          try {
            await api.rpc("set_initial_stock", {
              p_branch: b.branchId,
              p_item: itemModal.id,
              p_qty: targetQty,
            });
          } catch (e) {
            console.error("Gagal menyesuaikan stok fisik:", e);
          }
        }
      }
    } else {
      let inserted = null;
      let attemptCode = row.code;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          inserted = await api.insert("inventory_items", { ...row, code: attemptCode, tenant_id: tenantId });
          break;
        } catch (err) {
          const isConflict =
            err?.status === 409 ||
            err?.statusCode === 409 ||
            err?.code === "23505" ||
            String(err?.message || "").toLowerCase().includes("conflict") ||
            String(err?.message || "").toLowerCase().includes("unique") ||
            String(err || "").includes("409");
          if (isConflict && attempt < 4) {
            attemptCode = generateSafeCode([{ code: attemptCode }]);
            continue;
          }
          if (err?.code === "PGRST204" || String(err?.message || "").includes("column")) {
            const { pack_unit, pack_ratio, pack_price, template_id, ...coreRow } = row;
            inserted = await api.insert("inventory_items", { ...coreRow, code: attemptCode, tenant_id: tenantId });
            break;
          }
          throw err;
        }
      }
      targetId = inserted?.id;
      const initStockVal = Number(itemModal.initial_stock);
      if (initStockVal > 0 && b.branchId && inserted?.id) {
        try {
          await api.rpc("set_initial_stock", {
            p_branch: b.branchId,
            p_item: inserted.id,
            p_qty: initStockVal,
          });
        } catch (e) {
          console.error("Gagal menetapkan stok awal:", e);
        }
      }
    }

    // Simpan informasi Multi-UoM kemasan ke dalam registry
    if (targetId) {
      if (itemModal.uom_mode && Number(itemModal.pack_ratio) > 1 && itemModal.pack_unit) {
        saveItemUom(targetId, {
          packUnit: itemModal.pack_unit.trim().toLowerCase(),
          ratio: Number(itemModal.pack_ratio),
          packPrice: Number(itemModal.pack_price) || 0,
          templateId: itemModal.template_id || null,
        });
      } else {
        saveItemUom(targetId, null);
      }
    }

    // Invalidate caches instan (0ms delay antar tab & subtab)
    api.invalidateCache("inventory_items");
    api.invalidateCache("stock_levels");
    api.invalidateCache("stock_movements");
    clearAsyncCache();

    // OPTIMISTIC: Tutup modal seketika agar UX instan & responsif
    setItemModal(null);

    // Refresh background tanpa memblokir modal
    r.reload().catch((e) => console.warn("Background reload warning:", e));
  }, itemModal?.id ? "Bahan baku berhasil diperbarui" : "Bahan baku baru berhasil ditambahkan");

  const downloadExcelTemplate = () => {
    const templateData = [
      {
        "Kode Bahan (Opsional)": "BHN-001",
        "Nama Bahan Baku": "Air Galon Besar (19 Liter)",
        "Satuan Beli / Kemasan Kulakan": "galon",
        "Isi per Kemasan (Rasio)": 19000,
        "Satuan Dasar Pakai / Resep": "ml",
        "Harga Beli Kemasan (Rp)": 19000,
        "Stok Awal Fisik (Kemasan)": 10,
        "Batas Minimum (Kemasan)": 2,
        "Barang Setengah Jadi (YA/TIDAK)": "TIDAK",
        "Preset Template Gudangku": "air_galon",
      },
      {
        "Kode Bahan (Opsional)": "BHN-002",
        "Nama Bahan Baku": "Sirup Vanilla Botol (750 ml)",
        "Satuan Beli / Kemasan Kulakan": "botol",
        "Isi per Kemasan (Rasio)": 750,
        "Satuan Dasar Pakai / Resep": "ml",
        "Harga Beli Kemasan (Rp)": 85000,
        "Stok Awal Fisik (Kemasan)": 12,
        "Batas Minimum (Kemasan)": 3,
        "Barang Setengah Jadi (YA/TIDAK)": "TIDAK",
        "Preset Template Gudangku": "sirup_botol",
      },
      {
        "Kode Bahan (Opsional)": "BHN-003",
        "Nama Bahan Baku": "Susu UHT Fresh Milk (1 Liter)",
        "Satuan Beli / Kemasan Kulakan": "karton",
        "Isi per Kemasan (Rasio)": 1000,
        "Satuan Dasar Pakai / Resep": "ml",
        "Harga Beli Kemasan (Rp)": 22000,
        "Stok Awal Fisik (Kemasan)": 24,
        "Batas Minimum (Kemasan)": 6,
        "Barang Setengah Jadi (YA/TIDAK)": "TIDAK",
        "Preset Template Gudangku": "susu_karton",
      },
      {
        "Kode Bahan (Opsional)": "BHN-004",
        "Nama Bahan Baku": "Biji Kopi Espresso Blend (1 kg)",
        "Satuan Beli / Kemasan Kulakan": "pack",
        "Isi per Kemasan (Rasio)": 1000,
        "Satuan Dasar Pakai / Resep": "g",
        "Harga Beli Kemasan (Rp)": 160000,
        "Stok Awal Fisik (Kemasan)": 8,
        "Batas Minimum (Kemasan)": 2,
        "Barang Setengah Jadi (YA/TIDAK)": "TIDAK",
        "Preset Template Gudangku": "kopi_pack",
      },
      {
        "Kode Bahan (Opsional)": "BHN-005",
        "Nama Bahan Baku": "Beras Pandan Wangi (25 kg)",
        "Satuan Beli / Kemasan Kulakan": "karung",
        "Isi per Kemasan (Rasio)": 25000,
        "Satuan Dasar Pakai / Resep": "g",
        "Harga Beli Kemasan (Rp)": 360000,
        "Stok Awal Fisik (Kemasan)": 5,
        "Batas Minimum (Kemasan)": 1,
        "Barang Setengah Jadi (YA/TIDAK)": "TIDAK",
        "Preset Template Gudangku": "beras_karung",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [
      { wch: 24 },
      { wch: 36 },
      { wch: 28 },
      { wch: 24 },
      { wch: 26 },
      { wch: 26 },
      { wch: 26 },
      { wch: 26 },
      { wch: 30 },
      { wch: 26 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bahan Baku Multi-UoM");
    XLSX.writeFile(wb, "Templat_Bahan_Baku_Multi_UoM_Gudangku.xlsx");
  };

  const handleFileParse = (file) => {
    if (!file) return;
    setBulkFileName(file.name || "Berkas_Bahan_Baku.xlsx");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          alert("Berkas Excel/CSV tidak memiliki lembar kerja (worksheet).");
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        if (!rawJson.length) {
          alert("Berkas kosong atau tidak ada baris data yang terbaca.");
          return;
        }

        const existingCodes = new Set((r.data?.items ?? []).map((x) => String(x.code || "").trim().toUpperCase()));
        let lastNum = 0;
        for (const c of existingCodes) {
          const m = c.match(/BHN-(\d+)/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > lastNum) lastNum = n;
          }
        }

        const parsedRows = rawJson.map((row, idx) => {
          const getVal = (patterns, excludePatterns = []) => {
            // 1. Prioritaskan kecocokan persis (exact match)
            for (const p of patterns) {
              const pLower = p.toLowerCase().trim();
              for (const key of Object.keys(row)) {
                if (key.toLowerCase().trim() === pLower) {
                  const val = row[key];
                  if (val !== undefined && val !== null && String(val).trim() !== "") return val;
                }
              }
            }
            // 2. Pencocokan substring dengan filter eksklusi
            for (const p of patterns) {
              const pLower = p.toLowerCase().trim();
              for (const key of Object.keys(row)) {
                const k = key.toLowerCase().trim();
                if (k.includes(pLower)) {
                  const isExcluded = excludePatterns.some((ex) => k.includes(ex.toLowerCase().trim()));
                  if (!isExcluded) {
                    const val = row[key];
                    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
                  }
                }
              }
            }
            return "";
          };

          const rawCode = String(getVal(
            ["kode bahan (opsional)", "kode bahan", "kode", "code", "sku", "id_bahan", "kode barang", "item_code"],
            ["nama", "name"]
          )).trim();

          const rawName = String(getVal(
            ["nama bahan baku", "nama bahan", "nama", "name", "nama barang", "item name", "nama_bahan", "item", "deskripsi"],
            ["kode", "code", "sku", "id_bahan", "kode bahan"]
          )).trim() || `Bahan Baku ${idx + 1}`;

          let rawPackUnit = String(getVal(
            ["satuan beli / kemasan kulakan", "satuan beli", "kemasan kulakan", "satuan kemasan", "pack_unit", "kemasan"],
            ["dasar", "resep", "pakai", "base"]
          )).trim().toLowerCase();

          let rawRatio = parseFloat(String(getVal(
            ["isi per kemasan (rasio)", "isi per kemasan", "rasio", "ratio", "pack_ratio", "isi", "konversi"],
            []
          )).replace(/[^\d.]/g, "")) || 0;

          let rawUnit = String(getVal(
            ["satuan dasar pakai / resep", "satuan dasar", "satuan resep", "satuan pakai", "base_unit", "unit"],
            ["beli", "kemasan", "kulakan", "pack"]
          )).trim().toLowerCase();

          let rawPrice = parseFloat(String(getVal(
            ["harga beli kemasan (rp)", "harga beli kemasan", "harga beli", "harga kemasan", "pack_price", "harga", "price", "biaya"],
            ["dasar", "resep", "pokok"]
          )).replace(/[^\d.]/g, "")) || 0;

          let rawStock = parseFloat(String(getVal(
            ["stok awal fisik (kemasan)", "stok awal fisik", "stok awal", "stok fisik", "initial_stock", "stok kemasan", "stok"],
            ["minimum", "min", "dasar"]
          )).replace(/[^\d.]/g, "")) || 0;

          let rawMin = parseFloat(String(getVal(
            ["batas minimum (kemasan)", "batas minimum", "batas min", "min_qty", "stok minimum", "minimum", "min"],
            ["awal", "fisik"]
          )).replace(/[^\d.]/g, "")) || 0;

          const rawSemi = String(getVal(
            ["barang setengah jadi (ya/tidak)", "barang setengah jadi", "setengah jadi", "semi", "sub-resep"],
            []
          )).toLowerCase();

          let rawPreset = String(getVal(
            ["preset template gudangku", "preset", "template"],
            []
          )).trim();

          let detectedTpl = null;
          if (rawPreset) {
            detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === rawPreset || t.name.toLowerCase().includes(rawPreset.toLowerCase()));
          }
          if (!detectedTpl && bulkUomCheckbox) {
            const nLower = rawName.toLowerCase();
            if (nLower.includes("galon") || (nLower.includes("air") && (nLower.includes("19") || nLower.includes("mineral")))) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "air_galon");
            } else if (nLower.includes("sirup") || nLower.includes("syrup") || nLower.includes("monin") || nLower.includes("denali") || nLower.includes("toffin")) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "sirup_botol");
            } else if (nLower.includes("susu") && (nLower.includes("1000") || nLower.includes("1l") || nLower.includes("1 liter") || nLower.includes("uht") || nLower.includes("fresh"))) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "susu_karton");
            } else if (nLower.includes("kopi") || nLower.includes("espresso") || nLower.includes("beans") || nLower.includes("arabika") || nLower.includes("robusta")) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "kopi_pack");
            } else if (nLower.includes("beras") && (nLower.includes("25") || nLower.includes("karung"))) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "beras_karung");
            } else if (nLower.includes("cup") && (nLower.includes("16") || nLower.includes("slop"))) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "cup_16oz");
            } else if (nLower.includes("sedotan")) {
              detectedTpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "pack_sedotan");
            }
          }

          if (detectedTpl && (!rawPackUnit || !rawRatio || !rawUnit)) {
            if (!rawPackUnit) rawPackUnit = detectedTpl.purchaseUnit;
            if (!rawRatio) rawRatio = detectedTpl.ratio;
            if (!rawUnit) rawUnit = detectedTpl.baseUnit;
          }

          if (!rawUnit) rawUnit = "g";
          if (!rawPackUnit) rawPackUnit = "pack";
          if (!rawRatio || rawRatio <= 0) rawRatio = 1;

          const baseCost = calculateBaseCost(rawPrice, rawRatio);
          const initialBaseStock = Math.round(rawStock * rawRatio * 1000) / 1000;
          const minBaseQty = Math.round(rawMin * rawRatio * 1000) / 1000;

          let code = rawCode;
          if (!code || existingCodes.has(code.toUpperCase())) {
            lastNum++;
            while (existingCodes.has(`BHN-${String(lastNum).padStart(3, "0")}`)) {
              lastNum++;
            }
            code = `BHN-${String(lastNum).padStart(3, "0")}`;
          }
          existingCodes.add(code.toUpperCase());

          return {
            _selected: true,
            code,
            name: rawName,
            template_id: detectedTpl ? detectedTpl.id : "",
            pack_unit: rawPackUnit,
            pack_ratio: rawRatio,
            unit: rawUnit,
            pack_price: rawPrice,
            cost_per_unit: baseCost,
            pack_init_stock: rawStock,
            initial_stock: initialBaseStock,
            pack_min_stock: rawMin,
            min_qty: minBaseQty,
            is_semi: rawSemi === "ya" || rawSemi === "true" || rawSemi === "1" || rawSemi === "yes",
          };
        });

        setBulkRows(parsedRows);
        updateGudangkuTemplatesStorage(parsedRows);
      } catch (err) {
        console.error("Gagal membaca spreadsheet:", err);
        alert("Gagal membaca berkas spreadsheet. Pastikan format berkas adalah .xlsx atau .csv yang valid.\n\nDetail error: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const updateBulkRow = (idx, patch) => {
    setBulkRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  };

  const applyTemplateToRow = (idx, tplId) => {
    setBulkRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx] };
      const tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === tplId);
      if (tpl) {
        row.template_id = tplId;
        row.pack_unit = tpl.purchaseUnit;
        row.pack_ratio = tpl.ratio;
        row.unit = tpl.baseUnit;
        row.cost_per_unit = calculateBaseCost(row.pack_price, tpl.ratio);
        row.initial_stock = Math.round(Number(row.pack_init_stock || 0) * tpl.ratio * 1000) / 1000;
        row.min_qty = Math.round(Number(row.pack_min_stock || 0) * tpl.ratio * 1000) / 1000;
      } else {
        row.template_id = "";
      }
      updated[idx] = row;
      return updated;
    });
  };

  const handleBulkRatioChange = (idx, val) => {
    const clean = val.replace(/[^\d.]/g, "");
    const r = parseFloat(clean) || 1;
    setBulkRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx] };
      row.pack_ratio = clean;
      row.cost_per_unit = calculateBaseCost(row.pack_price, r);
      row.initial_stock = Math.round(Number(row.pack_init_stock || 0) * r * 1000) / 1000;
      row.min_qty = Math.round(Number(row.pack_min_stock || 0) * r * 1000) / 1000;
      updated[idx] = row;
      return updated;
    });
  };

  const handleBulkPriceChange = (idx, val) => {
    const clean = val.replace(/[^\d.]/g, "");
    const p = parseFloat(clean) || 0;
    setBulkRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx] };
      row.pack_price = clean;
      row.cost_per_unit = calculateBaseCost(p, row.pack_ratio);
      updated[idx] = row;
      return updated;
    });
  };

  const applyMasterTemplateToAll = (tplId) => {
    if (!tplId) return;
    setBulkRows((prev) =>
      prev.map((row) => {
        let tpl = null;
        if (tplId === "auto") {
          const nLower = (row.name || "").toLowerCase();
          if (nLower.includes("galon") || (nLower.includes("air") && (nLower.includes("19") || nLower.includes("mineral")))) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "air_galon");
          else if (nLower.includes("sirup") || nLower.includes("syrup") || nLower.includes("monin") || nLower.includes("denali") || nLower.includes("toffin")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "sirup_botol");
          else if (nLower.includes("susu") && !nLower.includes("kental")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "susu_karton");
          else if (nLower.includes("kopi") || nLower.includes("espresso")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "kopi_pack");
          else if (nLower.includes("beras") || nLower.includes("gula")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "beras_karung");
          else if (nLower.includes("cup")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "cup_16oz");
          else if (nLower.includes("sedotan")) tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === "pack_sedotan");
        } else {
          tpl = MULTI_UOM_TEMPLATES.find((t) => t.id === tplId);
        }

        if (tpl) {
          const newRatio = tpl.ratio;
          return {
            ...row,
            template_id: tpl.id,
            pack_unit: tpl.purchaseUnit,
            pack_ratio: newRatio,
            unit: tpl.baseUnit,
            cost_per_unit: calculateBaseCost(row.pack_price, newRatio),
            initial_stock: Math.round(Number(row.pack_init_stock || 0) * newRatio * 1000) / 1000,
            min_qty: Math.round(Number(row.pack_min_stock || 0) * newRatio * 1000) / 1000,
          };
        }
        return row;
      })
    );
  };

  const saveBulkItems = async (customRows = null) => {
    const selected = customRows && Array.isArray(customRows) ? customRows : bulkRows.filter((r) => r._selected);
    if (!selected.length) {
      alert("Pilih minimal satu bahan untuk diimpor.");
      return;
    }
    setBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      setBulkProgressText(`Menyimpan ${i + 1} dari ${selected.length}: ${item.name}...`);
      try {
        const rowData = {
          name: item.name.trim(),
          unit: item.unit.trim().toLowerCase(),
          cost_per_unit: Number(item.cost_per_unit) || 0,
          min_qty: Number(item.min_qty) || 0,
          is_semi: Boolean(item.is_semi),
          pack_unit: item.pack_unit ? item.pack_unit.trim().toLowerCase() : null,
          pack_ratio: Number(item.pack_ratio) > 0 ? Number(item.pack_ratio) : null,
          pack_price: Number(item.pack_price) > 0 ? Number(item.pack_price) : null,
          template_id: item.template_id || null,
        };

        let inserted = null;
        let attemptCode = item.code || generateSafeCode();
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            inserted = await api.insert("inventory_items", {
              ...rowData,
              code: attemptCode,
              tenant_id: tenantId,
            });
            break;
          } catch (err) {
            const isConflict =
              err?.status === 409 ||
              err?.statusCode === 409 ||
              err?.code === "23505" ||
              String(err?.message || "").toLowerCase().includes("conflict") ||
              String(err?.message || "").toLowerCase().includes("unique") ||
              String(err || "").includes("409");
            if (isConflict && attempt < 4) {
              attemptCode = generateSafeCode([{ code: attemptCode }]);
              continue;
            }
            if (err?.code === "PGRST204" || String(err?.message || "").includes("column")) {
              const { pack_unit, pack_ratio, pack_price, template_id, ...coreRow } = rowData;
              inserted = await api.insert("inventory_items", {
                ...coreRow,
                code: attemptCode,
                tenant_id: tenantId,
              });
              break;
            }
            throw err;
          }
        }

        if (inserted?.id) {
          successCount++;
          if (rowData.pack_unit && rowData.pack_ratio > 1) {
            saveItemUom(inserted.id, {
              packUnit: rowData.pack_unit,
              ratio: rowData.pack_ratio,
              packPrice: rowData.pack_price || 0,
              templateId: rowData.template_id,
            });
          }
          const initQty = Number(item.initial_stock);
          if (initQty > 0 && b.branchId) {
            try {
              await api.rpc("set_initial_stock", {
                p_branch: b.branchId,
                p_item: inserted.id,
                p_qty: initQty,
              });
            } catch (errStock) {
              console.warn("Gagal set stok awal bulk:", errStock);
            }
          }
        }
      } catch (err) {
        failCount++;
        errors.push(`${item.name} (${err.message})`);
      }
    }

    if (selected && selected.length > 0) {
      updateGudangkuTemplatesStorage(selected);

      // Otomatis simpan ke riwayat impor berkas
      const newBatch = {
        id: `batch_${Date.now()}`,
        fileName: bulkFileName || `Import_Bahan_${new Date().toISOString().slice(0, 10)}.xlsx`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: role === "owner" ? "Owner" : role === "gm" ? "General Manager" : "Admin Cabang",
        branchName: b.branch?.name || "Semua Cabang",
        totalItems: selected.length,
        items: selected.map((it) => ({
          code: it.code,
          name: it.name,
          pack_unit: it.pack_unit,
          pack_ratio: it.pack_ratio,
          unit: it.unit,
          pack_price: it.pack_price,
          cost_per_unit: it.cost_per_unit,
          pack_init_stock: it.pack_init_stock,
          initial_stock: it.initial_stock,
          pack_min_stock: it.pack_min_stock,
          min_qty: it.min_qty,
          is_semi: it.is_semi,
          template_id: it.template_id,
        })),
      };
      const updatedHist = [newBatch, ...uploadHistory];
      saveUploadHistoryToStorage(updatedHist);
    }

    api.invalidateCache("inventory_items");
    api.invalidateCache("stock_levels");
    api.invalidateCache("stock_movements");
    clearAsyncCache();

    setBulkProcessing(false);
    setBulkProgressText("");
    setBulkModal(false);
    setBulkRows([]);
    r.reload().catch((e) => console.warn("Background reload warning:", e));

    if (failCount === 0) {
      alert(`Berhasil mengimpor ${successCount} bahan baku Multi-UoM ke database Supabase!\nStok awal cabang "${b.branch?.name || "Aktif"}" otomatis tersimpan.\nTemplate Gudangku otomatis diperbarui untuk pilihan 1-Klik.`);
    } else {
      alert(`Impor selesai dengan catatan:\n[BERHASIL]: ${successCount} bahan\n[GAGAL]: ${failCount} bahan\n\nDetail:\n${errors.join("\n")}`);
    }
  };

  return (
    <>
      <PageHead eyebrow={`Fitur 10 · ${permOf(role, 10)?.label}`} title="Stok & gudang"
        desc="Kelola stok bahan baku dengan dukungan Multi-UoM (Konversi Satuan Beli Kemasan ke Satuan Dasar Resep). Terintegrasi otomatis ke HPP Menu, Resep & BOM, dan Pemotongan Kasir POS."
        actions={
          <>
            <div className="d-seg" role="radiogroup" aria-label="Tampilan">
              {[["level", "Level Stok"], ["mutasi", "Riwayat Mutasi"], ["opname", `Stock Opname${r.data?.counts?.length ? ` · ${r.data.counts.length}` : ""}`], ["waste", "Susut & Waste"]].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {canManageItem && (
              <>
                <button
                  type="button"
                  className="d-btn d-btn--secondary"
                  onClick={() => setBulkModal(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <i className="fa-solid fa-file-excel" style={{ color: "#10b981", fontSize: "1rem" }} />
                  <span>Bulk Import (.xlsx)</span>
                </button>
                <button type="button" className="d-btn d-btn--primary" onClick={openNewItem}>
                  + Tambah Bahan
                </button>
              </>
            )}
            <BranchSelect b={b} label="Lokasi" />
          </>
        } />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? null : (
        <>
          <div className="d-stats">
            <Stat label="Nilai persediaan" value={rupiah(value)} sub={b.branch?.name} />
            <Stat label="Di bawah minimum" value={low.length} sub={low.slice(0, 2).map((i) => i.name).join(", ") || "Aman"} />
            <Stat label="Opname menunggu" value={r.data.counts.length} />
            <Stat label="Waste (40 terakhir)" value={rupiah(r.data.waste.reduce((s, w) => s + Number(w.cost), 0))} />
          </div>
          <Panel>
            {tab === "level" && (
              <div className="d-table-wrap"><table className="d-table">
                <thead>
                  <tr>
                    <th scope="col">Bahan & Kemasan</th>
                    <th scope="col" className="d-num">Harga Modal Dasar</th>
                    <th scope="col" className="d-num">Stok Awal</th>
                    <th scope="col" className="d-num">Stok Saat Ini (Fisik)</th>
                    <th scope="col" className="d-num">Batas Minimum</th>
                    <th scope="col" className="d-num">Nilai Total</th>
                    <th scope="col">Status</th>
                    {canManageItem && <th scope="col"><span className="sr-only">Aksi</span></th>}
                  </tr>
                </thead>
                <tbody>{r.data.items.map((i) => {
                  const currentQty = lvl(i.id);
                  const startQty = initQty(i.id);
                  const totalVal = currentQty * i.cost_per_unit;
                  const pack = resolveItemPack(i);
                  const dualCurrent = formatDualStockDisplay(currentQty, i);
                  const dualStart = formatDualStockDisplay(startQty, i);
                  const dualMin = formatDualStockDisplay(i.min_qty, i);

                  return (
                    <tr key={i.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>{i.name}</span>
                          {i.is_semi && <Badge tone="accent">sub-resep</Badge>}
                          {pack && (
                            <span className="d-badge d-badge--muted" style={{ fontSize: "0.72rem", background: "rgba(5, 150, 105, 0.08)", color: "var(--color-brand, #059669)", border: "1px solid rgba(5, 150, 105, 0.2)" }}>
                              1 {pack.packUnit} = {Number(pack.ratio).toLocaleString("id-ID")} {i.unit}
                            </span>
                          )}
                        </div>
                        <div className="d-mono d-muted" style={{ fontSize: "0.78rem", marginTop: "2px" }}>{i.code}</div>
                      </td>
                      <td className="d-num d-mono">
                        <div>
                          <strong>{rupiah(i.cost_per_unit)}</strong>
                          <span className="d-muted" style={{ fontSize: "0.75rem" }}>/{i.unit}</span>
                        </div>
                        {pack && (
                          <div className="d-muted" style={{ fontSize: "0.72rem", marginTop: "1px" }}>
                            ≈ {rupiah(i.cost_per_unit * pack.ratio)}/{pack.packUnit}
                          </div>
                        )}
                      </td>
                      <td className="d-num d-mono" style={{ color: "var(--color-muted)" }}>
                        <div>{qtyFmt(startQty, i.unit)}</div>
                        {dualStart && <div className="d-muted" style={{ fontSize: "0.72rem", opacity: 0.85 }}>{dualStart}</div>}
                      </td>
                      <td className="d-num d-mono" style={{ fontWeight: 600 }}>
                        <div style={{ fontSize: "0.95rem" }}>{qtyFmt(currentQty, i.unit)}</div>
                        {dualCurrent && (
                          <div style={{ fontSize: "0.75rem", marginTop: "2px", color: "var(--color-brand, #059669)", fontWeight: 500 }}>
                            {dualCurrent}
                          </div>
                        )}
                      </td>
                      <td className="d-num d-mono">
                        <div>{qtyFmt(i.min_qty, i.unit)}</div>
                        {dualMin && <div className="d-muted" style={{ fontSize: "0.72rem", opacity: 0.85 }}>{dualMin}</div>}
                      </td>
                      <td className="d-num d-mono" style={{ fontWeight: 600 }}>
                        {rupiah(totalVal)}
                      </td>
                      <td>
                        {currentQty < 0 ? (
                          <Badge tone="danger">Minus</Badge>
                        ) : currentQty < i.min_qty ? (
                          <Badge tone="warn">Pesan ulang</Badge>
                        ) : (
                          <Badge tone="ok">Aman</Badge>
                        )}
                      </td>
                      {canManageItem && (
                        <td className="d-row-actions">
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--sm"
                            onClick={() => openEditItem(i)}
                          >
                            Ubah
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
            {tab === "mutasi" && (r.data.moves.length === 0 ? <Empty title="Belum ada mutasi" /> : (
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr><th scope="col">Waktu</th><th scope="col">Bahan</th><th scope="col">Jenis</th><th scope="col" className="d-num">Jumlah</th><th scope="col">Referensi</th></tr></thead>
                <tbody>{r.data.moves.map((m) => (
                  <tr key={m.id}><td className="d-mono">{dateTime(m.created_at)}</td><td>{items[m.item_id]?.name}</td>
                    <td><Badge tone={m.kind === "waste" ? "danger" : m.kind === "sale" ? "accent" : "ok"}>{KIND[m.kind] ?? m.kind}</Badge></td>
                    <td className="d-num">{m.qty_delta > 0 ? "+" : ""}{qtyFmt(m.qty_delta, items[m.item_id]?.unit)}</td><td className="d-mono d-muted">{m.ref}</td></tr>
                ))}</tbody>
              </table></div>
            ))}
            {tab === "opname" && (r.data.counts.length === 0 ? <Empty title="Tidak ada draf opname">Ajukan opname dari formulir cabang.</Empty> : (
              <>
                <div className="d-table-wrap"><table className="d-table">
                  <thead><tr><th scope="col">Bahan</th><th scope="col" className="d-num">Sistem</th><th scope="col" className="d-num">Fisik</th><th scope="col" className="d-num">Selisih</th><th scope="col" className="d-num">Nilai</th></tr></thead>
                  <tbody>{r.data.counts.map((c) => {
                    const it = items[c.item_id];
                    const diff = c.counted_qty - c.system_qty;
                    return <tr key={c.id}><td>{it?.name}</td><td className="d-num">{qtyFmt(c.system_qty, it?.unit)}</td><td className="d-num">{qtyFmt(c.counted_qty, it?.unit)}</td>
                      <td className="d-num"><Badge tone={diff < 0 ? "danger" : diff > 0 ? "accent" : "ok"}>{diff > 0 ? "+" : ""}{qtyFmt(diff, it?.unit)}</Badge></td><td className="d-num">{rupiah(diff * (it?.cost_per_unit ?? 0))}</td></tr>;
                  })}</tbody>
                </table></div>
                {canApply && (
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("apply_opname", { p_ids: r.data.counts.map((c) => c.id), p_apply: false }); r.reload(); }, "Opname ditolak")}>Tolak semua</button>
                    <button type="button" className="d-btn d-btn--primary" disabled={a.busy} onClick={() => a.run(async () => { const v = await api.rpc("apply_opname", { p_ids: r.data.counts.map((c) => c.id) }); r.reload(); return v; }, (v) => `Stok disesuaikan, selisih ${rupiah(v)} dijurnal`)}>Terapkan penyesuaian</button>
                  </div>
                )}
              </>
            ))}
            {tab === "waste" && (r.data.waste.length === 0 ? <Empty title="Belum ada waste" /> : (
              <ul className="d-list">{r.data.waste.map((w) => <li key={w.id}><div><p className="d-list__title">{items[w.item_id]?.name} · {qtyFmt(w.qty, items[w.item_id]?.unit)}</p><p className="d-list__meta">{w.reason} · {dateTime(w.created_at)}</p></div><span className="d-mono">{rupiah(w.cost)}</span></li>)}</ul>
            ))}
            <Feedback a={a} />
          </Panel>
        </>
      )}

      {/* ───────── Modal Tambah / Ubah Bahan dengan Multi-UoM Cerdas ───────── */}
      <Modal open={Boolean(itemModal)} title={itemModal?.id ? `Ubah Bahan Baku (${itemModal.code})` : "Tambah Bahan Baku Baru (Multi-UoM)"} onClose={() => setItemModal(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            {itemModal?.id && canManageItem ? (
              <button type="button" className="d-btn d-btn--danger d-btn--sm" disabled={a.busy} onClick={deleteItem}>
                <i className="fa-solid fa-trash-can" style={{ marginRight: "0.4rem" }} />
                Hapus bahan
              </button>
            ) : <span />}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => setItemModal(null)}>Batal</button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={a.busy}
                onClick={() => {
                  if (!itemModal?.name?.trim()) {
                    a.setError("Nama bahan baku wajib diisi!");
                    return;
                  }
                  saveItem();
                }}
                style={{
                  minWidth: "140px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: a.busy ? "wait" : "pointer"
                }}
              >
                {a.busy ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "0.4rem" }} />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check" style={{ marginRight: "0.4rem" }} />
                    {itemModal?.id ? "Simpan perubahan" : "Simpan bahan"}
                  </>
                )}
              </button>
            </div>
          </div>
        }>
        {itemModal && (
          <div className="d-form">
            {a.error && (
              <div style={{
                padding: "0.75rem 1rem",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1.5px solid #ef4444",
                borderRadius: "8px",
                color: "#991b1b",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem"
              }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: "#ef4444", fontSize: "1rem" }} />
                <span>{a.error}</span>
              </div>
            )}
            {/* Header Form Identitas Bahan */}
            <div className="d-form__row">
              <Field label="Kode bahan" id="im-code">
                <input id="im-code" value={itemModal.code} onChange={(e) => setItemModal({ ...itemModal, code: e.target.value.toUpperCase() })} placeholder="Contoh: BHN-001" />
              </Field>
              <Field label="Nama bahan baku" id="im-name">
                <input id="im-name" value={itemModal.name} onChange={(e) => {
                  if (a.error) a.setError(null);
                  setItemModal({ ...itemModal, name: e.target.value });
                }} placeholder="Contoh: Susu UHT Fresh Milk" />
              </Field>
            </div>

            {/* 1. CHECKBOX CHECKLIST DEFAULT: Gunakan Konversi Satuan Beli / Kemasan Kulakan (Multi-UoM) */}
            <div className="d-uom-checkbox-card" style={{
              margin: "0.85rem 0",
              border: itemModal.uom_mode ? "2px solid #10b981" : "1.5px solid #cbd5e1",
              background: itemModal.uom_mode ? "rgba(16, 185, 129, 0.04)" : "#f8fafc",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              transition: "all 0.2s ease"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <input
                  type="checkbox"
                  id="im-uom-mode"
                  checked={Boolean(itemModal.uom_mode)}
                  onChange={(e) => setItemModal({ ...itemModal, uom_mode: e.target.checked })}
                  style={{ width: "1.3rem", height: "1.3rem", cursor: "pointer", marginTop: "3px", accentColor: "#059669" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <label htmlFor="im-uom-mode" style={{ fontWeight: 700, fontSize: "0.92rem", cursor: "pointer", margin: 0, color: itemModal.uom_mode ? "#065f46" : "#334155" }}>
                      <i className="fa-solid fa-boxes-stacked" style={{ marginRight: "0.45rem", color: "#059669" }} />
                      Gunakan Konversi Satuan Beli / Kemasan Kulakan (Multi-UoM)
                    </label>
                    <Badge tone={itemModal.uom_mode ? "ok" : "muted"}>
                      {itemModal.uom_mode ? "Multi-UoM Aktif" : "Satuan Dasar Langsung"}
                    </Badge>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: itemModal.uom_mode ? "#047857" : "#64748b" }}>
                    {itemModal.uom_mode
                      ? "Konversi satuan kemasan kulakan (botol, galon, dus, sak) ke satuan resep dengan kalkulasi HPP otomatis."
                      : "Input manual harga modal dan batas stok langsung dalam satuan dasar resep tanpa konversi kemasan."}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. CHECKBOX CHECKLIST KEDUA: Gunakan Konversi Satuan Beli / Kemasan Kulakan (Multi-UoM) Template Gudangku (TERPISAH DARI CHECKBOX 1) */}
            <div style={{
              margin: "0.5rem 0 1rem",
              border: itemModal.use_template_excel ? "2px solid #10b981" : "1.5px solid #cbd5e1",
              background: itemModal.use_template_excel ? "rgba(16, 185, 129, 0.04)" : "#ffffff",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              transition: "all 0.2s ease"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <input
                  type="checkbox"
                  id="im-use-template-excel"
                  checked={Boolean(itemModal.use_template_excel)}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setPrefUseTemplateGudangku(val);
                    try {
                      localStorage.setItem(`tijarah_pref_use_template_gudangku_${tenantId}`, String(val));
                    } catch {}
                    setItemModal({
                      ...itemModal,
                      use_template_excel: val,
                      uom_mode: val ? true : itemModal.uom_mode,
                    });
                  }}
                  style={{ width: "1.3rem", height: "1.3rem", cursor: "pointer", marginTop: "3px", accentColor: "#059669" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <label htmlFor="im-use-template-excel" style={{ fontWeight: 700, fontSize: "0.92rem", cursor: "pointer", margin: 0, color: itemModal.use_template_excel ? "#065f46" : "#334155" }}>
                      <i className="fa-solid fa-file-excel" style={{ marginRight: "0.45rem", color: "#10b981" }} />
                      Gunakan Konversi Satuan Beli / Kemasan Kulakan (Multi-UoM) Template Gudangku
                    </label>
                    <Badge tone={itemModal.use_template_excel ? "ok" : "muted"}>
                      {itemModal.use_template_excel ? "Template Gudangku Aktif" : "Template Nonaktif"}
                    </Badge>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: itemModal.use_template_excel ? "#047857" : "#64748b" }}>
                    {itemModal.use_template_excel
                      ? "Menampilkan opsi template kemasan Gudangku (hasil impor Excel / preset kustom) pada pilihan dropdown di bawah."
                      : "Hanya menampilkan template kemasan standar bawaan sistem tanpa daftar template Gudangku."}
                  </p>
                </div>
              </div>
            </div>

            {/* Panel Multi-UoM Kemasan F&B ATAU Mode Standar Satuan Dasar Langsung */}
            {itemModal.uom_mode ? (
              <div style={{ borderLeft: "3px solid var(--color-brand, #059669)", paddingLeft: "1rem", margin: "0.5rem 0" }}>
                {/* 1-Klik Template Kemasan F&B: JIKA KEDUA CHECKBOX AKTIF: MUNCUL TEMPLATE GUDANGKU HASIL UPLOAD OWNER/GM PALING DI ATAS & RAPIH + DEFAULT TEMPLATE SBLMNYA */}
                <Field
                  label={
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <span>Pilih Template Kemasan F&B (1-Klik Auto-Fill)</span>
                      {itemModal.use_template_excel && (
                        <span style={{ fontSize: "0.74rem", color: "#059669", fontWeight: 600 }}>
                          <i className="fa-solid fa-file-excel" style={{ marginRight: "3px" }} />
                          Template Gudangku Aktif ({effectiveGudangkuTemplates.length} Template Siap Pakai)
                        </span>
                      )}
                    </div>
                  }
                  id="im-template"
                >
                  <select
                    id="im-template"
                    value={itemModal.template_id || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith("gudangku_")) {
                        const idx = Number(val.replace("gudangku_", ""));
                        const tpl = effectiveGudangkuTemplates[idx];
                        if (tpl) {
                          applyExcelItemToForm(tpl, val);
                        }
                      } else {
                        applyTemplate(val);
                      }
                    }}
                    style={{
                      fontWeight: 600,
                      borderColor: itemModal.use_template_excel ? "#10b981" : "var(--color-rule, #cbd5e1)",
                      color: "var(--color-ink, #0f172a)",
                      background: "#ffffff"
                    }}
                  >
                    <option value="">Pilih template / kemasan kustom…</option>

                    {/* JIKA KEDUA CHECKBOX AKTIF: TEMPLATE UPLOAD OWNER / GM MUNCUL PALING DI ATAS & RAPIH */}
                    {itemModal.use_template_excel && (
                      <optgroup label="Template Gudangku (Hasil Upload Owner / GM)">
                        {effectiveGudangkuTemplates.map((itm, idx) => (
                          <option key={`gudangku_${idx}`} value={`gudangku_${idx}`}>
                            [{itm.code || `BHN-${String(idx + 1).padStart(3, "0")}`}] {itm.name} — 1 {itm.pack_unit} = {Number(itm.pack_ratio).toLocaleString("id-ID")} {itm.unit}{itm.pack_price ? ` (Beli: ${rupiah(itm.pack_price)})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {/* DEFAULT TEMPLATE SBLMNYA TETAP ADA DENGAN RAPI */}
                    <optgroup label="Bahan Cair (Satuan Dasar: ml)">
                      {MULTI_UOM_TEMPLATES.filter((t) => t.category === "liquid").map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.desc}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Bahan Padat & Bubuk (Satuan Dasar: g)">
                      {MULTI_UOM_TEMPLATES.filter((t) => t.category === "solid").map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.desc}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kemasan, Alat & Hitungan (Satuan Dasar: pcs / butir)">
                      {MULTI_UOM_TEMPLATES.filter((t) => t.category === "count").map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.desc}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>

                {/* Parameter Konversi Kemasan */}
                <div className="d-form__row d-form__row--3" style={{ marginTop: "0.75rem" }}>
                  <Field label="Satuan Beli / Kemasan" id="im-pack-unit">
                    <input
                      id="im-pack-unit"
                      value={itemModal.pack_unit || ""}
                      onChange={(e) => setItemModal({ ...itemModal, pack_unit: e.target.value.toLowerCase() })}
                      placeholder="Contoh: botol, galon, dus, karung"
                    />
                  </Field>
                  <Field label="Isi per Kemasan (Rasio)" id="im-pack-ratio">
                    <input
                      id="im-pack-ratio"
                      inputMode="decimal"
                      value={itemModal.pack_ratio || ""}
                      onChange={(e) => {
                        const r = e.target.value.replace(/[^\d.]/g, "");
                        const newCost = itemModal.pack_price ? String(calculateBaseCost(itemModal.pack_price, r)) : itemModal.cost_per_unit;
                        const newInit = itemModal.pack_init_stock ? String(Number(itemModal.pack_init_stock) * (Number(r) || 1)) : itemModal.initial_stock;
                        const newMin = itemModal.pack_min_stock ? String(Number(itemModal.pack_min_stock) * (Number(r) || 1)) : itemModal.min_qty;
                        setItemModal({
                          ...itemModal,
                          pack_ratio: r,
                          cost_per_unit: newCost,
                          initial_stock: newInit,
                          min_qty: newMin,
                        });
                      }}
                      placeholder="Contoh: 750 (isi ml), 1000 (g), 50 (pcs)"
                    />
                  </Field>
                  <Field label="Satuan Dasar (Terkunci)" id="im-base-unit">
                    <input
                      id="im-base-unit"
                      value={itemModal.unit || "ml"}
                      onChange={(e) => setItemModal({ ...itemModal, unit: e.target.value.toLowerCase() })}
                      placeholder="ml, g, pcs"
                    />
                  </Field>
                </div>

                {/* Input Harga Beli Kemasan & Auto-Calculate Modal Dasar */}
                <div className="d-form__row" style={{ marginTop: "0.75rem" }}>
                  <Field label={`Harga Beli per ${itemModal.pack_unit || "Kemasan"} (Rp)`} id="im-pack-price">
                    <input
                      id="im-pack-price"
                      inputMode="numeric"
                      value={itemModal.pack_price || ""}
                      onChange={(e) => handlePackPriceChange(e.target.value)}
                      placeholder="Contoh: 120000 (harga beli kulakan)"
                    />
                  </Field>
                  <Field label={`Harga Modal Satuan Dasar (Rp / ${itemModal.unit || "unit"}) · Otomatis`} id="im-calc-cost">
                    <input
                      id="im-calc-cost"
                      disabled
                      readOnly
                      value={itemModal.cost_per_unit ? `${rupiah(itemModal.cost_per_unit)} / ${itemModal.unit || ""}` : "Rp 0"}
                      style={{ background: "var(--color-bg-subtle, rgba(0,0,0,0.03))", fontWeight: 700, color: "var(--color-accent, #ea580c)" }}
                    />
                  </Field>
                </div>

                {/* Stok Awal & Batas Minimum dalam Kemasan */}
                {!itemModal.id ? (
                  <div className="d-form__row" style={{ marginTop: "0.75rem" }}>
                    <Field label={`Stok Awal Fisik (${itemModal.pack_unit || "Kemasan"})`} id="im-pack-init">
                      <input
                        id="im-pack-init"
                        inputMode="decimal"
                        value={itemModal.pack_init_stock || ""}
                        onChange={(e) => handlePackInitStockChange(e.target.value)}
                        placeholder="Contoh: 10 (punya 10 botol di gudang)"
                      />
                      <span className="d-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "2px", color: "var(--color-brand, #059669)" }}>
                        {itemModal.initial_stock ? `Tersimpan: ${Number(itemModal.initial_stock).toLocaleString("id-ID")} ${itemModal.unit}` : ""}
                      </span>
                    </Field>
                    <Field label={`Batas Minimum (${itemModal.pack_unit || "Kemasan"})`} id="im-pack-min">
                      <input
                        id="im-pack-min"
                        inputMode="decimal"
                        value={itemModal.pack_min_stock || ""}
                        onChange={(e) => handlePackMinStockChange(e.target.value)}
                        placeholder="Contoh: 2 (peringatan jika sisa < 2 botol)"
                      />
                      <span className="d-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "2px" }}>
                        {itemModal.min_qty ? `Batas sistem: ${Number(itemModal.min_qty).toLocaleString("id-ID")} ${itemModal.unit}` : ""}
                      </span>
                    </Field>
                  </div>
                ) : (
                  <div className="d-form__row" style={{ marginTop: "0.75rem" }}>
                    <Field label={`Sesuaikan Stok Fisik (${itemModal.unit || "unit"})`} id="im-cur-stock">
                      <input
                        id="im-cur-stock"
                        inputMode="decimal"
                        value={itemModal.current_stock ?? ""}
                        onChange={(e) => setItemModal({ ...itemModal, current_stock: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder="Ubah angka jika ingin menyesuaikan stok fisik cabang ini secara instan"
                        style={{ fontWeight: 700 }}
                      />
                      {formatDualStockDisplay(itemModal.current_stock, itemModal) && (
                        <span className="d-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "2px", color: "var(--color-brand, #059669)" }}>
                          {formatDualStockDisplay(itemModal.current_stock, itemModal)}
                        </span>
                      )}
                    </Field>
                    <Field label={`Batas Minimum (${itemModal.pack_unit || "Kemasan"})`} id="im-pack-min-edit">
                      <input
                        id="im-pack-min-edit"
                        inputMode="decimal"
                        value={itemModal.pack_min_stock || ""}
                        onChange={(e) => handlePackMinStockChange(e.target.value)}
                        placeholder="Contoh: 2 (peringatan jika sisa < 2 botol)"
                      />
                      <span className="d-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "2px" }}>
                        {itemModal.min_qty ? `Batas sistem: ${Number(itemModal.min_qty).toLocaleString("id-ID")} ${itemModal.unit}` : ""}
                      </span>
                    </Field>
                  </div>
                )}

                {/* Ringkasan Konversi Cerdas Transparan */}
                {itemModal.pack_ratio && Number(itemModal.pack_ratio) > 1 && (
                  <div style={{
                    marginTop: "0.75rem",
                    padding: "0.65rem 0.85rem",
                    background: "rgba(5, 150, 105, 0.05)",
                    border: "1px solid rgba(5, 150, 105, 0.2)",
                    borderRadius: "var(--radius-md, 6px)",
                    fontSize: "0.78rem",
                    color: "var(--color-ink, #0f172a)",
                  }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: "0.35rem", color: "#059669" }} />
                    <strong>Sinkronisasi Otomatis:</strong> 1 {itemModal.pack_unit || "kemasan"} = {Number(itemModal.pack_ratio).toLocaleString("id-ID")} {itemModal.unit}.
                    {itemModal.cost_per_unit > 0 && ` Harga modal Rp ${Number(itemModal.cost_per_unit).toLocaleString("id-ID")}/${itemModal.unit}.`}
                    {" "}Resep di Subtab "Resep & BOM" dan pemotongan stok kasir POS otomatis sinkron dalam satuan dasar ({itemModal.unit}).
                  </div>
                )}
              </div>
            ) : (
              /* Mode Standar: Input Satuan Langsung */
              <>
                <div className="d-form__row">
                  <Field label="Satuan dasar" id="im-unit">
                    <input id="im-unit" list="im-units" value={itemModal.unit} onChange={(e) => setItemModal({ ...itemModal, unit: e.target.value.toLowerCase() })} placeholder="g, ml, pcs, botol…" />
                    <datalist id="im-units">
                      {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
                    </datalist>
                  </Field>
                  <Field label={`Harga Modal / HPP Satuan (Rp / ${itemModal.unit || "unit"})`} id="im-cost">
                    <input id="im-cost" inputMode="numeric" value={itemModal.cost_per_unit} onChange={(e) => setItemModal({ ...itemModal, cost_per_unit: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Harga beli pokok satuan" />
                  </Field>
                </div>
                <div className="d-form__row">
                  <Field label={`Batas minimum stok (${itemModal.unit || "unit"})`} id="im-min">
                    <input id="im-min" inputMode="decimal" value={itemModal.min_qty} onChange={(e) => setItemModal({ ...itemModal, min_qty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Peringatan pesan ulang jika stok < batas ini" />
                  </Field>
                  {!itemModal.id ? (
                    <Field label={`Stok Awal (${itemModal.unit || "unit"})`} id="im-stock">
                      <input
                        id="im-stock"
                        inputMode="decimal"
                        value={itemModal.initial_stock}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d.]/g, "");
                          setItemModal({ ...itemModal, initial_stock: val, current_stock: val });
                        }}
                        placeholder="Contoh: 19000"
                      />
                    </Field>
                  ) : (
                    <Field label={`Sesuaikan Stok Fisik (${itemModal.unit || "unit"})`} id="im-cur-stock-ro">
                      <input
                        id="im-cur-stock-ro"
                        inputMode="decimal"
                        value={itemModal.current_stock ?? ""}
                        onChange={(e) => setItemModal({ ...itemModal, current_stock: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder="Ubah angka jika ingin menyesuaikan stok fisik"
                      />
                    </Field>
                  )}
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
              <input type="checkbox" id="im-semi" checked={Boolean(itemModal.is_semi)} onChange={(e) => setItemModal({ ...itemModal, is_semi: e.target.checked })} />
              <label htmlFor="im-semi" className="d-label" style={{ margin: 0, fontWeight: "normal", cursor: "pointer" }}>
                Barang setengah jadi / sub-resep (diproduksi per batch, contoh: kaldu, sirup buatan sendiri)
              </label>
            </div>
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Bulk Import Excel (.xlsx) Multi-UoM Gudangku */}
      {bulkModal && (
        <Modal
          open={Boolean(bulkModal)}
          title="Bulk Import Bahan Baku & Multi-UoM (.xlsx / .csv)"
          style={{ maxWidth: "1160px", width: "96vw" }}
          onClose={() => {
            if (bulkProcessing) return;
            setBulkModal(false);
            setBulkRows([]);
            setBulkProgressText("");
          }}
          footer={
            bulkTab === "history" ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.82rem", color: "var(--color-muted, #64748b)" }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: "0.35rem", color: "#059669" }} />
                  Riwayat berkas yang pernah diimpor & registri template Gudangku. {isOwnerOrGm ? "Owner & GM memiliki akses penuh CRUD." : "Mode baca untuk peran saat ini."}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost"
                    onClick={() => {
                      setBulkModal(false);
                      setBulkRows([]);
                    }}
                  >
                    Tutup
                  </button>
                  {isOwnerOrGm && (
                    <button
                      type="button"
                      className="d-btn d-btn--primary"
                      onClick={() => openCreateHistoryItem()}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      <i className="fa-solid fa-plus" />
                      <span>+ Tambah Template ke Riwayat</span>
                    </button>
                  )}
                </div>
              </div>
            ) : bulkRows.length > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.83rem", color: "var(--color-muted, #64748b)" }}>
                  Terpilih: <strong>{bulkRows.filter((r) => r._selected).length}</strong> dari {bulkRows.length} baris bahan baku
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost"
                    disabled={bulkProcessing}
                    onClick={() => {
                      setBulkRows([]);
                      setBulkProgressText("");
                    }}
                  >
                    Pilih Berkas Lain
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--primary"
                    disabled={bulkProcessing || bulkRows.filter((r) => r._selected).length === 0}
                    onClick={() => saveBulkItems()}
                    style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                  >
                    {bulkProcessing ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" />
                        <span>{bulkProgressText || "Menyimpan ke Supabase..."}</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-floppy-disk" />
                        <span>Simpan Semua Bahan ({bulkRows.filter((r) => r._selected).length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Silakan unduh templat dan unggah berkas .xlsx / .csv untuk memproses impor massal
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost"
                    onClick={() => setBulkModal(false)}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--primary"
                    disabled={true}
                    style={{ opacity: 0.6, cursor: "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <i className="fa-solid fa-floppy-disk" />
                    <span>Simpan Semua Bahan (0)</span>
                  </button>
                </div>
              </div>
            )
          }
        >
          {/* TAB SWITCHER DI ATAS MODAL */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div className="d-seg" role="radiogroup" aria-label="Tab Bulk Modal">
              <button
                type="button"
                role="radio"
                aria-checked={bulkTab === "upload"}
                onClick={() => setBulkTab("upload")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: bulkTab === "upload" ? 700 : 500 }}
              >
                <i className="fa-solid fa-cloud-arrow-up" style={{ color: bulkTab === "upload" ? "#059669" : undefined }} />
                <span>Unggah & Impor Berkas Baru</span>
                {bulkRows.length > 0 && (
                  <span className="d-badge d-badge--ok" style={{ marginLeft: "4px", fontSize: "0.7rem", padding: "1px 6px" }}>
                    {bulkRows.length} Baris
                  </span>
                )}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={bulkTab === "history"}
                onClick={() => setBulkTab("history")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: bulkTab === "history" ? 700 : 500 }}
              >
                <i className="fa-solid fa-clock-rotate-left" style={{ color: bulkTab === "history" ? "#059669" : undefined }} />
                <span>Riwayat Berkas & Template Gudangku</span>
                <span className="d-badge d-badge--muted" style={{ marginLeft: "4px", fontSize: "0.7rem", padding: "1px 6px" }}>
                  {uploadHistory.length} Berkas
                </span>
              </button>
            </div>

            {bulkTab === "history" && isOwnerOrGm && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="d-badge d-badge--brand" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
                  <i className="fa-solid fa-shield-halved" style={{ marginRight: "0.3rem" }} />
                  Akses CRUD: Owner & GM
                </span>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--primary"
                  onClick={() => openCreateHistoryItem()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <i className="fa-solid fa-plus" />
                  <span>+ Tambah Template</span>
                </button>
              </div>
            )}
          </div>

          {/* KONTEN TAB 1: RIWAYAT BERKAS & TEMPLATE GUDANGKU (CRUD OWNER & GM) */}
          {bulkTab === "history" ? (
            <div>
              {/* Header Pencarian & Filter */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "260px" }}>
                  <div style={{ position: "relative", width: "100%", maxWidth: "420px" }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.85rem" }} />
                    <input
                      type="text"
                      placeholder="Cari nama bahan, kode, atau nama berkas di riwayat..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      style={{ width: "100%", padding: "0.4rem 0.5rem 0.4rem 2rem", fontSize: "0.82rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  {historySearch && (
                    <button
                      type="button"
                      className="d-btn d-btn--sm d-btn--ghost"
                      onClick={() => setHistorySearch("")}
                      style={{ fontSize: "0.75rem" }}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  Menampilkan <strong>{filteredBatches.length}</strong> batch riwayat berkas
                </div>
              </div>

              {filteredBatches.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-folder-open" style={{ fontSize: "2.5rem", color: "#94a3b8", marginBottom: "0.75rem" }} />
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#334155" }}>
                    {historySearch ? "Tidak ada bahan baku atau berkas yang cocok dengan pencarian" : "Belum ada riwayat impor berkas"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>
                    {historySearch ? "Coba gunakan kata kunci lain." : "Unggah berkas Excel/CSV untuk mulai mencatat riwayat impor bahan baku."}
                  </div>
                  <button
                    type="button"
                    className="d-btn d-btn--sm d-btn--primary"
                    onClick={() => setBulkTab("upload")}
                    style={{ marginTop: "1rem" }}
                  >
                    Unggah Berkas Sekarang
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "550px", overflowY: "auto", paddingRight: "4px" }}>
                  {filteredBatches.map((batch) => (
                    <div
                      key={batch.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Batch Card Header */}
                      <div style={{
                        padding: "0.75rem 1rem",
                        background: "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <i className="fa-solid fa-file-excel" style={{ color: "#10b981", fontSize: "1.4rem" }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                              <span>{batch.fileName}</span>
                              <span className="d-badge d-badge--ok" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                                {batch.items?.length || 0} Bahan
                              </span>
                            </div>
                            <div style={{ fontSize: "0.76rem", color: "#64748b", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginTop: "2px" }}>
                              <span><i className="fa-solid fa-clock" style={{ marginRight: "0.25rem" }} />{dateTime(batch.uploadedAt)}</span>
                              <span>·</span>
                              <span><i className="fa-solid fa-user" style={{ marginRight: "0.25rem" }} />{batch.uploadedBy || "Owner / GM"}</span>
                              <span>·</span>
                              <span><i className="fa-solid fa-location-dot" style={{ marginRight: "0.25rem" }} />{batch.branchName || "Semua Cabang"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Aksi Tingkat Batch */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <button
                            type="button"
                            className="d-btn d-btn--sm d-btn--secondary"
                            onClick={() => loadBatchToImportTable(batch)}
                            title="Muat seluruh bahan dari berkas ini ke tabel impor aktif"
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
                          >
                            <i className="fa-solid fa-file-import" style={{ color: "#059669" }} />
                            <span>Muat ke Tabel Impor</span>
                          </button>
                          {isOwnerOrGm && (
                            <>
                              <button
                                type="button"
                                className="d-btn d-btn--sm d-btn--ghost"
                                onClick={() => openCreateHistoryItem(batch.id)}
                                title="Tambah bahan baru ke berkas riwayat ini"
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem" }}
                              >
                                <i className="fa-solid fa-plus" />
                                <span>Tambah Item</span>
                              </button>
                              <button
                                type="button"
                                className="d-btn d-btn--sm d-btn--ghost"
                                onClick={() => deleteHistoryBatch(batch.id)}
                                title="Hapus seluruh riwayat berkas ini"
                                style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem" }}
                              >
                                <i className="fa-solid fa-trash-can" />
                                <span>Hapus Batch</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Tabel Bahan di dalam Batch */}
                      <div style={{ overflowX: "auto" }}>
                        <table className="d-table" style={{ fontSize: "0.78rem", width: "100%", margin: 0 }}>
                          <thead>
                            <tr style={{ background: "#ffffff" }}>
                              <th style={{ width: "90px" }}>Kode</th>
                              <th>Nama Bahan Baku</th>
                              <th>Kemasan Kulakan (Multi-UoM)</th>
                              <th>Satuan Dasar</th>
                              <th className="d-num">Harga Beli Kemasan</th>
                              <th className="d-num">HPP Dasar</th>
                              <th className="d-num">Stok Fisik Awal</th>
                              <th className="d-num">Batas Min</th>
                              <th style={{ width: "110px", textAlign: "center" }}>Aksi {isOwnerOrGm ? "(Owner/GM)" : ""}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(batch.items || []).map((item, itemIdx) => (
                              <tr key={item.code || itemIdx}>
                                <td className="d-mono" style={{ fontWeight: 600 }}>{item.code || "-"}</td>
                                <td style={{ fontWeight: 600, color: "#1e293b" }}>{item.name}</td>
                                <td>
                                  <span style={{ fontWeight: 600 }}>1 {item.pack_unit}</span> = {Number(item.pack_ratio || 1).toLocaleString("id-ID")} {item.unit}
                                </td>
                                <td>
                                  <span className="d-badge d-badge--muted">{item.unit}</span>
                                </td>
                                <td className="d-num d-mono">
                                  {item.pack_price ? rupiah(item.pack_price) : "-"}
                                </td>
                                <td className="d-num d-mono" style={{ color: "#059669", fontWeight: 600 }}>
                                  {rupiah(item.cost_per_unit || calculateBaseCost(item.pack_price, item.pack_ratio))}/{item.unit}
                                </td>
                                <td className="d-num d-mono">
                                  <div>{item.pack_init_stock || 0} {item.pack_unit}</div>
                                  <div className="d-muted" style={{ fontSize: "0.7rem" }}>
                                    = {Number(item.initial_stock || ((item.pack_init_stock || 0) * (item.pack_ratio || 1))).toLocaleString("id-ID")} {item.unit}
                                  </div>
                                </td>
                                <td className="d-num d-mono">
                                  <div>{item.pack_min_stock || 0} {item.pack_unit}</div>
                                  <div className="d-muted" style={{ fontSize: "0.7rem" }}>
                                    = {Number(item.min_qty || ((item.pack_min_stock || 0) * (item.pack_ratio || 1))).toLocaleString("id-ID")} {item.unit}
                                  </div>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  {isOwnerOrGm ? (
                                    <div style={{ display: "inline-flex", gap: "0.3rem" }}>
                                      <button
                                        type="button"
                                        className="d-btn d-btn--sm d-btn--ghost"
                                        onClick={() => openEditHistoryItem(batch.id, itemIdx, item)}
                                        title="Ubah data bahan ini di riwayat & template Gudangku"
                                        style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem", color: "#0284c7" }}
                                      >
                                        <i className="fa-solid fa-pen-to-square" />
                                      </button>
                                      <button
                                        type="button"
                                        className="d-btn d-btn--sm d-btn--ghost"
                                        onClick={() => deleteHistoryItem(batch.id, itemIdx)}
                                        title="Hapus bahan ini dari riwayat"
                                        style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem", color: "#dc2626" }}
                                      >
                                        <i className="fa-solid fa-trash-can" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="d-badge d-badge--muted" style={{ fontSize: "0.68rem" }}>Read-Only</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* KONTEN TAB 2: UNGGAH & IMPOR BERKAS BARU */
            bulkRows.length === 0 ? (
              <div style={{ padding: "0.5rem 0" }}>
                {/* 1. UNDUH TEMPLAT */}
                <div style={{ marginBottom: "1.25rem", padding: "0.85rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <div className="d-bulk-step-title" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#065f46" }}>
                        1. UNDUH TEMPLAT EXCEL RESMI
                      </div>
                    </div>
                    <button
                      type="button"
                      className="d-btn--pill"
                      onClick={downloadExcelTemplate}
                      style={{ padding: "0.5rem 1.1rem", fontSize: "0.85rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                    >
                      <i className="fa-solid fa-file-excel" style={{ color: "#10b981", fontSize: "1.15rem" }} />
                      <span>Unduh Templat (.xlsx)</span>
                    </button>
                  </div>
                </div>

                {/* 2. UNGGAH BERKAS ANDA */}
                <div style={{ marginTop: "1rem" }}>
                  <div className="d-bulk-step-title" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", marginBottom: "0.5rem" }}>
                    2. UNGGAH BERKAS (.XLSX & .CSV)
                  </div>
                  <div
                    className="d-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files?.[0]) handleFileParse(e.dataTransfer.files[0]);
                    }}
                    style={{ cursor: "pointer", border: "2px dashed #10b981", borderRadius: "10px", padding: "1.75rem 1rem", background: "rgba(16, 185, 129, 0.02)" }}
                  >
                    <div className="d-dropzone__icon">
                      <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: "2rem", color: "#10b981" }} />
                    </div>
                    <div className="d-dropzone__title" style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "0.4rem" }}>
                      Letakkan berkas .xlsx atau .csv di sini, atau klik untuk memilih berkas
                    </div>
                    <div className="d-dropzone__sub" style={{ fontSize: "0.78rem", color: "var(--color-muted, #64748b)", marginTop: "0.25rem" }}>
                      Format berkas: .xlsx, .xls, .csv · Maksimal 500 baris, ukuran hingga 2 MB
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileParse(e.target.files[0]);
                      }}
                      accept=".xlsx, .xls, .csv"
                      style={{ display: "none" }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Banner Berkas Terbaca & Master Template Dropdown */}
                <div style={{
                  background: "var(--color-paper-2, #f8fafc)",
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                  marginBottom: "0.85rem"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem" }}>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "var(--color-brand, #059669)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <i className="fa-solid fa-circle-check" style={{ color: "#10b981" }} />
                        <span>Berkas Berhasil Dibaca ({bulkRows.length} Bahan Baku Ditemukan)</span>
                      </strong>
                      <div style={{ fontSize: "0.78rem", color: "var(--color-muted, #64748b)" }}>
                        Berkas: <strong>{bulkFileName || "Berkas_Bahan.xlsx"}</strong> · Stok awal dicatat ke cabang: <strong>{b.branch?.name || "Semua Cabang"}</strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--ghost"
                        onClick={downloadExcelTemplate}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        <i className="fa-solid fa-download" style={{ color: "#10b981" }} />
                        <span>Unduh Templat (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--secondary"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        <i className="fa-solid fa-cloud-arrow-up" style={{ color: "#10b981" }} />
                        <span>Ganti Berkas (.xlsx/.csv)</span>
                      </button>
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--primary"
                        disabled={bulkProcessing || bulkRows.filter((r) => r._selected).length === 0}
                        onClick={() => saveBulkItems()}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700 }}
                      >
                        <i className="fa-solid fa-floppy-disk" />
                        <span>Simpan Semua Bahan ({bulkRows.filter((r) => r._selected).length})</span>
                      </button>
                    </div>
                  </div>

                  {/* DROPDOWN MASTER TEMPLATE GUDANGKU */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <label htmlFor="master-tpl-select" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: "0.45rem", color: "#10b981" }} />
                      Terapkan Template Gudangku Sekaligus:
                    </label>
                    <select
                      id="master-tpl-select"
                      style={{ flex: 1, minWidth: "220px", padding: "0.35rem 0.5rem", fontSize: "0.82rem", borderRadius: "6px", border: "1px solid var(--color-rule, #cbd5e1)" }}
                      onChange={(e) => applyMasterTemplateToAll(e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>Pilih preset untuk diterapkan ke semua baris…</option>
                      <option value="auto">Auto-Match Rekomendasi (Berdasarkan Nama Bahan)</option>
                      <optgroup label="Kategori Bahan Cair (Satuan Dasar ml)">
                        {MULTI_UOM_TEMPLATES.filter((t) => t.category === "liquid").map((t) => (
                          <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Kategori Bahan Padat & Bubuk (Satuan Dasar g)">
                        {MULTI_UOM_TEMPLATES.filter((t) => t.category === "solid").map((t) => (
                          <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Kategori Kemasan & Alat (Satuan Dasar pcs)">
                        {MULTI_UOM_TEMPLATES.filter((t) => t.category === "count").map((t) => (
                          <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* TABEL PREVIEW DATA EXCEL & DROPDOWN PER BARIS */}
                <div className="d-preview-table-wrap">
                  <table className="d-table" style={{ fontSize: "0.8rem", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "32px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={bulkRows.length > 0 && bulkRows.every((r) => r._selected)}
                            onChange={(e) => {
                              const chk = e.target.checked;
                              setBulkRows((prev) => prev.map((r) => ({ ...r, _selected: chk })));
                            }}
                          />
                        </th>
                        <th>Kode</th>
                        <th>Nama Bahan</th>
                        <th>Dropdown Template Gudangku</th>
                        <th>Satuan Beli & Rasio</th>
                        <th>Satuan Dasar</th>
                        <th className="d-num">Harga Beli</th>
                        <th className="d-num">HPP Dasar</th>
                        <th className="d-num">Stok Awal Fisik</th>
                        <th className="d-num">Batas Min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, idx) => (
                        <tr key={idx} style={{ opacity: row._selected ? 1 : 0.45, background: row._selected ? "transparent" : "#f8fafc" }}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(row._selected)}
                              onChange={(e) => updateBulkRow(idx, { _selected: e.target.checked })}
                            />
                          </td>
                          <td className="d-mono" style={{ fontWeight: 600 }}>{row.code}</td>
                          <td>
                            <input
                              value={row.name}
                              onChange={(e) => updateBulkRow(idx, { name: e.target.value })}
                              style={{ minWidth: "130px", width: "100%", padding: "0.2rem 0.35rem", fontSize: "0.8rem" }}
                            />
                          </td>
                          <td>
                            {/* DROPDOWN TEMPLATE GUDANGKU PER BARIS */}
                            <select
                              value={row.template_id || ""}
                              onChange={(e) => applyTemplateToRow(idx, e.target.value)}
                              style={{ maxWidth: "180px", padding: "0.2rem 0.35rem", fontSize: "0.76rem" }}
                            >
                              <option value="">Kustom / Sesuai Baris</option>
                              <optgroup label="Cair (ml)">
                                {MULTI_UOM_TEMPLATES.filter((t) => t.category === "liquid").map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Padat (g)">
                                {MULTI_UOM_TEMPLATES.filter((t) => t.category === "solid").map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Pcs">
                                {MULTI_UOM_TEMPLATES.filter((t) => t.category === "count").map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
                              <span>1 {row.pack_unit} =</span>
                              <input
                                value={row.pack_ratio}
                                onChange={(e) => handleBulkRatioChange(idx, e.target.value)}
                                style={{ width: "55px", padding: "0.15rem 0.25rem", textAlign: "right" }}
                              />
                            </div>
                          </td>
                          <td>
                            <span className="d-badge d-badge--muted">{row.unit}</span>
                          </td>
                          <td className="d-num d-mono">
                            <input
                              value={row.pack_price}
                              onChange={(e) => handleBulkPriceChange(idx, e.target.value)}
                              style={{ width: "75px", textAlign: "right", padding: "0.15rem 0.25rem" }}
                            />
                          </td>
                          <td className="d-num d-mono" style={{ color: "var(--color-brand, #059669)", fontWeight: 600 }}>
                            {rupiah(row.cost_per_unit)}/{row.unit}
                          </td>
                          <td className="d-num d-mono">
                            <div>{row.pack_init_stock || 0} {row.pack_unit}</div>
                            <div className="d-muted" style={{ fontSize: "0.7rem" }}>
                              = {Number(row.initial_stock || 0).toLocaleString("id-ID")} {row.unit}
                            </div>
                          </td>
                          <td className="d-num d-mono">
                            <div>{row.pack_min_stock || 0} {row.pack_unit}</div>
                            <div className="d-muted" style={{ fontSize: "0.7rem" }}>
                              = {Number(row.min_qty || 0).toLocaleString("id-ID")} {row.unit}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </Modal>
      )}

      {/* Modal CRUD Item Riwayat (Owner & GM) */}
      {historyItemModal && (
        <Modal
          open={Boolean(historyItemModal)}
          title={historyItemModal.isNew ? "Tambah Bahan Baru ke Riwayat / Template Gudangku" : "Ubah Bahan di Riwayat / Template Gudangku (Owner & GM)"}
          onClose={() => setHistoryItemModal(null)}
          style={{ maxWidth: "680px" }}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => setHistoryItemModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                onClick={saveHistoryItem}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
              >
                <i className="fa-solid fa-floppy-disk" />
                <span>Simpan Perubahan (Owner & GM)</span>
              </button>
            </div>
          }
        >
          <div className="d-grid-2" style={{ gap: "0.85rem" }}>
            <Field label="Kode Bahan (Opsional / Otomatis)">
              <input
                value={historyItemModal.item.code || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, code: e.target.value.toUpperCase() }
                }))}
                placeholder="Contoh: BHN-001"
              />
            </Field>
            <Field label="Nama Bahan Baku" required>
              <input
                value={historyItemModal.item.name || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, name: e.target.value }
                }))}
                placeholder="Contoh: Air Galon Besar (19 Liter)"
              />
            </Field>

            <Field label="Satuan Beli / Kemasan Kulakan" required>
              <input
                value={historyItemModal.item.pack_unit || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, pack_unit: e.target.value }
                }))}
                placeholder="Contoh: galon, botol, karton, pack"
              />
            </Field>
            <Field label="Isi per Kemasan (Rasio Multi-UoM)" required>
              <input
                type="number"
                value={historyItemModal.item.pack_ratio || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, pack_ratio: e.target.value }
                }))}
                placeholder="Contoh: 19000, 750, 1000"
              />
            </Field>

            <Field label="Satuan Dasar Pakai / Resep" required>
              <input
                value={historyItemModal.item.unit || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, unit: e.target.value }
                }))}
                placeholder="Contoh: ml, g, pcs"
              />
            </Field>
            <Field label="Harga Beli Kemasan (Rp)">
              <input
                type="number"
                value={historyItemModal.item.pack_price || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, pack_price: e.target.value }
                }))}
                placeholder="Contoh: 19000"
              />
            </Field>
          </div>

          {/* Live Calculation Info */}
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            margin: "0.85rem 0",
            fontSize: "0.82rem",
            color: "#065f46",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem"
          }}>
            <div>
              <i className="fa-solid fa-calculator" style={{ marginRight: "0.4rem", color: "#10b981" }} />
              <strong>Kalkulasi HPP Dasar:</strong>{" "}
              {rupiah(calculateBaseCost(historyItemModal.item.pack_price, historyItemModal.item.pack_ratio))}/
              {historyItemModal.item.unit || "satuan"}
            </div>
            <div>
              <strong>Rasio:</strong> 1 {historyItemModal.item.pack_unit || "kemasan"} ={" "}
              {Number(historyItemModal.item.pack_ratio || 1).toLocaleString("id-ID")} {historyItemModal.item.unit || "satuan"}
            </div>
          </div>

          <div className="d-grid-2" style={{ gap: "0.85rem" }}>
            <Field label="Stok Awal Fisik (Kemasan)">
              <input
                type="number"
                value={historyItemModal.item.pack_init_stock || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, pack_init_stock: e.target.value }
                }))}
                placeholder="Contoh: 10"
              />
            </Field>
            <Field label="Batas Minimum (Kemasan)">
              <input
                type="number"
                value={historyItemModal.item.pack_min_stock || ""}
                onChange={(e) => setHistoryItemModal((prev) => ({
                  ...prev,
                  item: { ...prev.item, pack_min_stock: e.target.value }
                }))}
                placeholder="Contoh: 2"
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
