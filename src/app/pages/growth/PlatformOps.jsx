import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const TABS = [["bill", "Tagihan"], ["flags", "Feature flag"], ["reseller", "Reseller"], ["ai", "Kuota AI"]];
const ISTAT = { paid: ["Lunas", "ok"], unpaid: ["Belum lunas", "warn"], void: ["Batal", "neutral"] };

function Bill() {
  const { api } = useAuth();
  const a = useAction();
  const [why, setWhy] = useState({});
  const q = useAsync(async () => ({ inv: (await api.listInvoices()).slice().sort((a, b) => String(b.period).localeCompare(String(a.period))), ten: await api.listTenants() }), [api]);
  useLive(["invoices", "tenants"], q.reload);
  const name = (id) => q.data?.ten.find((t) => t.id === id)?.name ?? id;
  const go = (fn, msg) => a.run(async () => { const r = await fn(); q.reload(); return r; }, msg);
  return (
    <Panel title="Tagihan" actions={<>
      <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => go(() => api.rpc("generate_invoices", {}), (n) => `${n} tagihan baru dibuat`)}>Buat tagihan bulan ini</button>
      <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => go(() => api.rpc("run_dunning"), (n) => `${n} pengingat/penangguhan diproses`)}>Jalankan penagihan</button></>}>
      <p className="d-text d-muted">Penagihan otomatis (cron) hanya berjalan bila saklar billing di platform_settings dinyalakan; bawaannya mati agar tenant lama tidak langsung ditagih.</p>
      <Feedback a={a} />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : q.data.inv.length === 0 ? <Empty title="Belum ada tagihan" /> : (
        <div className="d-table-wrap"><table className="d-table d-table--fin">
          <thead><tr><th scope="col">Tenant</th><th scope="col">Periode</th><th scope="col" className="d-num">Jumlah</th><th scope="col">Jatuh tempo</th><th scope="col">Pengingat</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
          <tbody>{q.data.inv.map((i) => (
            <tr key={i.id}><td>{name(i.tenant_id)}</td><td>{String(i.period).slice(0, 7)}</td><td className="d-num">{rupiah(i.amount)}</td><td>{i.due_date ? date(i.due_date) : "—"}</td><td>{i.reminder_stage ?? 0}/4</td>
              <td><Badge tone={(ISTAT[i.status] ?? ["", "neutral"])[1]}>{(ISTAT[i.status] ?? [i.status])[0]}</Badge></td>
              <td>{i.status === "unpaid" && <div className="d-row-actions">
                <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => go(() => api.rpc("mark_invoice_paid", { p_invoice: i.id, p_ref: "manual" }), "Ditandai lunas")}>Tandai lunas</button>
                <input className="d-cell-input" aria-label={`Alasan batal ${name(i.tenant_id)}`} placeholder="Alasan batal" value={why[i.id] ?? ""} onChange={(e) => setWhy({ ...why, [i.id]: e.target.value })} />
                <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy || (why[i.id] ?? "").trim().length < 5} onClick={() => go(() => api.rpc("void_invoice", { p_invoice: i.id, p_reason: why[i.id] }), "Dibatalkan")}>Batalkan</button></div>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Flags() {
  const { api } = useAuth();
  const a = useAction();
  const q = useAsync(async () => ({ f: await api.list("feature_flags"), o: await api.list("tenant_flag_overrides"), ten: await api.listTenants() }), [api]);
  useLive(["feature_flags", "tenant_flag_overrides"], q.reload);
  const [ov, setOv] = useState({ tenant: "", key: "", enabled: "true", reason: "" });
  const upd = (f, patch) => a.run(async () => { const n = { ...f, ...patch }; await api.rpc("set_feature_flag", { p_key: n.key, p_description: n.description, p_default: n.default_enabled, p_plans: n.plans, p_rollout: Number(n.rollout_pct) }); q.reload(); }, "Flag disimpan");
  return (
    <>
      <Panel title="Feature flag global">
        {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
          <div className="d-table-wrap"><table className="d-table">
            <thead><tr><th scope="col">Flag</th><th scope="col">Bawaan</th><th scope="col">Paket</th><th scope="col" className="d-num">Rollout %</th></tr></thead>
            <tbody>{q.data.f.map((f) => (
              <tr key={f.key}><td><span className="d-mono">{f.key}</span><div className="d-muted">{f.description}</div></td>
                <td><label className="d-check"><input type="checkbox" checked={f.default_enabled} disabled={a.busy} onChange={(e) => upd(f, { default_enabled: e.target.checked })} /> Semua</label></td>
                <td>{["starter", "growth", "enterprise"].map((p) => <label key={p} className="d-check"><input type="checkbox" checked={f.plans.includes(p)} disabled={a.busy} onChange={(e) => upd(f, { plans: e.target.checked ? [...f.plans, p] : f.plans.filter((x) => x !== p) })} /> {p}</label>)}</td>
                <td className="d-num"><input className="d-cell-input" inputMode="numeric" aria-label={`Rollout ${f.key}`} defaultValue={f.rollout_pct} onBlur={(e) => Number(e.target.value) !== f.rollout_pct && upd(f, { rollout_pct: Number(e.target.value) })} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Feedback a={a} />
      </Panel>
      <Panel title="Override per tenant">
        {q.data && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Tenant" id="ov-t"><select id="ov-t" value={ov.tenant} onChange={(e) => setOv({ ...ov, tenant: e.target.value })}><option value="">Pilih…</option>{q.data.ten.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Flag" id="ov-k"><select id="ov-k" value={ov.key} onChange={(e) => setOv({ ...ov, key: e.target.value })}><option value="">Pilih…</option>{q.data.f.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}</select></Field>
              <Field label="Nilai" id="ov-e"><select id="ov-e" value={ov.enabled} onChange={(e) => setOv({ ...ov, enabled: e.target.value })}><option value="true">Aktifkan</option><option value="false">Matikan</option></select></Field>
            </div>
            <Field label="Alasan" id="ov-r"><input id="ov-r" value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} /></Field>
            <div className="d-form__actions"><button type="button" className="d-btn d-btn--primary" disabled={a.busy || !ov.tenant || !ov.key} onClick={() => a.run(async () => { await api.rpc("set_flag_override", { p_tenant: ov.tenant, p_key: ov.key, p_enabled: ov.enabled === "true", p_reason: ov.reason || null }); q.reload(); }, "Override disimpan")}>Simpan override</button></div>
            {q.data.o.length > 0 && <ul className="d-list">{q.data.o.map((o) => <li key={`${o.tenant_id}${o.key}`}><span className="d-mono">{o.key}</span> → <Badge tone={o.enabled ? "ok" : "neutral"}>{o.enabled ? "aktif" : "mati"}</Badge> · {q.data.ten.find((t) => t.id === o.tenant_id)?.name}{o.reason ? ` · ${o.reason}` : ""}</li>)}</ul>}
          </div>
        )}
      </Panel>
    </>
  );
}

function Reseller() {
  const { api } = useAuth();
  const a = useAction();
  const [f, setF] = useState({ code: "", name: "", email: "", pct: "20" });
  const [pick, setPick] = useState(null);
  const q = useAsync(async () => ({ r: await api.list("resellers", { order: ["created_at", "desc"] }), ten: await api.listTenants() }), [api]);
  const st = useAsync(() => (pick ? api.rpc("reseller_statement", { p_reseller: pick }) : Promise.resolve(null)), [api, pick, q.data]);
  useLive(["resellers", "reseller_commissions", "tenants"], () => { q.reload(); st.reload(); });
  const go = (fn, msg) => a.run(async () => { const r = await fn(); q.reload(); return r; }, msg);
  return (
    <div className="d-grid">
      <Panel title="Reseller / agen">
        <div className="d-form">
          <div className="d-form__row">
            <Field label="Kode" id="rs-c"><input id="rs-c" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Nama" id="rs-n"><input id="rs-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Komisi %" id="rs-p"><input id="rs-p" type="number" min="0" max="50" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field>
          </div>
          <div className="d-form__actions"><button type="button" className="d-btn d-btn--primary" disabled={a.busy || f.code.length < 3 || !f.name.trim()} onClick={() => go(async () => { await api.rpc("create_reseller", { p_code: f.code, p_name: f.name, p_email: f.email || null, p_pct: Number(f.pct) }); setF({ code: "", name: "", email: "", pct: "20" }); }, "Reseller dibuat")}>Tambah reseller</button></div>
          <Feedback a={a} />
        </div>
        {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : q.data.r.length === 0 ? <Empty title="Belum ada reseller" /> : (
          <ul className="d-list">{q.data.r.map((r) => (
            <li key={r.id}><div className="d-list__title">{r.name} <span className="d-mono">{r.code}</span> · {r.commission_pct}%</div>
              <div className="d-row-actions"><button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setPick(r.id)}>Laporan</button></div></li>
          ))}</ul>
        )}
      </Panel>
      <Panel title="Penugasan tenant">
        {q.data && <ul className="d-list">{q.data.ten.map((t) => (
          <li key={t.id}><div className="d-list__title">{t.name}</div>
            <select aria-label={`Reseller ${t.name}`} value={t.reseller_id ?? ""} disabled={a.busy} onChange={(e) => go(() => api.rpc("assign_reseller", { p_tenant: t.id, p_reseller: e.target.value || null }), "Penugasan disimpan")}><option value="">— langsung —</option>{q.data.r.filter((r) => r.status === "active").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></li>
        ))}</ul>}
      </Panel>
      {pick && (
        <Panel title="Laporan komisi">
          {st.loading || !st.data ? <Loading /> : st.error ? <ErrorNote error={st.error} /> : (
            <>
              <p className="d-text">{st.data.reseller.name} · tenant aktif {st.data.tenants_aktif} · terutang <strong>{rupiah(st.data.accrued)}</strong> · sudah dibayar {rupiah(st.data.paid)}</p>
              <div className="d-form__actions"><button type="button" className="d-btn d-btn--primary" disabled={a.busy || st.data.accrued <= 0} onClick={() => go(async () => { const n = await api.rpc("pay_reseller_commissions", { p_reseller: pick }); st.reload(); return n; }, (n) => `Komisi ${rupiah(n)} ditandai dibayar`)}>Tandai komisi dibayar</button></div>
              {st.data.lines.length > 0 && <div className="d-table-wrap"><table className="d-table d-table--fin"><thead><tr><th scope="col">Tenant</th><th scope="col">Periode</th><th scope="col" className="d-num">Dasar</th><th scope="col" className="d-num">%</th><th scope="col" className="d-num">Komisi</th><th scope="col">Status</th></tr></thead>
                <tbody>{st.data.lines.map((l, i) => <tr key={i}><td>{l.tenant}</td><td>{String(l.invoice_period).slice(0, 7)}</td><td className="d-num">{rupiah(l.base)}</td><td className="d-num">{l.pct}</td><td className="d-num">{rupiah(l.amount)}</td><td><Badge tone={l.status === "paid" ? "ok" : "warn"}>{l.status === "paid" ? "Dibayar" : "Terutang"}</Badge></td></tr>)}</tbody></table></div>}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

function Ai() {
  const { api } = useAuth();
  const a = useAction();
  const q = useAsync(async () => ({ u: await api.list("ai_usage"), ten: await api.listTenants() }), [api]);
  const [val, setVal] = useState({});
  useLive(["ai_usage", "tenants"], q.reload);
  return (
    <Panel title="Pemakaian & kuota AI per tenant">
      <p className="d-text d-muted">Kuota override menimpa paket. Kosong = ikut paket; 0 = tidak boleh memakai AI. Batas bersifat lunak dan dihitung per bulan UTC.</p>
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
        <div className="d-table-wrap"><table className="d-table d-table--fin">
          <thead><tr><th scope="col">Tenant</th><th scope="col" className="d-num">Token bulan ini</th><th scope="col" className="d-num">Panggilan</th><th scope="col">Override kuota</th></tr></thead>
          <tbody>{q.data.ten.map((t) => {
            const u = q.data.u.find((x) => x.tenant_id === t.id && String(x.month).slice(0, 7) === new Date().toISOString().slice(0, 7));
            return <tr key={t.id}><td>{t.name}</td><td className="d-num">{(u?.tokens ?? 0).toLocaleString("id-ID")}</td><td className="d-num">{u?.calls ?? 0}</td>
              <td><div className="d-row-actions"><input className="d-cell-input" inputMode="numeric" aria-label={`Kuota ${t.name}`} placeholder={t.ai_quota_override == null ? "ikut paket" : String(t.ai_quota_override)} value={val[t.id] ?? ""} onChange={(e) => setVal({ ...val, [t.id]: e.target.value })} />
                <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("set_ai_quota", { p_tenant: t.id, p_tokens: (val[t.id] ?? "") === "" ? null : Number(val[t.id]) }); setVal({ ...val, [t.id]: "" }); q.reload(); }, "Kuota disimpan")}>Simpan</button></div></td></tr>;
          })}</tbody>
        </table></div>
      )}
      <Feedback a={a} />
    </Panel>
  );
}

export default function PlatformOps() {
  const [tab, setTab] = useState("bill");
  return (
    <>
      <PageHead eyebrow="Platform · Fase 4" title="Penagihan, flag, reseller & kuota AI" desc="Pusat kendali Superadmin. Semua tindakan tercatat di audit log." />
      <div className="d-chips" role="tablist" aria-label="Bagian">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`d-chip${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "bill" && <Bill />}{tab === "flags" && <Flags />}{tab === "reseller" && <Reseller />}{tab === "ai" && <Ai />}
    </>
  );
}
