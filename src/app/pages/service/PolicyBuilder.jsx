import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";
import { ServiceTabs } from "./shared.jsx";
import { ROLE_LABEL } from "../../../lib/rbac-matrix.js";
import BrandingForm from "./BrandingForm.jsx";

const LAYER_BADGE = {
  1: ["Lapis 1 · Default Toko", "accent"],
  2: ["Lapis 2 · Cabang", "ok"],
  3: ["Lapis 3 · Peran & Cabang", "warn"],
  0: ["Bawaan Sistem", "muted"],
};

export default function PolicyBuilder() {
  const { api, tenantId, role } = useAuth();
  const a = useAction();
  const [subTab, setSubTab] = useState("policies"); // "policies" | "branding"

  const r = useAsync(async () => {
    const [policies, branches] = await Promise.all([
      api.listTenantPolicies(tenantId),
      api.list("branches", { eq: { tenant_id: tenantId } }),
    ]);
    return { policies, branches };
  }, [api, tenantId]);

  useLive(["tenant_policies"], r.reload);

  const [form, setForm] = useState(null); // { id, branchId, role, discount, voidLimit, start, end, radius, lock }
  const [testBranch, setTestBranch] = useState("");
  const [testRole, setTestRole] = useState("staff");

  const branches = useMemo(() => r.data?.branches ?? [], [r.data?.branches]);
  const policies = useMemo(() => r.data?.policies ?? [], [r.data?.policies]);

  // Evaluasi Live simulator
  const sim = useAsync(async () => {
    if (!api?.getEffectivePolicy) return null;
    return await api.getEffectivePolicy({
      tenantId,
      branchId: testBranch || null,
      role: testRole || null,
    });
  }, [api, tenantId, testBranch, testRole, r.data?.policies?.length]);

  const brName = (id) => branches.find((b) => b.id === id)?.name ?? "Semua Cabang (Tenant)";

  const openForm = (existing = null) => {
    setForm(existing ? {
      id: existing.id,
      branchId: existing.branch_id ?? "",
      role: existing.role ?? "",
      discount: existing.max_discount_pct,
      voidLimit: existing.max_void_without_pin,
      start: existing.operating_hours_start?.slice(0, 5) ?? "07:00",
      end: existing.operating_hours_end?.slice(0, 5) ?? "23:00",
      radius: existing.geofence_radius_meters,
      lock: existing.enforce_shift_lock,
    } : {
      branchId: role === "gm" && branches[0] ? branches[0].id : "",
      role: "",
      discount: 15,
      voidLimit: 50000,
      start: "07:00",
      end: "23:00",
      radius: 50,
      lock: true,
    });
  };

  const save = () => a.run(async () => {
    await api.saveTenantPolicy({
      tenantId,
      branchId: form.branchId || null,
      role: form.role || null,
      discount: Number(form.discount),
      voidLimit: Number(form.voidLimit),
      start: form.start + ":00",
      end: form.end + ":00",
      radius: Number(form.radius),
      lock: Boolean(form.lock),
    });
    setForm(null);
    r.reload();
  }, "Kebijakan berhasil disimpan dan disinkronkan.");

  return (
    <>
      <ServiceTabs />
      <PageHead
        eyebrow={subTab === "branding" ? "Fase 2 · Portal Pelanggan" : "Fase 1.4 · Kebijakan Berjenjang"}
        title={subTab === "branding" ? "Identitas Merek & Portal Member" : "Policy Builder 3 Lapis"}
        desc={subTab === "branding" ? "Atur nama merek, warna aksen, logo, dan pesan sambutan untuk portal digital Member di /m." : "Atur hierarki kebijakan mitigasi fraud dan kontrol operasional. Aturan dievaluasi berjenjang: Lapis 3 (Peran) ➔ Lapis 2 (Cabang) ➔ Lapis 1 (Toko)."}
        actions={subTab === "policies" ? <button type="button" className="d-btn d-btn--primary" onClick={() => openForm(null)}>+ Tambah Aturan Kebijakan</button> : null}
      />

      {["owner", "superadmin"].includes(role) && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "1px solid var(--d-border)", paddingBottom: "0.75rem" }}>
          <button
            type="button"
            className={`d-btn ${subTab === "policies" ? "d-btn--primary" : "d-btn--ghost"}`}
            onClick={() => setSubTab("policies")}
          >
            🛡️ Kebijakan Operasional (3 Lapis)
          </button>
          <button
            type="button"
            className={`d-btn ${subTab === "branding" ? "d-btn--primary" : "d-btn--ghost"}`}
            onClick={() => setSubTab("branding")}
          >
            🎨 Merek & Portal Member (/m)
          </button>
        </div>
      )}

      {subTab === "branding" ? (
        <BrandingForm />
      ) : (
        <>
          <Feedback a={a} />

          {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <section className="d-grid d-grid--4" aria-label="Ringkasan Kebijakan">
            <Stat title="Total Aturan Aktif" value={policies.length} note="Di seluruh hierarki" tone="accent" />
            <Stat title="Lapis 1 (Tenant)" value={policies.filter((p) => !p.branch_id && !p.role).length} note="Default global toko" tone="ok" />
            <Stat title="Lapis 2 (Cabang)" value={policies.filter((p) => p.branch_id && !p.role).length} note="Kebijakan per outlet" tone="warn" />
            <Stat title="Lapis 3 (Peran)" value={policies.filter((p) => p.role).length} note="Batas spesifik kasir/staf" tone="accent" />
          </section>

          {/* SIMULATOR EVALUASI LIVE */}
          <Panel title="🔍 Simulator Evaluasi Kebijakan Efektif" desc="Uji bagaimana sistem menyelesaikan aturan secara otomatis untuk kombinasi cabang dan peran tertentu.">
            <div className="d-form__row" style={{ marginBottom: "1.25rem" }}>
              <Field label="Pilih Cabang Bertugas" id="sim-br">
                <select id="sim-br" value={testBranch} onChange={(e) => setTestBranch(e.target.value)}>
                  <option value="">Tanpa Cabang Khusus (Default)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Pilih Peran Staf" id="sim-role">
                <select id="sim-role" value={testRole} onChange={(e) => setTestRole(e.target.value)}>
                  <option value="staff">Staff / Kasir</option>
                  <option value="gm">General Manager (GM)</option>
                  <option value="dokter">Dokter / Terapis</option>
                </select>
              </Field>
            </div>

            {sim.loading ? <Loading /> : sim.data && (
              <div style={{ background: "var(--d-surface-alt, rgba(255,255,255,0.03))", padding: "1rem 1.25rem", borderRadius: "8px", border: "1px solid var(--d-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <p className="d-eyebrow" style={{ margin: 0 }}>Hasil Resolusi Hierarki</p>
                  <Badge tone={LAYER_BADGE[sim.data.layer]?.[1] ?? "accent"}>{LAYER_BADGE[sim.data.layer]?.[0] ?? "Aktif"}</Badge>
                </div>
                <div className="d-grid d-grid--4" style={{ margin: 0 }}>
                  <div>
                    <span className="d-muted d-mono">Diskon Mandiri Maks:</span>
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "var(--d-accent)" }}>{sim.data.max_discount_pct}%</strong>
                  </div>
                  <div>
                    <span className="d-muted d-mono">Void Bebas PIN:</span>
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "var(--d-warn)" }}>{rupiah(sim.data.max_void_without_pin)}</strong>
                  </div>
                  <div>
                    <span className="d-muted d-mono">Jam Operasional Kasir:</span>
                    <strong style={{ display: "block", fontSize: "1.2rem" }}>{sim.data.operating_hours_start?.slice(0, 5)} – {sim.data.operating_hours_end?.slice(0, 5)}</strong>
                  </div>
                  <div>
                    <span className="d-muted d-mono">Radius Presensi GPS:</span>
                    <strong style={{ display: "block", fontSize: "1.2rem" }}>{sim.data.geofence_radius_meters} meter</strong>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* DAFTAR ATURAN KEBIJAKAN TERPASANG */}
          <Panel title="Daftar Aturan Kebijakan Terpasang" desc="Semua lapisan aturan operasional yang saat ini berlaku di database.">
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th scope="col">Lingkup / Lapis</th>
                    <th scope="col">Cabang</th>
                    <th scope="col">Peran Khusus</th>
                    <th scope="col">Batas Diskon</th>
                    <th scope="col">Void Tanpa PIN</th>
                    <th scope="col">Jam Kasir</th>
                    <th scope="col">Radius GPS</th>
                    <th scope="col"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => {
                    const layer = p.branch_id && p.role ? 3 : p.branch_id ? 2 : p.role ? 2 : 1;
                    const [lbl, tone] = LAYER_BADGE[layer];
                    return (
                      <tr key={p.id}>
                        <td><Badge tone={tone}>{lbl}</Badge></td>
                        <td><strong>{brName(p.branch_id)}</strong></td>
                        <td>{p.role ? ROLE_LABEL[p.role] : <span className="d-muted">Semua Peran</span>}</td>
                        <td>{p.max_discount_pct}%</td>
                        <td>{rupiah(p.max_void_without_pin)}</td>
                        <td>{p.operating_hours_start?.slice(0, 5)} – {p.operating_hours_end?.slice(0, 5)}</td>
                        <td>{p.geofence_radius_meters} m</td>
                        <td>
                          <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => openForm(p)}>Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
        </>
      )}

      {/* MODAL EDIT / TAMBAH KEBIJAKAN */}
      <Modal open={Boolean(form)} title={form?.id ? "Edit Aturan Kebijakan" : "Tambah Aturan Kebijakan"} onClose={() => setForm(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setForm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy} onClick={save}>Simpan Kebijakan</button>
        </>}>
        {form && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Cakupan Cabang" id="p-branch" hint="Kosongkan untuk menjadikan aturan default seluruh tenant">
                <select id="p-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">Semua Cabang (Lapis 1 Tenant Default)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Target Peran" id="p-role" hint="Pilih jika aturan berlaku khusus peran tertentu">
                <select id="p-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="">Semua Peran (Default Cabang/Tenant)</option>
                  <option value="staff">Staff / Kasir</option>
                  <option value="gm">General Manager (GM)</option>
                  <option value="dokter">Dokter / Terapis</option>
                </select>
              </Field>
            </div>

            <div className="d-form__row">
              <Field label="Batas Diskon Mandiri (%)" id="p-disc" hint="Diskon maksimal yang dapat diberikan tanpa approval">
                <input id="p-disc" type="number" min="0" max="100" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
              </Field>
              <Field label="Batas Void Tanpa PIN (Rp)" id="p-void" hint="Void di atas nominal ini wajib otorisasi PIN GM">
                <input id="p-void" type="number" min="0" step="5000" value={form.voidLimit} onChange={(e) => setForm({ ...form, voidLimit: e.target.value })} />
              </Field>
            </div>

            <div className="d-form__row">
              <Field label="Jam Mulai Operasional" id="p-start">
                <input id="p-start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </Field>
              <Field label="Jam Selesai Operasional" id="p-end">
                <input id="p-end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </Field>
            </div>

            <div className="d-form__row">
              <Field label="Radius Presensi GPS (meter)" id="p-radius" hint="Toleransi jarak absen geofencing">
                <input id="p-radius" type="number" min="10" max="500" value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} />
              </Field>
              <Field label="Kunci Buka Kasir di Luar Jam" id="p-lock" hint="Cegah pembukaan shift jika di luar jam operasional">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.lock} onChange={(e) => setForm({ ...form, lock: e.target.checked })} />
                  <span>Wajibkan Kunci Shift</span>
                </label>
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
