import { useState, useEffect } from "react";
import { PageHead, Panel, Badge } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";
import { applyTheme } from "../../../lib/theme.js";

// Audio Synthesizer via Web Audio API tanpa membutuhkan file suara eksternal
function playBeepSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

function playChimeSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.4);
    });
  } catch {}
}

export default function Appearance() {
  const { lang, setLang, t } = useAccountLang();

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("tijarah:theme") || "system";
    } catch {
      return "system";
    }
  });

  const [timezone, setTimezone] = useState(() => {
    try {
      return localStorage.getItem("tijarah:timezone") || "Asia/Makassar";
    } catch {
      return "Asia/Makassar";
    }
  });

  const [soundBeep, setSoundBeep] = useState(() => {
    try {
      return localStorage.getItem("tijarah:sound_beep") !== "false";
    } catch {
      return true;
    }
  });

  const [soundChime, setSoundChime] = useState(() => {
    try {
      return localStorage.getItem("tijarah:sound_chime") !== "false";
    } catch {
      return true;
    }
  });

  const [savedNotice, setSavedNotice] = useState(false);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const handleSave = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem("tijarah:lang", lang);
      localStorage.setItem("tijarah:theme", theme);
      localStorage.setItem("tijarah:timezone", timezone);
      localStorage.setItem("tijarah:sound_beep", soundBeep ? "true" : "false");
      localStorage.setItem("tijarah:sound_chime", soundChime ? "true" : "false");
      applyTheme(theme);
      window.dispatchEvent(new CustomEvent("tijarah:timezone_changed", { detail: timezone }));
    } catch {}

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.appearanceTitle}
        desc={t.appearanceDesc}
      />

      {/* ──────── BENTO KPI SUMMARY TAMPILAN & BAHASA ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Bahasa Antarmuka"
          value={lang === "id" ? "Bahasa Indonesia (ID)" : "English (EN)"}
          sub="Real-Time Switcher Aktif"
          tone="emerald"
          icon="fa-language"
        />
        <AccountKpiCard
          label="Mode Tema Visual"
          value={theme === "light" ? "Mode Terang" : theme === "dark" ? "Mode Gelap" : "Otomatis Sistem"}
          sub="Palet Obsidian & Emerald"
          tone="sky"
          icon="fa-palette"
        />
        <AccountKpiCard
          label="Zona Waktu Operasional"
          value={
            timezone === "Asia/Makassar"
              ? "WITA (Makassar)"
              : timezone === "Asia/Jakarta"
              ? "WIB (Jakarta)"
              : "WIT (Jayapura)"
          }
          sub={
            timezone === "Asia/Makassar"
              ? "UTC+8 · Default Dashboard"
              : timezone === "Asia/Jakarta"
              ? "UTC+7 · Standar Barat"
              : "UTC+9 · Standar Timur"
          }
          tone="purple"
          icon="fa-clock"
        />
        <AccountKpiCard
          label="Umpan Balik Audio"
          value={soundBeep && soundChime ? "Beep & Chime Aktif" : "Parsial Aktif"}
          sub="Web Audio API Synthesizer"
          tone="amber"
          icon="fa-volume-high"
        />
      </AccountKpiGrid>

      {savedNotice && (
        <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
          <strong>Preferensi Berhasil Disimpan:</strong> Pengaturan bahasa, tema, dan suara telah diterapkan untuk perangkat Anda.
        </div>
      )}

      <form onSubmit={handleSave} className="d-grid" style={{ gap: "1.25rem" }}>
        {/* SECTION 1: PILIHAN BAHASA */}
        <Panel title={t.langSectionTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            {t.langSectionDesc}
          </p>

          <div className="sec-form-grid">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: lang === "id" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: lang === "id" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <input
                type="radio"
                name="app-language"
                value="id"
                checked={lang === "id"}
                onChange={() => setLang("id")}
                style={{ accentColor: "var(--color-accent)" }}
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ fontSize: "0.95rem" }}>Bahasa Indonesia (ID)</strong>
                  <Badge tone="ok">Standar Default</Badge>
                </div>
                <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                  Format resmi rupiah (Rp), tanggal baku Indonesia, dan terminologi akuntansi PSAK.
                </p>
              </div>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: lang === "en" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: lang === "en" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <input
                type="radio"
                name="app-language"
                value="en"
                checked={lang === "en"}
                onChange={() => setLang("en")}
                style={{ accentColor: "var(--color-accent)" }}
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ fontSize: "0.95rem" }}>English (EN)</strong>
                  <Badge tone="neutral">International</Badge>
                </div>
                <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                  Standard business terminology, international date formatting, and English labels.
                </p>
              </div>
            </label>
          </div>

          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--color-muted)" }}>Pratinjau Format Mata Uang &amp; Waktu:</span>{" "}
            <strong className="d-mono">{lang === "id" ? "Rp 1.500.000 · 16 Oktober 2026, 11:20 WITA" : "IDR 1,500,000 · October 16, 2026, 11:20 AM"}</strong>
          </div>
        </Panel>

        {/* SECTION 2: TEMA TAMPILAN */}
        <Panel title={t.themeTitle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <label
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: theme === "light" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: theme === "light" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <i className="fa-solid fa-sun" style={{ color: "#d97706", fontSize: "1.2rem" }} aria-hidden="true" />
                <input
                  type="radio"
                  name="app-theme"
                  value="light"
                  checked={theme === "light"}
                  onChange={() => handleThemeChange("light")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <strong style={{ fontSize: "0.9rem" }}>{t.lightTheme}</strong>
              <span className="d-text d-muted" style={{ fontSize: "0.75rem" }}>Latar putih bersih kontras tinggi untuk toko siang hari.</span>
            </label>

            <label
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: theme === "dark" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: theme === "dark" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <i className="fa-solid fa-moon" style={{ color: "#818cf8", fontSize: "1.2rem" }} aria-hidden="true" />
                <input
                  type="radio"
                  name="app-theme"
                  value="dark"
                  checked={theme === "dark"}
                  onChange={() => handleThemeChange("dark")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <strong style={{ fontSize: "0.9rem" }}>{t.darkTheme}</strong>
              <span className="d-text d-muted" style={{ fontSize: "0.75rem" }}>Latar obsidian gelap, hemat baterai tablet kasir.</span>
            </label>

            <label
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: theme === "system" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: theme === "system" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <i className="fa-solid fa-circle-half-stroke" style={{ color: "var(--color-ink)", fontSize: "1.2rem" }} aria-hidden="true" />
                <input
                  type="radio"
                  name="app-theme"
                  value="system"
                  checked={theme === "system"}
                  onChange={() => handleThemeChange("system")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <strong style={{ fontSize: "0.9rem" }}>{t.systemTheme}</strong>
              <span className="d-text d-muted" style={{ fontSize: "0.75rem" }}>Otomatis mendeteksi tema sistem operasi perangkat Anda.</span>
            </label>
          </div>
        </Panel>

        {/* SECTION 3: ZONA WAKTU OPERASIONAL */}
        <Panel title={t.timezoneTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            {t.timezoneDesc}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {/* 1. WITA (Default) */}
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: timezone === "Asia/Makassar" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: timezone === "Asia/Makassar" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-clock" style={{ color: "var(--color-accent)", fontSize: "1.2rem" }} aria-hidden="true" />
                  <strong style={{ fontSize: "0.95rem" }}>WITA (Asia/Makassar)</strong>
                </div>
                <input
                  type="radio"
                  name="app-timezone"
                  value="Asia/Makassar"
                  checked={timezone === "Asia/Makassar"}
                  onChange={() => setTimezone("Asia/Makassar")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <Badge tone="ok">Standar Default (UTC+8)</Badge>
                <Badge tone="neutral">Makassar &bull; Bali &bull; Sul &bull; Kaltim</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", lineHeight: 1.4 }}>
                Zona waktu baku sistem Tijarah POS untuk Makassar, Denpasar (Bali), Mataram, Kupang, Balikpapan, Banjarmasin, Manado, dan seluruh Sulawesi.
              </p>
            </label>

            {/* 2. WIB */}
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: timezone === "Asia/Jakarta" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: timezone === "Asia/Jakarta" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-clock" style={{ color: "#38bdf8", fontSize: "1.2rem" }} aria-hidden="true" />
                  <strong style={{ fontSize: "0.95rem" }}>WIB (Asia/Jakarta)</strong>
                </div>
                <input
                  type="radio"
                  name="app-timezone"
                  value="Asia/Jakarta"
                  checked={timezone === "Asia/Jakarta"}
                  onChange={() => setTimezone("Asia/Jakarta")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <Badge tone="accent">Wilayah Barat (UTC+7)</Badge>
                <Badge tone="neutral">Jawa &bull; Sumatera &bull; Kalbar &bull; Kalteng</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", lineHeight: 1.4 }}>
                Zona waktu untuk outlet dan cabang di Jakarta, Bandung, Surabaya, Medan, Palembang, Padang, Pontianak, dan Palangkaraya.
              </p>
            </label>

            {/* 3. WIT */}
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                padding: "1rem",
                borderRadius: "var(--radius-lg)",
                border: timezone === "Asia/Jayapura" ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: timezone === "Asia/Jayapura" ? "var(--color-paper-2)" : "var(--color-paper-1)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-clock" style={{ color: "#a855f7", fontSize: "1.2rem" }} aria-hidden="true" />
                  <strong style={{ fontSize: "0.95rem" }}>WIT (Asia/Jayapura)</strong>
                </div>
                <input
                  type="radio"
                  name="app-timezone"
                  value="Asia/Jayapura"
                  checked={timezone === "Asia/Jayapura"}
                  onChange={() => setTimezone("Asia/Jayapura")}
                  style={{ accentColor: "var(--color-accent)" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <Badge tone="warn">Wilayah Timur (UTC+9)</Badge>
                <Badge tone="neutral">Papua &bull; Papua Barat &bull; Maluku</Badge>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", lineHeight: 1.4 }}>
                Zona waktu untuk outlet di Jayapura, Merauke, Timika, Sorong, Manokwari, Ambon, dan Ternate.
              </p>
            </label>
          </div>
        </Panel>

        {/* SECTION 4: UMPAN BALIK SUARA KASIR */}
        <Panel title={t.audioTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Bunyi audio membantu kasir memverifikasi transaksi tanpa harus selalu menatap layar kasir secara konstan.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-rule)" }}>
              <div>
                <strong style={{ display: "block", fontSize: "0.9rem" }}>{t.audioBeepTitle}</strong>
                <span className="d-text d-muted" style={{ fontSize: "0.8rem" }}>{t.audioBeepDesc}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={playBeepSound}
                  title="Uji coba nada suara beep"
                >
                  <i className="fa-solid fa-volume-high" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {t.testSound}
                </button>
                <input
                  type="checkbox"
                  checked={soundBeep}
                  onChange={(e) => setSoundBeep(e.target.checked)}
                  style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ display: "block", fontSize: "0.9rem" }}>{t.audioChimeTitle}</strong>
                <span className="d-text d-muted" style={{ fontSize: "0.8rem" }}>{t.audioChimeDesc}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={playChimeSound}
                  title="Uji coba nada lonceng chime"
                >
                  <i className="fa-solid fa-bell" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {t.testSound}
                </button>
                <input
                  type="checkbox"
                  checked={soundChime}
                  onChange={(e) => setSoundChime(e.target.checked)}
                  style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--color-accent)", cursor: "pointer" }}
                />
              </div>
            </div>
          </div>
        </Panel>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button type="submit" className="d-btn d-btn--primary">
            <i className="fa-solid fa-sliders" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            Simpan Preferensi Tampilan
          </button>
        </div>
      </form>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />
    </>
  );
}
