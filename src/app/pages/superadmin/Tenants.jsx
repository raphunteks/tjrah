import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useRouter } from "../../../lib/router.jsx";
import { can } from "../../../lib/rbac.js";
import { date } from "../../../lib/format.js";
import { taxLabel } from "../../../lib/tax.js";
import { PageHead, Panel, Loading, ErrorNote, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { STATUS_TONE, STATUS_LABEL } from "./Overview.jsx";

const PILLARS = { fnb: "Food & Beverages", retail: "Retail & Distribusi", service: "Hospitality & Personal Care", health: "Healthcare", mfg: "Manufaktur", omni: "Omnichannel" };
// tax_label "Pajak" + tarif 0 = biarkan database mengisi default sesuai pilar (PBJT 10% F&B, PPN 11% ritel, tanpa pajak klinik).
const EMPTY = { name: "", slug: "", pillar: "fnb", status: "trial", plan_id: "", current_period_end: "", owner_email: "", tax_label: "Pajak", tax_rate: 0 };
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function Tenants() {
  const { api, role, chooseTenant } = useAuth();
  const { navigate } = useRouter();
  const list = useAsync(() => api.listTenants(), [api]);
  const plans = useAsync(() => api.listPlans(), [api]);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit.name.trim() || !edit.slug.trim()) return setErr("Nama dan slug wajib diisi.");
    if (!(Number(edit.tax_rate) >= 0 && Number(edit.tax_rate) <= 0.5)) return setErr("Tarif pajak harus 0–50%.");
    setBusy(true);
    setErr(null);
    try {
      await api.saveTenant({ ...edit, plan_id: edit.plan_id || null, current_period_end: edit.current_period_end || null });
      setEdit(null);
      list.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteTenant(confirm.id);
      setConfirm(null);
      list.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Superadmin · Fitur 1"
        title="Tenant"
        desc="Merchant yang berlangganan Harum.in. Membuka dashboard tenant dicatat di audit log."
        actions={can(role, 1, "c") && <button type="button" className="d-btn d-btn--primary" onClick={() => { setErr(null); setEdit({ ...EMPTY }); }}>Tambah tenant</button>}
      />
      <Panel>
        {list.loading ? <Loading /> : list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th scope="col">Tenant</th><th scope="col">Pilar</th><th scope="col">Paket</th>
                  <th scope="col">Pajak</th><th scope="col">Status</th><th scope="col">Periode s.d.</th><th scope="col"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => (
                  <tr key={t.id}>
                    <td><p className="d-list__title">{t.name}</p><p className="d-list__meta d-mono">{t.slug}</p></td>
                    <td>{PILLARS[t.pillar]}</td>
                    <td>{t.plan?.name ?? "—"}</td>
                    <td>{taxLabel(null, t)}</td>
                    <td><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                    <td>{t.current_period_end ? date(t.current_period_end) : "—"}</td>
                    <td className="d-row-actions">
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { chooseTenant(t.id); navigate("/app/dashboard"); }}>Buka</button>
                      {can(role, 1, "u") && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { setErr(null); setEdit({ ...EMPTY, ...t, plan_id: t.plan_id ?? "" }); }}>Ubah</button>}
                      {can(role, 1, "d") && <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => { setErr(null); setConfirm(t); }}>Hapus</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(edit)}
        title={edit?.id ? "Ubah tenant" : "Tambah tenant"}
        onClose={() => setEdit(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan tenant"}</button>
        </>}
      >
        {edit && (
          <div className="d-form">
            <Field label="Nama usaha" id="t-name">
              <input id="t-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} autoFocus />
            </Field>
            <Field label="Slug" id="t-slug" hint="Dipakai di URL toko online">
              <input id="t-slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />
            </Field>
            <div className="d-form__row">
              <Field label="Pilar industri" id="t-pillar">
                <select id="t-pillar" value={edit.pillar} onChange={(e) => setEdit({ ...edit, pillar: e.target.value })}>
                  {Object.entries(PILLARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Status" id="t-status">
                <select id="t-status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Paket" id="t-plan">
                <select id="t-plan" value={edit.plan_id} onChange={(e) => setEdit({ ...edit, plan_id: e.target.value })}>
                  <option value="">Tanpa paket</option>
                  {(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Periode berakhir" id="t-end">
                <input id="t-end" type="date" value={edit.current_period_end ?? ""} onChange={(e) => setEdit({ ...edit, current_period_end: e.target.value })} />
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Nama pajak penjualan" id="t-taxl" hint="Mis. PBJT (F&B), PPN (ritel). Klinik selalu tanpa pajak.">
                <input id="t-taxl" value={edit.tax_label ?? ""} onChange={(e) => setEdit({ ...edit, tax_label: e.target.value })} />
              </Field>
              <Field label="Tarif (%)" id="t-taxr" hint="Kosongkan 0 untuk tenant baru agar mengikuti default pilar.">
                <input id="t-taxr" inputMode="decimal" value={Math.round(Number(edit.tax_rate ?? 0) * 10000) / 100}
                  onChange={(e) => setEdit({ ...edit, tax_rate: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "") || 0) / 100 })} />
              </Field>
            </div>
            <Field label="Email pemilik" id="t-email">
              <input id="t-email" type="email" value={edit.owner_email ?? ""} onChange={(e) => setEdit({ ...edit, owner_email: e.target.value })} />
            </Field>
            {err && <p className="d-field__error" role="alert">{err}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title="Hapus tenant?"
        onClose={() => setConfirm(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setConfirm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--danger" onClick={remove} disabled={busy}>Hapus {confirm?.name}</button>
        </>}
      >
        <p className="d-text">Seluruh data <strong>{confirm?.name}</strong> (cabang, transaksi, jurnal, karyawan) ikut terhapus dan tidak bisa dikembalikan.</p>
        {err && <p className="d-field__error" role="alert">{err}</p>}
      </Modal>
    </>
  );
}
