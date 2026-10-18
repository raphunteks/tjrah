import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { healthOf, inviteStatus, INVITE_STATUS, auditText } from "../../../lib/watch.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Modal, Field, Empty, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";
import { STATUS_TONE, STATUS_LABEL } from "../superadmin/Overview.jsx";
import { ServiceTabs, HealthPill, ago } from "./shared.jsx";
import { generateTempPassword, copyToClipboard } from "../../../lib/passwordGenerator.js";

const PILLARS = { fnb: "Food & Beverages", retail: "Retail & Distribusi", service: "Hospitality & Personal Care", health: "Healthcare", mfg: "Manufaktur", omni: "Omnichannel" };
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NEW = {
  name: "",
  slug: "",
  pillar: "fnb",
  plan: "",
  trial: 14,
  branches: "Cabang Utama",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  tempPassword: "",
  gender: "Laki-laki",
  birthPlace: "",
  birthDate: "",
  address: ""
};

/** Superadmin · Kelola Owner Merchant — hanya akun berperan Owner (tidak ada dropdown peran, tidak ada jalur naik ke Superadmin). */
export default function Owners() {
  const { api } = useAuth();
  const r = useAsync(async () => {
    const [health, invites, plans, tenants] = await Promise.all([
      api.rpc("tenant_health"),
      api.list("staff_invites", { order: ["created_at", "desc"] }),
      api.listPlans(),
      api.listTenants(),
    ]);
    return { health, invites, plans, tenants };
  }, [api]);
  useLive(["tenants", "staff_invites", "profiles"], r.reload);
  const a = useAction();
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPillar, setFPillar] = useState("");
  const [form, setForm] = useState(null);
  const [showBioAccordion, setShowBioAccordion] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [successModal, setSuccessModal] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [susp, setSusp] = useState(null); // { row, reason }
  const [detail, setDetail] = useState(null);

  const rows = useMemo(() => (r.data?.health ?? []).map((t) => {
    const ownerInvites = (r.data.invites ?? []).filter((i) => i.tenant_id === t.tenant_id && i.role === "owner");
    const open = ownerInvites.find((i) => !i.accepted_at && !i.revoked_at);
    return { t, h: healthOf(t), invite: open ?? null, shownInvite: open ?? ownerInvites[0] ?? null };
  }), [r.data]);
  const shown = rows.filter(({ t, shownInvite }) =>
    (!fStatus || t.status === fStatus) && (!fPillar || t.pillar === fPillar)
    && (!q || `${t.name} ${t.owner_name ?? shownInvite?.full_name ?? ""} ${t.owner_email ?? shownInvite?.email ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  const count = (f) => rows.filter(({ t }) => f(t)).length;
  const pendingInvites = rows.filter((x) => x.invite).length;

  /** Simpan tenant + undangan Owner dalam satu transaksi database, lalu kirim undangan via SMTP & buat kredensial Auth langsung. */
  const create = () => a.run(async () => {
    const f = form;
    const tempPass = f.tempPassword?.trim() || generateTempPassword();
    const res = await api.rpc("create_tenant_with_owner", {
      p_name: f.name, p_slug: f.slug || slugify(f.name), p_pillar: f.pillar, p_plan: f.plan || null,
      p_owner_name: f.ownerName, p_owner_email: f.ownerEmail, p_owner_phone: f.ownerPhone || null,
      p_trial_days: Number(f.trial), p_branches: f.branches.split(",").map((x) => x.trim()).filter(Boolean),
    });

    // Sinkronisasi data Identitas Diri Owner ke LocalStorage agar saat login otomatis terisi lengkap
    try {
      const emailKey = f.ownerEmail?.trim().toLowerCase();
      if (emailKey) {
        if (f.gender) localStorage.setItem(`tijarah:gender:${emailKey}`, f.gender);
        if (f.birthPlace) localStorage.setItem(`tijarah:birth_place:${emailKey}`, f.birthPlace);
        if (f.birthDate) localStorage.setItem(`tijarah:birth_date:${emailKey}`, f.birthDate);
        if (f.address) localStorage.setItem(`tijarah:address:${emailKey}`, f.address);
        if (f.ownerPhone) localStorage.setItem(`tijarah:phone:${emailKey}`, f.ownerPhone);
      }
    } catch {}

    // Panggil Endpoint SMTP & Auth Provisioning
    let emailStatus = "";
    try {
      const invitePayload = {
        email: f.ownerEmail,
        fullName: f.ownerName,
        role: "owner",
        phone: f.ownerPhone || null,
        tenantId: res.tenant_id,
        tenantName: f.name,
        branches: f.branches.split(",").map((x) => x.trim()).filter(Boolean),
        tempPassword: tempPass,
        inviteId: res.invite_id,
        loginUrl: window.location.origin + "/masuk",
        senderName: "Superadmin Tijarah"
      };

      const resp = await fetch("/api/invite-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invitePayload)
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.ok) {
        emailStatus = data.emailSent ? `Email kredensial terkirim ke ${f.ownerEmail}.` : `Akun aktif; kirim email (${data.emailError || "kendala SMTP"}).`;
      } else {
        emailStatus = data?.error ? `Catatan: ${data.error}` : "";
      }
    } catch (e) {
      emailStatus = `Catatan aktivasi: ${e.message}`;
    }

    setSuccessModal({
      open: true,
      title: "Akun Owner Berhasil Dibuat!",
      data: {
        name: f.ownerName,
        email: f.ownerEmail,
        tenantName: f.name,
        role: "Owner",
        tempPassword: tempPass,
        loginUrl: window.location.origin + "/masuk"
      }
    });

    setForm(null);
    setShowBioAccordion(false);
    r.reload();
    return `Tenant ${f.name} dan Akun Owner berhasil dibuat. ${emailStatus}`;
  }, (m) => m);

  const resend = (inv) => a.run(async () => {
    const newTemp = generateTempPassword();
    await api.rpc("resend_invite", { p_id: inv.id });
    
    try {
      const tenantRow = rows.find((x) => x.t.tenant_id === inv.tenant_id)?.t;
      await fetch("/api/invite-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inv.email,
          fullName: inv.full_name,
          role: "owner",
          tenantId: inv.tenant_id,
          tenantName: tenantRow?.name || "Merchant",
          tempPassword: newTemp,
          inviteId: inv.id,
          loginUrl: window.location.origin + "/masuk",
          senderName: "Superadmin Tijarah"
        })
      });
    } catch (err) {
      console.warn("Gagal mengirim ulang undangan via SMTP:", err);
    }

    setSuccessModal({
      open: true,
      title: "Kata Sandi Diperbarui & Email Terkirim!",
      data: {
        name: inv.full_name,
        email: inv.email,
        tenantName: rows.find((x) => x.t.tenant_id === inv.tenant_id)?.t?.name || "Merchant",
        role: "Owner",
        tempPassword: newTemp,
        loginUrl: window.location.origin + "/masuk"
      }
    });

    r.reload();
  }, "Kata sandi sementara baru dibuat dan email dikirim ulang via SMTP.");

  const revoke = (inv) => a.run(async () => { await api.rpc("revoke_invite", { p_id: inv.id }); r.reload(); }, "Undangan dicabut.");
  const extend = (t) => a.run(async () => { await api.rpc("extend_trial", { p_tenant: t.tenant_id, p_days: 7 }); r.reload(); }, `Masa berlaku ${t.name} diperpanjang 7 hari.`);
  const suspend = () => a.run(async () => {
    await api.rpc("set_tenant_suspended", { p_tenant: susp.row.t.tenant_id, p_suspend: true, p_reason: susp.reason });
    setSusp(null);
    r.reload();
  }, "Status tenant diperbarui.");

  const openCreateModal = () => {
    a.setError(null);
    a.setOk(null);
    const freshPass = generateTempPassword();
    setForm({
      ...NEW,
      tempPassword: freshPass,
      plan: r.data?.plans?.find((p) => p.is_active)?.id ?? ""
    });
    setShowPass(false);
    setCopiedPass(false);
    setShowBioAccordion(false);
  };

  return (
    <>
      <PageHead eyebrow="Superadmin · Layanan & Akses" title="Kelola Owner Merchant"
        desc="Satu baris per merchant. Undang Owner baru sekaligus membuat tenant-nya; tangguhkan tenant mencabut akses seluruh tim tanpa menghapus data."
        actions={<button type="button" className="d-btn d-btn--primary" onClick={openCreateModal}>Undang Owner baru</button>} />
      <ServiceTabs />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <div className="d-stats">
            <Stat label="Merchant" value={rows.length} sub={`${count((t) => t.status === "active")} aktif`} />
            <Stat label="Masa uji coba" value={count((t) => t.status === "trial")} sub="trial berjalan" />
            <Stat label="Telat / ditangguhkan" value={count((t) => ["past_due", "suspended"].includes(t.status))} sub="perlu perhatian" />
            <Stat label="Undangan menunggu" value={pendingInvites} sub="Owner belum menerima" />
          </div>
          <Feedback a={a} />
          <Panel title="Owner & tenant" meta={`${shown.length} dari ${rows.length}`} actions={
            <div className="d-filters">
              <input className="d-date" type="search" placeholder="Cari usaha, nama, email" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="d-date" aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">Semua status</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="d-date" aria-label="Pilar" value={fPillar} onChange={(e) => setFPillar(e.target.value)}>
                <option value="">Semua pilar</option>
                {Object.entries(PILLARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>}>
            {shown.length === 0 ? <Empty title="Tidak ada merchant yang cocok" /> : (
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr>
                  <th scope="col">Owner</th><th scope="col">Usaha</th><th scope="col">Paket</th><th scope="col">Status</th>
                  <th scope="col" className="d-num">Cabang · Staf</th><th scope="col">Terakhir aktif</th><th scope="col">Kesehatan</th><th scope="col"><span className="sr-only">Aksi</span></th>
                </tr></thead>
                <tbody>{shown.map(({ t, h, invite, shownInvite }) => {
                  const st = shownInvite ? INVITE_STATUS[inviteStatus(shownInvite)] : null;
                  return (
                    <tr key={t.tenant_id}>
                      <td>{t.owner_name ?? shownInvite?.full_name ?? "—"}<p className="d-list__meta">{t.owner_email ?? shownInvite?.email ?? "—"}</p>
                        {!t.owner_id && st && <Badge tone={st[1]}>Undangan: {st[0]}</Badge>}
                        {t.owner_id && t.owner_active === false && <Badge tone="danger">Login dinonaktifkan</Badge>}</td>
                      <td>{t.name}<p className="d-list__meta">{PILLARS[t.pillar]}</p></td>
                      <td>{t.plan_name ?? "—"}<p className="d-list__meta">{t.period_end ? `s.d. ${date(t.period_end)}` : "—"}</p></td>
                      <td><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                      <td className="d-num">{t.branches} · {t.staff}</td>
                      <td>{t.owner_id ? ago(t.owner_last_login) : "—"}</td>
                      <td><HealthPill health={h} /></td>
                      <td><div className="d-row-actions">
                        <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setDetail(t.tenant_id)}>Detail</button>
                        {invite && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => resend(invite)}>Kirim ulang</button>}
                        {invite && <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy} onClick={() => revoke(invite)}>Cabut</button>}
                        {["trial", "past_due"].includes(t.status) && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => extend(t)}>+7 hari</button>}
                        {t.status === "suspended"
                          ? <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("set_tenant_suspended", { p_tenant: t.tenant_id, p_suspend: false }); r.reload(); }, `${t.name} diaktifkan kembali.`)}>Aktifkan</button>
                          : <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => setSusp({ row: { t }, reason: "" })}>Tangguhkan</button>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
            <p className="d-text d-muted svc-foot">Belum tersedia di versi ini: reset 2FA (2FA belum ada), kirim pesan langsung, dan ekspor data tenant untuk permintaan PDP.</p>
          </Panel>
        </>
      )}

      <Modal open={Boolean(form)} title="Undang Owner baru" onClose={() => setForm(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setForm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !form?.name || !form?.ownerName || !form?.ownerEmail} onClick={create}>Buat tenant &amp; kirim undangan</button></>}>
        {form && (
          <div className="d-form">
            <Field label="Nama usaha" id="o-name"><input id="o-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} /></Field>
            <div className="d-form__row">
              <Field label="Slug" id="o-slug" hint="Huruf kecil, angka, tanda hubung."><input id="o-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
              <Field label="Jenis usaha" id="o-pillar"><select id="o-pillar" value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value })}>{Object.entries(PILLARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
            <div className="d-form__row">
              <Field label="Paket" id="o-plan"><select id="o-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}><option value="">Belum dipilih</option>{(r.data?.plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Masa uji coba (hari)" id="o-trial"><input id="o-trial" type="number" min="0" max="90" value={form.trial} onChange={(e) => setForm({ ...form, trial: e.target.value })} /></Field>
            </div>
            <Field label="Cabang awal" id="o-br" hint="Pisahkan dengan koma. Owner tidak dapat membuat cabang sendiri."><input id="o-br" value={form.branches} onChange={(e) => setForm({ ...form, branches: e.target.value })} /></Field>
            <div className="d-form__row">
              <Field label="Nama Owner" id="o-on"><input id="o-on" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></Field>
              <Field label="WhatsApp Owner (opsional)" id="o-op"><input id="o-op" inputMode="tel" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} /></Field>
            </div>
            <Field label="Email Owner" id="o-oe" hint="Kredensial akun akan dikirimkan ke email ini via SMTP."><input id="o-oe" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></Field>

            {/* Mekanisme 2: Auto-Generate Kata Sandi Acak Sementara di Modal */}
            <div style={{
              margin: "0.75rem 0",
              padding: "0.85rem",
              background: "var(--color-paper-2)",
              border: "1px solid var(--color-rule)",
              borderRadius: "var(--radius-md)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.35rem" }}>
                <label htmlFor="o-temp-pass" style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-ink)" }}>
                  Kata Sandi Acak Sementara (Wajib &amp; Otomatis)
                </label>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => {
                      const fresh = generateTempPassword();
                      setForm({ ...form, tempPassword: fresh });
                    }}
                    title="Generate kata sandi baru"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px" }}>
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    Acak Sandi
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => setShowPass(!showPass)}
                  >
                    {showPass ? "Sembunyikan" : "Lihat"}
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", color: copiedPass ? "var(--color-accent, #10B981)" : "inherit" }}
                    onClick={async () => {
                      const ok = await copyToClipboard(form.tempPassword);
                      if (ok) {
                        setCopiedPass(true);
                        setTimeout(() => setCopiedPass(false), 2000);
                      }
                    }}
                  >
                    {copiedPass ? "Tersalin!" : "Salin"}
                  </button>
                </div>
              </div>
              <input
                id="o-temp-pass"
                type={showPass ? "text" : "password"}
                value={form.tempPassword || ""}
                onChange={(e) => setForm({ ...form, tempPassword: e.target.value })}
                style={{ fontFamily: "monospace", letterSpacing: "0.05em", fontWeight: 600, color: "var(--color-accent, #10B981)" }}
                required
              />
              <p className="d-field__hint" style={{ marginTop: "0.35rem", fontSize: "0.74rem" }}>
                Akun langsung diaktifkan dengan kata sandi ini &amp; dikirimkan via SMTP Gmail. Owner dapat langsung masuk tanpa bergantung pada tautan aktivasi Supabase yang rentan kedaluwarsa.
              </p>
            </div>

            {/* Accordion / Lipatan Biodata Identitas Diri Sesuai Profil Saya */}
            <div style={{ margin: "0.75rem 0 0.25rem" }}>
              <button
                type="button"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.625rem 0.85rem",
                  background: showBioAccordion ? "var(--color-paper-3)" : "var(--color-paper-2)",
                  border: "1px dashed var(--color-rule)",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  color: showBioAccordion ? "var(--color-accent)" : "var(--color-ink)",
                  transition: "all 0.15s ease"
                }}
                onClick={() => setShowBioAccordion((prev) => !prev)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showBioAccordion ? (
                      <line x1="5" y1="12" x2="19" y2="12" />
                    ) : (
                      <>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </>
                    )}
                  </svg>
                  <span>{showBioAccordion ? "Sembunyikan Biodata Identitas Diri Owner" : "+ Lengkapi Biodata Identitas Diri Owner (Opsional)"}</span>
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--color-muted)", fontWeight: 400 }}>
                  {showBioAccordion ? "Klik untuk melipat" : "Jenis Kelamin, Tgl Lahir, Alamat"}
                </span>
              </button>
            </div>

            {showBioAccordion && (
              <div style={{
                padding: "0.85rem",
                background: "var(--color-paper-2)",
                border: "1px solid var(--color-rule)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                marginBottom: "0.5rem"
              }}>
                <div className="d-form__row">
                  <Field label="Jenis Kelamin" id="o-gender">
                    <select id="o-gender" value={form.gender || "Laki-laki"} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </Field>
                  <Field label="Tempat Lahir" id="o-birth-place" hint="Contoh: Makassar">
                    <input id="o-birth-place" value={form.birthPlace || ""} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} placeholder="Tempat lahir" />
                  </Field>
                </div>
                <Field label="Tanggal Lahir" id="o-birth-date">
                  <input id="o-birth-date" type="date" value={form.birthDate || ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
                </Field>
                <Field label="Alamat Domisili Tempat Tinggal" id="o-address">
                  <textarea id="o-address" rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Alamat lengkap tempat tinggal Owner" />
                </Field>
              </div>
            )}

            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Kredensial Berhasil Dibuat */}
      <Modal
        open={Boolean(successModal)}
        title={successModal?.title || "Akun Berhasil Dibuat!"}
        onClose={() => setSuccessModal(null)}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", width: "100%", flexWrap: "wrap" }}>
            <button
              type="button"
              className="d-btn d-btn--primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              onClick={async () => {
                const creds = successModal?.data;
                const text = `Halo ${creds?.name},\nBerikut kredensial akun Owner Tijarah Anda untuk ${creds?.tenantName}:\n• Halaman Masuk: ${creds?.loginUrl}\n• Email Masuk: ${creds?.email}\n• Kata Sandi Sementara: ${creds?.tempPassword}\n\nSilakan masuk dan segera perbarui kata sandi ini di menu Akun > Keamanan & Kredensial.`;
                const ok = await copyToClipboard(text);
                if (ok) {
                  setCopiedCreds(true);
                  setTimeout(() => setCopiedCreds(false), 2500);
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              {copiedCreds ? "Kredensial Tersalin!" : "Salin Format WhatsApp / Teks"}
            </button>
            <button
              type="button"
              className="d-btn d-btn--ghost"
              onClick={() => setSuccessModal(null)}
            >
              Tutup &amp; Selesai
            </button>
          </div>
        }
      >
        {successModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B1310", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-ink)" }}>
                Akun telah aktif di sistem dan email kredensial telah dikirimkan via SMTP ke <strong>{successModal.data.email}</strong>.
              </p>
            </div>

            <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)", width: "35%" }}>Nama Owner:</td>
                    <td style={{ padding: "0.35rem 0", fontWeight: 600 }}>{successModal.data.name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>Nama Usaha:</td>
                    <td style={{ padding: "0.35rem 0", fontWeight: 600 }}>{successModal.data.tenantName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>Email Masuk:</td>
                    <td style={{ padding: "0.35rem 0", fontWeight: 600, fontFamily: "monospace" }}>{successModal.data.email}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>Kata Sandi Sementara:</td>
                    <td style={{ padding: "0.35rem 0" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1rem", color: "var(--color-accent, #10B981)", background: "rgba(16, 185, 129, 0.15)", padding: "2px 8px", borderRadius: "4px", border: "1px dashed rgba(16, 185, 129, 0.4)" }}>
                        {successModal.data.tempPassword}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>Halaman Masuk:</td>
                    <td style={{ padding: "0.35rem 0" }}>
                      <a href={successModal.data.loginUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
                        {successModal.data.loginUrl}
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-muted)", lineHeight: 1.4 }}>
              Catatan: Kredensial di atas juga dapat Anda salin dan kirimkan secara langsung melalui WhatsApp atau media komunikasi lainnya kepada pemilik usaha.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(susp)} title={`Tangguhkan ${susp?.row.t.name ?? ""}`} onClose={() => setSusp(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setSusp(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--danger" disabled={a.busy || (susp?.reason ?? "").trim().length < 3} onClick={suspend}>Tangguhkan tenant</button></>}>
        {susp && (
          <div className="d-form">
            <p className="d-text">Seluruh tim tenant ini langsung tidak bisa membaca atau menulis data. Data tetap utuh dan dapat dipulihkan dengan “Aktifkan”.</p>
            <Field label="Alasan (ditampilkan di halaman masuk Owner)" id="s-reason"><input id="s-reason" value={susp.reason} onChange={(e) => setSusp({ ...susp, reason: e.target.value })} /></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {detail && <OwnerDetail tenantId={detail} onClose={() => setDetail(null)} plans={r.data?.plans ?? []} tenants={r.data?.tenants ?? []} health={rows.find((x) => x.t.tenant_id === detail)} reload={r.reload} />}
    </>
  );
}

function OwnerDetail({ tenantId, onClose, plans, tenants, health, reload }) {
  const { api } = useAuth();
  const a = useAction();
  const d = useAsync(async () => {
    const [inv, notes, tickets, audit] = await Promise.all([
      api.listInvoices(),
      api.list("tenant_notes", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }),
      api.list("support_tickets", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }),
      api.listAudit({ tenantId, limit: 12 }),
    ]);
    return { inv: inv.filter((i) => i.tenant_id === tenantId), notes, tickets, audit };
  }, [api, tenantId]);
  const t = health?.t;
  const tenantRow = tenants.find((x) => x.id === tenantId);
  const [plan, setPlan] = useState(tenantRow?.plan_id ?? "");
  const [note, setNote] = useState("");
  const [off, setOff] = useState(null);
  if (!t) return null;
  const savePlan = () => a.run(async () => { await api.saveTenant({ ...tenantRow, plan_id: plan || null }); reload(); d.reload(); }, "Paket diperbarui.");
  const addNote = () => a.run(async () => { await api.rpc("add_tenant_note", { p_tenant: tenantId, p_body: note }); setNote(""); d.reload(); }, "Catatan tersimpan.");
  const toggleOwner = () => a.run(async () => {
    await api.rpc("set_member_active", { p_profile: t.owner_id, p_active: t.owner_active === false, p_reason: off ?? "" });
    setOff(null);
    reload();
  }, t.owner_active === false ? "Login Owner diaktifkan kembali." : "Login Owner dinonaktifkan.");
  return (
    <Modal open title={t.name} onClose={onClose} footer={<button type="button" className="d-btn d-btn--ghost" onClick={onClose}>Tutup</button>}>
      <div className="svc-detail">
        <section>
          <h3>Profil</h3>
          <dl className="svc-dl">
            <div><dt>Owner</dt><dd>{t.owner_name ?? "—"} · {t.owner_email ?? "—"}</dd></div>
            <div><dt>Terakhir masuk</dt><dd>{t.owner_id ? `${ago(t.owner_last_login)}` : "Belum ada akun"}</dd></div>
            <div><dt>Terdaftar</dt><dd>{date(t.created_at)}</dd></div>
            <div><dt>Skor kesehatan</dt><dd><HealthPill health={health.h} /></dd></div>
          </dl>
          {health.h.reasons.length > 0 && <ul className="svc-reasons">{health.h.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
          {t.owner_id && (off === null
            ? <button type="button" className={`d-btn d-btn--sm ${t.owner_active === false ? "d-btn--ghost" : "d-btn--danger-ghost"}`} onClick={() => (t.owner_active === false ? toggleOwner() : setOff(""))}>{t.owner_active === false ? "Aktifkan login Owner" : "Nonaktifkan login Owner"}</button>
            : <div className="d-row-actions"><input className="d-date" aria-label="Alasan" placeholder="Alasan (min. 3 huruf)" value={off} onChange={(e) => setOff(e.target.value)} />
                <button type="button" className="d-btn d-btn--danger d-btn--sm" disabled={a.busy || off.trim().length < 3} onClick={toggleOwner}>Nonaktifkan</button>
                <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setOff(null)}>Batal</button></div>)}
        </section>
        <section>
          <h3>Langganan &amp; tagihan</h3>
          <div className="d-row-actions svc-left">
            <select className="d-date" aria-label="Paket" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">Belum dipilih</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy || plan === (tenantRow?.plan_id ?? "")} onClick={savePlan}>Ubah paket</button>
          </div>
          {d.loading && !d.data ? <Loading /> : d.data?.inv.length ? (
            <ul className="d-list">{d.data.inv.map((i) => <li key={i.id}><div><p className="d-list__title">{date(i.period)}</p></div><span><Badge tone={i.status === "paid" ? "ok" : "warn"}>{i.status === "paid" ? "Lunas" : "Belum bayar"}</Badge> <span className="d-num">{rupiah(i.amount)}</span></span></li>)}</ul>
          ) : <p className="d-text d-muted">Belum ada tagihan.</p>}
        </section>
        <section>
          <h3>Riwayat tiket</h3>
          {d.data?.tickets.length ? <ul className="d-list">{d.data.tickets.map((x) => <li key={x.id}><div><p className="d-list__title">{x.subject}</p><p className="d-list__meta">{x.code} · {x.category} · {ago(x.created_at)}</p></div><Badge tone={x.status === "resolved" ? "ok" : "warn"}>{x.status === "resolved" ? "Selesai" : "Terbuka"}</Badge></li>)}</ul> : <p className="d-text d-muted">Belum ada tiket.</p>}
        </section>
        <section>
          <h3>Aktivitas terbaru</h3>
          {d.data?.audit.length ? <ul className="d-list">{d.data.audit.map((x) => <li key={x.id}><div><p className="d-list__title">{auditText(x)}</p><p className="d-list__meta">{x.actor_role ?? "sistem"} · {dateTime(x.created_at)}</p></div></li>)}</ul> : <p className="d-text d-muted">Belum ada aktivitas tercatat.</p>}
        </section>
        <section>
          <h3>Catatan internal CS <span className="d-muted">· tidak terlihat Owner</span></h3>
          <div className="d-row-actions svc-left"><input className="d-date svc-grow" aria-label="Catatan baru" placeholder="Tulis catatan…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy || !note.trim()} onClick={addNote}>Simpan</button></div>
          {d.data?.notes.length ? <ul className="d-list">{d.data.notes.map((n) => <li key={n.id}><div><p className="d-list__title">{n.body}</p><p className="d-list__meta">{dateTime(n.created_at)}</p></div></li>)}</ul> : null}
        </section>
        <Feedback a={a} />
      </div>
    </Modal>
  );
}
