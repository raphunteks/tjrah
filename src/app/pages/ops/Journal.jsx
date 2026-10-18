import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useAction, Feedback, useBranch, useLive } from "../../ops.jsx";

const ACCOUNTS = [["1101", "Kas"], ["1102", "Bank, EDC & QRIS"], ["1301", "Persediaan Bahan Baku"], ["2101", "Utang Dagang"], ["2102", "Utang Pajak Penjualan"], ["2103", "Utang Gaji"],
  ["3101", "Modal Pemilik"], ["4101", "Pendapatan Penjualan"], ["5101", "Harga Pokok Penjualan"], ["6101", "Beban Gaji"], ["6102", "Beban Sewa"], ["6103", "Beban Listrik & Internet"], ["6104", "Beban Waste & Susut"], ["6105", "Beban Kas Kecil Outlet"]];
const SRC = { pos: "POS", void: "Void", waste: "Waste", purchase: "Pembelian", petty: "Kas kecil", payroll: "Payroll", opname: "Opname", expense: "Beban", manual: "Manual", financing: "Pendanaan", investment: "Investasi" };

export default function Journal() {
  const { api, role, tenantId } = useAuth();
  const b = useBranch();
  const r = useAsync(() => (!api || !tenantId ? null : api.list("journal_entries", { select: "*, journal_lines(debit, credit, account:accounts(code, name))", eq: { tenant_id: tenantId }, order: ["entry_date", "desc"], limit: 80 }).catch(() => [])), [api, tenantId], { key: tenantId ? `journal@${tenantId}` : null });
  useLive(["journal_entries", "journal_lines"], r.reload);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const a = useAction();
  const dr = form?.lines.reduce((s, l) => s + (Number(l.dr) || 0), 0) ?? 0, cr = form?.lines.reduce((s, l) => s + (Number(l.cr) || 0), 0) ?? 0;
  return (
    <>
      <PageHead eyebrow={`Fitur 11 · ${permOf(role, 11)?.label}`} title="Jurnal umum" desc="Penjualan, pembelian, waste, kas kecil, dan payroll dijurnal otomatis (double-entry). Jurnal manual untuk transaksi di luar sistem."
        actions={can(role, 11, "c") && <button type="button" className="d-btn d-btn--primary" onClick={() => setForm({ memo: "", source: "manual", lines: [{ code: "6102", dr: "", cr: "" }, { code: "1101", dr: "", cr: "" }] })}>Jurnal manual</button>} />
      <Panel>
        {r.loading && !r.data ? <Loading /> : r.error && !r.data ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? <Loading /> : r.data.length === 0 ? <Empty title="Belum ada jurnal transaksi">Transaksi penjualan, kas kecil, dan mutasi lainnya akan tercatat otomatis di sini.</Empty> : (
          <ul className="jr">{r.data.map((e) => {
            const amt = e.journal_lines.reduce((s, l) => s + Number(l.debit), 0);
            const isOpen = open === e.id;
            return (
              <li key={e.id} className="jr-entry">
                <button type="button" className="jr-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                  <span className="d-mono d-muted">{date(e.entry_date)}</span>
                  <span className="jr-memo">{e.memo}</span>
                  <Badge>{SRC[e.source] ?? e.source}</Badge>
                  <span className="d-mono">{rupiah(amt)}</span>
                </button>
                {isOpen && (
                  <table className="d-table jr-lines"><tbody>{e.journal_lines.map((l, i) => (
                    <tr key={i}><td className="d-mono">{l.account?.code}</td><td className={Number(l.credit) > 0 ? "d-indent" : undefined}>{l.account?.name}</td><td className="d-num">{Number(l.debit) ? rupiah(l.debit) : ""}</td><td className="d-num">{Number(l.credit) ? rupiah(l.credit) : ""}</td></tr>
                  ))}</tbody></table>
                )}
              </li>
            );
          })}</ul>
        )}
      </Panel>
      <Modal open={Boolean(form)} title="Jurnal manual" onClose={() => setForm(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setForm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !form?.memo || dr === 0 || dr !== cr}
            onClick={() => a.run(async () => { await api.rpc("post_manual_journal", { p_branch: b.branchId, p_memo: form.memo, p_source: form.source, p_lines: form.lines.map((l) => ({ code: l.code, dr: Number(l.dr) || 0, cr: Number(l.cr) || 0 })) }); setForm(null); r.reload(); })}>Posting jurnal</button></>}>
        {form && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Keterangan" id="j-m"><input id="j-m" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
              <Field label="Aktivitas arus kas" id="j-s"><select id="j-s" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="manual">Operasional</option><option value="expense">Beban operasional</option><option value="investment">Investasi (aset)</option><option value="financing">Pendanaan (modal/pinjaman)</option></select></Field>
            </div>
            {form.lines.map((l, i) => (
              <div key={i} className="d-form__row d-form__row--3">
                <Field label="Akun" id={`j-a${i}`}><select id={`j-a${i}`} value={l.code} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })}>{ACCOUNTS.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
                <Field label="Debit" id={`j-d${i}`}><input id={`j-d${i}`} inputMode="numeric" value={l.dr} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, dr: e.target.value.replace(/\D/g, ""), cr: "" } : x)) })} /></Field>
                <Field label="Kredit" id={`j-c${i}`}><input id={`j-c${i}`} inputMode="numeric" value={l.cr} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, cr: e.target.value.replace(/\D/g, ""), dr: "" } : x)) })} /></Field>
              </div>
            ))}
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setForm({ ...form, lines: [...form.lines, { code: "1101", dr: "", cr: "" }] })}>+ Baris</button>
            <p className={dr === cr && dr > 0 ? "d-saved" : "d-field__error"}>Debit {rupiah(dr)} · Kredit {rupiah(cr)} {dr === cr && dr > 0 ? "· seimbang" : "· belum seimbang"}</p>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </>
  );
}
