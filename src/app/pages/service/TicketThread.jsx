import { useState } from "react";
import { dateTime } from "../../../lib/format.js";
import { Badge } from "../../ui/index.jsx";
import { TICKET_STATUS, PRIORITY, TEMPLATES, slaOf } from "../../../lib/watch.js";

/** Percakapan satu tiket. Sisi Superadmin: catatan internal, template, ubah status. Sisi Owner: balas dan beri nilai. */
export default function TicketThread({ ticket, messages, tenantName, isSA, busy, now, onReply, onStatus, onRate }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const sla = slaOf(ticket, now);
  const [stLabel, stTone] = TICKET_STATUS[ticket.status];
  const [prLabel, prTone] = PRIORITY[ticket.priority];
  const send = async () => { if (await onReply(body.trim(), isSA && internal)) { setBody(""); setInternal(false); } };
  return (
    <article className="tk" aria-label={`Tiket ${ticket.code}`}>
      <header className="tk__head">
        <div>
          <p className="d-eyebrow">{ticket.code} · {ticket.category}{tenantName ? ` · ${tenantName}` : ""}</p>
          <h2 className="tk__title">{ticket.subject}</h2>
        </div>
        <div className="d-chips">
          <Badge tone={stTone}>{stLabel}</Badge>
          <Badge tone={prTone}>{prLabel}</Badge>
          {isSA && <Badge tone={sla.tone}>{sla.label}</Badge>}
        </div>
      </header>
      <ol className="tk__msgs">
        {messages.map((m) => (
          <li key={m.id} className={`tk__msg tk__msg--${m.author_role === "owner" ? "owner" : "cs"}${m.internal ? " is-internal" : ""}`}>
            <p className="tk__meta">
              <strong>{m.author_role === "owner" ? "Owner" : "Tim Tijarah"}</strong> · {dateTime(m.created_at)}
              {m.internal && <Badge tone="warn">Catatan internal · tidak terlihat Owner</Badge>}
            </p>
            <p className="tk__body">{m.body}</p>
          </li>
        ))}
      </ol>
      {ticket.csat != null && <p className="d-text">Penilaian Owner: <strong>{ticket.csat}/5</strong>{ticket.csat_note ? ` — ${ticket.csat_note}` : ""}</p>}
      {!isSA && ticket.status === "resolved" && ticket.csat == null && (
        <div className="tk__rate" role="group" aria-label="Nilai layanan">
          <p className="d-text">Tiket ini sudah diselesaikan. Bagaimana layanannya?</p>
          <div className="d-chips">{[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`d-chip${score === n ? " is-on" : ""}`} aria-pressed={score === n} onClick={() => setScore(n)}>{n}</button>))}</div>
          <input className="d-date" aria-label="Komentar (opsional)" placeholder="Komentar (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={busy || !score} onClick={() => onRate(score, note)}>Kirim penilaian</button>
        </div>
      )}
      <div className="tk__reply">
        {isSA && (
          <select className="d-date" aria-label="Template balasan" value="" onChange={(e) => { const t = TEMPLATES[Number(e.target.value)]; if (t) setBody(t[1]); }}>
            <option value="">Template balasan…</option>{TEMPLATES.map((t, i) => <option key={t[0]} value={i}>{t[0]}</option>)}
          </select>
        )}
        <label className="sr-only" htmlFor="tk-body">Pesan</label>
        <textarea id="tk-body" rows={3} className="tk__text" placeholder={ticket.status === "resolved" && !isSA ? "Balas untuk membuka kembali tiket" : "Tulis balasan…"} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="d-row-actions svc-left">
          {isSA && <label className="d-check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Catatan internal (Owner tidak melihat)</label>}
          <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={busy || !body.trim()} onClick={send}>{internal ? "Simpan catatan" : "Kirim balasan"}</button>
        </div>
        {isSA && (
          <div className="d-row-actions svc-left" role="group" aria-label="Ubah status">
            {Object.entries(TICKET_STATUS).filter(([k]) => k !== ticket.status).map(([k, [l]]) => (
              <button key={k} type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={busy} onClick={() => onStatus(k)}>Tandai: {l}</button>))}
          </div>
        )}
      </div>
    </article>
  );
}
