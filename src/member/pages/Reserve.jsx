import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAsync, Loading, ErrorNote, Empty, Badge } from "../../app/ui/index.jsx";
import { dateTime } from "../../lib/format.js";

const STATUS = { booked: ["Terjadwal", "accent"], waiting: ["Menunggu", "accent"], called: ["Dipanggil", "accent"], in_exam: ["Berlangsung", "accent"], done: ["Selesai", "success"], cancelled: ["Dibatalkan", "neutral"], no_show: ["Tidak hadir", "neutral"] };
const pad = (n) => String(n).padStart(2, "0");
/** Nilai untuk <input type="datetime-local"> (waktu setempat). */
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const defaultAt = () => { const d = new Date(Date.now() + 24 * 3600e3); d.setMinutes(0, 0, 0); d.setHours(12); return localInput(d); };

export default function Reserve() {
  const { api } = useAuth();
  const menu = useAsync(() => api.rpc("member_menu"), [api]);
  const list = useAsync(() => api.rpc("member_reservations"), [api]);
  const [f, setF] = useState({ kind: "", branch: "", at: defaultAt(), party: 2, note: "", nik: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (menu.loading || list.loading) return <Loading />;
  if (menu.error || list.error) return <ErrorNote error={menu.error ?? list.error} onRetry={() => { menu.reload(); list.reload(); }} />;
  const m = menu.data;
  const kinds = [m.can_book_table && ["table", "Reservasi meja"], m.can_book_clinic && ["clinic", "Janji klinik"]].filter(Boolean);
  const kind = f.kind || kinds[0]?.[0];
  const branch = f.branch || m.branches[0]?.id;
  const minAt = localInput(new Date(Date.now() + 30 * 60e3));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.rpc("member_reservation_create", { p_branch: branch, p_kind: kind, p_at: new Date(f.at).toISOString(),
        p_party: kind === "table" ? Number(f.party) : null, p_note: f.note.trim() || null, p_nik: kind === "clinic" ? f.nik.trim() : null });
      setMsg({ ok: true, t: "Reservasi tersimpan." }); setF({ ...f, note: "", nik: "" }); list.reload();
    } catch (e2) { setMsg({ ok: false, t: e2.message }); }
    finally { setBusy(false); }
  };
  const cancel = async (q) => {
    setMsg(null);
    try { await api.rpc("member_reservation_cancel", { p_id: q.id }); setMsg({ ok: true, t: "Reservasi dibatalkan." }); }
    catch (e) { setMsg({ ok: false, t: e.message }); }
    list.reload();
  };
  const rows = list.data ?? [];

  return (
    <section aria-labelledby="m-res">
      <h1 id="m-res">Reservasi</h1>
      {msg && <p className={msg.ok ? "d-field__hint" : "d-field__error"} role={msg.ok ? "status" : "alert"}>{msg.t}</p>}
      {kinds.length === 0 ? <Empty title="Reservasi belum tersedia">Tempat usaha ini belum menerima reservasi lewat aplikasi.</Empty> : (
        <form className="d-form" onSubmit={submit} noValidate>
          {kinds.length > 1 && <div className="d-field"><label htmlFor="r-kind">Jenis</label><select id="r-kind" value={kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
          {m.branches.length > 1 && <div className="d-field"><label htmlFor="r-branch">Cabang</label><select id="r-branch" value={branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{m.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <div className="d-field"><label htmlFor="r-at">Waktu</label><input id="r-at" type="datetime-local" min={minAt} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} required /></div>
          {kind === "table" && <div className="d-field"><label htmlFor="r-party">Jumlah tamu</label><input id="r-party" type="number" min={1} max={20} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} required /></div>}
          {kind === "clinic" && <div className="d-field"><label htmlFor="r-nik">NIK</label><input id="r-nik" inputMode="numeric" autoComplete="off" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, "") })} required /><p className="d-field__hint">Dibutuhkan untuk pendaftaran pasien. Hanya dilihat tenaga klinik dan tidak termasuk di unduhan data.</p></div>}
          <div className="d-field"><label htmlFor="r-note">{kind === "clinic" ? "Keluhan" : "Catatan"} <span className="d-muted">(opsional)</span></label><textarea id="r-note" rows={2} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <button type="submit" className="d-btn d-btn--primary" disabled={busy}>{busy ? "Menyimpan…" : "Buat reservasi"}</button>
        </form>
      )}
      <div className="m-section">
        <h2>Reservasi saya</h2>
        {rows.length === 0 ? <Empty title="Belum ada reservasi">Reservasi yang Anda buat akan muncul di sini.</Empty> : (
          <ul className="m-list">
            {rows.map((q) => {
              const [text, tone] = STATUS[q.status] ?? [q.status, "neutral"];
              return (
                <li key={q.id} className="m-card">
                  <p className="m-card__title">{q.kind === "clinic" ? "Janji klinik" : `Meja untuk ${q.party_size} orang`} <Badge tone={tone}>{text}</Badge></p>
                  <p className="d-muted">{dateTime(q.scheduled_at)} · {q.branch}</p>
                  {q.note && <p>{q.note}</p>}
                  {q.status === "booked" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => cancel(q)}>Batalkan</button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
