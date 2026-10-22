import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, isOwnerOrGm } from "../../../lib/rbac.js";
import { PageHead, Panel, Loading, ErrorNote, Field, Badge, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";

const DEFAULT_STATIONS = ["dapur", "barista", "grill", "pastry"];

export default function KitchenSettings() {
  const { api, role, tenantId } = useAuth();
  const a = useAction();

  // Load tenant configuration
  const tQuery = useAsync(async () => {
    if (!api || !tenantId) return null;
    const [t] = await api.list("tenants", { eq: { id: tenantId } });
    return t || null;
  }, [api, tenantId], { key: `tenant@${tenantId}` });

  const [kdsEnabled, setKdsEnabled] = useState(false);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [stationsEnabled, setStationsEnabled] = useState(false);
  const [slaMinutes, setSlaMinutes] = useState(15);
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [newStation, setNewStation] = useState("");

  // Sync state once data loaded
  useEffect(() => {
    if (tQuery.data) {
      const t = tQuery.data;
      setKdsEnabled(Boolean(t.kds_enabled));
      setReservationEnabled(Boolean(t.reservation_enabled));
      setStationsEnabled(Boolean(t.kitchen_stations_enabled));
      setSlaMinutes(Number(t.kds_sla_minutes) || 15);
      if (Array.isArray(t.kitchen_stations) && t.kitchen_stations.length > 0) {
        setStations(t.kitchen_stations);
      } else {
        setStations(DEFAULT_STATIONS);
      }
    }
  }, [tQuery.data]);

  const canEdit = isOwnerOrGm(role) && can(role, 8, "u");

  const addStation = () => {
    const s = newStation.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!s) return;
    if (stations.includes(s)) {
      a.setError(`Stasiun '${s}' sudah ada.`);
      return;
    }
    setStations([...stations, s]);
    setNewStation("");
  };

  const removeStation = (s) => {
    if (stations.length <= 1) {
      a.setError("Minimal harus memiliki 1 stasiun dapur aktif.");
      return;
    }
    setStations(stations.filter((x) => x !== s));
  };

  const saveSettings = () => a.run(async () => {
    if (!tenantId) throw new Error("ID Tenant tidak ditemukan.");
    const patch = {
      kds_enabled: kdsEnabled,
      reservation_enabled: reservationEnabled,
      kitchen_stations_enabled: stationsEnabled,
      kds_sla_minutes: Math.max(1, Number(slaMinutes) || 15),
      kitchen_stations: stations.length > 0 ? stations : DEFAULT_STATIONS,
    };
    await api.update("tenants", tenantId, patch);
    tQuery.reload();
  }, "Pengaturan dapur & KDS berhasil disimpan!");

  return (
    <>
      <PageHead
        eyebrow="Gudang & Menu · Fitur 8"
        title="Pengaturan Dapur & KDS"
        desc="Konfigurasi sakelar Display Dapur (KDS), stasiun kerja memasak, dan batas waktu SLA untuk seluruh cabang usaha."
        actions={
          canEdit && (
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={a.busy}
              onClick={saveSettings}
            >
              {a.busy ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          )
        }
      />

      <Feedback a={a} />

      {tQuery.loading && !tQuery.data ? (
        <Loading label="Memuat preferensi dapur tenant…" />
      ) : tQuery.error ? (
        <ErrorNote error={tQuery.error} onRetry={tQuery.reload} />
      ) : (
        <div style={{ display: "grid", gap: "1.25rem", maxWidth: "960px" }}>
          {/* KARTU 1: Master KDS Toggle */}
          <Panel
            title="1. Sakelar Master KDS (Display Dapur)"
            meta={<Badge tone={kdsEnabled ? "ok" : "neutral"}>{kdsEnabled ? "Aktif" : "Nonaktif (Default)"}</Badge>}
            desc="Mengatur ketersediaan menu Layar Dapur (/app/dapur) pada bilah navigasi Staf Kasir (L3)."
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "0.5rem 0" }}>
              <div style={{ flex: "1 1 300px" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Status Layar Dapur Kasir / Staf
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--color-muted, #64748b)" }}>
                  Jika dinonaktifkan, subtab Display Dapur disembunyikan sepenuhnya dari kasir. Pesanan tetap tercatat aman di server.
                </p>
              </div>
              <div>
                <label className="d-btn d-btn--ghost" style={{ cursor: canEdit ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.5rem", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={kdsEnabled}
                    disabled={!canEdit}
                    onChange={(e) => setKdsEnabled(e.target.checked)}
                    style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    {kdsEnabled ? "KDS Dapur Diaktifkan" : "KDS Dinonaktifkan"}
                  </span>
                </label>
              </div>
            </div>
          </Panel>

          {/* KARTU 2: Sakelar Reservasi Meja & Antrean Tamu */}
          <Panel
            title="2. Sakelar Reservasi Meja & Antrean Tamu"
            meta={<Badge tone={reservationEnabled ? "ok" : "neutral"}>{reservationEnabled ? "Aktif" : "Nonaktif (Default)"}</Badge>}
            desc="Mengatur ketersediaan subtab Reservasi (/app/antrean) pada bilah navigasi Staf Kasir (L3)."
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "0.5rem 0" }}>
              <div style={{ flex: "1 1 300px" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Status Subtab Reservasi Kasir / Staf
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--color-muted, #64748b)" }}>
                  Jika dinonaktifkan, subtab Reservasi disembunyikan sepenuhnya dari kasir. Data reservasi tetap tersimpan aman di server.
                </p>
              </div>
              <div>
                <label className="d-btn d-btn--ghost" style={{ cursor: canEdit ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.5rem", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={reservationEnabled}
                    disabled={!canEdit}
                    onChange={(e) => setReservationEnabled(e.target.checked)}
                    style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    {reservationEnabled ? "Reservasi Diaktifkan" : "Reservasi Dinonaktifkan"}
                  </span>
                </label>
              </div>
            </div>
          </Panel>

          {/* KARTU 3: Sakelar Multi-Stasiun Dapur */}
          <Panel
            title="3. Sakelar Multi-Stasiun Dapur"
            meta={<Badge tone={stationsEnabled ? "ok" : "neutral"}>{stationsEnabled ? "Multi-Stasiun Aktif" : "Satu Dapur Umum (Default)"}</Badge>}
            desc="Pemisahan pesanan makanan/minuman ke beberapa pos kerja (misal: Barista, Grill, Pastry)."
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "0.5rem 0" }}>
              <div style={{ flex: "1 1 300px" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Alur Kerja Multi-Stasiun
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--color-muted, #64748b)" }}>
                  Saat dinonaktifkan, form Tambah Menu menyembunyikan pilihan stasiun dapur (otomatis masuk dapur umum), dan tabel menu menyembunyikan kolom stasiun agar lebih ringkas.
                </p>
              </div>
              <div>
                <label className="d-btn d-btn--ghost" style={{ cursor: canEdit ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.5rem", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={stationsEnabled}
                    disabled={!canEdit}
                    onChange={(e) => setStationsEnabled(e.target.checked)}
                    style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    {stationsEnabled ? "Multi-Stasiun Aktif" : "Dapur Umum Tunggal"}
                  </span>
                </label>
              </div>
            </div>
          </Panel>

          {/* KARTU 4: Target SLA Timer Masak */}
          <Panel
            title="4. Target Waktu Masak & SLA Dapur"
            meta={<Badge tone="neutral">{slaMinutes} Menit</Badge>}
            desc="Batas waktu standar penyelesaian pesanan sebelum tiket antrean dapur berganti warna peringatan."
          >
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <Field label="Target Maksimal Masak (Menit)" id="cfg-sla">
                <input
                  id="cfg-sla"
                  type="number"
                  min="1"
                  max="120"
                  disabled={!canEdit}
                  value={slaMinutes}
                  onChange={(e) => setSlaMinutes(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: "100%", maxWidth: "200px" }}
                />
              </Field>

              <div style={{ background: "var(--color-paper-2, #f8fafc)", padding: "1rem", borderRadius: "var(--radius, 8px)", border: "1px solid var(--color-border, #e2e8f0)", fontSize: "0.85rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Indikator Visual Tiket KDS:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                    <span>0 – {Math.max(1, slaMinutes - 5)} mnt: <strong>Tepat Waktu (Hijau)</strong></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                    <span>{Math.max(1, slaMinutes - 5)} – {slaMinutes} mnt: <strong>Peringatan SLA (Kuning)</strong></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                    <span>&gt; {slaMinutes} mnt: <strong>Terlambat / Breach SLA (Merah)</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          {/* KARTU 5: Kelola Stasiun Kerja Dapur Aktif */}
          <Panel
            title="5. Daftar Stasiun Kerja Dapur"
            meta={<Badge tone="neutral">{stations.length} Stasiun Terdaftar</Badge>}
            desc="Kelola stasiun tujuan preparasi produk. Stasiun ini muncul pada pilihan menu saat Multi-Stasiun aktif."
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {stations.map((s) => (
                <span
                  key={s}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "999px",
                    background: "var(--color-paper-2, #f1f5f9)",
                    border: "1px solid var(--color-border, #cbd5e1)",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                  }}
                >
                  <span>{s}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeStation(s)}
                      title={`Hapus stasiun ${s}`}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-muted, #64748b)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: "0.95rem",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>

            {canEdit && (
              <div style={{ display: "flex", gap: "0.5rem", maxWidth: "420px", alignItems: "flex-end" }}>
                <Field label="Tambah Stasiun Baru" id="new-st">
                  <input
                    id="new-st"
                    placeholder="misal: bakery, gorengan"
                    value={newStation}
                    onChange={(e) => setNewStation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStation();
                      }
                    }}
                  />
                </Field>
                <button
                  type="button"
                  className="d-btn d-btn--ghost"
                  onClick={addStation}
                  disabled={!newStation.trim()}
                  style={{ marginBottom: "0.15rem" }}
                >
                  + Tambah
                </button>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
