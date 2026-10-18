import { useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { Link } from "../lib/router.jsx";
import { deviceId } from "./device.js";
import "../styles/dashboard.css";
import "../styles/member.css";

/** Daftar / masuk Member: nomor WhatsApp → Kode Masuk → sesi. Terpisah dari login karyawan (/masuk). */
export default function MemberAuth({ slug }) {
  const { api } = useAuth();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [consentData, setConsentData] = useState(false);
  const [consentMkt, setConsentMkt] = useState(false);
  const [sim, setSim] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const request = (e) => {
    e.preventDefault();
    if (!consentData) { setErr("Persetujuan pengolahan data wajib diberikan untuk melanjutkan."); return; }
    run(async () => {
      const r = await api.memberRequestCode({ tenantSlug: slug, phone, deviceId: deviceId(), consentData, consentMarketing: consentMkt });
      setSim(r.simulated ? r.dev_code ?? "tidak tersedia" : null);
      setStep("code");
    });
  };
  const verify = (e) => {
    e.preventDefault();
    run(async () => {
      try { await api.memberVerifyCode({ tenantSlug: slug, phone, deviceId: deviceId(), code: code.trim(), name: name.trim() || undefined }); }
      catch (e2) {
        if (e2.reason === "terkunci") { setStep("phone"); setCode(""); throw new Error("Terlalu banyak percobaan. Minta kode baru."); }
        if (e2.reason === "kedaluwarsa") { setStep("phone"); setCode(""); throw new Error("Kode kedaluwarsa. Minta kode baru."); }
        throw new Error(e2.attempts_left != null ? `Kode salah. Sisa percobaan: ${e2.attempts_left}.` : e2.message);
      }
    });
  };

  return (
    <div className="m-auth">
      <main className="m-auth__card" aria-labelledby="m-auth-title">
        <p className="d-eyebrow">Member · {slug}</p>
        <h1 id="m-auth-title">{step === "phone" ? "Masuk atau daftar sebagai Member" : "Masukkan Kode Masuk"}</h1>

        {step === "phone" ? (
          <form className="d-form" onSubmit={request} noValidate>
            <div className="d-field">
              <label htmlFor="m-phone">Nomor WhatsApp</label>
              <input id="m-phone" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <p className="d-field__hint">Kami mengirim kode sekali pakai ke nomor ini. Tanpa kata sandi.</p>
            </div>
            <label className="m-check">
              <input type="checkbox" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} />
              <span><strong>Wajib.</strong> Saya setuju data saya (nomor, nama, riwayat pesanan, poin) diolah untuk akun Member ini. Saya dapat mengunduh atau menghapusnya kapan saja.</span>
            </label>
            <label className="m-check">
              <input type="checkbox" checked={consentMkt} onChange={(e) => setConsentMkt(e.target.checked)} />
              <span><strong>Opsional.</strong> Kirimi saya info promo lewat WhatsApp.</span>
            </label>
            {err && <p className="d-field__error" role="alert">{err}</p>}
            <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy || !api}>{busy ? "Mengirim…" : "Kirim kode"}</button>
          </form>
        ) : (
          <form className="d-form" onSubmit={verify} noValidate>
            {sim && (
              <p className="m-sim" role="status">
                <strong>MODE SIMULASI.</strong> WhatsApp belum aktif, jadi tidak ada pesan terkirim. Kode untuk percobaan: <code>{sim}</code>
              </p>
            )}
            <div className="d-field">
              <label htmlFor="m-code">Kode 6 digit</label>
              <input id="m-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <div className="d-field">
              <label htmlFor="m-name">Nama panggilan <span className="d-muted">(opsional)</span></label>
              <input id="m-name" autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {err && <p className="d-field__error" role="alert">{err}</p>}
            <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy || code.length !== 6}>{busy ? "Memeriksa…" : "Masuk"}</button>
            <button type="button" className="d-btn d-btn--ghost d-btn--block" onClick={() => { setStep("phone"); setErr(null); }}>Ganti nomor</button>
          </form>
        )}
        <p className="d-text d-muted">Karyawan? <Link to="/masuk">Masuk di sini</Link>.</p>
      </main>
    </div>
  );
}
