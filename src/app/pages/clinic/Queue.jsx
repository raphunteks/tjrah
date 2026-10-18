import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useRouter } from "../../../lib/router.jsx";
import { can } from "../../../lib/rbac.js";
import { dateTime } from "../../../lib/format.js";
import { checkNik, SEX, ageFrom } from "../../../lib/clinic.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useNow, useAction, Feedback, minutesSince } from "../../ops.jsx";

const STATUS = {
  booked: ["Reservasi", "accent"], waiting: ["Menunggu", "warn"], called: ["Dipanggil", "accent"], in_exam: ["Diperiksa", "ok"],
  done: ["Selesai", "neutral"], cancelled: ["Batal", "neutral"], no_show: ["Tidak hadir", "danger"],
};
const today = () => new Date().toISOString().slice(0, 10);

function ClinicForm({ branchId, tenantId, onDone }) {
  const { api } = useAuth();
  const [f, setF] = useState({ name: "", nik: "", phone: "", complaint: "" });
  const a = useAction();
  const nik = f.nik.length >= 16 ? checkNik(f.nik) : null;
  const submit = (e) => {
    e.preventDefault();
    a.run(async () => {
      const r = await api.insert("queue_entries", { tenant_id: tenantId, branch_id: branchId, kind: "clinic", name: f.name.trim(), nik: f.nik, phone: f.phone || null, complaint: f.complaint || null });
      setF({ name: "", nik: "", phone: "", complaint: "" });
      onDone();
      return r;
    }, (r) => `Nomor antrean ${r.queue_no} untuk ${r.name}`);
  };
  return (
    <form className="d-form" onSubmit={submit} noValidate>
      <Field label="Nama sesuai KTP" id="q-name"><input id="q-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="off" /></Field>
      <Field label="NIK (16 digit)" id="q-nik" error={nik && !nik.ok ? nik.reason : null}
        hint={nik?.ok ? `${SEX[nik.sex]}, lahir ${nik.birth} (${ageFrom(nik.birth)} th) — terbaca dari NIK` : "Wajib untuk pelaporan SATUSEHAT."}>
        <input id="q-nik" inputMode="numeric" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, "") })} className="d-mono" required />
      </Field>
      <Field label="WhatsApp (opsional)" id="q-wa"><input id="q-wa" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, "") })} /></Field>
      <Field label="Keluhan utama" id="q-cc"><textarea id="q-cc" rows="2" value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} /></Field>
      <Feedback a={a} />
      <div className="d-form__actions"><button type="submit" className="d-btn d-btn--primary" disabled={a.busy || !f.name.trim() || !nik?.ok}>Daftarkan ke antrean</button></div>
    </form>
  );
}

function TableForm({ branchId, tenantId, tables, onDone }) {
  const { api } = useAuth();
  const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0);
  const local = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const [f, setF] = useState({ name: "", phone: "", party: 2, at: local(d), table: "" });
  const a = useAction();
  const submit = (e) => {
    e.preventDefault();
    a.run(async () => {
      const r = await api.insert("queue_entries", { tenant_id: tenantId, branch_id: branchId, kind: "table", status: "booked", name: f.name.trim(), phone: f.phone || null,
        party_size: Number(f.party), scheduled_at: new Date(f.at).toISOString(), table_id: f.table || null });
      setF({ ...f, name: "", phone: "", table: "" });
      onDone();
      return r;
    }, "Reservasi tersimpan. Meja ditandai biru di denah.");
  };
  return (
    <form className="d-form" onSubmit={submit} noValidate>
      <Field label="Nama tamu" id="r-name"><input id="r-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
      <div className="d-form__row q-row">
        <Field label="Jumlah tamu" id="r-pax"><input id="r-pax" type="number" min="1" max="50" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></Field>
        <Field label="Waktu" id="r-at"><input id="r-at" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
      </div>
      <Field label="Meja (opsional)" id="r-tb">
        <select id="r-tb" value={f.table} onChange={(e) => setF({ ...f, table: e.target.value })}>
          <option value="">Pilih saat tamu datang</option>
          {tables.filter((t) => t.status === "available").map((t) => <option key={t.id} value={t.id}>Meja {t.label} · {t.seats} kursi</option>)}
        </select>
      </Field>
      <Field label="WhatsApp (opsional)" id="r-wa"><input id="r-wa" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, "") })} /></Field>
      <Feedback a={a} />
      <div className="d-form__actions"><button type="submit" className="d-btn d-btn--primary" disabled={a.busy || !f.name.trim() || !(f.party > 0)}>Simpan reservasi</button></div>
    </form>
  );
}

