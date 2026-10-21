import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf, isOwnerOrGm } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useAction, Feedback, useLive, useBranch, BranchSelect } from "../../ops.jsx";

const DEFAULT_STATIONS = ["dapur", "barista", "grill", "pastry"];
const EMPTY = {
  sku: "",
  name: "",
  category: "Makanan",
  price: "",
  station: "dapur",
  barcode: "",
  image_url: "",
  description: "",
};

// Client-side HTML5 Canvas Auto-Converter ke WebP (<50 KB, max 800x800 px)
function convertToWebp(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 800;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Kompresi WebP kualitas 0.82
        const webpDataUrl = canvas.toDataURL("image/webp", 0.82);
        resolve(webpDataUrl);
      };
      img.onerror = () => reject(new Error("Gagal membaca file gambar."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Gagal mengunggah berkas."));
    reader.readAsDataURL(file);
  });
}

export default function Products() {
  const { api, role, tenantId, tenant } = useAuth();
  const b = useBranch();
  const fileInputRef = useRef(null);
  const bulkInputRef = useRef(null);

  // Ambil data produk
  const r = useAsync(
    () => (!api || !tenantId ? null : api.list("products", { eq: { tenant_id: tenantId }, order: ["category", "name"] })),
    [api, tenantId],
    { key: tenantId ? `products@${tenantId}` : null }
  );
  useLive(["products"], r.reload);

  // Ambil preferensi tenant untuk sakelar stasiun dapur
  const tenantQuery = useAsync(
    async () => {
      if (!api || !tenantId) return null;
      const [t] = await api.list("tenants", { eq: { id: tenantId } });
      return t || null;
    },
    [api, tenantId],
    { key: tenantId ? `tenant_cfg@${tenantId}` : null }
  );

  const tenantCfg = tenantQuery.data;
  const stationsEnabled = Boolean((tenant?.kds_enabled ?? tenantCfg?.kds_enabled ?? true) !== false && tenantCfg?.kitchen_stations_enabled);
  const availableStations =
    Array.isArray(tenantCfg?.kitchen_stations) && tenantCfg.kitchen_stations.length > 0
      ? tenantCfg.kitchen_stations
      : DEFAULT_STATIONS;

  const [edit, setEdit] = useState(null);
  const [imgConverting, setImgConverting] = useState(false);

  // State Bulk Import (.xlsx & .csv)
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const a = useAction();

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgConverting(true);
    try {
      const webpUrl = await convertToWebp(file);
      setEdit((prev) => ({ ...prev, image_url: webpUrl }));
    } catch (err) {
      a.setError(err.message || "Gagal mengonversi gambar ke WebP.");
    } finally {
      setImgConverting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = () =>
    a.run(async () => {
      const row = {
        ...edit,
        price: Number(edit.price),
        barcode: edit.barcode || null,
        station: stationsEnabled ? edit.station || "dapur" : "dapur",
        image_url: edit.image_url || null,
        description: edit.description || null,
      };

      if (row.id) {
        const { id, created_at, tenant_id, ...patch } = row;
        await api.update("products", id, patch);
      } else {
        await api.insert("products", { ...row, tenant_id: tenantId, is_available: true });
      }
      setEdit(null);
      r.reload();
    }, "Menu berhasil disimpan!");

  // Helper case-insensitive & whitespace-tolerant untuk membaca header spreadsheet
  const getRowVal = (row, ...keys) => {
    const cleanKeys = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
    for (const [k, v] of Object.entries(row)) {
      const cleanK = String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanKeys.includes(cleanK)) return v;
    }
    return undefined;
  };

  // Unduh Templat Resmi Excel SheetJS
  const downloadOfficialTemplate = () => {
    const rawData = [
      {
        SKU: "KOP-001",
        "Nama Menu": "Kopi Susu Gula Aren",
        Kategori: "Minuman",
        "Harga Jual": 22000,
        "Stasiun Dapur": "barista",
        Barcode: "8991234567890",
        "Deskripsi Menu": "Espresso arabika Toraja dengan susu segar dan gula aren murni.",
      },
      {
        SKU: "MKN-002",
        "Nama Menu": "Nasi Goreng Spesial",
        Kategori: "Makanan",
        "Harga Jual": 35000,
        "Stasiun Dapur": "dapur",
        Barcode: "",
        "Deskripsi Menu": "Nasi goreng bumbu kampung dengan suwiran ayam, telur mata sapi, dan acar.",
      },
      {
        SKU: "ROT-003",
        "Nama Menu": "Croissant Butter",
        Kategori: "Pastry",
        "Harga Jual": 28000,
        "Stasiun Dapur": "pastry",
        Barcode: "",
        "Deskripsi Menu": "Roti panggang mentega renyah khas Prancis.",
      },
    ];

    const templateData = stationsEnabled
      ? rawData
      : rawData.map(({ "Stasiun Dapur": _, ...rest }) => rest);

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Menu");
    XLSX.writeFile(wb, "Templat_Master_Menu_Tijarah.xlsx");
  };

  // Baca file Excel / CSV yang diunggah
  const processSpreadsheetFile = (file) => {
    if (!file) return;

    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

        if (!rawJson.length) {
          alert("Berkas Excel kosong atau tidak memiliki baris data.");
          return;
        }

        const existingSkus = new Set((r.data || []).map((p) => p.sku?.toUpperCase()));
        const parsed = rawJson.map((row, idx) => {
          const sku = String(getRowVal(row, "SKU", "sku") || "").trim().toUpperCase();
          const name = String(getRowVal(row, "Nama Menu", "Nama", "name", "Item", "Produk") || "").trim();
          const category = String(getRowVal(row, "Kategori", "category", "Kelompok") || "Makanan").trim();
          const priceRaw = getRowVal(row, "Harga Jual", "Harga", "price", "Price") || 0;
          const price = Number(String(priceRaw).replace(/[^0-9]/g, "")) || 0;
          const stationRaw = getRowVal(row, "Stasiun Dapur", "Stasiun", "station", "Kitchen Station", "Stasiun Pos") || "dapur";
          const station = String(stationRaw).trim().toLowerCase();
          const barcode = String(getRowVal(row, "Barcode", "barcode", "Kode Barcode") || "").trim();
          const description = String(getRowVal(row, "Deskripsi Menu", "Deskripsi", "description", "Keterangan") || "").trim();

          const errors = [];
          if (!sku) errors.push("SKU wajib diisi");
          if (!name) errors.push("Nama menu wajib diisi");
          if (price <= 0) errors.push("Harga jual harus lebih dari 0");
          if (existingSkus.has(sku)) errors.push("SKU sudah terdaftar di sistem");

          return {
            _id: `bulk_${idx}`,
            _selected: errors.length === 0,
            _errors: errors,
            sku,
            name,
            category: category || "Makanan",
            price,
            station: stationsEnabled ? (station || "dapur") : "dapur",
            barcode,
            description,
          };
        });

        setBulkRows(parsed);
      } catch (err) {
        alert("Gagal membaca berkas spreadsheet: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    processSpreadsheetFile(file);
  };

  // Simpan baris Bulk Import ke Supabase
  const saveBulkItems = () =>
    a.run(async () => {
      const selected = bulkRows.filter((r) => r._selected && r._errors.length === 0);
      if (!selected.length) throw new Error("Tidak ada baris menu valid yang dipilih.");

      setBulkProcessing(true);
      try {
        for (const item of selected) {
          await api.insert("products", {
            tenant_id: tenantId,
            sku: item.sku,
            name: item.name,
            category: item.category,
            price: item.price,
            station: stationsEnabled ? item.station : "dapur",
            barcode: item.barcode || null,
            description: item.description || null,
            is_available: true,
          });
        }
        setBulkModal(false);
        setBulkRows([]);
        setBulkFileName("");
        r.reload();
      } finally {
        setBulkProcessing(false);
      }
    }, `Berhasil mengimpor ${bulkRows.filter((r) => r._selected && r._errors.length === 0).length} menu produk!`);

  return (
    <>
      <PageHead
        eyebrow={`Fitur 3 · ${permOf(role, 3)?.label}`}
        title="Menu & harga jual"
        desc="Harga dihitung di server saat pesanan dibuat; kasir tidak bisa mengubah harga."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {isOwnerOrGm(role) && <BranchSelect b={b} label="Lokasi Cabang" />}
            {can(role, 3, "c") && (
              <>
                <button
                  type="button"
                  className="d-btn d-btn--ghost"
                  onClick={() => {
                    setBulkRows([]);
                    setBulkFileName("");
                    setBulkModal(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--color-paper, #ffffff)",
                    border: "1px solid var(--color-border, #cbd5e1)",
                    borderRadius: "var(--radius, 8px)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    fontWeight: 600,
                    color: "var(--color-ink, #0f172a)",
                    padding: "0.5rem 0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                    <line x1="10" y1="9" x2="14" y2="9" />
                  </svg>
                  <span>Bulk Import (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  onClick={() => setEdit({ ...EMPTY })}
                >
                  + Tambah menu
                </button>
              </>
            )}
          </div>
        }
      />

      <Panel>
        {r.loading && !r.data ? (
          <Loading />
        ) : r.error && !r.data ? (
          <ErrorNote error={r.error} onRetry={r.reload} />
        ) : !r.data ? (
          <Loading />
        ) : r.data.length === 0 ? (
          <Empty title="Belum ada menu produk">Tambahkan menu pertama Anda atau gunakan Bulk Import (.xlsx) untuk memulai.</Empty>
        ) : (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "48px" }}>Foto</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Menu</th>
                  <th scope="col">Kategori</th>
                  {stationsEnabled && <th scope="col">Stasiun</th>}
                  <th scope="col" className="d-num">Harga</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {r.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "6px",
                            objectFit: "cover",
                            border: "1px solid var(--color-border, #e2e8f0)",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "6px",
                            background: "var(--color-paper-2, #f1f5f9)",
                            border: "1px solid var(--color-border, #e2e8f0)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--color-muted, #94a3b8)",
                            fontSize: "0.8rem",
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="d-mono">{p.sku}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: "0.78rem", color: "var(--color-muted, #64748b)", marginTop: "0.15rem", maxWidth: "320px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td>{p.category}</td>
                    {stationsEnabled && <td className="d-mono">{p.station || "dapur"}</td>}
                    <td className="d-num">{rupiah(p.price)}</td>
                    <td>
                      <Badge tone={p.is_available ? "ok" : "danger"}>
                        {p.is_available ? "Tersedia" : "Habis (86)"}
                      </Badge>
                    </td>
                    <td className="d-row-actions">
                      {can(role, 3, "u") && (
                        <button
                          type="button"
                          className="d-btn d-btn--ghost d-btn--sm"
                          onClick={() =>
                            a.run(async () => {
                              await api.rpc("toggle_86", { p_product: p.id, p_available: !p.is_available });
                              r.reload();
                            })
                          }
                        >
                          {p.is_available ? "Tandai habis" : "Tersedia lagi"}
                        </button>
                      )}
                      {can(role, 3, "u") && (
                        <button
                          type="button"
                          className="d-btn d-btn--ghost d-btn--sm"
                          onClick={() =>
                            setEdit({
                              ...p,
                              barcode: p.barcode ?? "",
                              image_url: p.image_url ?? "",
                              description: p.description ?? "",
                              station: p.station ?? "dapur",
                            })
                          }
                        >
                          Ubah
                        </button>
                      )}
                      {can(role, 3, "d") && (
                        <button
                          type="button"
                          className="d-btn d-btn--danger-ghost d-btn--sm"
                          onClick={() =>
                            a.run(async () => {
                              await api.remove("products", p.id);
                              r.reload();
                            })
                          }
                        >
                          Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Feedback a={a} />
      </Panel>

      {/* MODAL TAMBAH / UBAH MENU */}
      <Modal
        open={Boolean(edit)}
        title={edit?.id ? "Ubah menu" : "Tambah menu"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={a.busy || imgConverting || !edit?.name || !edit?.sku || edit?.price === ""}
              onClick={save}
            >
              {a.busy ? "Menyimpan…" : "Simpan menu"}
            </button>
          </>
        }
      >
        {edit && (
          <div className="d-form">
            {/* Bagian Unggah Foto WebP */}
            <div style={{ padding: "0.85rem", background: "var(--color-paper-2, #f8fafc)", borderRadius: "var(--radius, 8px)", border: "1px solid var(--color-border, #e2e8f0)", marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", marginBottom: "0.5rem" }}>
                Foto Menu Produk (Otomatis Dikonversi ke WebP &lt; 50 KB)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                {edit.image_url ? (
                  <div style={{ position: "relative", width: "80px", height: "80px" }}>
                    <img
                      src={edit.image_url}
                      alt="Pratinjau Foto"
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        border: "1px solid var(--color-border, #cbd5e1)",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      borderRadius: "8px",
                      background: "var(--color-paper, #ffffff)",
                      border: "2px dashed var(--color-border, #cbd5e1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-muted, #94a3b8)",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleImageUpload}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="d-btn d-btn--ghost d-btn--sm"
                      disabled={imgConverting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {imgConverting ? "Mengonversi…" : edit.image_url ? "Ganti Foto" : "Pilih Foto"}
                    </button>
                    {edit.image_url && (
                      <button
                        type="button"
                        className="d-btn d-btn--danger-ghost d-btn--sm"
                        onClick={() => setEdit({ ...edit, image_url: "" })}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                    Format: PNG, JPG, JPEG, WEBP. Kompresi otomatis WebP 800×800 px.
                  </span>
                </div>
              </div>
            </div>

            <div className="d-form__row">
              <Field label="SKU" id="p-sku">
                <input
                  id="p-sku"
                  value={edit.sku}
                  onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Barcode (opsional)" id="p-bc">
                <input
                  id="p-bc"
                  value={edit.barcode}
                  onChange={(e) => setEdit({ ...edit, barcode: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Nama menu" id="p-n">
              <input
                id="p-n"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>

            <Field label="Deskripsi menu (komposisi, catatan rasa, info alergen)" id="p-desc">
              <textarea
                id="p-desc"
                rows="2"
                placeholder="Contoh: Espresso blend arabika toraja dengan susu segar dan gula aren murni."
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit", padding: "0.5rem", borderRadius: "var(--radius, 6px)", border: "1px solid var(--color-border, #cbd5e1)" }}
              />
            </Field>

            <div className="d-form__row">
              <Field label="Kategori" id="p-c">
                <input
                  id="p-c"
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                />
              </Field>
              {stationsEnabled && (
                <Field label="Stasiun dapur" id="p-s">
                  <select
                    id="p-s"
                    value={edit.station || "dapur"}
                    onChange={(e) => setEdit({ ...edit, station: e.target.value })}
                  >
                    {availableStations.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Harga jual (Rp, sebelum pajak)" id="p-p">
              <input
                id="p-p"
                inputMode="numeric"
                value={edit.price}
                onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/\D/g, "") })}
              />
            </Field>

            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* MODAL BULK IMPORT (.XLSX & .CSV) */}
      <Modal
        open={bulkModal}
        title="Bulk Import Menu Produk (.xlsx & .csv)"
        onClose={() => {
          if (bulkProcessing) return;
          setBulkModal(false);
          setBulkRows([]);
        }}
        style={{ maxWidth: "680px", width: "92vw" }}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--color-muted, #64748b)" }}>
              {bulkRows.length > 0 && (
                <span>
                  Terpilih: <strong>{bulkRows.filter((r) => r._selected && r._errors.length === 0).length}</strong> dari {bulkRows.length} baris
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                disabled={bulkProcessing}
                onClick={() => {
                  setBulkModal(false);
                  setBulkRows([]);
                }}
              >
                Batal
              </button>
              {bulkRows.length > 0 && (
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  disabled={bulkProcessing || bulkRows.filter((r) => r._selected && r._errors.length === 0).length === 0}
                  onClick={saveBulkItems}
                >
                  {bulkProcessing ? "Menyimpan ke Database…" : "Simpan Semua Menu Terpilih"}
                </button>
              )}
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* LANGKAH 1: UNDUH TEMPLAT RESMI */}
          <div
            style={{
              background: "var(--color-paper-2, #f8fafc)",
              padding: "0.85rem 1rem",
              borderRadius: "var(--radius, 8px)",
              border: "1px solid var(--color-border, #e2e8f0)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                1. Unduh Templat Excel Resmi
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--color-ink, #0f172a)", marginTop: "0.15rem" }}>
                Gunakan format resmi {stationsEnabled ? "(termasuk kolom Stasiun Dapur)" : "(tanpa kolom stasiun)"} agar data terbaca 100% presisi.
              </div>
            </div>
            <button
              type="button"
              className="d-btn d-btn--ghost d-btn--sm"
              onClick={downloadOfficialTemplate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "#ffffff",
                border: "1px solid #10b981",
                color: "#065f46",
                fontWeight: 600,
                borderRadius: "999px",
                padding: "0.4rem 0.85rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              <span>Unduh Templat (.xlsx)</span>
            </button>
          </div>

          {/* LANGKAH 2: DROPZONE AREA BERKAS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              2. Unggah Berkas (.xlsx &amp; .csv)
            </div>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={handleBulkFile}
            />
            <div
              onClick={() => bulkInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) processSpreadsheetFile(file);
              }}
              style={{
                border: isDragging ? "2px dashed #059669" : "2px dashed #10b981",
                borderRadius: "var(--radius, 10px)",
                background: isDragging ? "#ecfdf5" : "#f0fdf4",
                padding: "1.75rem 1rem",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 0.75rem",
                }}
              >
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#065f46", marginBottom: "0.25rem" }}>
                {bulkFileName ? `Berkas Terpilih: ${bulkFileName}` : "Letakkan berkas .xlsx atau .csv di sini, atau klik untuk memilih berkas"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#047857" }}>
                Format didukung: .xlsx, .xls, .csv · Maksimal 500 baris menu
              </div>
            </div>
          </div>

          {/* TABEL PRATINJAU DATA */}
          {bulkRows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Pratinjau Data ({bulkRows.length} baris)</h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={() =>
                      setBulkRows((prev) =>
                        prev.map((r) => (r._errors.length === 0 ? { ...r, _selected: true } : r))
                      )
                    }
                  >
                    Pilih Semua Valid
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={() => setBulkRows((prev) => prev.map((r) => ({ ...r, _selected: false })))}
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid var(--color-border, #cbd5e1)", borderRadius: "var(--radius, 6px)" }}>
                <table className="d-table" style={{ margin: 0, fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: "36px" }}>
                        <span className="sr-only">Pilih</span>
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">SKU</th>
                      <th scope="col">Nama Menu</th>
                      <th scope="col">Kategori</th>
                      {stationsEnabled && <th scope="col">Stasiun</th>}
                      <th scope="col" className="d-num">Harga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, idx) => (
                      <tr key={row._id} style={{ opacity: row._errors.length > 0 ? 0.75 : 1 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row._selected}
                            disabled={row._errors.length > 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBulkRows((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, _selected: checked } : item))
                              );
                            }}
                          />
                        </td>
                        <td>
                          {row._errors.length === 0 ? (
                            <Badge tone="ok">Valid</Badge>
                          ) : (
                            <Badge tone="danger">{row._errors.join(", ")}</Badge>
                          )}
                        </td>
                        <td className="d-mono">{row.sku}</td>
                        <td>
                          <strong>{row.name}</strong>
                          {row.description && (
                            <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                              {row.description}
                            </div>
                          )}
                        </td>
                        <td>{row.category}</td>
                        {stationsEnabled && <td className="d-mono">{row.station || "dapur"}</td>}
                        <td className="d-num">{rupiah(row.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
