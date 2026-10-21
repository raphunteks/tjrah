import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, pct } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Empty, Badge, Modal, clearAsyncCache } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex, useBranch, BranchSelect, qtyFmt, useLive } from "../../ops.jsx";
import { resolveItemPack } from "../../../lib/multiUom.js";

// ───────── Smart Unit Classification & Conversion Engine ─────────
export function getUnitCategory(rawUnit = "") {
  const u = (rawUnit || "").toLowerCase().trim();
  if (["kg", "kilogram", "g", "gr", "gram", "mg", "miligram", "milligram"].includes(u)) return "mass";
  if (["liter", "l", "ml", "mililiter", "milliliter", "cc"].includes(u)) return "volume";
  return "count";
}

export function getRecipeUnits(masterUnit = "") {
  const cat = getUnitCategory(masterUnit);
  if (cat === "mass") {
    // Sesuai kebutuhan resep: prioritas utama mg & g, tetap sertakan kg jika takaran grosir
    return [
      { value: "g", label: "g (gram) — Standar Resep", short: "g" },
      { value: "mg", label: "mg (miligram) — Dosis Mikro", short: "mg" },
      { value: "kg", label: "kg (kilogram) — Satuan Gudang", short: "kg" },
    ];
  }
  if (cat === "volume") {
    return [
      { value: "ml", label: "ml (mililiter) — Standar Porsi", short: "ml" },
      { value: "liter", label: "liter (L) — Satuan Curah", short: "liter" },
    ];
  }
  const clean = masterUnit || "pcs";
  return [{ value: clean, label: `${clean} (satuan gudang)`, short: clean }];
}

export function getDefaultRecipeUnit(masterUnit = "") {
  const cat = getUnitCategory(masterUnit);
  if (cat === "mass") return "g"; // Default gram untuk resep F&B
  if (cat === "volume") return "ml"; // Default mililiter untuk resep F&B
  return masterUnit || "pcs";
}

function formatNum(n, maxDec = 4) {
  if (n == null || isNaN(n)) return "0";
  return Number(Number(n).toFixed(maxDec)).toLocaleString("id-ID", {
    maximumFractionDigits: maxDec,
  });
}

export function convertRecipeQty(amount, fromUnit, toMasterUnit) {
  const num = parseFloat(String(amount ?? "").replace(/,/g, ".")) || 0;
  const from = (fromUnit || "").toLowerCase().trim();
  const to = (toMasterUnit || "").toLowerCase().trim();

  if (num <= 0) {
    return { baseQty: 0, factor: 1, formula: "", isConverted: false };
  }

  if (!to || from === to) {
    return { baseQty: num, factor: 1, formula: `${formatNum(num, 4)} ${from}`, isConverted: false };
  }

  // Mass scale in grams
  const massToGram = {
    kg: 1000,
    kilogram: 1000,
    g: 1,
    gr: 1,
    gram: 1,
    mg: 0.001,
    miligram: 0.001,
    milligram: 0.001,
  };

  if (massToGram[from] && massToGram[to]) {
    const inGrams = num * massToGram[from];
    const baseQty = inGrams / massToGram[to];
    return {
      baseQty,
      factor: massToGram[from] / massToGram[to],
      formula: `${formatNum(num, 2)} ${from} = ${formatNum(baseQty, 6)} ${to}`,
      isConverted: from !== to,
    };
  }

  // Volume scale in ml
  const volumeToMl = {
    liter: 1000,
    l: 1000,
    ml: 1,
    mililiter: 1,
    milliliter: 1,
    cc: 1,
  };

  if (volumeToMl[from] && volumeToMl[to]) {
    const inMl = num * volumeToMl[from];
    const baseQty = inMl / volumeToMl[to];
    return {
      baseQty,
      factor: volumeToMl[from] / volumeToMl[to],
      formula: `${formatNum(num, 2)} ${from} = ${formatNum(baseQty, 6)} ${to}`,
      isConverted: from !== to,
    };
  }

  return { baseQty: num, factor: 1, formula: `${formatNum(num, 4)} ${from}`, isConverted: false };
}

