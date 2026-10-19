import { useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";
import { useAccountLang, t } from "../account/i18n.js";

const CATEGORIES = {
  CT: { code: "CT", label: "Cuti Tahunan", tone: "ok", desc: "Memotong saldo cuti tahunan, gaji pokok dibayar penuh." },
  IZ: { code: "IZ", label: "Izin Pribadi", tone: "warn", desc: "Keperluan keluarga mendesak, dispensasi disesuaikan." },
  SK: { code: "SK", label: "Sakit", tone: "danger", desc: "Wajib menyertakan Surat Keterangan Sakit dari Dokter/Faskes." },
  ML: { code: "ML", label: "Cuti Bersalin (Melahirkan)", tone: "accent", desc: "Kuota regulasi ketenagakerjaan 90 hari kalender." },
  IT: { code: "IT", label: "Izin Keterlambatan Hadir", tone: "warn", desc: "Dispensasi datang terlambat dengan alasan dinas/kahar." },
  PC: { code: "PC", label: "Izin Pulang Lebih Cepat", tone: "warn", desc: "Dispensasi meninggalkan outlet sebelum jam shift selesai." },
  DL: { code: "DL", label: "Dinas Luar / Penugasan Khusus", tone: "accent", desc: "Tugas di luar outlet gerai cabang (logistik/pelatihan)." },
  TB: { code: "TB", label: "Cuti Tanpa Upah (Unpaid Leave)", tone: "neutral", desc: "Tidak memotong saldo tahunan, memotong gaji harian pada payroll." }
};

const STATUS_BADGES = {
  pending: ["Menunggu Otorisasi GM", "warn"],
  approved: ["Disetujui", "ok"],
  rejected: ["Ditolak", "danger"],
  cancelled: ["Dibatalkan", "neutral"]
};

export default function LeaveManagement() {
  const { api, tenantId, role, profile } = useAuth();
  const { lang } = useAccountLang();
  const [tab, setTab] = useState("requests"); // "requests" | "balances" | "calendar"
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [evalModal, setEvalModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: 1, memo: "" });
  const [busy, setBusy] = useState(false);

  // Form State Pengajuan Cuti
  const [form, setForm] = useState({
    profile_id: "",
    category: "CT",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    days_count: 1,
    reason: "",
    attachment_url: ""
  });

  const q = useAsync(async () => {
    const [requests, balances, profiles, branches, shifts] = await Promise.all([
      api.list("leave_requests", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
      api.list("leave_balances", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("profiles", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("work_shifts", { eq: { tenant_id: tenantId } }).catch(() => [])
    ]);
    return { requests, balances, profiles, branches, shifts };
  }, [api, tenantId], { key: `leaves@${tenantId || "default"}` });

  useLive(["leave_requests", "leave_balances", "work_shifts", "approvals"], q.reload);

  const requests = q.data?.requests ?? [];
  const balances = q.data?.balances ?? [];
  const profiles = q.data?.profiles ?? [];
  const branches = q.data?.branches ?? [];
  const shifts = q.data?.shifts ?? [];

  const staffProfiles = useMemo(
    () => profiles.filter((p) => ["staff", "gm"].includes(p.role) && p.is_active !== false),
    [profiles]
  );

  const isManager = ["owner", "gm", "superadmin"].includes(role);

  // Hitung jumlah hari otomatis berdasarkan rentang tanggal
  const calcDays = (start, end) => {
    if (!start || !end) return 1;
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = e - s;
    if (diffTime < 0) return 1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleDateChange = (field, val) => {
    const next = { ...form, [field]: val };
    next.days_count = calcDays(next.start_date, next.end_date);
    setForm(next);
  };

  // Cek bentrok roster shift
  const selectedProfileId = form.profile_id || (role === "staff" ? profile?.id : staffProfiles[0]?.id);
  const conflictingShifts = useMemo(() => {
    if (!selectedProfileId || !form.start_date || !form.end_date) return [];
    return shifts.filter(
      (w) => w.profile_id === selectedProfileId && w.work_date >= form.start_date && w.work_date <= form.end_date
    );
  }, [shifts, selectedProfileId, form.start_date, form.end_date]);

  // Statistik Ringkasan Cuti
  const todayIso = new Date().toISOString().slice(0, 10);
  const summary = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending").length;
    const currentMonth = todayIso.slice(0, 7);
    const approvedThisMonth = requests.filter((r) => r.status === "approved" && (r.start_date || "").startsWith(currentMonth)).length;
    const onLeaveToday = requests.filter((r) => r.status === "approved" && r.start_date <= todayIso && r.end_date >= todayIso).length;
    const zeroBalance = balances.filter((b) => b.remaining_days <= 0).length;
    return { pending, approvedThisMonth, onLeaveToday, zeroBalance };
  }, [requests, balances, todayIso]);

  // Submit pengajuan cuti baru
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.rpc("request_leave", {
        p_category: form.category,
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_days: form.days_count,
        p_reason: form.reason,
        p_attachment: form.attachment_url || null,
        p_profile_id: form.profile_id || (role === "staff" ? profile?.id : null)
      });
      setShowApplyModal(false);
      setForm({
        profile_id: "",
        category: "CT",
        start_date: todayIso,
        end_date: todayIso,
        days_count: 1,
        reason: "",
        attachment_url: ""
      });
      q.reload();
    } catch (err) {
      alert("Gagal mengajukan cuti: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Keputusan persetujuan cuti
  const handleDecide = async (decision) => {
    if (!evalModal) return;
    if (decision === "rejected" && (!rejectReason || rejectReason.trim().length < 5)) {
      alert("Alasan penolakan wajib diisi (minimal 5 karakter)");
      return;
    }
    setBusy(true);
    try {
      await api.rpc("decide_leave", {
        p_id: evalModal.id,
        p_decision: decision,
        p_reason: decision === "rejected" ? rejectReason : null
      });
      setEvalModal(null);
      setRejectReason("");
      q.reload();
    } catch (err) {
      alert("Gagal memproses keputusan: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Penyesuaian saldo cuti manual (Adjustment)
  const handleAdjustBalance = async (e) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setBusy(true);
    try {
      await api.rpc("adjust_leave_balance", {
        p_profile_id: adjustTarget.profile_id,
        p_delta: adjustForm.delta,
        p_memo: adjustForm.memo
      });
      setShowAdjustModal(false);
      setAdjustTarget(null);
      setAdjustForm({ delta: 1, memo: "" });
      q.reload();
    } catch (err) {
      alert("Gagal menyesuaikan saldo: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Fase 2 · Manajemen Cuti &amp; Izin Kerja"
        title="Cuti &amp; Izin Karyawan"
        desc="Pusat administrasi perizinan kerja, sinkronisasi buku saldo cuti tahunan, dan kalender cuti lintas cabang terpadu sistem roster."
        actions={
          <button
            type="button"
            className="d-btn d-btn--sm d-btn--primary"
            onClick={() => setShowApplyModal(true)}
          >
            {t("+ Ajukan Permohonan Cuti / Izin", lang)}
          </button>
        }
      />

      {/* ──────── 4 STAT METRICS (4 KARTU BERJEJER SEJAJAR HORIZONTAL) ──────── */}
      <section className="d-stats" aria-label="Statistik Cuti" style={{ marginBottom: "1.25rem" }}>
        <Stat
          label={t("Menunggu Otorisasi", lang)}
          value={summary.pending}
          sub={t("Permohonan butuh persetujuan", lang)}
          tone={summary.pending > 0 ? "warn" : "slate"}
          icon={<i className="fa-solid fa-hourglass-half" />}
        />
        <Stat
          label={t("Disetujui Bulan Ini", lang)}
          value={summary.approvedThisMonth}
          sub={t("Total izin disahkan GM/Owner", lang)}
          tone="emerald"
          icon={<i className="fa-solid fa-calendar-check" />}
        />
        <Stat
          label={t("Sedang Cuti Hari Ini", lang)}
          value={summary.onLeaveToday}
          sub={t("Staf izin hari berjalan", lang)}
          tone={summary.onLeaveToday > 0 ? "sky" : "slate"}
          icon={<i className="fa-solid fa-plane-departure" />}
        />
        <Stat
          label={t("Saldo Cuti Habis", lang)}
          value={summary.zeroBalance}
          sub={t("Kasir dengan sisa kuota 0 hari", lang)}
          tone={summary.zeroBalance > 0 ? "danger" : "emerald"}
          icon={<i className="fa-solid fa-clock-rotate-left" />}
        />
      </section>

      {/* ──────── TAB SELEKTOR CUTI (RESPONSIF MOBILE DENGAN SCROLL HALUS) ──────── */}
      <div className="d-subtabs">
        <button
          type="button"
          className={`d-btn d-btn--sm ${tab === "requests" ? "d-btn--primary" : "d-btn--ghost"}`}
          onClick={() => setTab("requests")}
        >
          <i className="fa-solid fa-list-check" style={{ marginRight: "0.4rem" }} />
          {t("Antrean Pengajuan", lang)} ({requests.length})
        </button>
        <button
          type="button"
          className={`d-btn d-btn--sm ${tab === "balances" ? "d-btn--primary" : "d-btn--ghost"}`}
          onClick={() => setTab("balances")}
        >
          <i className="fa-solid fa-book" style={{ marginRight: "0.4rem" }} />
          {t("Buku Saldo Cuti Staf", lang)} ({balances.length})
        </button>
        <button
          type="button"
          className={`d-btn d-btn--sm ${tab === "calendar" ? "d-btn--primary" : "d-btn--ghost"}`}
          onClick={() => setTab("calendar")}
        >
          <i className="fa-solid fa-calendar-days" style={{ marginRight: "0.4rem" }} />
          {t("Kalender Cuti Lintas Cabang", lang)}
        </button>
      </div>

      {q.loading && !q.data ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={q.reload} />
      ) : tab === "requests" ? (
        /* ──────── TAB A: ANTREAN PENGAJUAN CUTI ──────── */
        <Panel title="Daftar Permohonan Cuti &amp; Izin">
          {requests.length === 0 ? (
            <Empty title="Belum ada permohonan cuti terdaftar">
              {t("Gunakan tombol \"+ Ajukan Permohonan Cuti / Izin\" untuk membuat permohonan baru.", lang)}
            </Empty>
          ) : (
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>{t("Kategori", lang)}</th>
                    <th>{t("Staf & Cabang", lang)}</th>
                    <th>{t("Periode Tanggal", lang)}</th>
                    <th className="d-num">{t("Durasi", lang)}</th>
                    <th>{t("Dokumen Bukti", lang)}</th>
                    <th>{t("Status", lang)}</th>
                    <th>{t("Aksi", lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const profileData = profiles.find((p) => p.id === r.profile_id);
                    const branchData = branches.find((b) => b.id === r.branch_id);
                    const catInfo = CATEGORIES[r.category] ?? { label: r.category, tone: "neutral" };
                    const [statusLabel, statusTone] = STATUS_BADGES[r.status] ?? [r.status, "neutral"];

                    return (
                      <tr key={r.id}>
                        <td>
                          <Badge tone={catInfo.tone}>{r.category} · {t(catInfo.label, lang)}</Badge>
                        </td>
                        <td>
                          <strong>{profileData?.full_name ?? "Staf"}</strong>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                            {branchData?.name ?? "Pusat"}
                          </div>
                        </td>
                        <td className="d-mono">
                          {date(r.start_date)} s.d {date(r.end_date)}
                        </td>
                        <td className="d-num" style={{ fontWeight: 600 }}>
                          {r.days_count} {t("Hari", lang)}
                        </td>
                        <td>
                          {r.attachment_url ? (
                            <a
                              href={r.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--color-accent)", textDecoration: "underline", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            >
                              <i className="fa-solid fa-paperclip" />
                              {t("Lihat Dokumen", lang)}
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={statusTone}>{t(statusLabel, lang)}</Badge>
                          {r.reject_reason && (
                            <div style={{ fontSize: "0.78rem", color: "var(--color-danger)", marginTop: "0.2rem" }}>
                              Alasan: "{r.reject_reason}"
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="d-btn d-btn--sm d-btn--ghost"
                              onClick={() => setEvalModal(r)}
                            >
                              {t("Detail", lang)}
                            </button>
                            {isManager && r.status === "pending" && (
                              <button
                                type="button"
                                className="d-btn d-btn--sm d-btn--primary"
                                onClick={() => setEvalModal(r)}
                              >
                                {t("Evaluasi", lang)}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : tab === "balances" ? (
        /* ──────── TAB B: BUKU SALDO CUTI STAF ──────── */
        <Panel title="Buku Saldo Cuti Staf" desc="Pembaruan otomatis 12 hari/tahun setiap 1 Januari &amp; penyesuaian manual memo">
          <div className="d-table-wrap">
            <table className="d-table d-table--fin">
              <thead>
                <tr>
                  <th>{t("Nama Staf Kasir", lang)}</th>
                  <th>{t("Cabang", lang)}</th>
                  <th className="d-num">{t("Kuota Tahunan", lang)}</th>
                  <th className="d-num">{t("Cuti Digunakan", lang)}</th>
                  <th className="d-num">{t("Pending GM", lang)}</th>
                  <th className="d-num">{t("Sisa Saldo Aktif", lang)}</th>
                  <th>{t("Aksi", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => {
                  const p = profiles.find((x) => x.id === b.profile_id);
                  const br = branches.find((x) => x.id === p?.branch_id);

                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{p?.full_name ?? "Kasir"}</td>
                      <td>{br?.name ?? "Pusat"}</td>
                      <td className="d-num">{b.annual_quota} {t("Hari", lang)}</td>
                      <td className="d-num">{b.used_days} {t("Hari", lang)}</td>
                      <td className="d-num" style={{ color: b.pending_days > 0 ? "var(--color-warn)" : "inherit" }}>
                        {b.pending_days} {t("Hari", lang)}
                      </td>
                      <td className="d-num">
                        <Badge tone={b.remaining_days > 3 ? "ok" : b.remaining_days > 0 ? "warn" : "danger"}>
                          {b.remaining_days} {t("Hari", lang)}
                        </Badge>
                      </td>
                      <td>
                        {isManager && (
                          <button
                            type="button"
                            className="d-btn d-btn--sm d-btn--ghost"
                            onClick={() => {
                              setAdjustTarget(b);
                              setShowAdjustModal(true);
                            }}
                          >
                            <i className="fa-solid fa-pen-to-square" style={{ marginRight: "0.3rem" }} />
                            {t("Sesuaikan Memo", lang)}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", fontSize: "0.82rem", color: "var(--color-muted)" }}>
            <strong>{t("Aturan Mesin Kuota:", lang)}</strong> {t("Kuota tahunan direset otomatis menjadi 12 hari kerja setiap tanggal 1 Januari. Cuti Bersalin (ML) dan Dinas Luar (DL) tidak memotong kuota reguler tahunan.", lang)}
          </div>
        </Panel>
      ) : (
        /* ──────── TAB C: KALENDER CUTI LINTAS CABANG ──────── */
        <Panel title="Kalender Cuti Lintas Cabang" desc="Visualisasi jadwal cuti aktif seluruh gerai outlet untuk mencegah kekosongan shift">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {requests.filter((r) => r.status === "approved").length === 0 ? (
              <Empty title="Tidak ada cuti yang disetujui pada kalender ini" />
            ) : (
              requests
                .filter((r) => r.status === "approved")
                .map((r) => {
                  const p = profiles.find((x) => x.id === r.profile_id);
                  const br = branches.find((x) => x.id === r.branch_id);
                  const cat = CATEGORIES[r.category] ?? { label: r.category, tone: "neutral" };

                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: "0.85rem 1rem",
                        borderLeft: `4px solid ${cat.tone === "danger" ? "#ef4444" : cat.tone === "ok" ? "#10b981" : "#6366f1"}`,
                        background: "var(--color-paper-2)",
                        borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong>{p?.full_name}</strong>
                          <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>({br?.name})</span>
                          <Badge tone={cat.tone}>{r.category} · {t(cat.label, lang)}</Badge>
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--color-muted)", marginTop: "0.2rem" }}>
                          {date(r.start_date)} s.d {date(r.end_date)} ({r.days_count} {t("Hari", lang)}) — "{r.reason}"
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--color-muted)" }}>
                        <Badge tone="neutral">{t("Shift Roster Terblokir", lang)}</Badge>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Panel>
      )}

      {/* ──────── MODAL AJUKAN PERMOHONAN CUTI / IZIN ──────── */}
      {showApplyModal && (
        <Modal open={Boolean(showApplyModal)} title="Formulir Permohonan Cuti &amp; Izin Resmi" onClose={() => setShowApplyModal(false)}>
          <form onSubmit={handleApplyLeave} className="d-form">
            {isManager && (
              <Field label="Kasir / Staf Pemohon" id="f-staf" hint="Pilih staf yang mengajukan cuti">
                <select
                  id="f-staf"
                  value={form.profile_id}
                  onChange={(e) => setForm({ ...form, profile_id: e.target.value })}
                  required
                >
                  <option value="">Pilih Staf Kasir…</option>
                  {staffProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Kategori Cuti / Izin" id="f-cat">
              <select
                id="f-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                {Object.entries(CATEGORIES).map(([code, item]) => (
                  <option key={code} value={code}>{code} - {t(item.label, lang)}</option>
                ))}
              </select>
            </Field>

            <div style={{ padding: "0.5rem 0.75rem", background: "var(--color-paper)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
              {t(CATEGORIES[form.category]?.desc, lang)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Field label="Tanggal Mulai" id="f-sdate">
                <input
                  type="date"
                  id="f-sdate"
                  value={form.start_date}
                  onChange={(e) => handleDateChange("start_date", e.target.value)}
                  required
                />
              </Field>
              <Field label="Tanggal Selesai" id="f-edate">
                <input
                  type="date"
                  id="f-edate"
                  value={form.end_date}
                  onChange={(e) => handleDateChange("end_date", e.target.value)}
                  required
                />
              </Field>
            </div>

            <div style={{ fontSize: "0.85rem", margin: "0.25rem 0" }}>
              {t("Total Durasi:", lang)} <strong>{form.days_count} {t("Hari Kerja", lang)}</strong>
            </div>

            {/* Peringatan Bentrok Roster (Engine Invariant) */}
            {conflictingShifts.length > 0 && (
              <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "var(--radius-md)", fontSize: "0.82rem", color: "#ef4444" }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "0.35rem" }} />
                <strong>{t("Peringatan Bentrok Roster:", lang)}</strong> {t("Kasir memiliki jadwal shift kerja pada periode ini. Jika cuti disetujui, jadwal shift tersebut akan dibatalkan otomatis menjadi shift kosong.", lang)}
              </div>
            )}

            <Field label="Alasan Permohonan (Wajib)" id="f-reason">
              <textarea
                id="f-reason"
                rows="3"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder={t("Tuliskan alasan permohonan secara jelas (minimal 5 karakter)…", lang)}
                required
              />
            </Field>

            <Field label="Lampiran Surat Dokter / Bukti (URL)" id="f-doc" hint={form.category === "SK" ? t("Wajib untuk kategori Sakit (SK)", lang) : t("Opsional", lang)}>
              <input
                type="text"
                id="f-doc"
                value={form.attachment_url}
                onChange={(e) => setForm({ ...form, attachment_url: e.target.value })}
                placeholder="https://contoh.com/surat-dokter.jpg"
                required={form.category === "SK"}
              />
            </Field>

            <div className="d-form__actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setShowApplyModal(false)}>
                {t("Batal", lang)}
              </button>
              <button type="submit" className="d-btn d-btn--primary" disabled={busy || form.reason.trim().length < 5}>
                {busy ? t("Menyimpan...", lang) : t("Kirim Pengajuan Cuti", lang)}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ──────── MODAL EVALUASI PERMOHONAN OLEH GM/OWNER ──────── */}
      {evalModal && (
        <Modal open={Boolean(evalModal)} title={`Evaluasi Permohonan Cuti · ${evalModal.category}`} onClose={() => setEvalModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ padding: "0.75rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", fontSize: "0.85rem" }}>
              <p style={{ margin: "0.2rem 0" }}><strong>{t("Kategori", lang)}:</strong> {t(CATEGORIES[evalModal.category]?.label, lang)}</p>
              <p style={{ margin: "0.2rem 0" }}><strong>{t("Periode Tanggal", lang)}:</strong> {date(evalModal.start_date)} s.d {date(evalModal.end_date)} ({evalModal.days_count} {t("Hari", lang)})</p>
              <p style={{ margin: "0.2rem 0" }}><strong>{t("Alasan", lang)}:</strong> "{evalModal.reason}"</p>
              {evalModal.attachment_url && (
                <p style={{ margin: "0.2rem 0" }}>
                  <strong>{t("Dokumen Bukti", lang)}:</strong>{" "}
                  <a href={evalModal.attachment_url} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
                    {t("Buka Dokumen Bukti", lang)}
                  </a>
                </p>
              )}
            </div>

            {evalModal.status === "pending" && isManager && (
              <div>
                <Field label="Catatan / Alasan Penolakan (Wajib jika menolak)" id="f-rej">
                  <input
                    type="text"
                    id="f-rej"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("Isi alasan penolakan jika menolak…", lang)}
                  />
                </Field>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--danger-ghost"
                    disabled={busy}
                    onClick={() => handleDecide("rejected")}
                  >
                    {t("Tolak Permohonan", lang)}
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--primary"
                    disabled={busy}
                    onClick={() => handleDecide("approved")}
                  >
                    {t("Setujui Cuti", lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}


      {/* ──────── MODAL PENYESUAIAN SALDO MEMO ──────── */}
      {showAdjustModal && adjustTarget && (
        <Modal open={Boolean(showAdjustModal && adjustTarget)} title={t("Penyesuaian Manual Saldo Cuti", lang)} onClose={() => setShowAdjustModal(false)}>
          <form onSubmit={handleAdjustBalance} className="d-form">
            <Field label="Perubahan Kuota (Hari)" id="f-adj-delta" hint="Gunakan angka positif untuk menambah atau negatif untuk memotong">
              <input
                type="number"
                id="f-adj-delta"
                value={adjustForm.delta}
                onChange={(e) => setAdjustForm({ ...adjustForm, delta: Number(e.target.value) })}
                required
              />
            </Field>

            <Field label="Dasar Memo / Catatan Penyesuaian" id="f-adj-memo" hint="Wajib mencantumkan alasan tertulis">
              <textarea
                id="f-adj-memo"
                rows="2"
                value={adjustForm.memo}
                onChange={(e) => setAdjustForm({ ...adjustForm, memo: e.target.value })}
                placeholder="Contoh: Kompensasi lembur khusus Idul Fitri..."
                required
              />
            </Field>

            <div className="d-form__actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setShowAdjustModal(false)}>
                {t("Batal", lang)}
              </button>
              <button type="submit" className="d-btn d-btn--primary" disabled={busy || adjustForm.memo.trim().length < 5}>
                {t("Simpan Penyesuaian", lang)}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
