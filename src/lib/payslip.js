// Slip gaji siap cetak / simpan PDF lewat dialog cetak browser (tanpa dependensi). Semua nilai di-escape.
import { rupiah } from "./format.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const netOf = (l) => Number(l.net ?? l.base + l.allowance + l.overtime + l.commission - l.late_penalty - l.kasbon);

export function payslipHtml({ tenant, employee, period, line, status }) {
  const earn = [["Gaji pokok", line.base], ["Tunjangan", line.allowance], ["Lembur", line.overtime], ["Komisi", line.commission]];
  const cut = [["Potongan keterlambatan", line.late_penalty], ["Cicilan kasbon", line.kasbon]];
  const row = ([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(rupiah(Number(v) || 0))}</td></tr>`;
  const gross = earn.reduce((a, [, v]) => a + (Number(v) || 0), 0), pot = cut.reduce((a, [, v]) => a + (Number(v) || 0), 0);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Slip gaji ${esc(employee?.full_name)} ${esc(String(period).slice(0, 7))}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.05em}
table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px solid #ddd}.n{text-align:right}.t td{font-weight:700;border-top:2px solid #111}
.meta{color:#555;margin:2px 0 14px}.net{margin-top:18px;padding:12px;border:2px solid #111;display:flex;justify-content:space-between;font-size:16px;font-weight:700}
.sig{margin-top:40px;color:#555;font-size:12px}@media print{body{margin:12mm}}</style></head><body>
<h1>${esc(tenant?.name ?? "Tijarah")}</h1><p class="meta">Slip gaji · periode ${esc(String(period).slice(0, 7))}${status ? ` · status ${esc(status)}` : ""}</p>
<p><strong>${esc(employee?.full_name ?? "—")}</strong><br>${esc(employee?.role ?? "")}</p>
<h2>Pendapatan</h2><table>${earn.map(row).join("")}<tr class="t"><td>Total pendapatan</td><td class="n">${esc(rupiah(gross))}</td></tr></table>
<h2>Potongan</h2><table>${cut.map(row).join("")}<tr class="t"><td>Total potongan</td><td class="n">${esc(rupiah(pot))}</td></tr></table>
<div className="net" style={{ display: "flex", justifyContent: "space-between" }}><span>Diterima</span><span>${esc(rupiah(netOf(line)))}</span></div>
<p class="sig">Dokumen ini dibuat otomatis oleh Tijarah dan sah tanpa tanda tangan. Simpan sebagai PDF lewat dialog cetak.</p></body></html>`;
}

/** Buka jendela baru berisi slip lalu panggil dialog cetak. Mengembalikan false bila popup diblokir. */
export function printPayslip(data) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return false;
  w.document.open(); w.document.write(payslipHtml(data)); w.document.close();
  w.focus(); setTimeout(() => { try { w.print(); } catch { /* pengguna menutup */ } }, 250);
  return true;
}