export function formatRecipeDisplay(qty, masterUnit) {
  const q = Number(qty) || 0;
  const u = (masterUnit || "").toLowerCase().trim();

  if (u === "kg" || u === "kilogram") {
    if (q > 0 && q < 0.001) {
      const mg = Math.round(q * 1000000 * 100) / 100;
      return { main: `${formatNum(mg, 2)} mg`, sub: `${formatNum(q, 4)} kg master` };
    }
    if (q > 0 && q < 1) {
      const g = Math.round(q * 1000 * 100) / 100;
      return { main: `${formatNum(g, 2)} g`, sub: `${formatNum(q, 4)} kg master` };
    }
    return { main: `${formatNum(q, 2)} kg`, sub: null };
  }

  if (u === "g" || u === "gram" || u === "gr") {
    if (q > 0 && q < 1) {
      const mg = Math.round(q * 1000 * 100) / 100;
      return { main: `${formatNum(mg, 2)} mg`, sub: `${formatNum(q, 3)} g master` };
    }
    return { main: `${formatNum(q, 2)} g`, sub: null };
  }

  if (u === "liter" || u === "l") {
    if (q > 0 && q < 1) {
      const ml = Math.round(q * 1000 * 100) / 100;
      return { main: `${formatNum(ml, 2)} ml`, sub: `${formatNum(q, 4)} liter master` };
    }
    return { main: `${formatNum(q, 2)} liter`, sub: null };
  }

  return { main: qtyFmt(q, masterUnit), sub: null };
}

export function RecipeSkeleton() {
  return (
    <div className="bom" style={{ opacity: 0.95 }}>
      <nav className="bom-list" aria-label="Memuat daftar resep">
        <p className="d-nav__label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ color: "var(--color-accent, #059669)" }} aria-hidden="true" />
          <span>Menu</span>
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[1, 2, 3, 4].map((i) => (
            <li key={i} style={{ marginBottom: "0.4rem" }}>
              <div
                style={{
                  height: "36px",
                  borderRadius: "var(--radius-sm, 6px)",
                  background: "var(--color-rule, #e2e8f0)",
                  opacity: 0.6
                }}
              />
            </li>
          ))}
        </ul>
      </nav>

      <Panel title="Memuat Resep & BOM..." meta="Sinkronisasi data resep dan takaran bahan baku...">
        <div style={{ padding: "1.5rem 0" }}>
          <Loading label="Menghubungkan ke database dan mengalkulasi HPP otomatis..." />
        </div>
      </Panel>
    </div>
  );
}

