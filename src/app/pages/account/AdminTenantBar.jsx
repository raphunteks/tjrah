import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useAccountLang } from "./i18n.js";

export default function AdminTenantBar({ onSelectTenant, selectedTenantId }) {
  const { role, viewTenant, chooseTenant, tenants = [] } = useAuth();
  const { lang } = useAccountLang();

  // Hanya tampil bagi peran Superadmin / Admin platform
  if (role !== "superadmin") return null;

  const activeTenantId = selectedTenantId !== undefined ? selectedTenantId : (viewTenant || "");

  const handleTenantChange = (e) => {
    const val = e.target.value || null;
    chooseTenant(val);
    if (onSelectTenant) onSelectTenant(val);
  };

  return (
    <div
      className="admin-tenant-bar"
      role="region"
      aria-label="Panel Pengawasan Admin Multi-Tenant"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.04) 0%, rgba(30, 41, 59, 0.08) 100%)",
        border: "1px solid var(--color-rule)",
        borderRadius: "var(--radius-md)",
        padding: "0.75rem 1rem",
        marginBottom: "1.25rem"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.25rem 0.65rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-ink)",
            color: "#ffffff",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase"
          }}
        >
          <i className="fa-solid fa-user-shield" aria-hidden="true" />
          SUPERADMIN AUDIT
        </span>
        <span style={{ fontSize: "0.85rem", color: "var(--color-ink)", fontWeight: 500 }}>
          {lang === "en" ? "Viewing Tenant Account Data:" : "Mengawasi Data Akun Tenant:"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <select
          className="d-input"
          value={activeTenantId}
          onChange={handleTenantChange}
          style={{
            padding: "0.35rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-rule)",
            background: "var(--color-paper-1)",
            color: "var(--color-ink)",
            minWidth: "240px",
            cursor: "pointer"
          }}
        >
          <option value="">
            {lang === "en" ? "-- Personal Superadmin Account --" : "-- Akun Pribadi Superadmin --"}
          </option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.pillar ? t.pillar.toUpperCase() : "TENANT"})
            </option>
          ))}
        </select>

        {activeTenantId && (
          <button
            type="button"
            className="d-btn d-btn--ghost d-btn--sm"
            onClick={() => handleTenantChange({ target: { value: "" } })}
            title={lang === "en" ? "Reset to Superadmin Account" : "Kembali ke Akun Pribadi Superadmin"}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
          >
            <i className="fa-solid fa-rotate-left" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
