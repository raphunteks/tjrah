import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Panel, PageHead, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive, useNow } from "../../ops.jsx";
import { TICKET_STATUS, PRIORITY } from "../../../lib/watch.js";
import { ServiceTabs, ago } from "./shared.jsx";
import TicketThread from "./TicketThread.jsx";

const CATEGORIES = ["Tagihan", "Teknis", "Data", "Integrasi", "SATUSEHAT", "Lainnya"];

/** Owner · Tiket ke Harum.in: buat tiket, ikuti balasan, nilai layanan, dan otorisasi Break-Glass Support Session. */
export default function Help() {
  const { api, tenantId } = useAuth();
  const now = useNow(60000);
  const r = useAsync(async () => {
    const [tickets, messages, sessions] = await Promise.all([
      api.list("support_tickets", { order: ["updated_at", "desc"] }),
      api.list("ticket_messages", { order: ["created_at"] }),
      api.listSupportSessions ? api.listSupportSessions(tenantId) : [],
    ]);
    return { tickets, messages, sessions };
  }, [api, tenantId]);

  useLive(["support_tickets", "ticket_messages", "support_sessions"], r.reload);
  const a = useAction();
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const tickets = r.data?.tickets ?? [];
  const sessions = r.data?.sessions ?? [];
  const current = tickets.find((t) => t.id === (sel ?? tickets[0]?.id));

  // Sesi Break-Glass
  const activeSession = sessions.find((s) => s.status === "active" && new Date(s.expires_at).getTime() > now);
  const pendingSession = sessions.find((s) => s.status === "requested");

  const create = () => a.run(async () => {
    const tk = await api.rpc("open_ticket", { p_category: form.category, p_subject: form.subject, p_body: form.body });
    setForm(null);
    setSel(tk.id);
    await r.reload();
  }, "Tiket terkirim. Tim Harum.in akan membalas di sini.");

  const handleGrant = (grant) => a.run(async () => {
    await api.grantSupportSession(pendingSession.id, grant);
    await r.reload();
  }, grant ? "Izin akses dukungan diberikan ke tim Harum.in." : "Permintaan akses ditolak.");

  const handleRevoke = () => a.run(async () => {
    await api.revokeSupportSession(activeSession.id);
    await r.reload();
  }, "Sesi akses dukungan telah dicabut.");

  return (
    <>
      <PageHead eyebrow="Owner · Layanan & Akses" title="Tiket ke Harum.in"
        desc="Laporkan kendala langsung ke tim Harum.in. Balasan dan izin akses dukungan darurat dikelola di halaman ini."
        actions={<button type="button" className="d-btn d-btn--primary" onClick={() => { a.setError(null); a.setOk(null); setForm({ category: "Teknis", subject: "", body: "" }); }}>Butuh bantuan</button>} />
      <ServiceTabs />
      <Feedback a={a} />

      {/* BANNER BREAK-GLASS SUPPORT SESSION (1.6) */}
      {pendingSession && (
        <div style={{ background: "rgba(234, 179, 8, 0.12)", border: "1px solid var(--d-warn)", padding: "1rem 1.25rem", borderRadius: "8px", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Badge tone="warn">Permintaan Akses Masuk</Badge>
              <strong style={{ color: "var(--d-warn)" }}>Tim Dukungan Harum.in Meminta Akses Bantuan Teknis</strong>
            </div>
            <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.9rem" }}>
              Alasan: <em>"{pendingSession.reason}"</em> · Durasi diminta: <strong>{pendingSession.duration_hours} Jam</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => handleGrant(false)}>Tolak</button>
            <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => handleGrant(true)}>Izinkan ({pendingSession.duration_hours} Jam)</button>
          </div>
        </div>
      )}

      {activeSession && (
        <div style={{ background: "rgba(34, 197, 94, 0.12)", border: "1px solid var(--d-ok)", padding: "0.85rem 1.25rem", borderRadius: "8px", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Badge tone="ok">Sesi Dukungan Aktif</Badge>
            <span style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>
              Tim Harum.in sedang menginvestigasi sistem toko Anda (Berakhir: {new Date(activeSession.expires_at).toLocaleTimeString()}). Seluruh aktivitas dicatat di Audit Log.
            </span>
          </div>
          <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy} onClick={handleRevoke}>Cabut Akses Sekarang</button>
        </div>
      )}

      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <div className="tk-layout">
          <Panel title="Tiket saya" meta={`${tickets.filter((t) => t.status !== "resolved").length} terbuka`}>
            {tickets.length === 0 ? <Empty title="Belum ada tiket">Klik “Butuh bantuan” untuk melaporkan kendala.</Empty> : (
              <ul className="tk-list">{tickets.map((t) => (
                <li key={t.id}><button type="button" className={`tk-item${current?.id === t.id ? " is-on" : ""}`} onClick={() => setSel(t.id)} aria-current={current?.id === t.id ? "true" : undefined}>
                  <span className="tk-item__top"><span className="d-mono">{t.code}</span><Badge tone={TICKET_STATUS[t.status][1]}>{TICKET_STATUS[t.status][0]}</Badge></span>
                  <span className="tk-item__subj">{t.subject}</span>
                  <span className="tk-item__meta">{t.category} · {ago(t.created_at, now)}</span>
                  {t.status === "waiting_owner" && <span className="tk-item__foot"><Badge tone="warn">Menunggu balasan Anda</Badge></span>}
                </button></li>))}</ul>
            )}
          </Panel>
          <Panel>
            {current ? (
              <TicketThread key={current.id} ticket={current} busy={a.busy} now={now}
                messages={r.data.messages.filter((m) => m.ticket_id === current.id)}
                onReply={async (body) => (await a.run(async () => { await api.rpc("reply_ticket", { p_ticket: current.id, p_body: body, p_internal: false }); await r.reload(); return true; }, "Balasan terkirim.")) === true}
                onRate={(score, note) => a.run(async () => { await api.rpc("rate_ticket", { p_ticket: current.id, p_score: score, p_note: note || null }); await r.reload(); }, "Terima kasih atas penilaiannya.")} />
            ) : <Empty title="Pilih tiket" />}
          </Panel>
        </div>
      )}

      <Modal open={Boolean(form)} title="Buat tiket bantuan" onClose={() => setForm(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setForm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !form?.subject || !form?.body} onClick={create}>Kirim tiket</button></>}>
        {form && (
          <div className="d-form">
            <Field label="Kategori" id="f-cat">
              <select id="f-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subjek / Ringkasan kendala" id="f-subj"><input id="f-subj" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label="Penjelasan detail" id="f-body"><textarea id="f-body" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
