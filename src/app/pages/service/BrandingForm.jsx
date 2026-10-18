import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useAsync, Panel, Field, Loading, ErrorNote } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";
import { brandVars } from "../../../member/brand.js";

const PRESET_COLORS = [
  { name: "Emerald", hex: "#059669" },
  { name: "Royal Blue", hex: "#2563eb" },
  { name: "Amber Gold", hex: "#d97706" },
  { name: "Ruby Rose", hex: "#e11d48" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Midnight", hex: "#334155" },
];

export default function BrandingForm() {
  const { api, tenantId } = useAuth();
  const a = useAction();

  const r = useAsync(() => api.getTenantBranding(tenantId), [api, tenantId]);

  const [displayName, setDisplayName] = useState("");
  const [accentColor, setAccentColor] = useState("#059669");
  const [logoUrl, setLogoUrl] = useState("");
  const [welcomeText, setWelcomeText] = useState("");

  useEffect(() => {
    if (r.data) {
      setDisplayName(r.data.display_name ?? "");
      setAccentColor(r.data.accent_color ?? "#059669");
      setLogoUrl(r.data.logo_url ?? "");
      setWelcomeText(r.data.welcome_text ?? "");
    }
  }, [r.data]);

  const previewStyle = useMemo(() => brandVars(accentColor), [accentColor]);

  const save = () => a.run(async () => {
    const trimmedName = displayName.trim();
    if (trimmedName && (trimmedName.length < 1 || trimmedName.length > 60)) {
      throw new Error("Nama tampilan harus antara 1 sampai 60 karakter.");
    }
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      throw new Error("Warna aksen harus dalam format heksadesimal 6 digit (contoh: #059669).");
    }
    if (logoUrl && !/^https:\/\/\S{4,250}$/.test(logoUrl)) {
      throw new Error("Logo harus berupa tautan HTTPS yang valid (maksimal 250 karakter).");
    }
    if (welcomeText && welcomeText.length > 160) {
      throw new Error("Pesan sambutan maksimal 160 karakter.");
    }

    await api.saveTenantBranding({
      tenantId,
      displayName: trimmedName || null,
      accentColor: accentColor || null,
      logoUrl: logoUrl.trim() || null,
      welcomeText: welcomeText.trim() || null,
    });
    r.reload();
  }, "Identitas merek dan tema portal Member (/m) berhasil disimpan.");

  if (r.loading) return <Loading label="Memuat data merek Tenant…" />;
  if (r.error) return <ErrorNote error={r.error} onRetry={r.reload} />;

  return (
    <>
      <Feedback a={a} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginTop: "1rem" }}>
        {/* Formulir Pengaturan */}
        <Panel
          title="Pengaturan Merek Tenant"
          desc="Kustomisasi tampilan portal pelanggan /m. Tema ini diterapkan otomatis saat Member mengakses kartu loyalitas atau riwayat transaksi."
        >
          <div className="d-form">
            <Field label="Nama Tampilan Merek / Toko" id="brand-name" hint="Maks. 60 karakter. Tampil di header dan kartu member.">
              <input
                id="brand-name"
                type="text"
                placeholder="Contoh: Kopi Harum"
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>

            <Field label="Warna Aksen Member" id="brand-color" hint="Warna utama kartu, tombol, dan sorotan di dashboard member.">
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <input
                  id="brand-color-picker"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : "#059669"}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: "42px", height: "38px", padding: "2px", cursor: "pointer", borderRadius: "6px", border: "1px solid var(--d-border)" }}
                />
                <input
                  id="brand-color"
                  type="text"
                  placeholder="#059669"
                  maxLength={7}
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ fontFamily: "monospace", textTransform: "uppercase" }}
                />
              </div>

              {/* Preset Warna Populer */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setAccentColor(p.hex)}
                    style={{
                      background: p.hex,
                      color: "#fff",
                      border: accentColor.toLowerCase() === p.hex.toLowerCase() ? "2px solid #fff" : "1px solid rgba(0,0,0,0.2)",
                      outline: accentColor.toLowerCase() === p.hex.toLowerCase() ? `2px solid ${p.hex}` : "none",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="URL Logo Merek (HTTPS)" id="brand-logo" hint="Format https://... (PNG/SVG/WebP direkomendasikan).">
              <input
                id="brand-logo"
                type="url"
                placeholder="https://domain.anda/logo.png"
                maxLength={250}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </Field>

            <Field label="Pesan Sambutan Member" id="brand-welcome" hint={`Teks pembuka di beranda /m (${welcomeText.length}/160 karakter).`}>
              <textarea
                id="brand-welcome"
                rows={3}
                placeholder="Contoh: Selamat datang kembali! Kumpulkan poin belanja dan nikmati promo eksklusif."
                maxLength={160}
                value={welcomeText}
                onChange={(e) => setWelcomeText(e.target.value)}
              />
            </Field>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                type="button"
                className="d-btn d-btn--primary"
                onClick={save}
                disabled={a.busy}
              >
                {a.busy ? "Menyimpan…" : "Simpan Pengaturan Merek"}
              </button>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => r.reload()}
                disabled={a.busy}
              >
                Batal / Muat Ulang
              </button>
            </div>
          </div>
        </Panel>

        {/* Live Preview Kartu & Portal Member */}
        <Panel
          title="Pratinjau Interaktif Portal Member"
          desc="Tampilan waktu-nyata bagaimana pelanggan melihat kartu dan beranda Anda di perangkat seluler."
        >
          <div
            style={{
              ...previewStyle,
              background: "var(--m-bg, #0b1120)",
              color: "var(--m-text, #f8fafc)",
              border: "1px solid var(--d-border)",
              borderRadius: "16px",
              padding: "1.25rem",
              maxWidth: "360px",
              margin: "0 auto",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Top Bar Portal Member */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "6px", objectFit: "cover" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      background: "var(--m-accent, #059669)",
                      color: "var(--m-accent-contrast, #fff)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                    }}
                  >
                    {displayName?.[0] || "H"}
                  </span>
                )}
                <strong style={{ fontSize: "0.95rem" }}>{displayName || "Nama Merek Toko"}</strong>
              </div>
              <span style={{ fontSize: "0.75rem", opacity: 0.7, padding: "2px 6px", borderRadius: "4px", background: "rgba(255,255,255,0.08)" }}>Portal /m</span>
            </div>

            {/* Kartu Member Digital */}
            <div
              style={{
                background: "linear-gradient(135deg, var(--m-accent, #059669) 0%, rgba(15,23,42,0.95) 100%)",
                color: "#fff",
                borderRadius: "12px",
                padding: "1.25rem",
                boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
                marginBottom: "1rem",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "1px", opacity: 0.8 }}>Kartu Member</span>
                  <h4 style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 700 }}>Hasan (Demo)</h4>
                </div>
                <div style={{ width: "36px", height: "36px", background: "rgba(255,255,255,0.15)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                  💎
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>Saldo Poin</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>1.250 <span style={{ fontSize: "0.8rem", fontWeight: 400 }}>poin</span></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.65rem", opacity: 0.7 }}>QR Dinamis</div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--m-accent-contrast, #fff)" }}>Aktif · 90s</div>
                </div>
              </div>
            </div>

            {/* Pesan Sambutan */}
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "0.75rem 1rem", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--m-accent, #10b981)", fontWeight: 600, marginBottom: "0.2rem", textTransform: "uppercase" }}>Teks Sambutan</div>
              <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.4, opacity: 0.9 }}>
                {welcomeText || "Selamat datang kembali! Kumpulkan poin belanja dan nikmati promo eksklusif."}
              </p>
            </div>

            {/* Tombol Aksi Member */}
            <button
              type="button"
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "8px",
                border: "none",
                background: "var(--m-accent, #059669)",
                color: "var(--m-accent-contrast, #fff)",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Tampilkan Kode QR Kasir
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}
