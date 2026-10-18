import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Panel, Stat, PageHead, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive, useNow } from "../../ops.jsx";
import { TICKET_STATUS, PRIORITY, ticketOrder, slaOf } from "../../../lib/watch.js";
import { ServiceTabs, ago } from "./shared.jsx";
import TicketThread from "./TicketThread.jsx";

const TABS = [["open", "Antrean"], ["new", "Baru"], ["in_progress", "Dikerjakan"], ["waiting_owner", "Menunggu Owner"], ["resolved", "Selesai"]];

/** Superadmin · Tiket Bantuan CS: antrean lintas tenant, SLA, balasan, catatan internal, dan Break-Glass Support. */
export default function Tickets() {
  const { api } = useAuth();
  const now = useNow(30000);
  const r = useAsync(async () => {
    const [tickets, messages, tenants, sessions] = await Promise.all([
      api.list("support_tickets"),
      api.list("ticket_messages", { order: ["created_at"] }),
      api.listTenants(),
      api.listSupportSessions ? api.listSupportSessions() : [],
    ]);
    return { tickets, messages, tenants, sessions };
  }, [api]);

  useLive(["support_tickets", "ticket_messages", "support_sessions"], r.reload);
  const a = useAction();
  const [tab, setTab] = useState("open");
  const [sel, setSel] = useState(null);

  // State untuk Break-Glass Session Modal
  const [bgModal, setBgModal] = useState(null); // ticket object
  const [bgReason, setBgReason] = useState("");
  const [bgHours, setBgHours] = useState(2);

  const tenantName = (id) => r.data?.tenants?.find((t) => t.id === id)?.name ?? "—";
  const list = useMemo(() => (r.data?.tickets ?? [])
    .filter((t) => (tab === "open" ? t.status !== "resolved" : t.status === tab))
    .sort(tab === "resolved" ? (x, y) => new Date(y.closed_at ?? 0) - new Date(x.closed_at ?? 0) : ticketOrder), [r.data, tab]);
  const open = (r.data?.tickets ?? []).filter((t) => t.status !== "resolved");
  const overdue = open.filter((t) => !t.first_response_at && new Date(t.sla_due_at).getTime() < now);
  const rated = (r.data?.tickets ?? []).filter((t) => t.csat != null);
  const csat = rated.length ? (rated.reduce((s, t) => s + t.csat, 0) / rated.length).toFixed(1).replace(".", ",") : "—";
  const current = (r.data?.tickets ?? []).find((t) => t.id === (sel ?? list[0]?.id));

  // Sesi Break-Glass aktif untuk tenant yang sedang dipilih
  const tenantSession = (r.data?.sessions ?? []).find((s) => s.tenant_id === current?.tenant_id && s.status === "active" && new Date(s.expires_at).getTime() > now);
  const pendingSession = (r.data?.sessions ?? []).find((s) => s.tenant_id === current?.tenant_id && s.status === "requested");

  const act = (fn, msg) => a.run(async () => { await fn(); await r.reload(); }, msg);

  const requestBreakGlass = () => a.run(async () => {
    await api.requestSupportSession({
      tenantId: bgModal.tenant_id,
      ticketId: bgModal.id,
      reason: bgReason,
      hours: Number(bgHours),
    });
    setBgModal(null);
    setBgReason("");
    r.reload();
  }, "Permintaan akses dukungan (Break-Glass) terkirim ke Owner.");

  return (
    <>
      <PageHead
        eyebrow="Superadmin · Layanan & Akses"
        title="Tiket Bantuan CS"
        desc="Antrean tiket dari seluruh merchant, SLA terpadu, dan opsi permintaan akses dukungan darurat (Break-Glass)."
      />
      <ServiceTabs />

      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <div className="d-stats">
            <Stat label="Tiket terbuka" value={open.length} sub={`${(r.data.tickets.length)} total`} />
            <Stat label="SLA terlewat" value={overdue.length} sub="belum ada respons pertama" />
            <Stat label="Menunggu Owner" value={open.filter((t) => t.status === "waiting_owner").length} sub="bola di sisi merchant" />
            <Stat label="CSAT rata-rata" value={csat} sub={`${rated.length} penilaian`} />
          </div>

          <Feedback a={a} />

          <div className="tk-layout">
            <Panel title="Antrean" actions={
              <div className="d-seg" role="radiogroup" aria-label="Filter status">
                {TABS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => { setTab(k); setSel(null); }}>{l}</button>)}
              </div>}>
              {list.length === 0 ? <Empty title="Tidak ada tiket">Tiket dari Owner muncul di sini begitu dikirim.</Empty> : (
                <ul className="tk-list">{list.map((t) => {
                  const sla = slaOf(t, now);
                  return (
                    <li key={t.id}><button type="button" className={`tk-item${current?.id === t.id ? " is-on" : ""}`} onClick={() => setSel(t.id)} aria-current={current?.id === t.id ? "true" : undefined}>
                      <span className="tk-item__top"><span className="d-mono">{t.code}</span><Badge tone={PRIORITY[t.priority][1]}>{PRIORITY[t.priority][0]}</Badge></span>
                      <span className="tk-item__subj">{t.subject}</span>
                      <span className="tk-item__meta">{tenantName(t.tenant_id)} · {t.category} · {ago(t.created_at, now)}</span>
                      <span className="tk-item__foot"><Badge tone={TICKET_STATUS[t.status][1]}>{TICKET_STATUS[t.status][0]}</Badge>{t.status !== "resolved" && <Badge tone={sla.tone}>{sla.label}</Badge>}</span>
                    </button></li>);
                })}</ul>
              )}
            </Panel>

            <Panel>
              {current ? (
                <>
                  {/* BREAK-GLASS SUPPORT BADGE / ACTIONS */}
                  <div style={{ background: "var(--d-surface-alt)", padding: "0.85rem 1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: "600" }}>
                        🛡️ Mode Dukungan Bersyarat (Break-Glass)
                      </p>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--d-muted)" }}>
                        {tenantSession ? `Sesi aktif s.d. ${new Date(tenantSession.expires_at).toLocaleTimeString()}` :
                         pendingSession ? "Menunggu persetujuan Owner" : "Hanya dapat melihat data merchant bila diizinkan Owner"}
                      </p>
                    </div>
                    {tenantSession ? (
                      <Badge tone="ok">Sesi Aktif</Badge>
                    ) : pendingSession ? (
                      <Badge tone="warn">Menunggu Persetujuan</Badge>
                    ) : (
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--ghost"
                        onClick={() => { setBgModal(current); setBgReason(`Investigasi kendala tiket ${current.code}: ${current.subject}`); }}
                      >
                        Minta Akses Dukungan
                      </button>
                    )}
                  </div>

                  <TicketThread key={current.id} ticket={current} isSA tenantName={tenantName(current.tenant_id)} busy={a.busy} now={now}
                    messages={r.data.messages.filter((m) => m.ticket_id === current.id)}
                    onReply={async (body, internal) => (await a.run(async () => { await api.rpc("reply_ticket", { p_ticket: current.id, p_body: body, p_internal: internal }); await r.reload(); return true; }, internal ? "Catatan internal tersimpan." : "Balasan terkirim.")) === true}
                    onStatus={(s) => act(() => api.rpc("set_ticket_status", { p_ticket: current.id, p_status: s }), "Status tiket diperbarui.")} />
                </>
              ) : <Empty title="Pilih tiket" />}
            </Panel>
          </div>
        </>
      )}

      {/* MODAL MINTA AKSES BREAK-GLASS */}
      <Modal
        open={Boolean(bgModal)}
        title="Minta Akses Dukungan Bersyarat (Break-Glass)"
        onClose={() => setBgModal(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setBgModal(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || bgReason.length < 5} onClick={requestBreakGlass}>
            Kirim Permintaan ke Owner
          </button>
        </>}
      >
        {bgModal && (
          <div className="d-form">
            <p className="d-text" style={{ fontSize: "0.9rem" }}>
              Sesuai prinsip <strong>Zero-Trust & UU PDP</strong>, Superadmin hanya dapat menginspeksi data transaksi dan operasional merchant setelah disetujui Owner. Seluruh aktivitas Anda akan dicatat di Audit Log dan rekam medis pasien (F17) tetap disamarkan.
            </p>
            <Field label="Alasan Investigasi Teknis (Wajib)" id="bg-reason" hint="Alasan ini akan dibaca oleh Owner sebelum memberi izin">
              <textarea
                id="bg-reason"
                rows={3}
                value={bgReason}
                onChange={(e) => setBgReason(e.target.value)}
                placeholder="Contoh: Investigasi selisih kasir cabang Pettarani pada shift sore..."
              />
            </Field>
            <Field label="Durasi Akses yang Diminta" id="bg-hours" hint="Akses otomatis kedaluwarsa setelah waktu habis">
              <select id="bg-hours" value={bgHours} onChange={(e) => setBgHours(e.target.value)}>
                <option value={1}>1 Jam</option>
                <option value={2}>2 Jam (Standar)</option>
                <option value={4}>4 Jam</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
