import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { rupiah, dateTime, iso, addDays } from "../../../lib/format.js";
import { anomaliesOf, auditText, fmtSpan, voidRatio, discountPct, VARIANCE_TOLERANCE } from "../../../lib/watch.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Empty, useAsync } from "../../ui/index.jsx";
import { useBranch, useLive, useNow, useIndex } from "../../ops.jsx";
import { ServiceTabs } from "./shared.jsx";

const IDLE_MIN = 15; // [Guessing] kasir dianggap idle bila tanpa aktivitas lebih dari 15 menit
const pctText = (n) => `${(n * 100).toFixed(1).replace(".", ",")}%`;

/**
 * Owner · Monitoring GM & Kasir/Staf   |   GM · Monitoring Kasir Bertugas.
 * Papan "bertugas sekarang" (shift terbuka) dibaca lewat RLS: GM yang dibatasi cabang hanya melihat cabangnya.
 */
export default function Pulse() {
  const { api, role, tenantId } = useAuth();
  const isOwner = role === "owner";
  const now = useNow(30000);
  const b = useBranch();
  const [fBranch, setFBranch] = useState("");
  const [days, setDays] = useState(7);
  const [fPerson, setFPerson] = useState("");
  const [fKind, setFKind] = useState("");
  const gridRef = useRef(null);

  const duty = useAsync(() => api.rpc("on_duty", { p_branch: fBranch || null }), [api, fBranch]);
  const today = iso(new Date());
  const day = useAsync(async () => {
    const [shifts, people, att, plan] = await Promise.all([
      api.list("shifts", { eq: { tenant_id: tenantId }, order: ["opened_at", "desc"], limit: 80 }),
      api.list("profiles", { eq: { tenant_id: tenantId } }),
      api.list("attendance", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 200 }),
      api.list("work_shifts", { eq: { tenant_id: tenantId, work_date: today } }),
    ]);
    return { shifts, people, att, plan };
  }, [api, tenantId, today]);
  const score = useAsync(() => (isOwner ? api.rpc("staff_scorecard", { p_from: iso(addDays(new Date(), -(days - 1))), p_to: today }) : []), [api, isOwner, days, today]);
  const audit = useAsync(() => (isOwner ? api.listAudit({ tenantId, limit: 200 }) : []), [api, isOwner, tenantId]);
  useLive(["shifts", "orders", "approvals", "attendance"], () => { duty.reload(); day.reload(); });

  const ppl = useIndex(day.data?.people);
  const rows = (duty.data ?? []).filter((x) => !fBranch || x.branch_id === fBranch);
  const closedToday = (day.data?.shifts ?? []).filter((s) => s.status === "closed" && s.closed_at && iso(s.closed_at) === today);
  const anomalies = useMemo(() => anomaliesOf(score.data ?? []), [score.data]);

  useGSAP(() => {
    if (prefersReducedMotion() || !gridRef.current?.children.length) return;
    gsap.from(gridRef.current.children, { opacity: 0, y: 8, stagger: 0.05, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
  }, { scope: gridRef, dependencies: [rows.length] });

  const attendance = useMemo(() => {
    const d = day.data;
    if (!d) return [];
    const ids = [...new Set(d.plan.map((w) => w.profile_id))];
    return ids.map((pid) => {
      const mine = d.att.filter((x) => x.profile_id === pid && iso(x.created_at) === today).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
      const last = mine[0];
      const w = d.plan.find((x) => x.profile_id === pid);
      return { pid, w, last, state: !last ? ["Belum absen", "warn"] : last.kind === "in" ? ["Sedang bertugas", "ok"] : ["Sudah pulang", "neutral"] };
    });
  }, [day.data, today]);

  const people = (score.data ?? []);
  const feed = (audit.data ?? []).filter((x) => (!fPerson || x.entity_id === fPerson || x.actor_id === fPerson)
    && (!fKind || (fKind === "login" ? x.action === "login" : fKind === "akun" ? ["invite", "invite_resend", "invite_revoke", "pin_reset"].includes(x.action) || x.entity === "profiles" || x.entity === "member_branches" : true))).slice(0, 30);

  return (
    <>
      <PageHead eyebrow={`${isOwner ? "Owner" : "General Manager"} · Layanan & Akses`} title={isOwner ? "Monitoring GM & Kasir/Staf" : "Monitoring Kasir Bertugas"}
        desc={isOwner ? "Siapa bertugas sekarang, kartu skor 7/30 hari, dan peringatan anomali. Semua angka dihitung dari transaksi, shift, dan absensi nyata."
          : "Kartu muncul otomatis saat kasir membuka shift dan hilang saat shift ditutup. Anda hanya melihat cabang yang Anda pegang."}
        actions={b.options.length > 1 && (
          <label className="d-switch"><span className="d-switch__label">Cabang</span>
            <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}><option value="">Semua cabang</option>{b.options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>)} />
      <ServiceTabs />

      <Panel title="Bertugas sekarang" meta={duty.data ? `${rows.length} kasir · diperbarui langsung` : undefined}>
        {duty.loading && !duty.data ? <Loading /> : duty.error ? <ErrorNote error={duty.error} onRetry={duty.reload} /> : rows.length === 0 ? (
          <Empty title="Tidak ada kasir yang sedang membuka shift">Kartu akan muncul begitu kasir menekan “Buka shift”.</Empty>
        ) : (
          <div className="duty-grid" ref={gridRef}>{rows.map((x) => {
            const idle = Math.floor((now - new Date(x.last_activity ?? x.opened_at).getTime()) / 60000);
            return (
              <article key={x.shift_id} className={`duty${idle > IDLE_MIN ? " is-idle" : ""}`} aria-label={`Kasir ${x.cashier_name}`}>
                <header className="duty__head">
                  <div><p className="duty__name">{x.cashier_name}</p><p className="d-list__meta">{x.branch_name} · buka {fmtSpan(now - new Date(x.opened_at).getTime())} lalu</p></div>
                  <div className="d-chips">
                    {idle > IDLE_MIN ? <Badge tone="warn">Idle {idle} mnt</Badge> : <Badge tone="ok">Aktif</Badge>}
                    {x.pending_void_requests > 0 && <Badge tone="danger">{x.pending_void_requests} request void</Badge>}
                  </div>
                </header>
                <dl className="duty__nums">
                  <div><dt>Transaksi</dt><dd className="d-num">{x.orders_paid}</dd></div>
                  <div><dt>Nota terbuka</dt><dd className="d-num">{x.open_orders}</dd></div>
                  <div><dt>Void</dt><dd className="d-num">{x.voids}</dd></div>
                  <div><dt>Diskon</dt><dd className="d-num">{rupiah(x.discount_total)}</dd></div>
                  <div><dt>Modal awal</dt><dd className="d-num">{rupiah(x.opening_cash)}</dd></div>
                  <div><dt>Tunai di laci (perkiraan)</dt><dd className="d-num">{rupiah(Number(x.opening_cash) + Number(x.cash_sales))}</dd></div>
                </dl>
                {x.pending_void_requests > 0 && <Link to="/app/persetujuan" className="d-btn d-btn--primary d-btn--sm">Tinjau request void</Link>}
              </article>);
          })}</div>
        )}
      </Panel>

      <div className="d-grid d-grid--2">
        <Panel title="Kehadiran hari ini" meta="Dari jadwal shift dan absen GPS">
          {day.loading && !day.data ? <Loading /> : attendance.length === 0 ? <p className="d-text d-muted">Tidak ada jadwal shift hari ini.</p> : (
            <ul className="d-list">{attendance.map(({ pid, w, last, state }) => (
              <li key={pid}><div><p className="d-list__title">{ppl[pid]?.full_name ?? "—"}</p><p className="d-list__meta">Jadwal {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}{last ? ` · ${last.kind === "in" ? "masuk" : "pulang"} ${dateTime(last.created_at)}` : ""}</p></div><Badge tone={state[1]}>{state[0]}</Badge></li>))}</ul>
          )}
        </Panel>
        <Panel title="Rekap shift ditutup hari ini" meta="Selisih kas per kasir">
          {day.loading && !day.data ? <Loading /> : closedToday.length === 0 ? <p className="d-text d-muted">Belum ada shift yang ditutup hari ini.</p> : (
            <ul className="d-list">{closedToday.map((s) => {
              const v = Number(s.variance ?? 0);
              return (
                <li key={s.id}><div><p className="d-list__title">{ppl[s.cashier_id]?.full_name ?? "—"}</p><p className="d-list__meta">Tunai terhitung {rupiah(s.counted_cash)} · ditutup {dateTime(s.closed_at)}</p></div>
                  <Badge tone={Math.abs(v) <= VARIANCE_TOLERANCE ? "ok" : "danger"}>{v === 0 ? "Pas" : `${v > 0 ? "+" : "−"}${rupiah(Math.abs(v))}`}</Badge></li>);
            })}</ul>
          )}
        </Panel>
      </div>

      {isOwner && (
        <>
          <Panel title="Kartu skor" meta="Void, diskon, selisih kas, dan keterlambatan dihitung per orang" actions={
            <div className="d-seg" role="radiogroup" aria-label="Periode">
              {[7, 30].map((n) => <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}>{n} hari</button>)}
            </div>}>
            {score.loading && !score.data ? <Loading /> : score.error ? <ErrorNote error={score.error} onRetry={score.reload} /> : people.length === 0 ? <Empty title="Belum ada data" /> : (
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr><th scope="col">Nama</th><th scope="col" className="d-num">Transaksi</th><th scope="col" className="d-num">Rata-rata nota</th><th scope="col" className="d-num">Void</th><th scope="col" className="d-num">Diskon</th><th scope="col" className="d-num">Selisih kas</th><th scope="col" className="d-num">Terlambat</th><th scope="col" className="d-num">Approval</th></tr></thead>
                <tbody>{people.map((p) => {
                  const flagged = anomalies.some((x) => x.profile_id === p.profile_id);
                  return (
                    <tr key={p.profile_id} className={flagged ? "is-flag" : undefined}>
                      <td>{p.full_name}<p className="d-list__meta">{p.role === "gm" ? "General Manager" : "Kasir / Staf"}{p.is_active === false ? " · nonaktif" : ""}</p></td>
                      {p.role === "staff" ? (
                        <>
                          <td className="d-num">{p.orders_paid}</td>
                          <td className="d-num">{p.orders_paid ? rupiah(p.revenue / p.orders_paid) : "—"}</td>
                          <td className="d-num">{p.voids} <span className="d-muted">({pctText(voidRatio(p))})</span></td>
                          <td className="d-num">{pctText(discountPct(p))}</td>
                          <td className="d-num">{Number(p.cash_variance) === 0 ? "Pas" : rupiah(p.cash_variance)}</td>
                          <td className="d-num">{p.clock_ins ? `${p.late_ins}/${p.clock_ins}` : "—"}</td>
                          <td className="d-num">—</td>
                        </>
                      ) : (
                        <>
                          <td className="d-num" colSpan={5}><span className="d-muted">Tidak memegang kas</span></td>
                          <td className="d-num">{p.clock_ins ? `${p.late_ins}/${p.clock_ins}` : "—"}</td>
                          <td className="d-num">{p.approvals_decided ? `${p.approvals_decided} · ${String(p.avg_decision_min).replace(".", ",")} mnt` : "—"}</td>
                        </>
                      )}
                    </tr>);
                })}</tbody>
              </table></div>
            )}
          </Panel>
          <div className="d-grid d-grid--2">
            <Panel title="Peringatan anomali" meta="Ambang awal, belum dikalibrasi dengan data tenant Anda">
              {anomalies.length === 0 ? <p className="d-text d-muted">Tidak ada anomali pada {days} hari terakhir.</p> : (
                <ul className="d-list">{anomalies.map((x, i) => <li key={i}><div><p className="d-list__title">{x.name}</p><p className="d-list__meta">{x.text}</p></div><Badge tone={x.severity}>{x.severity === "danger" ? "Periksa" : "Pantau"}</Badge></li>)}</ul>
              )}
            </Panel>
            <Panel title="Timeline aktivitas" actions={
              <div className="d-filters">
                <select className="d-date" aria-label="Orang" value={fPerson} onChange={(e) => setFPerson(e.target.value)}><option value="">Semua orang</option>{people.map((p) => <option key={p.profile_id} value={p.profile_id}>{p.full_name}</option>)}</select>
                <select className="d-date" aria-label="Jenis" value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="">Semua jenis</option><option value="login">Login</option><option value="akun">Akun &amp; penugasan</option></select>
              </div>}>
              {feed.length === 0 ? <p className="d-text d-muted">Belum ada aktivitas yang cocok.</p> : (
                <ul className="d-feed">{feed.map((x) => <li key={x.id} className="d-feed__item"><p className="d-feed__meta">{x.actor_role ?? "sistem"} · {dateTime(x.created_at)}</p><p className="d-feed__msg">{auditText(x)}</p></li>)}</ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
