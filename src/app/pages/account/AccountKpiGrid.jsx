export function AccountKpiCard({ label, value, sub, tone = "emerald", icon = "fa-chart-simple" }) {
  return (
    <div className="runut-tab-kpi-card">
      <div className={`runut-tab-kpi-icon runut-tab-kpi-icon--${tone}`}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </div>
      <div className="runut-tab-kpi-content">
        <span className="runut-tab-kpi-lbl">{label}</span>
        <span className="runut-tab-kpi-val">{value}</span>
        <span className="runut-tab-kpi-sub">{sub}</span>
      </div>
    </div>
  );
}

export function AccountKpiGrid({ children }) {
  return (
    <div className="runut-tab-kpi-grid" style={{ marginBottom: "1.25rem" }}>
      {children}
    </div>
  );
}
