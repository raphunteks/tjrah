import { useEffect, useState } from "react";
import { Link } from "../../lib/router.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAsync, Loading, ErrorNote } from "../../app/ui/index.jsx";

export default function Profile() {
  const { api } = useAuth();
  const q = useAsync(() => api.rpc("member_home"), [api]);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF({ name: q.data.name ?? "", note: q.data.member_note ?? "", marketing: q.data.marketing }); }, [q.data]);
  if (q.loading || !f) return q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : <Loading />;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { await api.rpc("member_update_profile", { p_name: f.name, p_note: f.note || null, p_marketing: f.marketing }); setMsg({ ok: true, t: "Tersimpan." }); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
    finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="m-prof">
      <h1 id="m-prof">Profil</h1>
      <form className="d-form" onSubmit={save} noValidate>
        <div className="d-field"><label htmlFor="p-name">Nama</label><input id="p-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div className="d-field"><label>Nomor WhatsApp</label><input value={q.data.phone} readOnly aria-readonly="true" /><p className="d-field__hint">Nomor adalah kunci akun dan tidak bisa diubah di sini.</p></div>
        <div className="d-field"><label htmlFor="p-note">Catatan untuk kami <span className="d-muted">(alergi, preferensi)</span></label><textarea id="p-note" rows={3} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <label className="m-check"><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} /><span>Kirimi saya info promo lewat WhatsApp. Bisa dimatikan kapan saja.</span></label>
        {msg && <p className={msg.ok ? "d-field__hint" : "d-field__error"} role={msg.ok ? "status" : "alert"}>{msg.t}</p>}
        <button type="submit" className="d-btn d-btn--primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
      <p className="m-section"><Link to="/m/privasi">Privasi dan data saya</Link></p>
    </section>
  );
}
