import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useRouter } from "../../lib/router.jsx";

export default function Privacy() {
  const { api, signOut } = useAuth();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(null);

  const exportData = async () => {
    setBusy(true); setErr(null);
    try {
      const data = await api.rpc("member_export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "data-saya.json" });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.rpc("member_delete_account", { p_confirm: confirm }); setDone(r); await signOut(); navigate("/", { replace: true }); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <section aria-labelledby="m-priv">
      <h1 id="m-priv">Privasi data</h1>
      <div className="m-card">
        <h2>Unduh data saya</h2>
        <p className="d-muted">Berkas JSON berisi profil, poin, riwayat pesanan, dan riwayat persetujuan Anda. Hanya data milik Anda.</p>
        <button type="button" className="d-btn d-btn--ghost" disabled={busy} onClick={exportData}>Unduh data</button>
      </div>
      <div className="m-card m-card--danger">
        <h2>Hapus akun</h2>
        <p className="d-muted">Menghapus akun, poin, dan tautan nomor Anda secara permanen. Pesanan lama tetap ada tanpa identitas untuk pembukuan usaha. Rekam medis (bila ada) dikelola klinik sesuai kewajiban penyimpanan dan tidak ikut terhapus. Tindakan ini dicatat di Jejak Audit tanpa data pribadi.</p>
        <div className="d-field"><label htmlFor="del">Ketik <strong>HAPUS</strong> untuk mengonfirmasi</label><input id="del" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <button type="button" className="d-btn d-btn--danger" disabled={busy || confirm !== "HAPUS"} onClick={remove}>Hapus akun saya</button>
      </div>
      {err && <p className="d-field__error" role="alert">{err}</p>}
      {done && <p role="status">Akun dihapus.</p>}
    </section>
  );
}