export default function Recipes() {
  const { api, role, tenantId } = useAuth();
  const b = useBranch({ warehouses: true });
  const r = useAsync(async () => {
    const [products, items, lines] = await Promise.all([
      api.list("products", { eq: { tenant_id: tenantId }, order: ["name"] }),
      api.list("inventory_items", { eq: { tenant_id: tenantId }, order: ["name"] }),
      api.list("bom_lines", { eq: { tenant_id: tenantId } }),
    ]);
    return {
      products: Array.isArray(products) ? products : [],
      items: Array.isArray(items) ? items : [],
      lines: Array.isArray(lines) ? lines : [],
    };
  }, [api, tenantId], { key: `recipes@${tenantId || "default"}` });
  useLive(["products", "inventory_items", "bom_lines"], r.reload);

  const [sel, setSel] = useState(null); // { kind: "product"|"item", id }
  const [add, setAdd] = useState({ component: "", qty: "", unit: "g" });
  const [batches, setBatches] = useState("1");
  const [editLine, setEditLine] = useState(null); // { line, item, qty, unit }

  const a = useAction();
  const d = r.data || { products: [], items: [], lines: [] };
  const items = useIndex(d.items);
  const cur = sel ?? (d.products?.[0] ? { kind: "product", id: d.products[0].id } : null);
  const lines = useMemo(() => (d && cur ? d.lines.filter((l) => (cur.kind === "product" ? l.product_id === cur.id : l.parent_item_id === cur.id)) : []), [d, cur]);
  const cost = lines.reduce((s, l) => s + l.qty * (items[l.component_id]?.cost_per_unit ?? 0), 0);
  const product = cur?.kind === "product" ? d.products.find((p) => p.id === cur.id) : null;
  const semi = cur?.kind === "item" ? items[cur.id] : null;
  const editable = can(role, 4, "u");

  // Selected item info for addition form
  const selectedAdd = add.component ? items[add.component] : null;
  const smartUnits = useMemo(() => getRecipeUnits(selectedAdd?.unit), [selectedAdd]);
  const currentAddUnit = add.unit || getDefaultRecipeUnit(selectedAdd?.unit);

  // Live Auto-Conversion & Cost for Add Form
  const addConversion = useMemo(() => {
    if (!selectedAdd || !add.qty) return null;
    return convertRecipeQty(add.qty, currentAddUnit, selectedAdd.unit);
  }, [selectedAdd, add.qty, currentAddUnit]);

  const addLineCost = useMemo(() => {
    if (!addConversion || !selectedAdd) return 0;
    return addConversion.baseQty * (selectedAdd.cost_per_unit ?? 0);
  }, [addConversion, selectedAdd]);

  // Handle component selection in add form
  const handleComponentChange = (cid) => {
    const it = items[cid];
    const defU = it ? getDefaultRecipeUnit(it.unit) : "g";
    setAdd({ component: cid, qty: add.qty, unit: defU });
  };

  const addLine = () => a.run(async () => {
    if (!selectedAdd || !add.qty) return;
    const { baseQty } = convertRecipeQty(add.qty, currentAddUnit, selectedAdd.unit);
    await api.insert("bom_lines", {
      tenant_id: tenantId,
      product_id: cur.kind === "product" ? cur.id : null,
      parent_item_id: cur.kind === "item" ? cur.id : null,
      component_id: add.component,
      qty: Number(baseQty.toFixed(6)),
      yield_qty: lines[0]?.yield_qty ?? 1,
    });
    clearAsyncCache(`recipes@${tenantId}`);
    setAdd({ component: "", qty: "", unit: "g" });
    r.reload();
  });

  // Handle editing of an existing recipe line
  const openEdit = (l) => {
    const it = items[l.component_id];
    if (!it) return;
    const cat = getUnitCategory(it.unit);
    let initQty = l.qty;
    let initUnit = it.unit;

    if (cat === "mass") {
      const u = (it.unit || "").toLowerCase();
      if (u === "kg") {
        if (l.qty < 0.001) { initQty = String(Math.round(l.qty * 1000000 * 100) / 100); initUnit = "mg"; }
        else if (l.qty < 1) { initQty = String(Math.round(l.qty * 1000 * 100) / 100); initUnit = "g"; }
        else { initQty = String(l.qty); initUnit = "kg"; }
      } else if (u === "g") {
        if (l.qty < 1) { initQty = String(Math.round(l.qty * 1000 * 100) / 100); initUnit = "mg"; }
        else { initQty = String(l.qty); initUnit = "g"; }
      }
    } else if (cat === "volume") {
      const u = (it.unit || "").toLowerCase();
      if (u === "liter" || u === "l") {
        if (l.qty < 1) { initQty = String(Math.round(l.qty * 1000 * 100) / 100); initUnit = "ml"; }
        else { initQty = String(l.qty); initUnit = "liter"; }
      }
    }

    setEditLine({
      id: l.id,
      component_id: l.component_id,
      item: it,
      qty: String(initQty),
      unit: initUnit,
    });
  };

  const saveEdit = () => a.run(async () => {
    if (!editLine || !editLine.qty) return;
    const { baseQty } = convertRecipeQty(editLine.qty, editLine.unit, editLine.item.unit);
    await api.update("bom_lines", editLine.id, {
      qty: Number(baseQty.toFixed(6)),
    });
    clearAsyncCache(`recipes@${tenantId}`);
    setEditLine(null);
    r.reload();
  });

  // Edit conversion calculation
  const editConversion = useMemo(() => {
    if (!editLine || !editLine.qty) return null;
    return convertRecipeQty(editLine.qty, editLine.unit, editLine.item?.unit);
  }, [editLine]);

  const editLineCost = useMemo(() => {
    if (!editConversion || !editLine?.item) return 0;
    return editConversion.baseQty * (editLine.item.cost_per_unit ?? 0);
  }, [editConversion, editLine]);

  return (
    <>
      <PageHead
        eyebrow={`Fitur 4 · ${permOf(role, 4)?.label}`}
        title="Resep & BOM"
        desc="Setiap porsi terjual memotong bahan baku sesuai takaran. Sistem secara cerdas mengonversi satuan resep (mg, g, ml) ke satuan stok gudang dan menghitung biaya HPP secara otomatis."
        actions={<BranchSelect b={b} label="Lokasi Cabang" />}
      />
      {r.loading && !r.data ? (
        <RecipeSkeleton />
      ) : r.error && !r.data ? (
        <ErrorNote error={r.error} onRetry={r.reload} />
      ) : (
        <div className="bom">
          <nav className="bom-list" aria-label="Daftar resep">
            <p className="d-nav__label">Menu</p>
            <ul>{d.products.map((p) => <li key={p.id}><button type="button" className={cur?.id === p.id ? "is-active" : undefined} onClick={() => setSel({ kind: "product", id: p.id })}>{p.name}</button></li>)}</ul>
            <p className="d-nav__label">Barang setengah jadi</p>
            <ul>{d.items.filter((i) => i.is_semi).map((i) => <li key={i.id}><button type="button" className={cur?.id === i.id ? "is-active" : undefined} onClick={() => setSel({ kind: "item", id: i.id })}>{i.name}</button></li>)}</ul>
          </nav>

          <Panel
            title={product?.name ?? semi?.name ?? "Pilih resep"}
            meta={product ? `Harga jual ${rupiah(product.price)}` : semi ? `Hasil per batch ${qtyFmt(lines[0]?.yield_qty ?? 0, semi.unit)}` : ""}
          >
            {lines.length === 0 ? <Empty title="Resep belum diisi">Tambahkan komponen bahan di bawah dengan takaran gramatur (mg / g).</Empty> : (
              <div className="d-table-wrap">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th scope="col">Bahan</th>
                      <th scope="col" className="d-num">Takaran</th>
                      <th scope="col" className="d-num">Biaya</th>
                      <th scope="col"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const it = items[l.component_id];
                      const display = formatRecipeDisplay(l.qty, it?.unit);
                      const lineCost = l.qty * (it?.cost_per_unit ?? 0);
                      return (
                        <tr key={l.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 500 }}>{it?.name}</span>
                              {it?.is_semi && <Badge tone="accent">sub-resep</Badge>}
                              {it?.unit && (
                                <span className="d-badge d-badge--muted" style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                                  Stok: {it.unit}
                                </span>
                              )}
                              {resolveItemPack(it) && (
                                <span className="d-badge d-badge--muted" style={{ fontSize: "0.7rem", background: "rgba(5, 150, 105, 0.08)", color: "var(--color-brand, #059669)", border: "1px solid rgba(5, 150, 105, 0.2)" }}>
                                  1 {resolveItemPack(it).packUnit} = {Number(resolveItemPack(it).ratio).toLocaleString("id-ID")} {it?.unit}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="d-num">
                            <span style={{ fontWeight: 600 }}>{display.main}</span>
                            {display.sub && (
                              <div className="d-muted" style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                                {display.sub}
                              </div>
                            )}
                          </td>
                          <td className="d-num">
                            <span className="d-mono" style={{ fontWeight: 600 }}>{rupiah(lineCost)}</span>
                            {it?.cost_per_unit != null && (
                              <div className="d-muted" style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                                @{rupiah(it.cost_per_unit)}/{it.unit}
                              </div>
                            )}
                          </td>
                          <td className="d-row-actions">
                            {can(role, 4, "u") && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                onClick={() => openEdit(l)}
                                title="Ubah takaran bahan"
                              >
                                Ubah
                              </button>
                            )}
                            {can(role, 4, "d") && (
                              <button
                                type="button"
                                className="d-btn d-btn--danger-ghost d-btn--sm"
                                onClick={() => a.run(async () => { await api.remove("bom_lines", l.id); clearAsyncCache(`recipes@${tenantId}`); r.reload(); })}
                              >
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <ul className="d-list" style={{ marginTop: "1rem" }}>
              <li>
                <span>{product ? "HPP per porsi" : "Biaya per batch"}</span>
                <strong className="d-mono" style={{ fontSize: "1.05rem" }}>{rupiah(cost)}</strong>
              </li>
              {product && (
                <li>
                  <span>Marjin kotor</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Badge tone={(product.price - cost) / product.price >= 0.6 ? "ok" : (product.price - cost) / product.price >= 0.4 ? "accent" : "danger"}>
                      {pct((product.price - cost) / product.price)}
                    </Badge>
                    <span className="d-muted" style={{ fontSize: "0.8rem" }}>
                      (Laba: {rupiah(product.price - cost)})
                    </span>
                  </div>
                </li>
              )}
              {semi && <li><span>Biaya per {semi.unit}</span><strong className="d-mono">{rupiah(cost / (lines[0]?.yield_qty || 1))}</strong></li>}
            </ul>

            {/* ───────── Form Tambah Bahan dengan Smart Auto-Konversi & Biaya ───────── */}
            {editable && cur && (
              <div style={{ marginTop: "1.5rem", borderTop: "1px dashed var(--color-rule, #e2e8f0)", paddingTop: "1.25rem" }}>
                <p style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--color-ink, #0f172a)" }}>
                  + Tambah Komponen Bahan (Smart Auto-Konversi)
                </p>
                <div className="d-form__row d-form__row--4">
                  <Field label="Bahan" id="bom-c">
                    <select
                      id="bom-c"
                      value={add.component}
                      onChange={(e) => handleComponentChange(e.target.value)}
                    >
                      <option value="">Pilih bahan…</option>
                      {d.items.filter((i) => i.id !== cur.id).map((i) => {
                        const p = resolveItemPack(i);
                        return (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit}) — {rupiah(i.cost_per_unit)}/{i.unit} {p ? `[1 ${p.packUnit} = ${Number(p.ratio).toLocaleString("id-ID")} ${i.unit}]` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </Field>

                  <Field label="Takaran" id="bom-q">
                    <input
                      id="bom-q"
                      inputMode="decimal"
                      placeholder="Contoh: 18"
                      value={add.qty}
                      onChange={(e) => setAdd({ ...add, qty: e.target.value.replace(/[^\d.,]/g, "") })}
                    />
                  </Field>

                  <Field label="Satuan" id="bom-u">
                    <select
                      id="bom-u"
                      value={currentAddUnit}
                      onChange={(e) => setAdd({ ...add, unit: e.target.value })}
                      disabled={!selectedAdd}
                    >
                      {smartUnits.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <button
                    type="button"
                    className="d-btn d-btn--primary d-self-end"
                    disabled={!add.component || !add.qty || a.busy}
                    onClick={addLine}
                  >
                    Tambah bahan
                  </button>
                </div>

                {/* Quick Unit Selector Pills (mg & g) for quick one-click selection */}
                {selectedAdd && getUnitCategory(selectedAdd.unit) === "mass" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>Satuan Cepat:</span>
                    <button
                      type="button"
                      className={`d-chip ${currentAddUnit === "g" ? "is-on" : ""}`}
                      onClick={() => setAdd({ ...add, unit: "g" })}
                      style={{ height: "1.75rem", padding: "0 0.65rem", fontSize: "0.75rem" }}
                    >
                      g (gram)
                    </button>
                    <button
                      type="button"
                      className={`d-chip ${currentAddUnit === "mg" ? "is-on" : ""}`}
                      onClick={() => setAdd({ ...add, unit: "mg" })}
                      style={{ height: "1.75rem", padding: "0 0.65rem", fontSize: "0.75rem" }}
                    >
                      mg (miligram)
                    </button>
                    <button
                      type="button"
                      className={`d-chip ${currentAddUnit === "kg" ? "is-on" : ""}`}
                      onClick={() => setAdd({ ...add, unit: "kg" })}
                      style={{ height: "1.75rem", padding: "0 0.65rem", fontSize: "0.75rem" }}
                    >
                      kg (stok master)
                    </button>
                  </div>
                )}

                {/* Smart Live Conversion & Estimated Cost Preview Card */}
                {addConversion && selectedAdd && Number(add.qty) > 0 && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-md, 8px)",
                      background: "var(--color-paper-2, #f8fafc)",
                      border: "1px solid var(--color-rule-2, #cbd5e1)",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <i className="fa-solid fa-bolt" style={{ fontSize: "1.2rem", color: "#f59e0b" }} />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.85rem", color: "var(--color-ink, #0f172a)" }}>
                            Auto-Konversi:
                          </strong>
                          <span className="d-badge d-badge--accent" style={{ fontWeight: 600 }}>
                            {add.qty} {currentAddUnit} = {formatNum(addConversion.baseQty, 6)} {selectedAdd.unit}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                            (satuan gudang)
                          </span>
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                          Harga master: {rupiah(selectedAdd.cost_per_unit)} / {selectedAdd.unit}
                          {addConversion.isConverted && ` · Rumus: ${addConversion.formula}`}
                        </p>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                        Biaya Takaran Otomatis
                      </div>
                      <div className="d-mono" style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-accent, #ea580c)" }}>
                        {rupiah(addLineCost)}
                      </div>
                      {product && (
                        <div style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>
                          Proyeksi HPP: {rupiah(cost + addLineCost)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Batch Production Form for Semi-finished goods */}
            {semi && can(role, 10, "u") && !permOf(role, 10)?.scope && (
              <div className="d-form__row d-form__row--3" style={{ marginTop: "1.5rem" }}>
                <BranchSelect b={b} label="Produksi di" />
                <Field label="Jumlah batch" id="bom-b">
                  <input
                    id="bom-b"
                    inputMode="decimal"
                    value={batches}
                    onChange={(e) => setBatches(e.target.value.replace(/[^\d.]/g, ""))}
                  />
                </Field>
                <button
                  type="button"
                  className="d-btn d-btn--primary d-self-end"
                  disabled={!batches || a.busy}
                  onClick={() =>
                    a.run(
                      async () => {
                        const y = await api.rpc("produce_semi", {
                          p_branch: b.branchId,
                          p_item: semi.id,
                          p_batches: Number(batches),
                        });
                        r.reload();
                        return y;
                      },
                      (y) => `${qtyFmt(y, semi.unit)} ${semi.name} masuk stok`
                    )
                  }
                >
                  Produksi
                </button>
              </div>
            )}
            <Feedback a={a} />
          </Panel>
        </div>
      )}

      {/* ───────── Modal Ubah Takaran Resep ───────── */}
      <Modal
        open={Boolean(editLine)}
        title="Ubah Takaran Resep"
        onClose={() => setEditLine(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setEditLine(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={!editLine?.qty || a.busy}
              onClick={saveEdit}
            >
              Simpan Perubahan
            </button>
          </>
        }
      >
        {editLine && (
          <div className="d-form">
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--color-ink, #0f172a)" }}>
              Komponen: <strong>{editLine.item.name}</strong> (Stok Gudang: <strong>{editLine.item.unit}</strong> @ {rupiah(editLine.item.cost_per_unit)}/{editLine.item.unit})
            </p>

            <div className="d-form__row">
              <Field label="Takaran Baru" id="edit-bom-q">
                <input
                  id="edit-bom-q"
                  inputMode="decimal"
                  value={editLine.qty}
                  onChange={(e) => setEditLine({ ...editLine, qty: e.target.value.replace(/[^\d.,]/g, "") })}
                />
              </Field>

              <Field label="Satuan Resep" id="edit-bom-u">
                <select
                  id="edit-bom-u"
                  value={editLine.unit}
                  onChange={(e) => setEditLine({ ...editLine, unit: e.target.value })}
                >
                  {getRecipeUnits(editLine.item.unit).map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Quick Pills in Edit Modal */}
            {getUnitCategory(editLine.item.unit) === "mass" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "-0.25rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>Satuan Cepat:</span>
                <button
                  type="button"
                  className={`d-chip ${editLine.unit === "g" ? "is-on" : ""}`}
                  onClick={() => setEditLine({ ...editLine, unit: "g" })}
                  style={{ height: "1.75rem", padding: "0 0.65rem", fontSize: "0.75rem" }}
                >
                  g (gram)
                </button>
                <button
                  type="button"
                  className={`d-chip ${editLine.unit === "mg" ? "is-on" : ""}`}
                  onClick={() => setEditLine({ ...editLine, unit: "mg" })}
                  style={{ height: "1.75rem", padding: "0 0.65rem", fontSize: "0.75rem" }}
                >
                  mg (miligram)
                </button>
              </div>
            )}

            {/* Live Auto-Conversion in Edit Modal */}
            {editConversion && editLine.item && Number(editLine.qty) > 0 && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-md, 8px)",
                  background: "var(--color-paper-2, #f8fafc)",
                  border: "1px solid var(--color-rule-2, #cbd5e1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                    {editLine.qty} {editLine.unit} = {formatNum(editConversion.baseQty, 6)} {editLine.item.unit}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)", marginTop: "2px" }}>
                    Dikonversi ke unit gudang ({editLine.item.unit})
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>Biaya Baru</div>
                  <div className="d-mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--color-accent, #ea580c)" }}>
                    {rupiah(editLineCost)}
                  </div>
                </div>
              </div>
            )}
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </>
  );
}