export default function Queue() {
  const { api, role, tenantId, pillar } = useAuth();
  const { navigate } = useRouter();
  const clinic = pillar === "health";
  const b = useBranch();
  const now = useNow(30000);
  const list = useRef(null);
  const [showDone, setShowDone] = useState(false);
  const a = useAction();
  const data = useAsync(async () => {
    if (!b.branchId) return null;
    const [rows, tables] = await Promise.all([
      api.list("queue_entries", { eq: { branch_id: b.branchId, kind: clinic ? "clinic" : "table" }, order: ["scheduled_at"] }),
      clinic ? [] : api.list("tables", { eq: { branch_id: b.branchId }, order: ["sort"] }).catch(() => []),
    ]);
    return { rows, tables };
  }, [api, b.branchId, clinic]);
  useLive(["queue_entries", "tables"], data.reload);

  const rows = data.data?.rows ?? [];
  const active = useMemo(() => rows.filter((r) => (clinic ? r.scheduled_at.slice(0, 10) === today() : true) && ["booked", "waiting", "called", "in_exam"].includes(r.status)), [rows, clinic]);
  const closed = rows.filter((r) => !active.includes(r) && r.scheduled_at.slice(0, 10) === today());
  const canCreate = can(role, 18, "c"), canUpdate = can(role, 18, "u");
  const isDoctor = can(role, 17, "c");

  useGSAP(() => {
    if (prefersReducedMotion() || !list.current?.children.length) return;
    gsap.from(list.current.children, { opacity: 0, y: 6, stagger: 0.03, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
  }, { scope: list, dependencies: [b.branchId, Boolean(data.data)] });

  const setStatus = (r, status, msg) => a.run(() => api.update("queue_entries", r.id, { status }), msg).then(data.reload);
  const examine = (r) => a.run(async () => {
    await api.rpc("start_visit", { p_queue: r.id });
    navigate("/app/pemeriksaan");
  });

  return (
    <>
      <PageHead
        eyebrow="Fitur 18 · Reservasi & antrean ruang tunggu"
        title={clinic ? "Antrean pasien" : "Reservasi meja"}
        desc={clinic
          ? "Staff mendaftarkan pasien dengan NIK. Dokter memanggil dan memulai pemeriksaan; kartu rekam medis dibuat dokter (fitur 17)."
          : "Reservasi menandai meja biru di denah. Saat tamu datang, check-in membebaskan meja untuk dipilih di kasir."}
        actions={<BranchSelect b={b} />}
      />
      <div className="q-layout">
        {canCreate && b.branchId && (
          <Panel title={clinic ? "Registrasi pasien" : "Reservasi baru"}>
            {clinic ? <ClinicForm branchId={b.branchId} tenantId={tenantId} onDone={data.reload} />
              : <TableForm branchId={b.branchId} tenantId={tenantId} tables={data.data?.tables ?? []} onDone={data.reload} />}
          </Panel>
        )}
        <Panel title={clinic ? "Antrean hari ini" : "Reservasi aktif"} meta={`${active.length} ${clinic ? "pasien" : "reservasi"}`}>
          <Feedback a={a} />
          {data.loading && !data.data ? <Loading /> : data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : active.length === 0 ? (
            <Empty title={clinic ? "Belum ada pasien menunggu" : "Belum ada reservasi"}>{canCreate ? "Gunakan formulir untuk mendaftarkan." : "Daftar terisi saat Staff mendaftarkan."}</Empty>
          ) : (
            <ol className="q-list" ref={list}>
              {active.map((r) => {
                const wait = minutesSince(r.created_at, now);
                return (
                  <li key={r.id} className={`q-item q-item--${r.status}`}>
                    <span className="q-no d-mono" aria-label={`Nomor ${r.queue_no}`}>{clinic ? String(r.queue_no).padStart(3, "0") : r.party_size}</span>
                    <div className="q-main">
                      <p className="q-name">{r.name} <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge></p>
                      <p className="d-list__meta">
                        {clinic
                          ? <>{SEX[r.sex] ?? "—"}{r.birth_date ? `, ${ageFrom(r.birth_date)} th` : ""} · NIK <span className="d-mono">{r.nik.slice(0, 6)}••••{r.nik.slice(-4)}</span> · menunggu {wait} mnt</>
                          : <>{r.party_size} tamu · {dateTime(r.scheduled_at)}{r.table_id ? ` · Meja ${data.data.tables.find((t) => t.id === r.table_id)?.label ?? ""}` : ""}</>}
                      </p>
                      {r.complaint && <p className="q-cc">“{r.complaint}”</p>}
                    </div>
                    <div className="d-row-actions">
                      {clinic && isDoctor && r.status === "waiting" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => setStatus(r, "called", `${r.name} dipanggil`)}>Panggil</button>}
                      {clinic && isDoctor && ["waiting", "called"].includes(r.status) && <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => examine(r)}>Periksa</button>}
                      {clinic && isDoctor && r.status === "in_exam" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => navigate("/app/pemeriksaan")}>Lanjutkan</button>}
                      {!clinic && canUpdate && r.status === "booked" && <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => setStatus(r, "waiting", "Tamu check-in; meja siap dipilih di kasir")}>Check-in</button>}
                      {canUpdate && ["booked", "waiting", "called"].includes(r.status) && (
                        <>
                          <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => setStatus(r, "no_show", "Ditandai tidak hadir")}>Tidak hadir</button>
                          <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy} onClick={() => setStatus(r, "cancelled", "Dibatalkan")}>Batal</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {closed.length > 0 && (
            <details className="pos-recent" open={showDone} onToggle={(e) => setShowDone(e.currentTarget.open)}>
              <summary>Selesai / batal hari ini · {closed.length}</summary>
              <ul className="d-list">
                {closed.map((r) => (
                  <li key={r.id}><div><p className="d-list__title">{r.name}</p><p className="d-list__meta">{clinic ? `No. ${r.queue_no}` : `${r.party_size} tamu`}</p></div><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge></li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      </div>
    </>
  );
}
