import { useState, useEffect } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useRouter } from "../../../lib/router.jsx";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";
import BranchMapPicker from "../../ui/BranchMapPicker.jsx";
import { getDeviceLocationSync, requestDeviceLocation, reverseGeocode } from "../../../lib/geo.js";

const BLANK_FORM = {
  name: "",
  city: "",
  address: "",
  lat: "",
  lng: "",
  geofence_m: "50",
  is_warehouse: false,
  clone_from: "",
  satusehat_location_id: "",
};

export default function Branches() {
  const { api, tenant, role } = useAuth();
  const { navigate } = useRouter();
  const a = useAction();
  const [modal, setModal] = useState(null); // 'create' | { edit: row }
  const [f, setF] = useState(BLANK_FORM);
  const [geoLoading, setGeoLoading] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);

  const overview = useAsync(async () => {
    try {
      return await api.ownerBranchOverview();
    } catch {
      // Fallback
      const br = await api.listBranches(tenant?.id);
      return {
        quota: { used: br.length, max: 5, plan_name: "Standard" },
        branches: br.map((b) => ({ ...b, staff_count: 0, today_orders: 0, today_sales: 0 })),
      };
    }
  }, [api, tenant?.id], { key: `branch_overview@${tenant?.id}` });

  useLive(["branches", "profiles", "orders"], overview.reload);

  // Auto-reverse geocode alamat cabang yang memiliki koordinat namun alamatnya masih kosong di DB
  useEffect(() => {
    if (!overview.data?.branches) return;
    const branchesWithMissingAddr = overview.data.branches.filter(
      (b) => b.lat != null && b.lng != null && !b.address
    );
    if (branchesWithMissingAddr.length === 0) return;

    let mounted = true;
    (async () => {
      for (const b of branchesWithMissingAddr) {
        try {
          const res = await reverseGeocode(b.lat, b.lng);
          if (res && (res.road || res.address) && mounted) {
            await api.updateBranch(b.id, {
              address: res.road || res.address,
              city: b.city || res.city || "Makassar",
            });
            overview.reload();
          }
        } catch {}
      }
    })();
    return () => {
      mounted = false;
    };
  }, [overview.data?.branches]);

  const openCreate = async () => {
    // 1. Ambil lokasi perangkat owner yang telah di-cache saat dashboard dibuka
    const cachedGeo = getDeviceLocationSync();
    const initLat = cachedGeo?.lat != null ? String(cachedGeo.lat.toFixed(6)) : "";
    const initLng = cachedGeo?.lng != null ? String(cachedGeo.lng.toFixed(6)) : "";
    const initAddr = cachedGeo?.road || cachedGeo?.address || "";
    const initCity = cachedGeo?.city || "Makassar";

    setF({
      ...BLANK_FORM,
      lat: initLat,
      lng: initLng,
      address: initAddr,
      city: initCity,
      clone_from: overview.data?.branches?.[0]?.id || "",
    });
    setShowManualCoords(false);
    setMapPickerOpen(false);
    setModal("create");

    // 2. Jika belum ada koordinat tersimpan, minta izin geolokasi secara real-time
    if (!initLat || !initLng) {
      setGeoLoading(true);
      try {
        const geo = await requestDeviceLocation();
        if (geo && geo.lat && geo.lng) {
          setF((prev) => ({
            ...prev,
            lat: String(geo.lat.toFixed(6)),
            lng: String(geo.lng.toFixed(6)),
            city: prev.city || geo.city || "Makassar",
            address: prev.address || geo.road || geo.address || "",
          }));
        }
      } catch {} finally {
        setGeoLoading(false);
      }
    }
  };

  const openEdit = async (b) => {
    const bLat = b.lat != null && !isNaN(Number(b.lat)) ? String(Number(b.lat).toFixed(6)) : "";
    const bLng = b.lng != null && !isNaN(Number(b.lng)) ? String(Number(b.lng).toFixed(6)) : "";
    const bAddr = b.address || "";
    const bCity = b.city || "";

    setF({
      name: b.name || "",
      city: bCity,
      address: bAddr,
      lat: bLat,
      lng: bLng,
      geofence_m: String(b.geofence_m || 50),
      is_warehouse: Boolean(b.is_warehouse),
      clone_from: "",
      satusehat_location_id: b.satusehat_location_id || "",
    });
    setShowManualCoords(false);
    setMapPickerOpen(false);
    setModal({ edit: b });

    // Jika koordinat ada tapi alamat kosong di DB, lakukan reverse-geocode otomatis
    if (!bAddr && bLat && bLng) {
      try {
        const res = await reverseGeocode(Number(bLat), Number(bLng));
        if (res && (res.road || res.address)) {
          setF((prev) => ({
            ...prev,
            address: prev.address || res.road || res.address,
            city: prev.city || res.city || "Makassar",
          }));
        }
      } catch {}
    }
  };

  const getGeoLocation = async () => {
    setGeoLoading(true);
    try {
      const geo = await requestDeviceLocation(true);
      if (geo && geo.lat && geo.lng) {
        setF((prev) => ({
          ...prev,
          lat: String(geo.lat.toFixed(6)),
          lng: String(geo.lng.toFixed(6)),
          city: prev.city || geo.city || "Makassar",
          address: geo.road || geo.address || prev.address,
        }));
      } else {
        alert("Tidak dapat mendeteksi lokasi GPS perangkat. Pastikan izin lokasi browser telah diaktifkan.");
      }
    } catch (err) {
      alert(`Gagal mengambil koordinat: ${err?.message || err}`);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSave = () => {
    if (!f.name.trim()) return;
    a.run(async () => {
      if (modal === "create") {
        await api.createBranch({
          name: f.name.trim(),
          city: f.city.trim(),
          address: f.address.trim(),
          lat: f.lat ? Number(f.lat) : null,
          lng: f.lng ? Number(f.lng) : null,
          geofence_m: Number(f.geofence_m) || 50,
          is_warehouse: f.is_warehouse,
          clone_from: f.clone_from || null,
          satusehat_location_id: f.satusehat_location_id?.trim() || null,
        });
      } else if (modal?.edit) {
        await api.updateBranch(modal.edit.id, {
          name: f.name.trim(),
          city: f.city.trim(),
          address: f.address.trim(),
          lat: f.lat ? Number(f.lat) : null,
          lng: f.lng ? Number(f.lng) : null,
          geofence_m: Number(f.geofence_m) || 50,
          is_warehouse: f.is_warehouse,
          satusehat_location_id: f.satusehat_location_id?.trim() || null,
        });
      }
      setModal(null);
      overview.reload();
    }, modal === "create" ? "Cabang berhasil dibuat" : "Data cabang diperbarui");
  };

  const quota = overview.data?.quota || { used: 0, max: 1, plan_name: "Starter" };
  const branches = overview.data?.branches || [];
  const isQuotaFull = quota.used >= quota.max;
  const isHealth = tenant?.pillar === "health";

  return (
    <>
      <PageHead
        eyebrow="Bisnis · Multi-Cabang"
        title="Kelola Cabang & Lokasi"
        desc="Kelola outlet penjualan, gudang bahan sentral, radius GPS geofencing kehadiran staf, dan pantau omzet real-time per cabang."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={openCreate}
              disabled={isQuotaFull}
              title={isQuotaFull ? "Batas maksimal cabang telah tercapai" : "Tambah cabang baru"}
            >
              + Tambah Cabang
            </button>
          </div>
        }
      />

      {/* Kuota Cabang Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "1rem 1.25rem",
          background: isQuotaFull ? "var(--color-warn-soft, #fef3c7)" : "var(--color-paper-2, #f8fafc)",
          border: `1px solid ${isQuotaFull ? "var(--color-warn, #f59e0b)" : "var(--color-rule, #e2e8f0)"}`,
          borderRadius: "var(--radius-lg, 12px)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.9375rem", color: "var(--color-ink, #0f172a)" }}>
              Kapasitas Cabang: {quota.used} dari {quota.max} Terpakai
            </strong>
            <Badge tone={isQuotaFull ? "warn" : "accent"}>{quota.plan_name}</Badge>
          </div>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--color-muted, #64748b)" }}>
            {isQuotaFull
              ? "Kuota cabang paket Anda telah penuh. Tingkatkan paket untuk memperluas jaringan cabang usaha Anda."
              : `Anda masih dapat menambahkan ${quota.max - quota.used} cabang tambahan dalam paket ini.`}
          </p>
        </div>
        {isQuotaFull && (
          <button
            type="button"
            className="d-btn d-btn--ghost d-btn--sm"
            onClick={() => navigate("/app/langganan")}
          >
            Upgrade Paket
          </button>
        )}
      </div>

      <Panel
        title="Daftar Cabang Aktif"
        meta={`${branches.length} lokasi terdaftar`}
      >
        {overview.loading && !overview.data ? (
          <Loading />
        ) : overview.error ? (
          <ErrorNote error={overview.error} onRetry={overview.reload} />
        ) : branches.length === 0 ? (
          <Empty
            title="Belum ada cabang terdaftar"
            desc="Tekan tombol Tambah Cabang untuk mendaftarkan outlet pertama Anda."
          />
        ) : (
          <div
            className="d-table-wrap d-table-wrap--contained"
            style={{ margin: 0, borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-rule, #e2e8f0)", overflowX: "auto" }}
          >
            <table className="d-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-paper-2, #f1f5f9)" }}>
                  <th scope="col" style={{ width: "25%" }}>NAMA CABANG</th>
                  <th scope="col" style={{ width: "15%" }}>FUNGSI / TIPE</th>
                  <th scope="col" style={{ width: "25%" }}>LOKASI & GEOFENCE</th>
                  <th scope="col" style={{ width: "10%" }} className="d-num">STAF</th>
                  <th scope="col" style={{ width: "15%" }} className="d-num">OMZET HARI INI</th>
                  <th scope="col" style={{ width: "10%", textAlign: "right" }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--color-rule, #e2e8f0)" }}>
                    <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                      <div style={{ fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)", marginTop: "0.2rem" }}>
                        ID: {b.id.slice(0, 8)}…
                      </div>
                      {b.satusehat_location_id && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <span className="d-badge d-badge--ok" style={{ fontSize: "0.6875rem" }}>
                            SATUSEHAT: {b.satusehat_location_id}
                          </span>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                      {b.is_warehouse ? (
                        <Badge tone="neutral">Gudang Bahan</Badge>
                      ) : (
                        <Badge tone="accent">Outlet POS</Badge>
                      )}
                    </td>

                    <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                      <div style={{ fontSize: "0.8125rem", color: "var(--color-ink, #334155)" }}>
                        {b.city ? <strong>{b.city}</strong> : "—"}
                        {b.address && <span>, {b.address}</span>}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)", marginTop: "0.25rem" }}>
                        {b.lat != null && b.lng != null && !isNaN(Number(b.lat)) && !isNaN(Number(b.lng)) ? (
                          <a
                            href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--color-accent, #0B5D4B)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600 }}
                            title="Buka titik koordinat di Google Maps"
                          >
                            <span>📍</span>
                            <span>{Number(b.lat).toFixed(6)}, {Number(b.lng).toFixed(6)}</span>
                            <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(Radius {b.geofence_m || 50}m)</span>
                          </a>
                        ) : (
                          <span style={{ fontStyle: "italic", color: "var(--color-warn, #b45309)" }}>Titik GPS belum diatur</span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: "0.875rem var(--space-md, 1rem)", textAlign: "right" }}>
                      <strong style={{ fontSize: "0.875rem" }}>{b.staff_count ?? 0}</strong> Staf
                    </td>

                    <td style={{ padding: "0.875rem var(--space-md, 1rem)", textAlign: "right" }}>
                      <div style={{ fontWeight: 600, color: "var(--color-ink, #0f172a)", fontSize: "0.875rem" }}>
                        {rupiah(b.today_sales ?? 0)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                        {b.today_orders ?? 0} pesanan
                      </div>
                    </td>

                    <td style={{ padding: "0.875rem var(--space-md, 1rem)", textAlign: "right" }}>
                      <button
                        type="button"
                        className="d-btn d-btn--subtle"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => openEdit(b)}
                      >
                        Ubah Info
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Modal Buat / Edit Cabang */}
      {modal && (
        <Modal
          open
          hidden={mapPickerOpen}
          title={modal === "create" ? "Tambah Cabang Baru" : `Ubah Info: ${modal.edit?.name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => setModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={a.busy || !f.name.trim()}
                onClick={handleSave}
              >
                {modal === "create" ? "Buat Cabang" : "Simpan Perubahan"}
              </button>
            </>
          }
        >
          <div className="d-form" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="d-form__row">
              <Field label="Nama Cabang" id="br-name" hint="Contoh: Kopi Harum Pettarani">
                <input
                  id="br-name"
                  placeholder="Masukkan nama cabang..."
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Kota" id="br-city" hint="Contoh: Makassar">
                <input
                  id="br-city"
                  placeholder="Nama kota..."
                  value={f.city}
                  onChange={(e) => setF({ ...f, city: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Alamat Lengkap" id="br-addr">
              <textarea
                id="br-addr"
                rows={2}
                placeholder="Alamat jalan, nomor ruko, kelurahan, kecamatan..."
                value={f.address}
                onChange={(e) => setF({ ...f, address: e.target.value })}
              />
            </Field>

            <div className="d-form__row">
              <Field label="Tipe Fungsi Cabang" id="br-type">
                <select
                  id="br-type"
                  value={f.is_warehouse ? "warehouse" : "outlet"}
                  onChange={(e) => setF({ ...f, is_warehouse: e.target.value === "warehouse" })}
                >
                  <option value="outlet">Outlet Penjualan (Kasir POS, Meja & Dapur)</option>
                  <option value="warehouse">Gudang Bahan / Central Kitchen (Tanpa Kasir)</option>
                </select>
              </Field>
              <Field label="Radius Geofence Absensi (Meter)" id="br-geo" hint="Jarak toleransi GPS staf untuk clock-in">
                <input
                  id="br-geo"
                  type="number"
                  min="10"
                  max="1000"
                  value={f.geofence_m}
                  onChange={(e) => setF({ ...f, geofence_m: e.target.value })}
                />
              </Field>
            </div>

            {/* ────────── FITUR EMBED GOOGLE MAPS PREVIEW (GAMBAR 3) ────────── */}
            <div
              style={{
                borderRadius: "16px",
                border: "1px solid var(--color-rule, #CBD5E1)",
                overflow: "hidden",
                background: "#FFFFFF",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
              }}
            >
              {/* Embed Peta Iframe Google Maps */}
              <div style={{ width: "100%", height: "190px", position: "relative", background: "#E2E8F0" }}>
                <iframe
                  title="Google Maps Preview Cabang"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${f.lat || -5.147665},${f.lng || 119.432731}&hl=id&z=16&output=embed`}
                />
              </div>

              {/* Baris Informasi Alamat, Koordinat & Tombol Ubah Lokasi (Gambar 3) */}
              <div
                style={{
                  padding: "0.875rem 1.125rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  background: "#FFFFFF",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <strong style={{ display: "block", fontSize: "0.9375rem", color: "var(--color-ink, #0F172A)", lineHeight: 1.3 }}>
                    {f.address?.trim() || (f.lat ? "Alamat terdeteksi" : "Titik Lokasi Cabang")}
                  </strong>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: f.lat && f.lng ? "var(--color-muted, #64748B)" : "var(--color-warn, #B45309)",
                      fontFamily: "monospace",
                      marginTop: "0.2rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    {f.lat && f.lng ? (
                      <span>{Number(f.lat).toFixed(6)}, {Number(f.lng).toFixed(6)}</span>
                    ) : (
                      <>
                        <span>📍</span>
                        <span>{geoLoading ? "Mendeteksi lokasi saat ini..." : "Titik koordinat belum ditentukan"}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setMapPickerOpen(true)}
                    style={{
                      padding: "0.5rem 1.1rem",
                      borderRadius: "9999px",
                      border: "1px solid #CBD5E1",
                      background: "#FFFFFF",
                      color: "#0F172A",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="22" y1="12" x2="18" y2="12"></line>
                      <line x1="6" y1="12" x2="2" y2="12"></line>
                      <line x1="12" y1="6" x2="12" y2="2"></line>
                      <line x1="12" y1="22" x2="12" y2="18"></line>
                    </svg>
                    <span>Ubah lokasi</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Opsi Tambahan Cepat: Geolocation & Manual Input Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                className="d-btn d-btn--subtle d-btn--sm"
                onClick={getGeoLocation}
                disabled={geoLoading}
                style={{ fontSize: "0.75rem" }}
              >
                {geoLoading ? "Mendeteksi..." : "⌖ Gunakan Lokasi GPS Saya Saat Ini"}
              </button>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={() => setShowManualCoords(!showManualCoords)}
                style={{ fontSize: "0.75rem" }}
              >
                {showManualCoords ? "Sembunyikan Koordinat Manual" : "Tampilkan Koordinat Manual (Lat/Lng)"}
              </button>
            </div>

            {/* Input Manual Koordinat (Jika Dibuka) */}
            {showManualCoords && (
              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--color-paper-2, #F8FAFC)",
                  border: "1px dashed var(--color-rule, #CBD5E1)",
                  borderRadius: "8px",
                }}
              >
                <div className="d-form__row">
                  <Field label="Latitude" id="br-lat" hint="Bisa diedit langsung">
                    <input
                      id="br-lat"
                      placeholder="Contoh: -5.147665"
                      value={f.lat}
                      onChange={(e) => setF({ ...f, lat: e.target.value })}
                    />
                  </Field>
                  <Field label="Longitude" id="br-lng" hint="Bisa diedit langsung">
                    <input
                      id="br-lng"
                      placeholder="Contoh: 119.432731"
                      value={f.lng}
                      onChange={(e) => setF({ ...f, lng: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* Opsi Kloning Menu & Resep (khusus saat buat baru) */}
            {modal === "create" && branches.length > 0 && (
              <Field
                label="Kloning Katalog Menu & Resep"
                id="br-clone"
                hint="Menyalin struktur kategori produk, varian, dan resep bahan agar cabang langsung siap pakai."
              >
                <select
                  id="br-clone"
                  value={f.clone_from}
                  onChange={(e) => setF({ ...f, clone_from: e.target.value })}
                >
                  <option value="">Jangan kloning (Mulai katalog kosong)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Salin dari {b.name} ({b.city || "Cabang"})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Khusus Pilar Health */}
            {isHealth && (
              <Field
                label="SATUSEHAT Location ID (Kemenkes RI)"
                id="br-satusehat"
                hint="ID lokasi resmi faskes dari platform SATUSEHAT untuk bridging data rekam medis."
              >
                <input
                  id="br-satusehat"
                  placeholder="Contoh: b9cf9a3e-63f2-4b2a-8742-…"
                  value={f.satusehat_location_id}
                  onChange={(e) => setF({ ...f, satusehat_location_id: e.target.value })}
                />
              </Field>
            )}

            <Feedback a={a} />
          </div>
        </Modal>
      )}

      {/* ────────── FULLSCREEN GOOGLE MAPS LOCATION PICKER (GAMBAR 4) ────────── */}
      <BranchMapPicker
        open={mapPickerOpen}
        branchName={f.name || (modal?.edit?.name ? modal.edit.name : "Cabang Baru")}
        initialLat={f.lat}
        initialLng={f.lng}
        initialAddress={f.address}
        onClose={() => setMapPickerOpen(false)}
        onSelect={({ lat, lng, address: pickedAddr }) => {
          setF((prev) => ({
            ...prev,
            lat: String(lat),
            lng: String(lng),
            address: pickedAddr || prev.address,
          }));
        }}
      />
    </>
  );
}
