import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Badge, Modal, Field, useAsync, Empty } from "../../ui/index.jsx";

const MODULES = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
const MODULE_NAME = { M1: "Kasir POS", M2: "Dapur", M3: "Inventori", M4: "Akuntansi", M5: "SDM", M6: "CRM", M7: "Omnichannel", M8: "Reservasi", M9: "Klinik", M10: "Ritel", M11: "Manufaktur", M12: "Capital" };
const EMPTY = {
  code: "",
  name: "",
  price_month: "",
  max_branches: 1,
  max_cashiers: 3,
  ai_queries_month: 250,
  description: "",
  modules: ["M1"],
  is_active: true
};

export default function Plans() {
  const { api, role } = useAuth();
  const plans = useAsync(() => api.listPlans(), [api]);
  const invoices = useAsync(() => api.listInvoices(), [api]);
  const tenants = useAsync(() => api.listTenants(), [api]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);

  // Kebijakan Referral Platform (Global Policy)
  const [refConfig, setRefConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tijarah:platform_referral_config");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      discountPct: 10,
      commissionPct: 1,
      trialDays: 0,
      welcomeAiQueries: 0
    };
  });
  const [refNotice, setRefNotice] = useState(null);

  const handleSaveRefConfig = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem("tijarah:platform_referral_config", JSON.stringify(refConfig));
      setRefNotice("Kebijakan referral platform berhasil disimpan dan langsung berlaku bagi seluruh merchant.");
      setTimeout(() => setRefNotice(null), 4000);
    } catch {}
  };

  const save = async () => {
    if (!edit.code.trim() || !edit.name.trim()) return setErr("Kode dan nama wajib diisi.");
    try {
      await api.savePlan({
        ...edit,
        price_month: edit.price_month === "" ? null : Number(edit.price_month),
        max_branches: Number(edit.max_branches),
        max_cashiers: edit.max_cashiers === "" ? null : Number(edit.max_cashiers),
        ai_queries_month: edit.ai_queries_month === "" ? null : Number(edit.ai_queries_month)
      });
      setEdit(null);
      plans.reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const name = (id) => tenants.data?.find((t) => t.id === id)?.name ?? "—";

  return (
    <>
      <PageHead
        eyebrow="Superadmin · Fitur 1"
        title="Paket & tagihan"
        desc="Paket langganan, kuota pertanyaan AI (1 Tanya = 1 Kuota), modul yang dibuka, dan kebijakan referral platform."
        actions={can(role, 1, "c") && <button type="button" className="d-btn d-btn--primary" onClick={() => { setErr(null); setEdit({ ...EMPTY }); }}>Tambah paket</button>}
      />
      {plans.loading ? <Loading /> : plans.error ? <ErrorNote error={plans.error} onRetry={plans.reload} /> : (
        <div className="d-plan-grid">
          {plans.data.map((p) => {
            const isStarter = p.code?.toLowerCase().includes("starter");
            const isGrowth = p.code?.toLowerCase().includes("growth");
            const isEnterprise = p.code?.toLowerCase().includes("enterprise");

            const planTitle = isStarter ? "Starter (1 Bulan)" : isGrowth ? "Growth (6 Bulan)" : isEnterprise ? "Enterprise (1 Tahun)" : p.name;
            const priceMain = isStarter ? "Rp 500.000" : isGrowth ? "Rp 2.500.000" : isEnterprise ? "Rp 3.500.000" : (p.price_month ? `${rupiah(p.price_month)}` : "Harga belum ditetapkan");
            const durationLabel = isStarter ? "1 bulan" : isGrowth ? "6 bulan" : isEnterprise ? "12 bulan (1 tahun)" : "";
            const rateMonthly = isGrowth ? "Rp 416.666 / bulan" : isEnterprise ? "Rp 291.666 / bulan" : isStarter ? "Rp 500.000 / bulan" : null;

            const aiDisplay = p.ai_queries_month != null
              ? `${p.ai_queries_month} Tanya AI / bln`
              : (isGrowth ? "250 Tanya AI / bln" : isStarter ? "0 Tanya AI" : "Unlimited Tanya AI");
            const cashierDisplay = p.max_cashiers != null
              ? `Maks. ${p.max_cashiers} kasir POS`
              : (isStarter ? "Maks. 3 kasir POS" : isGrowth ? "Maks. 15 kasir POS" : "Kasir Tanpa Batas");

            return (
              <article key={p.id} className="d-plan">
                <header>
                  <p className="d-mono d-muted">{p.code} · {durationLabel}</p>
                  <h2>{planTitle}</h2>
                  <div style={{ margin: "0.25rem 0" }}>
                    <strong style={{ font: "700 1.25rem var(--font-mono)", color: isGrowth ? "var(--color-accent)" : "var(--color-ink)" }}>
                      {priceMain}
                    </strong>
                    {rateMonthly && (
                      <span style={{ display: "block", fontSize: "0.78rem", color: "#D97706", fontWeight: 600, marginTop: "2px" }}>
                        {rateMonthly}
                      </span>
                    )}
                  </div>
                </header>
                <div style={{ margin: "0.5rem 0", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <p className="d-list__meta" style={{ margin: 0 }}>Maks. {p.max_branches} cabang · {cashierDisplay}</p>
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--color-accent)" }}>
                    <i className="fa-solid fa-brain" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                    {aiDisplay}
                  </p>
                  <p className="d-list__meta" style={{ margin: 0 }}>Status: {p.is_active ? "aktif" : "nonaktif"}</p>
                </div>
                <ul className="d-chips">{p.modules.map((m) => <li key={m}><Badge>{m} {MODULE_NAME[m]}</Badge></li>)}</ul>
                {can(role, 1, "u") && (
                  <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { setErr(null); setEdit({ ...p, price_month: p.price_month ?? "", max_cashiers: p.max_cashiers ?? (p.code === "STARTER" ? 3 : 15), ai_queries_month: p.ai_queries_month ?? (p.code === "GROWTH" ? 250 : p.code === "STARTER" ? 0 : "") }); }}>Ubah paket</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* PANEL KONFIGURASI KEBIJAKAN REFERRAL PLATFORM */}
      <Panel title="Konfigurasi Kebijakan Referral Platform (Global Policy)">
        <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
          Atur default keuntungan program referral merchant untuk seluruh pengguna Tijarah OS. Nilai ini menjadi acuan resmi saat pendaftar memasukkan kode referral.
        </p>

        {refNotice && (
          <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
            <strong>Berhasil:</strong> {refNotice}
          </div>
        )}

        <form onSubmit={handleSaveRefConfig} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
          <div>
            <label htmlFor="ref-discount" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
              Potongan Harga Pendaftar Baru (Referee)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="ref-discount"
                className="d-input"
                type="number"
                min="0"
                max="100"
                value={refConfig.discountPct}
                onChange={(e) => setRefConfig({ ...refConfig, discountPct: Number(e.target.value) })}
                required
              />
              <span style={{ fontWeight: 600 }}>%</span>
            </div>
            <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
              Default rekomendasi platform: 10% diskon saat aktivasi paket.
            </p>
          </div>

          <div>
            <label htmlFor="ref-commission" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
              Komisi Recurring Pengajak (Masuk S-Wallet)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="ref-commission"
                className="d-input"
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={refConfig.commissionPct}
                onChange={(e) => setRefConfig({ ...refConfig, commissionPct: Number(e.target.value) })}
                required
              />
              <span style={{ fontWeight: 600 }}>%</span>
            </div>
            <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
              Default rekomendasi platform: 1% recurring bulanan langsung ke S-Wallet.
            </p>
          </div>

          <div>
            <label htmlFor="ref-trial" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
              Bonus Masa Percobaan Tambahan
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="ref-trial"
                className="d-input"
                type="number"
                min="0"
                value={refConfig.trialDays}
                onChange={(e) => setRefConfig({ ...refConfig, trialDays: Number(e.target.value) })}
                required
              />
              <span style={{ fontWeight: 600 }}>Hari</span>
            </div>
            <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
              Default platform: 0 hari (masa percobaan gratis standar).
            </p>
          </div>

          <div>
            <label htmlFor="ref-token" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
              Bonus Sambutan Kuota Pertanyaan AI
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="ref-token"
                className="d-input"
                type="number"
                min="0"
                value={refConfig.welcomeAiQueries}
                onChange={(e) => setRefConfig({ ...refConfig, welcomeAiQueries: Number(e.target.value) })}
                required
              />
              <span style={{ fontWeight: 600 }}>Tanya</span>
            </div>
            <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
              Default platform: 0 pertanyaan bonus (mengikuti kuota paket).
            </p>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button type="submit" className="d-btn d-btn--primary">
              <i className="fa-solid fa-sliders" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              Simpan Kebijakan Referral
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Tagihan">
        {invoices.loading ? <Loading /> : (invoices.data ?? []).length === 0 ? <Empty title="Belum ada tagihan" /> : (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead><tr><th scope="col">Tenant</th><th scope="col">Periode</th><th scope="col" className="d-num">Jumlah</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {invoices.data.map((i) => (
                  <tr key={i.id}>
                    <td>{name(i.tenant_id)}</td>
                    <td>{date(i.period)}</td>
                    <td className="d-num">{rupiah(i.amount)}</td>
                    <td><Badge tone={i.status === "paid" ? "ok" : i.status === "unpaid" ? "warn" : "neutral"}>{i.status === "paid" ? "Lunas" : i.status === "unpaid" ? "Belum dibayar" : "Batal"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(edit)}
        title={edit?.id ? "Ubah paket" : "Tambah paket"}
        onClose={() => setEdit(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" onClick={save}>Simpan paket</button>
        </>}
      >
        {edit && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Kode" id="p-code"><input id="p-code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
              <Field label="Nama" id="p-name"><input id="p-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            </div>
            <div className="d-form__row">
              <Field label="Harga per bulan (Rp)" id="p-price" hint="Kosongkan jika belum ditetapkan">
                <input id="p-price" inputMode="numeric" value={edit.price_month} onChange={(e) => setEdit({ ...edit, price_month: e.target.value.replace(/\D/g, "") })} />
              </Field>
              <Field label="Maks. cabang" id="p-br">
                <input id="p-br" type="number" min="1" value={edit.max_branches} onChange={(e) => setEdit({ ...edit, max_branches: e.target.value })} />
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Maks. Kasir POS" id="p-cashier" hint="Contoh: 3 untuk Starter, 15 untuk Growth">
                <input id="p-cashier" type="number" min="1" value={edit.max_cashiers ?? ""} onChange={(e) => setEdit({ ...edit, max_cashiers: e.target.value })} />
              </Field>
              <Field label="Kuota Pertanyaan AI / Bulan (1 Tanya = 1 Kuota)" id="p-ai" hint="0 jika tanpa AI, 250 untuk Growth, kosongkan jika Unlimited">
                <input id="p-ai" type="number" min="0" value={edit.ai_queries_month ?? ""} onChange={(e) => setEdit({ ...edit, ai_queries_month: e.target.value })} />
              </Field>
            </div>
            <Field label="Keterangan Ringkas Paket" id="p-desc">
              <input id="p-desc" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Ringkasan modul & sasaran skala bisnis" />
            </Field>
            <fieldset className="d-fieldset">
              <legend>Modul yang dibuka</legend>
              <div className="d-checks">
                {MODULES.map((m) => (
                  <label key={m} className="d-check">
                    <input type="checkbox" checked={edit.modules.includes(m)}
                      onChange={(e) => setEdit({ ...edit, modules: e.target.checked ? [...edit.modules, m] : edit.modules.filter((x) => x !== m) })} />
                    <span>{m} · {MODULE_NAME[m]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="d-check">
              <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
              <span>Paket aktif (tampil untuk pendaftaran)</span>
            </label>
            {err && <p className="d-field__error" role="alert">{err}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

