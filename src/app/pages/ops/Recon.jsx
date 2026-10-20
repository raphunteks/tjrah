import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { permOf } from "../../../lib/rbac.js";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";

const ST = {
  matched: ["Cocok", "ok"], amount_diff: ["Selisih nominal", "danger"], missing_statement: ["Belum ada di laporan penyedia", "warn"],
  missing_payment: ["Di laporan penyedia, tidak ada Pembayaran", "danger"], ambiguous: ["Referensi ganda", "warn"],
};
const METHOD = { qris: "QRIS", card: "Kartu", ewallet: "E-wallet", transfer: "Transfer", swallet: "S-Wallet Digital" };
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5));

/** Format baris: ref,gross,fee,tanggal(YYYY-MM-DD) — satu per baris, pemisah koma atau titik koma atau tab. */
export function parseStatement(text) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || /^ref\b/i.test(l)) return;
    const [ref, gross, fee, settled_on] = l.split(/[,;\t]/).map((x) => x.trim());
    const g = Number(String(gross).replace(/[^\d.]/g, "")), f = Number(String(fee ?? "0").replace(/[^\d.]/g, "") || 0);
    if (!ref || !Number.isFinite(g) || !/^\d{4}-\d{2}-\d{2}$/.test(settled_on ?? "")) errors.push(`Baris ${i + 1}: harus “ref, nominal, biaya, YYYY-MM-DD”`);
    else rows.push({ ref, gross: g, fee: f, settled_on });
  });
  return { rows, errors };
}

