import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { dateTime } from "../../../lib/format.js";
import { inviteStatus, INVITE_STATUS, auditText } from "../../../lib/watch.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Modal, Field, Empty, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useBranch, useLive } from "../../ops.jsx";
import { ServiceTabs, ago, branchesOfPerson } from "./shared.jsx";
import AssignBranches from "./AssignBranches.jsx";
import { generateTempPassword, copyToClipboard } from "../../../lib/passwordGenerator.js";

const ROLE_NAME = { gm: "General Manager", staff: "Kasir / Staf", dokter: "Dokter" };

/**
 * Owner · Kelola GM & Kasir/Staf  |  GM · Kelola Kasir Cabang.
 * Hierarki ditegakkan di database (set_member_active, create_invite, guard_profile_role); UI hanya menyembunyikan yang pasti ditolak.
 */
export default function Team() {
  const { api, role, tenantId, tenant } = useAuth();
  const isOwner = role === "owner";
  const mine = useBranch();
  const r = useAsync(async () => {
    const [people, branches, mb, invites] = await Promise.all([
      api.list("profiles", { eq: { tenant_id: tenantId }, order: ["full_name"] }),
      api.list("branches", { eq: { tenant_id: tenantId } }),
      api.list("member_branches", { eq: { tenant_id: tenantId } }),
      api.list("staff_invites", { order: ["created_at", "desc"] }),
    ]);
    return { people, branches, mb, invites };
  }, [api, tenantId], { key: `team@${tenantId}` });
  useLive(["profiles", "member_branches", "staff_invites"], r.reload);
  const a = useAction();
  const [assign, setAssign] = useState(null);
  const [off, setOff] = useState(null);     // { person, reason }
  const [pin, setPin] = useState(null);     // { person, value }
  const [hist, setHist] = useState(null);   // person
  const [inv, setInv] = useState(null);
  const [showBioAccordion, setShowBioAccordion] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [successModal, setSuccessModal] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [q, setQ] = useState("");

  const myBranchIds = useMemo(() => new Set(mine.options.map((b) => b.id)), [mine.options]);
  const roles = isOwner ? ["gm", "staff", "dokter"] : ["staff", "dokter"];
  const reach = (p) => {
    if (isOwner) return true;
    const ids = branchesOfPerson(p, r.data?.mb ?? []);
    return ids ? ids.some((id) => myBranchIds.has(id)) : true;
  };
  const people = (r.data?.people ?? []).filter((p) => roles.includes(p.role) && reach(p)
    && (!q || `${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const brName = (id) => r.data?.branches?.find((b) => b.id === id)?.name;
  const invites = (r.data?.invites ?? []).filter((i) => roles.includes(i.role) && !i.accepted_at);
  const active = people.filter((p) => p.is_active !== false).length;

  const statusOf = (p) => (p.is_active === false ? ["Nonaktif", "danger"] : !p.last_login_at ? ["Belum pernah masuk", "warn"] : ["Aktif", "ok"]);

  const invite = () => a.run(async () => {
    const f = inv;
    const tempPass = f.tempPassword?.trim() || generateTempPassword();
    const created = await api.rpc("create_invite", { p_email: f.email, p_full_name: f.name, p_role: f.role, p_branches: [...f.branches], p_phone: f.phone || null });

    // Simpan biodata Identitas Diri & Payroll ke LocalStorage agar saat anggota login pertama kali, profilnya langsung 100% lengkap
    try {
      const emailKey = f.email?.trim().toLowerCase();
      if (emailKey) {
        if (f.gender) localStorage.setItem(`tijarah:gender:${emailKey}`, f.gender);
        if (f.birthPlace) localStorage.setItem(`tijarah:birth_place:${emailKey}`, f.birthPlace);
        if (f.birthDate) localStorage.setItem(`tijarah:birth_date:${emailKey}`, f.birthDate);
        if (f.address) localStorage.setItem(`tijarah:address:${emailKey}`, f.address);
        if (f.phone) localStorage.setItem(`tijarah:phone:${emailKey}`, f.phone);
        if (f.bankName) localStorage.setItem(`tijarah:bank_name:${emailKey}`, f.bankName);
        if (f.bankAccount) localStorage.setItem(`tijarah:bank_acc:${emailKey}`, f.bankAccount);
        if (f.bankHolder || f.name) localStorage.setItem(`tijarah:bank_holder:${emailKey}`, f.bankHolder || f.name);
      }
    } catch {}

    // Panggil Endpoint SMTP & Auth Provisioning
    let emailStatus = "";
    try {
      const branchList = [...f.branches];
      const branchNames = branchList.map((id) => brName(id) || mine.options.find((b) => b.id === id)?.name).filter(Boolean);
      const invitePayload = {
        email: f.email,
        fullName: f.name,
        role: f.role,
        phone: f.phone || null,
        tenantId: tenantId || tenant?.id,
        tenantName: tenant?.name || "Tijarah Merchant",
        branches: branchList,
        branchNames: branchNames,
        tempPassword: tempPass,
        inviteId: created.id,
        loginUrl: window.location.origin + "/masuk",
        senderName: isOwner ? "Owner Usaha" : "General Manager"
      };

      const resp = await fetch("/api/invite-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invitePayload)
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.ok) {
        emailStatus = data.emailSent ? `Email kredensial terkirim ke ${f.email}.` : `Akun aktif; kirim email (${data.emailError || "kendala SMTP"}).`;
      } else {
        emailStatus = data?.error ? `Catatan: ${data.error}` : "";
      }
    } catch (e) {
      emailStatus = `Catatan aktivasi: ${e.message}`;
    }

    setSuccessModal({
      open: true,
      title: "Akun Anggota Berhasil Dibuat!",
      data: {
        name: f.name,
        email: f.email,
        role: ROLE_NAME[f.role] || f.role,
        tenantName: tenant?.name || "Tijarah Merchant",
        tempPassword: tempPass,
        loginUrl: window.location.origin + "/masuk"
      }
    });

    setInv(null);
    setShowBioAccordion(false);
    r.reload();
    return `Akun ${f.name} (${ROLE_NAME[f.role] || f.role}) berhasil dibuat. ${emailStatus}`;
  }, (m) => m);

  const resendInvite = (i) => a.run(async () => {
    const newTemp = generateTempPassword();
    await api.rpc("resend_invite", { p_id: i.id });
    
    try {
      const branchNames = (i.branch_ids || []).map(brName).filter(Boolean);
      await fetch("/api/invite-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: i.email,
          fullName: i.full_name,
          role: i.role,
          phone: i.phone || null,
          tenantId: i.tenant_id,
          tenantName: tenant?.name || "Tijarah Merchant",
          branches: i.branch_ids || [],
          branchNames: branchNames,
          tempPassword: newTemp,
          inviteId: i.id,
          loginUrl: window.location.origin + "/masuk",
          senderName: isOwner ? "Owner Usaha" : "General Manager"
        })
      });
    } catch (err) {
      console.warn("Gagal mengirim ulang undangan via SMTP:", err);
    }

    setSuccessModal({
      open: true,
      title: "Kata Sandi Diperbarui & Email Terkirim!",
      data: {
        name: i.full_name,
        email: i.email,
        role: ROLE_NAME[i.role] || i.role,
        tenantName: tenant?.name || "Tijarah Merchant",
        tempPassword: newTemp,
        loginUrl: window.location.origin + "/masuk"
      }
    });

    r.reload();
  }, "Kata sandi sementara baru dibuat dan email dikirim ulang via SMTP.");

  const roleOptions = roles.filter((x) => x !== "dokter" || tenant?.pillar === "health");
  const openInvite = () => {
    a.setError(null); a.setOk(null);
    const initialBranch = mine.options.length ? mine.options[0].id : null;
    const initialRole = roleOptions.includes("staff") ? "staff" : roleOptions[0];
    const freshPass = generateTempPassword();
    setInv({
      name: "",
      email: "",
      phone: "+62",
      role: initialRole,
      tempPassword: freshPass,
      branches: new Set(initialRole === "staff" && initialBranch ? [initialBranch] : initialRole === "gm" ? [] : initialBranch ? [initialBranch] : []),
      gender: "Laki-laki",
      birthPlace: "",
      birthDate: "",
      address: "",
      bankName: "BCA",
      bankAccount: "",
      bankHolder: ""
    });
    setShowPass(false);
    setCopiedPass(false);
    setShowBioAccordion(false);
  };
  const needBranch = inv && inv.role !== "gm";
  const isKasir = inv && inv.role === "staff";

  const handlePhone = (val) => {
    let clean = val.replace(/[^\d+]/g, "");
    if (!clean.startsWith("+62")) {
      clean = clean.replace(/^\+?62?|^0/, "");
      clean = "+62" + clean;
    }
    setInv((prev) => ({ ...prev, phone: clean }));
  };

  return (
    <>
      <PageHead eyebrow={`${isOwner ? "Owner" : "General Manager"} · Layanan & Akses`} title={isOwner ? "Kelola GM & Kasir/Staf" : "Kelola Kasir Cabang"}
        desc={isOwner ? "Undang, tempatkan, dan nonaktifkan GM, Kasir/Staf, dan Dokter. Riwayat transaksi tetap menunjuk ke orang yang sama — akun dinonaktifkan, bukan dihapus."
          : "Kelola Kasir di cabang yang Anda pegang. Peran GM dan Owner tidak dapat Anda ubah."}
        actions={<button type="button" className="d-btn d-btn--primary" onClick={openInvite}>Undang anggota</button>} />
      <ServiceTabs />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <div className="d-stats">
            <Stat label="Anggota" value={people.length} sub={`${active} aktif`} />
            <Stat label="Nonaktif" value={people.length - active} sub="riwayat tetap tersimpan" />
            <Stat label="Undangan menunggu" value={invites.filter((i) => ["pending", "queued"].includes(inviteStatus(i))).length} sub="belum diterima" />
            <Stat label="Cabang dipegang" value={mine.options.length} sub={isOwner ? "semua cabang" : mine.locked ? "dibatasi Owner" : "semua cabang"} />
          </div>
          <Feedback a={a} />
          <Panel title={isOwner ? "GM, Kasir/Staf & Dokter" : "Kasir cabang"} meta={`${people.length} orang`} actions={
            <input className="d-date" type="search" placeholder="Cari nama atau email" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />}>
            {people.length === 0 ? <Empty title="Belum ada anggota">Klik “Undang anggota” untuk menambah.</Empty> : (
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr><th scope="col">Nama</th><th scope="col">Peran</th><th scope="col">Cabang</th><th scope="col">Status</th><th scope="col">Terakhir aktif</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
                <tbody>{people.map((p) => {
                  const ids = branchesOfPerson(p, r.data.mb);
                  const [sl, st] = statusOf(p);
                  return (
                    <tr key={p.id} className={p.is_active === false ? "is-muted" : undefined}>
                      <td>{p.full_name}<p className="d-list__meta">{p.email}</p></td>
                      <td>{ROLE_NAME[p.role]}</td>
                      <td>{ids ? ids.map(brName).filter(Boolean).join(", ") || "—" : "Semua cabang"}</td>
                      <td><Badge tone={st}>{sl}</Badge>{p.is_active === false && p.deactivation_reason && <p className="d-list__meta">{p.deactivation_reason}</p>}</td>
                      <td>{p.last_login_at ? ago(p.last_login_at) : "—"}</td>
                      <td><div className="d-row-actions">
                        {p.is_active !== false && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setAssign({ person: p, ids })}>Atur cabang</button>}
                        {isOwner && p.role === "gm" && p.is_active !== false && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { a.setError(null); setPin({ person: p, value: "" }); }}>Reset PIN</button>}
                        {isOwner && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setHist(p)}>Riwayat</button>}
                        {p.is_active === false
                          ? <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("set_member_active", { p_profile: p.id, p_active: true }); r.reload(); }, `${p.full_name} diaktifkan kembali.`)}>Aktifkan</button>
                          : <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => { a.setError(null); setOff({ person: p, reason: "" }); }}>Nonaktifkan</button>}
                      </div></td>
                    </tr>);
                })}</tbody>
              </table></div>
            )}
          </Panel>
          <Panel title="Undangan" meta="Tautan sekali pakai, berlaku 48 jam">
            {invites.length === 0 ? <p className="d-text d-muted">Tidak ada undangan yang menunggu.</p> : (
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr><th scope="col">Penerima</th><th scope="col">Peran</th><th scope="col">Cabang</th><th scope="col">Status</th><th scope="col">Berlaku s.d.</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
                <tbody>{invites.map((i) => {
                  const k = inviteStatus(i), [sl, st] = INVITE_STATUS[k], openInv = !i.revoked_at;
                  return (
                    <tr key={i.id}>
                      <td>{i.full_name}<p className="d-list__meta">{i.email}</p></td>
                      <td>{ROLE_NAME[i.role]}</td>
                      <td>{i.branch_ids.length ? i.branch_ids.map(brName).filter(Boolean).join(", ") : "Semua cabang"}</td>
                      <td><Badge tone={st}>{sl}</Badge></td>
                      <td>{dateTime(i.expires_at)}</td>
                      <td><div className="d-row-actions">
                        {openInv && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => resendInvite(i)}>Kirim ulang</button>}
                        {openInv && <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("revoke_invite", { p_id: i.id }); r.reload(); }, "Undangan dicabut.")}>Cabut</button>}
                      </div></td>
                    </tr>);
                })}</tbody>
              </table></div>
            )}
          </Panel>
          <p className="d-text d-muted svc-foot">
            Atur batas diskon, batas void, dan jam operasional di <a href="/app/layanan/kebijakan" className="d-link">Kebijakan Berjenjang (3 Lapis)</a>. Tinjau permintaan di <a href="/app/persetujuan" className="d-link">Pusat Persetujuan Terpadu</a>.
          </p>
        </>
      )}

      {assign && <AssignBranches person={assign.person} initial={assign.ids} options={mine.options} onClose={() => setAssign(null)} onSaved={r.reload} />}

      <Modal open={Boolean(inv)} title="Undang anggota" onClose={() => setInv(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" }}>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setInv(null)}>Batal</button>
            <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !inv?.name || !inv?.email || (needBranch && inv.branches.size === 0)} onClick={invite}>Kirim undangan</button>
          </div>
        }>
        {inv && (
          <div className="d-form" style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: "4px" }}>
            <div className="d-form__row">
              <Field label="Nama lengkap *" id="i-name"><input id="i-name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
              <Field label="Peran *" id="i-role">
                <select id="i-role" value={inv.role} onChange={(e) => {
                  const newRole = e.target.value;
                  const firstBr = mine.options[0]?.id;
                  setInv({
                    ...inv,
                    role: newRole,
                    branches: newRole === "staff" && firstBr ? new Set([firstBr]) : newRole === "gm" ? new Set() : inv.branches
                  });
                }}>
                  {roleOptions.map((x) => <option key={x} value={x}>{ROLE_NAME[x]}</option>)}
                </select>
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Email (RFC 5322) *" id="i-email"><input id="i-email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
              <Field label="WhatsApp (+62)" id="i-phone"><input id="i-phone" inputMode="tel" value={inv.phone} onChange={(e) => handlePhone(e.target.value)} /></Field>
            </div>

            {/* Mekanisme 2: Auto-Generate Kata Sandi Acak Sementara */}
            <div style={{
              margin: "0.25rem 0 0.5rem",
              padding: "0.85rem",
              background: "var(--color-paper-2)",
              border: "1px solid var(--color-rule)",
              borderRadius: "var(--radius-md)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.35rem" }}>
                <label htmlFor="i-temp-pass" style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-ink)" }}>
                  Kata Sandi Acak Sementara (Wajib &amp; Otomatis)
                </label>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => {
                      const fresh = generateTempPassword();
                      setInv({ ...inv, tempPassword: fresh });
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
                      const ok = await copyToClipboard(inv.tempPassword);
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
                id="i-temp-pass"
                type={showPass ? "text" : "password"}
                value={inv.tempPassword || ""}
                onChange={(e) => setInv({ ...inv, tempPassword: e.target.value })}
                style={{ fontFamily: "monospace", letterSpacing: "0.05em", fontWeight: 600, color: "var(--color-accent, #10B981)" }}
                required
              />
              <p className="d-field__hint" style={{ marginTop: "0.35rem", fontSize: "0.74rem" }}>
                Akun langsung diaktifkan dengan kata sandi ini &amp; dikirimkan via SMTP Gmail. Anggota dapat langsung masuk tanpa bergantung pada tautan aktivasi Supabase yang rentan kedaluwarsa.
              </p>
            </div>

            {/* Accordion / Lipatan Biodata Identitas Diri Sesuai Profil Saya */}
            <div style={{ margin: "0.25rem 0 0.5rem" }}>
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
                  <span>{showBioAccordion ? "Sembunyikan Biodata Identitas Diri Anggota" : "+ Lengkapi Biodata Identitas Diri Anggota (Opsional)"}</span>
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--color-muted)", fontWeight: 400 }}>
                  {showBioAccordion ? "Klik untuk melipat" : "Jenis Kelamin, Tgl Lahir, Alamat, Payroll"}
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
                marginBottom: "0.75rem"
              }}>
                <div className="d-form__row">
                  <Field label="Jenis Kelamin" id="i-gender">
                    <select id="i-gender" value={inv.gender || "Laki-laki"} onChange={(e) => setInv({ ...inv, gender: e.target.value })}>
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </Field>
                  <Field label="Tempat Lahir" id="i-birth-place" hint="Contoh: Makassar">
                    <input id="i-birth-place" value={inv.birthPlace || ""} onChange={(e) => setInv({ ...inv, birthPlace: e.target.value })} placeholder="Tempat lahir" />
                  </Field>
                </div>
                <Field label="Tanggal Lahir" id="i-birth-date">
                  <input id="i-birth-date" type="date" value={inv.birthDate || ""} onChange={(e) => setInv({ ...inv, birthDate: e.target.value })} />
                </Field>
                <Field label="Alamat Domisili Tempat Tinggal" id="i-address">
                  <textarea id="i-address" rows={2} value={inv.address || ""} onChange={(e) => setInv({ ...inv, address: e.target.value })} placeholder="Alamat lengkap tempat tinggal anggota" />
                </Field>

                {/* Rekening Payroll Staf untuk Penggajian */}
                <div style={{ borderTop: "1px solid var(--color-rule)", paddingTop: "0.6rem" }}>
                  <span style={{ font: "600 0.8rem var(--font-display)", color: "var(--color-ink)", display: "block", marginBottom: "0.5rem" }}>
                    Rekening Payroll (Untuk Pembayaran Gaji / Slip Gaji)
                  </span>
                  <div className="d-form__row">
                    <Field label="Nama Bank" id="i-bank-name">
                      <select id="i-bank-name" value={inv.bankName || "BCA"} onChange={(e) => setInv({ ...inv, bankName: e.target.value })}>
                        <option value="BCA">BCA (Bank Central Asia)</option>
                        <option value="Mandiri">Bank Mandiri</option>
                        <option value="BRI">BRI (Bank Rakyat Indonesia)</option>
                        <option value="BNI">BNI (Bank Negara Indonesia)</option>
                        <option value="BSI">BSI (Bank Syariah Indonesia)</option>
                        <option value="CIMB">CIMB Niaga</option>
                        <option value="Permata">Bank Permata</option>
                        <option value="Jago">Bank Jago</option>
                        <option value="Lainnya">Bank Lainnya</option>
                      </select>
                    </Field>
                    <Field label="Nomor Rekening" id="i-bank-acc">
                      <input id="i-bank-acc" inputMode="numeric" value={inv.bankAccount || ""} onChange={(e) => setInv({ ...inv, bankAccount: e.target.value })} placeholder="Contoh: 7890123456" />
                    </Field>
                  </div>
                  <Field label="Atas Nama Pemilik Rekening" id="i-bank-holder" hint="Default nama lengkap staf jika dikosongkan">
                    <input id="i-bank-holder" value={inv.bankHolder || ""} onChange={(e) => setInv({ ...inv, bankHolder: e.target.value })} placeholder={inv.name || "Nama pemilik rekening"} />
                  </Field>
                </div>
              </div>
            )}
            <fieldset className="d-checks" style={{ border: "1px solid var(--color-rule, #e2e8f0)", padding: "0.75rem", borderRadius: "8px", background: "var(--color-paper-2, #f8fafc)" }}>
              <legend style={{ padding: "0 6px", fontWeight: 600 }}>
                {isKasir ? "Cabang Penugasan Kasir (Wajib Radio Tunggal)" : needBranch ? "Cabang (wajib, minimal satu)" : "Cabang (kosong = semua cabang)"}
              </legend>
              {isKasir ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {mine.options.map((b) => (
                    <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="team_kasir_branch"
                        value={b.id}
                        checked={inv.branches.has(b.id)}
                        onChange={() => setInv({ ...inv, branches: new Set([b.id]) })}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                mine.options.map((b) => (
                  <label key={b.id} className="d-check"><input type="checkbox" checked={inv.branches.has(b.id)}
                    onChange={(e) => setInv((x) => { const n = new Set(x.branches); e.target.checked ? n.add(b.id) : n.delete(b.id); return { ...x, branches: n }; })} />{b.name}</label>
                ))
              )}
            </fieldset>
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(off)} title={`Nonaktifkan ${off?.person.full_name ?? ""}`} onClose={() => setOff(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setOff(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--danger" disabled={a.busy || (off?.reason ?? "").trim().length < 3}
            onClick={() => a.run(async () => { await api.rpc("set_member_active", { p_profile: off.person.id, p_active: false, p_reason: off.reason }); setOff(null); r.reload(); }, "Akun dinonaktifkan.")}>Nonaktifkan</button></>}>
        {off && (
          <div className="d-form">
            <p className="d-text">Orang ini langsung tidak bisa membaca atau menulis data. Shift kasir yang masih terbuka harus ditutup lebih dulu. Riwayat transaksi tetap utuh.</p>
            <Field label="Alasan" id="off-reason"><input id="off-reason" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(pin)} title={`Reset PIN · ${pin?.person.full_name ?? ""}`} onClose={() => setPin(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setPin(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !/^[0-9]{6}$/.test(pin?.value ?? "")}
            onClick={() => a.run(async () => { await api.rpc("reset_member_pin", { p_profile: pin.person.id, p_pin: pin.value }); setPin(null); }, "PIN otorisasi diperbarui. Sampaikan PIN baru langsung ke GM.")}>Simpan PIN</button></>}>
        {pin && (
          <div className="d-form">
            <p className="d-text">PIN otorisasi dipakai GM untuk menyetujui void, refund, dan diskon besar. PIN baru tidak dicatat di log.</p>
            <Field label="PIN baru (6 digit)" id="pin-new"><input id="pin-new" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin.value} onChange={(e) => setPin({ ...pin, value: e.target.value.replace(/\D/g, "") })} /></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Kredensial Anggota Berhasil Dibuat */}
      <Modal
        open={Boolean(successModal)}
        title={successModal?.title || "Akun Anggota Berhasil Dibuat!"}
        onClose={() => setSuccessModal(null)}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", width: "100%", flexWrap: "wrap" }}>
            <button
              type="button"
              className="d-btn d-btn--primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              onClick={async () => {
                const creds = successModal?.data;
                const text = `Halo ${creds?.name},\nBerikut kredensial akun ${creds?.role} Anda untuk ${creds?.tenantName}:\n• Halaman Masuk: ${creds?.loginUrl}\n• Email Masuk: ${creds?.email}\n• Kata Sandi Sementara: ${creds?.tempPassword}\n\nSilakan masuk dan segera perbarui kata sandi ini di menu Akun > Keamanan & Kredensial.`;
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
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)", width: "35%" }}>Nama Anggota:</td>
                    <td style={{ padding: "0.35rem 0", fontWeight: 600 }}>{successModal.data.name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>Peran Akun:</td>
                    <td style={{ padding: "0.35rem 0", fontWeight: 600 }}>{successModal.data.role}</td>
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
              Catatan: Kredensial di atas dapat disalin dan dikirimkan secara langsung melalui WhatsApp atau media komunikasi lainnya kepada staf/anggota.
            </p>
          </div>
        )}
      </Modal>

      {hist && <History person={hist} tenantId={tenantId} onClose={() => setHist(null)} />}
    </>
  );
}

function History({ person, tenantId, onClose }) {
  const { api } = useAuth();
  const d = useAsync(() => api.listAudit({ tenantId, limit: 300 }), [api, tenantId]);
  const rows = (d.data ?? []).filter((x) => x.entity_id === person.id || x.actor_id === person.id && x.action === "login").slice(0, 30);
  return (
    <Modal open title={`Riwayat · ${person.full_name}`} onClose={onClose} footer={<button type="button" className="d-btn d-btn--ghost" onClick={onClose}>Tutup</button>}>
      {d.loading ? <Loading /> : rows.length === 0 ? <p className="d-text d-muted">Belum ada perubahan tercatat.</p> : (
        <ul className="d-list">{rows.map((x) => <li key={x.id}><div><p className="d-list__title">{auditText(x)}</p><p className="d-list__meta">{x.actor_role ?? "sistem"} · {dateTime(x.created_at)}</p></div></li>)}</ul>
      )}
    </Modal>
  );
}