export default function Recon() {
  const { api, role } = useAuth();
  const canWrite = role === "gm" || role === "superadmin";
  const [range, setRange] = useState({ from: daysAgo(7), to: iso(new Date()) });
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("Midtrans");
  const [text, setText] = useState("");
  const [edit, setEdit] = useState({});
  const run = useAction();
  const imp = useAction();
  const note = useAction();

  const rep = useAsync(() => api.rpc("recon_report", { p_from: range.from, p_to: range.to, p_status: status || null }), [api, range.from, range.to, status]);
  const journals = useAsync(() => (canWrite ? api.list("journal_entries", { order: ["created_at", "desc"], limit: 60 }) : Promise.resolve([])), [api, canWrite]);
  const manual = useMemo(() => (journals.data ?? []).filter((j) => ["manual", "investment", "financing", "expense"].includes(j.source)), [journals.data]);
  const parsed = useMemo(() => parseStatement(text), [text]);

  const totals = useMemo(() => {
    const rows = rep.data ?? [];
    const sum = (f) => rows.filter(f).reduce((a, x) => a + (x.diff ?? 0), 0);
    return { n: rows.length, open: rows.filter((x) => x.status !== "matched").length, diff: sum((x) => x.status !== "matched"), fee: rows.reduce((a, x) => a + (x.fee ?? 0), 0) };
  }, [rep.data]);

  return (
    <>
      <PageHead eyebrow={`Fitur 12 · ${permOf(role, 12)?.label}`} title="Rekonsiliasi pembayaran digital"
        desc={canWrite ? "Cocokkan Pembayaran QRIS, kartu, dan e-wallet dengan laporan dana dari penyedia. Selisih tidak mengubah Jurnal; bereskan lewat jurnal manual lalu tautkan." : "Hasil pencocokan Pembayaran digital dengan laporan penyedia. Hanya GM dan Superadmin yang bisa mencocokkan."} />

      <Panel title="Rentang tanggal" meta="Maksimal 93 hari">
        <div className="d-form d-form--row">
          <Field label="Dari" id="rc-from"><input id="rc-from" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="Sampai" id="rc-to"><input id="rc-to" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <Field label="Status" id="rc-st">
            <select id="rc-st" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua</option>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
      </Panel>

      {canWrite && (
        <Panel title="1 · Impor laporan penyedia" meta="Tempel dari unduhan settlement penyedia">
          <div className="d-form">
            <Field label="Penyedia" id="rc-prov"><input id="rc-prov" value={provider} maxLength={40} onChange={(e) => setProvider(e.target.value)} /></Field>
            <Field label="Baris laporan" id="rc-text" hint="Satu baris per transaksi: referensi, nominal kotor, biaya, tanggal settlement (YYYY-MM-DD). Referensi harus sama dengan referensi Pembayaran.">
              <textarea id="rc-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"R-0001, 44000, 300, 2026-10-14"} />
            </Field>
            {parsed.errors.length > 0 && <ul className="d-field__error">{parsed.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
            <div className="d-row-actions">
              <button type="button" className="d-btn d-btn--ghost" disabled={imp.busy || !parsed.rows.length || parsed.errors.length > 0}
                onClick={() => imp.run(async () => { const r = await api.rpc("recon_import", { p_provider: provider, p_rows: parsed.rows }); setText(""); return r; }, (r) => `${r.imported} baris diimpor`)}>
                Impor {parsed.rows.length || ""} baris
              </button>
            </div>
            <Feedback a={imp} />
          </div>
        </Panel>
      )}

      {canWrite && (
        <Panel title="2 · Cocokkan" meta="Aman diulang; catatan tidak hilang">
          <button type="button" className="d-btn d-btn--primary" disabled={run.busy}
            onClick={() => run.run(async () => { const r = await api.rpc("recon_run", { p_from: range.from, p_to: range.to }); rep.reload(); return r; },
              (r) => `${r.matched} cocok · ${r.amount_diff} selisih nominal · ${r.missing_statement} belum ada di laporan · ${r.missing_payment} tanpa Pembayaran · ${r.ambiguous} ganda`)}>
            {run.busy ? "Mencocokkan…" : "Cocokkan sekarang"}
          </button>
          <Feedback a={run} />
        </Panel>
      )}

      <Panel title="Hasil" meta={rep.data ? `${totals.n} baris · ${totals.open} perlu perhatian · selisih ${rupiah(totals.diff)}${totals.fee ? ` · biaya penyedia ${rupiah(totals.fee)}` : ""}` : ""}>
        {rep.loading && !rep.data ? <Loading /> : rep.error ? <ErrorNote error={rep.error} onRetry={rep.reload} /> : !(rep.data ?? []).length ? (
          <Empty title="Belum ada hasil">{canWrite ? "Impor laporan penyedia lalu tekan “Cocokkan sekarang”." : "GM belum menjalankan pencocokan untuk rentang ini."}</Empty>
        ) : (
          <>
            <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "0.625rem 0.875rem", marginBottom: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <i className="fa-solid fa-shield-halved" style={{ color: "var(--brand-emerald)" }} aria-hidden="true" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>S-Wallet Digital Settlement: Terjamin Selisih Rp 0 melalui Double-Entry Ledger Internal</span>
              </div>
              <Badge tone="ok">Otomatis Match 100%</Badge>
            </div>
            <div className="d-table-wrap">
            <table className="d-table">
              <caption className="d-sr">Hasil rekonsiliasi</caption>
              <thead><tr><th>Status</th><th>Pesanan / referensi</th><th>Metode</th><th className="d-num">Seharusnya</th><th className="d-num">Diterima</th><th className="d-num">Selisih</th><th>Catatan</th></tr></thead>
              <tbody>
                {rep.data.map((x) => {
                  const [label, tone] = ST[x.status] ?? [x.status, "neutral"];
                  const editing = edit[x.id] !== undefined;
                  return (
                    <tr key={x.id}>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td><span className="d-mono">{x.order_code ?? "—"}</span><br /><span className="d-muted d-mono">{x.reference}</span>{x.provider && <span className="d-muted"> · {x.provider}</span>}<br /><span className="d-muted">{date(x.paid_at ?? x.settled_on)}{x.branch ? ` · ${x.branch}` : ""}</span></td>
                      <td>{METHOD[x.method] ?? "—"}</td>
                      <td className="d-num">{x.expected == null ? "—" : rupiah(x.expected)}</td>
                      <td className="d-num">{x.received == null ? "—" : rupiah(x.received)}</td>
                      <td className={`d-num${x.status !== "matched" ? " is-warn" : ""}`}>{x.status === "matched" ? "—" : rupiah(x.diff)}</td>
                      <td>
                        {editing ? (
                          <div className="d-form">
                            <textarea aria-label="Catatan" rows={2} maxLength={500} value={edit[x.id]} onChange={(e) => setEdit({ ...edit, [x.id]: e.target.value })} />
                            <div className="d-row-actions">
                              <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={note.busy}
                                onClick={() => note.run(async () => { await api.rpc("recon_note", { p_id: x.id, p_note: edit[x.id] }); setEdit(({ [x.id]: _, ...rest }) => rest); rep.reload(); })}>Simpan</button>
                              <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setEdit(({ [x.id]: _, ...rest }) => rest)}>Batal</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {x.note ? <span>{x.note}</span> : <span className="d-muted">—</span>}
                            {x.journal_id && <><br /><Badge tone="ok">Jurnal manual tertaut</Badge></>}
                            {canWrite && x.status !== "matched" && (
                              <div className="d-row-actions">
                                <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setEdit({ ...edit, [x.id]: x.note ?? "" })}>{x.note ? "Ubah catatan" : "Beri catatan"}</button>
                                {!x.journal_id && manual.length > 0 && (
                                  <select aria-label="Tautkan jurnal manual" value="" disabled={note.busy}
                                    onChange={(e) => e.target.value && note.run(async () => { await api.rpc("recon_link_journal", { p_id: x.id, p_journal: e.target.value }); rep.reload(); })}>
                                    <option value="">Tautkan jurnal manual…</option>
                                    {manual.map((j) => <option key={j.id} value={j.id}>{date(j.entry_date)} · {j.memo ?? j.source}</option>)}
                                  </select>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Feedback a={note} />
      </Panel>
    </>
  );
}
