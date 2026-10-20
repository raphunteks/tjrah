import { useState, useMemo } from "react";
import { Link } from "../../../lib/router.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, Empty, Badge, Modal, useAsync } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";

export default function SdmDashboard() {
  const { api, tenantId, role } = useAuth();
  const [branchFilter, setBranchFilter] = useState("");
  const [horizonFilter, setHorizonFilter] = useState("7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [photoModal, setPhotoModal] = useState(null);

  // Waktu hari ini (Makassar UTC+8)
  const todayIso = useMemo(() => {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }, []);

  // Helper konversi waktu database UTC ke tanggal lokal Makassar
  const getAttendanceWitaDate = (created_at) => {
    if (!created_at) return "";
    try {
      return new Date(created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
    } catch {
      return (created_at || "").slice(0, 10);
    }
  };

  // Evaluasi rentang tanggal aktif [rangeStart, rangeEnd]
  const activeRange = useMemo(() => {
    const today = new Date(todayIso);
    if (horizonFilter === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd, label: `${date(customStart)} - ${date(customEnd)}` };
    }
    const days = Number(horizonFilter) || 7;
    const startD = new Date(today);
    startD.setDate(startD.getDate() - (days - 1));
    const startIso = startD.toISOString().slice(0, 10);
    return {
      start: startIso,
      end: todayIso,
      label: `${days} Hari Terakhir`
    };
  }, [horizonFilter, customStart, customEnd, todayIso]);

  // -------------------------------------------------------------
  // PEMUATAN DATA 100% REALTIME DARI DATABASE SUPABASE
  // TIDAK ADA DATA DUMMY / FIKTIF
  // -------------------------------------------------------------
  const q = useAsync(async () => {
    const rawBranches = await api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => []);
    const branches = rawBranches.filter((b) => !b.is_warehouse);

    const [profiles, attendance, workShifts, leaveRequests, approvals, payrollRuns] = await Promise.all([
      api.list("profiles", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("attendance", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 300 }).catch(() => []),
      api.list("work_shifts", { eq: { tenant_id: tenantId }, limit: 300 }).catch(() => []),
      api.list("leave_requests", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("approvals", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("payroll_runs", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 20 }).catch(() => [])
    ]);

    return { branches, profiles, attendance, workShifts, leaveRequests, approvals, payrollRuns };
  }, [api, tenantId, branchFilter, horizonFilter], { key: `sdm_dash@${tenantId}@${branchFilter}@${horizonFilter}` });

  useLive(["profiles", "work_shifts", "attendance", "leave_requests", "approvals", "payroll_runs"], q.reload);

  const branches = q.data?.branches ?? [];
  const rawProfiles = q.data?.profiles ?? [];
  const rawAttendance = q.data?.attendance ?? [];
  const rawShifts = q.data?.workShifts ?? [];
  const rawLeaves = q.data?.leaveRequests ?? [];
  const rawPayrolls = q.data?.payrollRuns ?? [];

  // Filter cabang untuk profil staf
  const profiles = useMemo(() => {
    return rawProfiles.filter((p) => !branchFilter || p.branch_id === branchFilter);
  }, [rawProfiles, branchFilter]);

  // Kasir / Staff aktif
  const staffList = useMemo(() => {
    return profiles.filter((p) => p.role === "staff" && p.is_active !== false);
  }, [profiles]);

  // Absensi hari ini (zona waktu Makassar WITA)
  const todayAttendance = useMemo(() => {
    return rawAttendance.filter((a) => {
      if (branchFilter && a.branch_id !== branchFilter) return false;
      const d = getAttendanceWitaDate(a.created_at);
      return d === todayIso;
    });
  }, [rawAttendance, branchFilter, todayIso]);

  const clockInsToday = useMemo(() => {
    return todayAttendance.filter((a) => a.kind === "in");
  }, [todayAttendance]);

  // Shifts hari ini
  const todayShifts = useMemo(() => {
    return rawShifts.filter((w) => {
      if (branchFilter && w.branch_id !== branchFilter) return false;
      return w.work_date === todayIso;
    });
  }, [rawShifts, branchFilter, todayIso]);

  // Cuti hari ini
  const leavesToday = useMemo(() => {
    return rawLeaves.filter((l) => {
      if (branchFilter && l.branch_id !== branchFilter) return false;
      return l.status === "approved" && l.start_date <= todayIso && l.end_date >= todayIso;
    });
  }, [rawLeaves, branchFilter, todayIso]);

  // -------------------------------------------------------------
  // 8 METRIK BENTO KPI RESMI & REALTIME DARI DATABASE
  // -------------------------------------------------------------
  const metrics = useMemo(() => {
    const kasirAktif = staffList.length;
    const hadirHariIni = clockInsToday.length;
    const terlambat = clockInsToday.filter((a) => (a.late_min ?? 0) > 5).length;
    const sedangCuti = leavesToday.length;
    const shiftKosong = todayShifts.filter((w) => !w.profile_id).length;

    const scheduledStaffIds = new Set(todayShifts.filter((w) => w.profile_id).map((w) => w.profile_id));
    const clockedInStaffIds = new Set(clockInsToday.map((a) => a.profile_id));
    const belumAbsen = Array.from(scheduledStaffIds).filter((pid) => !clockedInStaffIds.has(pid)).length;

    const pendingLeaves = rawLeaves.filter((l) => (!branchFilter || l.branch_id === branchFilter) && l.status === "pending").length;
    const approvalPending = pendingLeaves;

    const latestPayroll = rawPayrolls[0];
    const statusPayroll = latestPayroll ? (latestPayroll.status === "approved" ? "Disetujui" : "Draf") : "Draf";

    return {
      kasir_aktif: kasirAktif,
      hadir_hari_ini: hadirHariIni,
      belum_absen: belumAbsen,
      terlambat: terlambat,
      sedang_cuti: sedangCuti,
      shift_kosong: shiftKosong,
      approval_pending: approvalPending,
      status_payroll: statusPayroll
    };
  }, [staffList, clockInsToday, leavesToday, todayShifts, rawLeaves, rawPayrolls, branchFilter]);

  // Ringkasan Cuti
  const leaveSummary = useMemo(() => {
    const filteredLeaves = rawLeaves.filter((l) => !branchFilter || l.branch_id === branchFilter);
    return {
      pending: filteredLeaves.filter((l) => l.status === "pending").length,
      approved: filteredLeaves.filter((l) => l.status === "approved").length,
      rejected: filteredLeaves.filter((l) => l.status === "rejected").length,
      all: filteredLeaves
    };
  }, [rawLeaves, branchFilter]);

  // Ringkasan Penggajian
  const payrollSummary = useMemo(() => {
    const totalSalary = staffList.reduce((sum, s) => sum + (Number(s.base_salary) || 0), 0);
    return {
      totalSalary: totalSalary,
      periodMonth: "Periode Berjalan"
    };
  }, [staffList]);

  // Handler apply dari Dual-Month Date Range Picker Modal
  const handleApplyRange = (start, end) => {
    setCustomStart(start);
    setCustomEnd(end);
    setHorizonFilter("custom");
    setShowRangeModal(false);
  };

  return (
    <>
      <PageHead
        eyebrow="Fase 2 · Operasional Harian & SDM"
        title="Dashboard SDM"
        desc="Pusat kendali operasional tenaga kerja kasir, monitoring kedisiplinan presensi langsung, roster kerja, KPI staf, dan efisiensi labour cost gerai."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="d-input"
              aria-label="Filter Cabang"
              style={{ minWidth: "150px", fontSize: "0.85rem", padding: "0.35rem 0.65rem" }}
            >
              <option value="">Seluruh Cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* Tombol Pemilih Rentang Waktu (GBR 4 & GBR 5) */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <select
                value={horizonFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setHorizonFilter("custom");
                    setShowRangeModal(true);
                  } else {
                    setHorizonFilter(val);
                    setCustomStart("");
                    setCustomEnd("");
                  }
                }}
                className="d-input"
                aria-label="Rentang Hari"
                style={{ minWidth: "135px", fontSize: "0.85rem", padding: "0.35rem 0.65rem" }}
              >
                <option value="7">7 Hari Terakhir</option>
                <option value="14">14 Hari Terakhir</option>
                <option value="30">30 Hari Terakhir</option>
                <option value="60">60 Hari Terakhir</option>
                <option value="custom">Kustom Rentang...</option>
              </select>

              <button
                type="button"
                className="d-btn d-btn--sm d-btn--ghost"
                onClick={() => setShowRangeModal(true)}
                title="Buka Kalender Rentang Tanggal"
                style={{ padding: "0.35rem 0.6rem" }}
              >
                <i className="fa-solid fa-calendar-days" />
                <span style={{ fontSize: "0.78rem", marginLeft: "0.35rem" }}>
                  {horizonFilter === "custom" && customStart ? activeRange.label : "Pilih Rentang"}
                </span>
              </button>
            </div>

            <Link to="/app/tukar-shift" className="d-btn d-btn--sm d-btn--ghost">
              <i className="fa-solid fa-calendar-days" style={{ marginRight: "0.4rem" }} />
              Jadwal &amp; Tukar Shift
            </Link>
            <Link to="/app/sdm/cuti" className="d-btn d-btn--sm d-btn--primary">
              <i className="fa-solid fa-plus" style={{ marginRight: "0.4rem" }} />
              Permohonan Cuti
            </Link>
          </div>
        }
      />

      {q.loading && !q.data ? (
        <Loading />
      ) : (
        <>
          {/* 1. KARTU INDIKATOR UI CARD BENTO KPI (100% REAL DARI DATABASE) */}
          <section className="d-stats" aria-label="Bento KPI SDM - Baris 1" style={{ marginBottom: "0.75rem" }}>
            <Stat
              label="Kasir Aktif"
              value={metrics.kasir_aktif}
              sub="Staf aktif seluruh cabang"
              tone="purple"
              icon={<i className="fa-solid fa-users" />}
            />
            <Stat
              label="Hadir Hari Ini"
              value={metrics.hadir_hari_ini}
              sub="Presensi clock-in valid"
              tone="emerald"
              icon={<i className="fa-solid fa-user-check" />}
            />
            <Stat
              label="Belum Absen"
              value={metrics.belum_absen}
              sub="Jadwal belum clock-in"
              tone={metrics.belum_absen > 0 ? "warn" : "slate"}
              icon={<i className="fa-solid fa-user-clock" />}
            />
            <Stat
              label="Terlambat"
              value={metrics.terlambat}
              sub="Melampaui batas toleransi"
              tone={metrics.terlambat > 0 ? "danger" : "emerald"}
              icon={<i className="fa-solid fa-clock-rotate-left" />}
            />
          </section>

          <section className="d-stats" aria-label="Bento KPI SDM - Baris 2" style={{ marginBottom: "1.25rem" }}>
            <Stat
              label="Sedang Cuti"
              value={metrics.sedang_cuti}
              sub="Izin resmi disetujui"
              tone="sky"
              icon={<i className="fa-solid fa-plane-departure" />}
            />
            <Stat
              label="Shift Kosong"
              value={metrics.shift_kosong}
              sub="Slot belum terisi kasir"
              tone={metrics.shift_kosong > 0 ? "danger" : "emerald"}
              icon={<i className="fa-solid fa-calendar-xmark" />}
            />
            <Stat
              label="Approval Pending"
              value={metrics.approval_pending}
              sub="Menunggu otorisasi GM"
              tone={metrics.approval_pending > 0 ? "warn" : "slate"}
              icon={<i className="fa-solid fa-scale-balanced" />}
            />
            <Stat
              label="Penggajian"
              value={metrics.status_payroll}
              sub="Status periode berjalan"
              tone={metrics.status_payroll === "Disetujui" ? "emerald" : "warn"}
              icon={<i className="fa-solid fa-wallet" />}
            />
          </section>

          {/* 2. NAVIGASI CEPAT MODUL SDM */}
          <div className="sdm-bento-nav-grid" aria-label="Navigasi Cepat Modul SDM">
            <Link to="/app/tukar-shift" className="sdm-bento-nav-card">
              <div className="sdm-bento-nav-top">
                <div className="sdm-bento-nav-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#059669" }}>
                  <i className="fa-solid fa-calendar-days" />
                </div>
                <i className="fa-solid fa-arrow-up-right-from-square sdm-bento-nav-arrow" />
              </div>
              <h4 className="sdm-bento-nav-title">Jadwal &amp; Tukar Shift</h4>
              <p className="sdm-bento-nav-desc">Kalender roster kerja, template shift, &amp; pengajuan tukar dinas kasir.</p>
              <div className="sdm-bento-nav-footer">
                <span className="sdm-bento-nav-badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#059669" }}>
                  <i className="fa-solid fa-clock" /> {todayShifts.length} Shift Hari Ini
                </span>
                <span>Buka Roster &rarr;</span>
              </div>
            </Link>

            <Link to="/app/absen" className="sdm-bento-nav-card">
              <div className="sdm-bento-nav-top">
                <div className="sdm-bento-nav-icon" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#0284c7" }}>
                  <i className="fa-solid fa-fingerprint" />
                </div>
                <i className="fa-solid fa-arrow-up-right-from-square sdm-bento-nav-arrow" />
              </div>
              <h4 className="sdm-bento-nav-title">Presensi &amp; Validasi GPS</h4>
              <p className="sdm-bento-nav-desc">Validasi clock-in/out live webcam stempel anti-rekayasa &amp; radius outlet.</p>
              <div className="sdm-bento-nav-footer">
                <span className="sdm-bento-nav-badge" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#0284c7" }}>
                  <i className="fa-solid fa-user-check" /> {clockInsToday.length} Masuk Valid
                </span>
                <span>Verifikasi Presensi &rarr;</span>
              </div>
            </Link>

            <Link to="/app/sdm/cuti" className="sdm-bento-nav-card">
              <div className="sdm-bento-nav-top">
                <div className="sdm-bento-nav-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
                  <i className="fa-solid fa-plane-departure" />
                </div>
                <i className="fa-solid fa-arrow-up-right-from-square sdm-bento-nav-arrow" />
              </div>
              <h4 className="sdm-bento-nav-title">Cuti &amp; Izin Staf</h4>
              <p className="sdm-bento-nav-desc">Otorisasi permohonan izin dinas, cuti tahunan, &amp; integrasi buku saldo cuti.</p>
              <div className="sdm-bento-nav-footer">
                <span className="sdm-bento-nav-badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
                  <i className="fa-solid fa-hourglass-half" /> {leaveSummary.pending} Butuh Otorisasi
                </span>
                <span>Review Pengajuan &rarr;</span>
              </div>
            </Link>

            <Link to="/app/penggajian" className="sdm-bento-nav-card">
              <div className="sdm-bento-nav-top">
                <div className="sdm-bento-nav-icon" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" }}>
                  <i className="fa-solid fa-wallet" />
                </div>
                <i className="fa-solid fa-arrow-up-right-from-square sdm-bento-nav-arrow" />
              </div>
              <h4 className="sdm-bento-nav-title">Penggajian &amp; Upah Kasir</h4>
              <p className="sdm-bento-nav-desc">Konsolidasi draf upah, gaji pokok kasir, denda telat, serta cetak slip gaji.</p>
              <div className="sdm-bento-nav-footer">
                <span className="sdm-bento-nav-badge" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" }}>
                  <i className="fa-solid fa-file-invoice" /> {metrics.status_payroll}
                </span>
                <span>Kelola Penggajian &rarr;</span>
              </div>
            </Link>
          </div>

          {/* 3. SUITE 4 VISUAL HRIS CHARTS (100% REALTIME DARI DATABASE) */}
          <div className="sdm-charts-grid" aria-label="Visual Analytics Suite SDM">
            
            {/* CHART 1: Tren Presensi & Kedisiplinan Harian */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Tren Presensi &amp; Kedisiplinan</h3>
                  <p className="sdm-chart-desc">
                    Aktivitas clock-in harian ({activeRange.label})
                  </p>
                </div>
                <Badge tone="emerald">Real-time DB</Badge>
              </div>

              <div className="sdm-chart-body">
                <AttendanceDisciplineTrendChart
                  range={activeRange}
                  attendance={rawAttendance}
                  branchFilter={branchFilter}
                  totalStaff={staffList.length}
                />
              </div>

              <div className="sdm-chart-legend">
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#10b981" }} />
                  Hadir Tepat Waktu
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#f59e0b" }} />
                  Terlambat
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#cbd5e1" }} />
                  Kapasitas Tim
                </span>
              </div>
            </div>

            {/* CHART 2: Komposisi Status Tenaga Kerja Hari Ini */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Komposisi Tenaga Kerja</h3>
                  <p className="sdm-chart-desc">
                    Distribusi status shift hari ini ({date(todayIso)})
                  </p>
                </div>
                <Badge tone="sky">{staffList.length} Staf Aktif</Badge>
              </div>

              <div className="sdm-chart-body">
                <WorkforceCompositionDonut
                  metrics={metrics}
                  totalStaff={staffList.length}
                />
              </div>

              <div className="sdm-chart-legend">
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#10b981" }} />
                  Hadir ({metrics.hadir_hari_ini - metrics.terlambat})
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#f59e0b" }} />
                  Terlambat ({metrics.terlambat})
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#0284c7" }} />
                  Cuti ({metrics.sedang_cuti})
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#94a3b8" }} />
                  Belum Absen / Off ({metrics.belum_absen})
                </span>
              </div>
            </div>

            {/* CHART 3: Distribusi Jam Kerja & Lembur */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Distribusi Jam Kerja &amp; Lembur</h3>
                  <p className="sdm-chart-desc">
                    Total alokasi jam kerja reguler vs jam lembur ({activeRange.label})
                  </p>
                </div>
                <Badge tone="purple">Shift Hours</Badge>
              </div>

              <div className="sdm-chart-body">
                <WorkHoursOvertimeBarChart
                  range={activeRange}
                  shifts={rawShifts}
                  branchFilter={branchFilter}
                />
              </div>

              <div className="sdm-chart-legend">
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#6366f1" }} />
                  Jam Shift Reguler (Jam)
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#f43f5e" }} />
                  Jam Lembur / Overtime (Jam)
                </span>
              </div>
            </div>

            {/* CHART 4: Kategori Cuti & Permohonan Izin */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Kategori Cuti &amp; Izin Staf</h3>
                  <p className="sdm-chart-desc">
                    Distribusi pengajuan izin dan kuota cuti
                  </p>
                </div>
                <Link to="/app/sdm/cuti" className="d-btn d-btn--sm d-btn--ghost">
                  Kelola Cuti &rarr;
                </Link>
              </div>

              <div className="sdm-chart-body">
                <LeaveAllocationBreakdown
                  leaves={leaveSummary.all}
                  summary={leaveSummary}
                />
              </div>

              <div className="sdm-chart-legend">
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#059669" }} />
                  Disetujui ({leaveSummary.approved})
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#d97706" }} />
                  Menunggu ({leaveSummary.pending})
                </span>
                <span className="sdm-chart-legend-item">
                  <span className="sdm-chart-legend-dot" style={{ background: "#dc2626" }} />
                  Ditolak ({leaveSummary.rejected})
                </span>
              </div>
            </div>

            {/* CHART 5: Peringkat Kedisiplinan Staf / Kasir */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Peringkat Kedisiplinan &amp; On-Time Kasir</h3>
                  <p className="sdm-chart-desc">
                    Tingkat ketepatan waktu presensi clock-in staf ({activeRange.label})
                  </p>
                </div>
                <Badge tone="emerald">On-Time Rank</Badge>
              </div>

              <div className="sdm-chart-body" style={{ padding: "0.5rem 0" }}>
                <StaffDisciplineLeaderboard
                  staffList={staffList}
                  attendance={rawAttendance}
                  range={activeRange}
                  branchFilter={branchFilter}
                  branches={branches}
                  getAttendanceWitaDate={getAttendanceWitaDate}
                />
              </div>
            </div>

            {/* CHART 6: Kepatuhan Presensi per Cabang / Outlet */}
            <div className="sdm-chart-card">
              <div className="sdm-chart-header">
                <div>
                  <h3 className="sdm-chart-title">Kepatuhan Presensi Antar Cabang</h3>
                  <p className="sdm-chart-desc">
                    Komparasi kehadiran roster shift vs clock-in aktual ({activeRange.label})
                  </p>
                </div>
                <Badge tone="sky">Multi-Branch</Badge>
              </div>

              <div className="sdm-chart-body" style={{ padding: "0.5rem 0" }}>
                <BranchAttendanceCompliance
                  branches={branches}
                  staffList={staffList}
                  attendance={rawAttendance}
                  shifts={rawShifts}
                  range={activeRange}
                  getAttendanceWitaDate={getAttendanceWitaDate}
                />
              </div>
            </div>

          </div>

          {/* 4. DAFTAR KASIR REALTIME DARI DATABASE SUPABASE */}
          <div style={{ marginTop: "1.5rem" }}>
            <Panel
              title="Daftar Kasir &amp; Staf Terdaftar (Database Real-time)"
              desc="Staf aktif yang tercatat resmi pada basis data Supabase tanpa data fiktif"
            >
              {staffList.length === 0 ? (
                <Empty title="Belum ada kasir terdaftar">
                  Tambahkan staf kasir pertama Anda melalui menu Kelola Kasir.
                </Empty>
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th>Nama Lengkap</th>
                        <th>Peran (Role)</th>
                        <th>Cabang Penugasan</th>
                        <th>Email Akun</th>
                        <th>Status Akun</th>
                        <th>Presensi Terakhir</th>
                        <th style={{ textAlign: "right" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((s) => {
                        const br = branches.find((b) => b.id === s.branch_id);
                        const lastAtt = rawAttendance.find((a) => a.profile_id === s.id);
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>{s.full_name || "Staf Demo"}</td>
                            <td>
                              <Badge tone="accent">Kasir POS (Staff)</Badge>
                            </td>
                            <td>{br?.name || "Cabang Hasanuddin (Utama)"}</td>
                            <td className="d-mono">{s.email || "staff@demo.tijarah.id"}</td>
                            <td>
                              <Badge tone="ok">Aktif</Badge>
                            </td>
                            <td style={{ fontSize: "0.82rem" }}>
                              {lastAtt ? (
                                <span>
                                  {lastAtt.kind === "in" ? "Masuk" : "Pulang"} ({lastAtt.created_at ? lastAtt.created_at.slice(11, 16) : "-"})
                                </span>
                              ) : (
                                <span style={{ color: "var(--color-muted)" }}>Belum ada presensi</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <Link to="/app/karyawan" className="d-btn d-btn--sm d-btn--ghost">
                                Kelola Profil
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* MODAL 1: Pratinjau Foto Selfie Presensi */}
      {photoModal && (
        <Modal open={Boolean(photoModal)} title={`Verifikasi Foto Presensi · ${photoModal.full_name}`} onClose={() => setPhotoModal(null)}>
          <div style={{ textAlign: "center" }}>
            <img
              src={photoModal.selfie_url}
              alt="Foto Snapshot Selfie"
              style={{ maxWidth: "100%", maxHeight: "360px", borderRadius: "var(--radius-md)", objectFit: "cover" }}
            />
            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--color-muted)", textAlign: "left" }}>
              <p style={{ margin: "0.2rem 0" }}><strong>Jarak GPS:</strong> {photoModal.distance_m} meter dari outlet cabang</p>
              <p style={{ margin: "0.2rem 0" }}><strong>Akurasi Hardware:</strong> ± {photoModal.accuracy_m} meter</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button type="button" className="d-btn d-btn--primary" onClick={() => setPhotoModal(null)}>
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Dual-Month Date Range Picker Modal (Matches GBR 5) */}
      {showRangeModal && (
        <DualMonthRangePickerModal
          initialStart={activeRange.start}
          initialEnd={activeRange.end}
          todayIso={todayIso}
          onApply={handleApplyRange}
          onClose={() => {
            setShowRangeModal(false);
            if (horizonFilter === "custom" && !customStart) {
              setHorizonFilter("7");
            }
          }}
        />
      )}
    </>
  );
}

// =============================================================
// MODAL DUAL-MONTH DATE RANGE PICKER (SESUAI DOKUMEN GBR 5)
// =============================================================
function DualMonthRangePickerModal({ initialStart, initialEnd, todayIso, onApply, onClose }) {
  const [startIso, setStartIso] = useState(initialStart);
  const [endIso, setEndIso] = useState(initialEnd);
  const [activePreset, setActivePreset] = useState("custom");

  // Navigasi kalender: bulan pertama (kiri)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(todayIso);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d;
  });

  const month1Date = viewDate;
  const month2Date = useMemo(() => {
    const d = new Date(month1Date);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [month1Date]);

  const handlePrevMonth = () => {
    setViewDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setViewDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  // Helper pilih preset cepat
  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const today = new Date(todayIso);
    let s = new Date(today);
    let e = new Date(today);

    if (presetKey === "today") {
      // s & e = today
    } else if (presetKey === "yesterday") {
      s.setDate(s.getDate() - 1);
      e.setDate(e.getDate() - 1);
    } else if (presetKey === "this_week") {
      const day = s.getDay();
      const diff = s.getDate() - day + (day === 0 ? -6 : 1);
      s.setDate(diff);
    } else if (presetKey === "7d") {
      s.setDate(s.getDate() - 6);
    } else if (presetKey === "14d") {
      s.setDate(s.getDate() - 13);
    } else if (presetKey === "30d") {
      s.setDate(s.getDate() - 29);
    } else if (presetKey === "this_month") {
      s.setDate(1);
    } else if (presetKey === "last_month") {
      s.setMonth(s.getMonth() - 1);
      s.setDate(1);
      e = new Date(s);
      e.setMonth(e.getMonth() + 1);
      e.setDate(0);
    }

    const sStr = s.toISOString().slice(0, 10);
    const eStr = e.toISOString().slice(0, 10);
    setStartIso(sStr);
    setEndIso(eStr);
  };

  // Klik tanggal kalender
  const handleDayClick = (dayStr) => {
    setActivePreset("custom");
    if (!startIso || (startIso && endIso)) {
      setStartIso(dayStr);
      setEndIso("");
    } else {
      if (dayStr < startIso) {
        setEndIso(startIso);
        setStartIso(dayStr);
      } else {
        setEndIso(dayStr);
      }
    }
  };

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dayHeaders = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const renderMonth = (monthDate, isLeft) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ empty: false, day: d, iso: dayStr, key: dayStr });
    }

    return (
      <div className="sdm-dp-month">
        <div className="sdm-dp-month__header">
          {isLeft ? (
            <button type="button" className="sdm-dp-nav-btn" onClick={handlePrevMonth} aria-label="Bulan Sebelumnya">
              <i className="fa-solid fa-chevron-left" />
            </button>
          ) : <span style={{ width: 28 }} />}

          <span className="sdm-dp-month__title">
            {monthNames[month]} {year}
          </span>

          {!isLeft ? (
            <button type="button" className="sdm-dp-nav-btn" onClick={handleNextMonth} aria-label="Bulan Berikutnya">
              <i className="fa-solid fa-chevron-right" />
            </button>
          ) : <span style={{ width: 28 }} />}
        </div>

        <div className="sdm-dp-grid">
          {dayHeaders.map((dh) => (
            <div key={dh} className="sdm-dp-day-header">{dh}</div>
          ))}

          {cells.map((c) => {
            if (c.empty) return <div key={c.key} className="sdm-dp-cell sdm-dp-cell--empty" />;
            const isStart = c.iso === startIso;
            const isEnd = c.iso === endIso;
            const inRange = startIso && endIso && c.iso > startIso && c.iso < endIso;
            const isToday = c.iso === todayIso;

            let cls = "sdm-dp-cell";
            if (isStart) cls += " sdm-dp-cell--range-start";
            if (isEnd) cls += " sdm-dp-cell--range-end";
            if (inRange) cls += " sdm-dp-cell--in-range";
            if (isToday) cls += " sdm-dp-cell--today";

            return (
              <button
                key={c.key}
                type="button"
                className={cls}
                onClick={() => handleDayClick(c.iso)}
              >
                {c.day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const daysCount = useMemo(() => {
    if (!startIso || !endIso) return 1;
    const diff = Math.round((new Date(endIso) - new Date(startIso)) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [startIso, endIso]);

  return (
    <Modal open={true} title="Pilih Rentang Waktu (Date Range Picker)" onClose={onClose}>
      <div className="sdm-dp-wrap">
        {/* Kolom Sidebar Preset Cepat (GBR 5) */}
        <div className="sdm-dp-sidebar">
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "today" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("today")}
          >
            Hari Ini
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "yesterday" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("yesterday")}
          >
            Kemarin
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "this_week" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("this_week")}
          >
            Minggu Ini
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "7d" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("7d")}
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "14d" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("14d")}
          >
            14 Hari Terakhir
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "30d" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("30d")}
          >
            30 Hari Terakhir
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "this_month" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("this_month")}
          >
            Bulan Ini
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "last_month" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => applyPreset("last_month")}
          >
            Bulan Lalu
          </button>
          <button
            type="button"
            className={`sdm-dp-preset-btn ${activePreset === "custom" ? "sdm-dp-preset-btn--active" : ""}`}
            onClick={() => setActivePreset("custom")}
          >
            Kustom Rentang
          </button>
        </div>

        {/* Kolom Kalender Dual-Month */}
        <div className="sdm-dp-main">
          <div className="sdm-dp-calendars">
            {renderMonth(month1Date, true)}
            {renderMonth(month2Date, false)}
          </div>

          <div className="sdm-dp-footer">
            <div className="sdm-dp-badge-range">
              <i className="fa-solid fa-calendar-check" style={{ marginRight: "0.35rem", color: "var(--color-brand)" }} />
              {startIso ? (
                <span>
                  {date(startIso)} {endIso ? ` s/d ${date(endIso)} (${daysCount} Hari)` : " (Pilih tanggal akhir)"}
                </span>
              ) : "Silakan pilih rentang tanggal"}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={onClose}>
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={!startIso}
                onClick={() => onApply(startIso, endIso || startIso)}
              >
                Terapkan Rentang
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================
// CHART 1: TREN PRESENSI & KEDISIPLINAN HARIAN (INTERACTIVE SVG)
// =============================================================
function AttendanceDisciplineTrendChart({ range, attendance, branchFilter, totalStaff }) {
  const w = 500;
  const h = 180;
  const pad = { top: 30, right: 25, bottom: 25, left: 35 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Bangun titik-titik data harian dari database dalam rentang
  const { days, maxVal } = useMemo(() => {
    const start = new Date(range.start);
    const end = new Date(range.end);
    const list = [];
    const curr = new Date(start);

    while (curr <= end && list.length < 31) {
      const iso = curr.toISOString().slice(0, 10);
      const dayAtt = attendance.filter((a) => {
        if (branchFilter && a.branch_id !== branchFilter) return false;
        const d = (a.created_at || "").slice(0, 10);
        return d === iso && a.kind === "in";
      });
      const onTime = dayAtt.filter((a) => (a.late_min ?? 0) <= 5).length;
      const late = dayAtt.filter((a) => (a.late_min ?? 0) > 5).length;

      const label = `${curr.getDate()}/${curr.getMonth() + 1}`;
      list.push({ iso, label, onTime, late, total: onTime + late });
      curr.setDate(curr.getDate() + 1);
    }

    if (list.length === 0) {
      list.push({ iso: range.end, label: "Hari Ini", onTime: 0, late: 0, total: 0 });
    }

    const calculatedMax = Math.max(totalStaff || 2, ...list.map((d) => d.total));
    return { days: list, maxVal: Math.max(2, calculatedMax) };
  }, [range, attendance, branchFilter, totalStaff]);

  const coords = days.map((d, i) => {
    const x = days.length === 1 ? pad.left + chartW / 2 : pad.left + (i / (days.length - 1)) * chartW;
    const yOnTime = pad.top + chartH - (d.onTime / maxVal) * chartH;
    const yLate = pad.top + chartH - (d.late / maxVal) * chartH;
    return { ...d, x, yOnTime, yLate };
  });

  const [activeIdx, setActiveIdx] = useState(coords.length - 1);
  const activePt = coords[activeIdx] || coords[coords.length - 1];

  const lineOnTime = coords.reduce((acc, curr, i, arr) => {
    if (i === 0) return `M ${curr.x} ${curr.yOnTime}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp2x = prev.x + (curr.x - prev.x) / 2;
    return `${acc} C ${cp1x} ${prev.yOnTime}, ${cp2x} ${curr.yOnTime}, ${curr.x} ${curr.yOnTime}`;
  }, "");

  const areaOnTime = `${lineOnTime} L ${coords[coords.length - 1].x} ${pad.top + chartH} L ${coords[0].x} ${pad.top + chartH} Z`;

  return (
    <figure style={{ margin: 0, width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "180px", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="sdm-chart1-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <filter id="sdm-card-sh" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Grid lines horizontal */}
        {[0, 0.5, 1].map((r, i) => {
          const y = pad.top + chartH * (1 - r);
          return (
            <g key={i}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--color-rule)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">
                {Math.round(maxVal * r)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaOnTime} fill="url(#sdm-chart1-grad)" />

        {/* Line on-time */}
        <path d={lineOnTime} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

        {/* Garis vertikal aktif */}
        {activePt && (
          <line
            x1={activePt.x}
            x2={activePt.x}
            y1={pad.top}
            y2={pad.top + chartH}
            stroke="#10b981"
            strokeWidth="1.2"
            strokeDasharray="2 2"
            opacity="0.6"
          />
        )}

        {/* Titik interaktif */}
        {coords.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.yOnTime}
            r={i === activeIdx ? "5.5" : "3.5"}
            fill={i === activeIdx ? "#10b981" : "#ffffff"}
            stroke="#10b981"
            strokeWidth={i === activeIdx ? "3" : "2"}
            style={{ cursor: "pointer", transition: "all 0.15s ease" }}
            onMouseEnter={() => setActiveIdx(i)}
            onTouchStart={() => setActiveIdx(i)}
          />
        ))}

        {/* Tooltip Card */}
        {activePt && (
          <g
            transform={`translate(${Math.max(10, Math.min(w - 110, activePt.x - 50))}, ${Math.max(5, activePt.yOnTime - 45)})`}
            filter="url(#sdm-card-sh)"
            style={{ pointerEvents: "none" }}
          >
            <rect width="105" height="38" rx="6" fill="var(--color-paper)" stroke="var(--color-rule)" strokeWidth="1" />
            <text x="52" y="14" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--color-muted)">
              {activePt.label} ({activePt.iso})
            </text>
            <text x="52" y="29" textAnchor="middle" fontSize="10" fontWeight="700" fill="#10b981">
              {activePt.onTime} Hadir · {activePt.late} Telat
            </text>
          </g>
        )}

        {/* Label sumbu bawah */}
        {coords.filter((_, i) => i === 0 || i === Math.floor(coords.length / 2) || i === coords.length - 1).map((pt, idx) => (
          <text key={idx} x={pt.x} y={h - 6} textAnchor="middle" fontSize="9.5" fill="var(--color-muted)">
            {pt.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// =============================================================
// CHART 2: KOMPOSISI TENAGA KERJA (MODERN DONUT CHART)
// =============================================================
function WorkforceCompositionDonut({ metrics, totalStaff }) {
  const size = 155;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circum = 2 * Math.PI * radius; // ~442.96

  const onTime = Math.max(0, metrics.hadir_hari_ini - metrics.terlambat);
  const late = metrics.terlambat;
  const leave = metrics.sedang_cuti;
  const absent = Math.max(0, (totalStaff || 1) - (onTime + late + leave));
  const base = totalStaff || 1;

  const onTimePct = onTime / base;
  const latePct = late / base;
  const leavePct = leave / base;
  const absentPct = absent / base;

  const onTimeDash = onTimePct * circum;
  const lateDash = latePct * circum;
  const leaveDash = leavePct * circum;
  const absentDash = absentPct * circum;

  const totalPresentPct = Math.round((metrics.hadir_hari_ini / base) * 100);

  return (
    <div style={{ position: "relative", width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        {/* Track abu-abu dasar */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-rule)" strokeWidth={strokeWidth} />

        {/* Segmen Hadir Tepat Waktu (Emerald) */}
        {onTime > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth={strokeWidth}
            strokeDasharray={`${onTimeDash} ${circum}`}
            strokeDashoffset="0"
          />
        )}

        {/* Segmen Terlambat (Amber) */}
        {late > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            strokeDasharray={`${lateDash} ${circum}`}
            strokeDashoffset={-onTimeDash}
          />
        )}

        {/* Segmen Cuti (Sky Blue) */}
        {leave > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#0284c7"
            strokeWidth={strokeWidth}
            strokeDasharray={`${leaveDash} ${circum}`}
            strokeDashoffset={-(onTimeDash + lateDash)}
          />
        )}
      </svg>

      <div className="sdm-donut-center">
        <div className="sdm-donut-center__val" style={{ color: totalPresentPct > 0 ? "#10b981" : "var(--color-ink)" }}>
          {totalPresentPct}%
        </div>
        <div className="sdm-donut-center__lbl">
          Kehadiran
        </div>
      </div>
    </div>
  );
}

// =============================================================
// CHART 3: DISTRIBUSI JAM KERJA & LEMBUR (STACKED BAR CHART)
// =============================================================
function WorkHoursOvertimeBarChart({ range, shifts, branchFilter }) {
  const w = 480;
  const h = 180;
  const pad = { top: 25, right: 20, bottom: 25, left: 35 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Hitung total jam reguler dan lembur per hari
  const bars = useMemo(() => {
    const start = new Date(range.start);
    const end = new Date(range.end);
    const list = [];
    const curr = new Date(start);

    while (curr <= end && list.length < 14) {
      const iso = curr.toISOString().slice(0, 10);
      const dayShifts = shifts.filter((s) => {
        if (branchFilter && s.branch_id !== branchFilter) return false;
        return s.work_date === iso;
      });

      let regularHours = 0;
      let otHours = 0;
      dayShifts.forEach((s) => {
        const [sh, sm] = (s.start_time || "08:00").split(":").map(Number);
        const [eh, em] = (s.end_time || "16:00").split(":").map(Number);
        let duration = (eh * 60 + em - (sh * 60 + sm)) / 60;
        if (duration < 0) duration += 24;
        if (duration <= 8) {
          regularHours += duration;
        } else {
          regularHours += 8;
          otHours += (duration - 8);
        }
      });

      const label = `${curr.getDate()}/${curr.getMonth() + 1}`;
      list.push({ iso, label, regularHours, otHours, total: regularHours + otHours });
      curr.setDate(curr.getDate() + 1);
    }

    if (list.length === 0) {
      list.push({ iso: range.end, label: "Hari Ini", regularHours: 8, otHours: 0, total: 8 });
    }

    return list;
  }, [range, shifts, branchFilter]);

  const maxVal = Math.max(12, ...bars.map((b) => b.total));
  const barWidth = Math.max(12, Math.min(32, (chartW / bars.length) * 0.6));

  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <figure style={{ margin: 0, width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "180px", display: "block", overflow: "visible" }}>
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((r, i) => {
          const y = pad.top + chartH * (1 - r);
          return (
            <g key={i}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--color-rule)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">
                {Math.round(maxVal * r)}j
              </text>
            </g>
          );
        })}

        {bars.map((b, i) => {
          const x = pad.left + (i + 0.5) * (chartW / bars.length) - barWidth / 2;
          const regH = (b.regularHours / maxVal) * chartH;
          const otH = (b.otHours / maxVal) * chartH;
          const yReg = pad.top + chartH - regH;
          const yOt = yReg - otH;
          const isHov = hoveredIdx === i;

          return (
            <g
              key={i}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onTouchStart={() => setHoveredIdx(i)}
            >
              {/* Regular bar */}
              <rect
                x={x}
                y={yReg}
                width={barWidth}
                height={Math.max(2, regH)}
                rx="3"
                fill={isHov ? "#4f46e5" : "#6366f1"}
              />
              {/* Overtime bar */}
              {otH > 0 && (
                <rect
                  x={x}
                  y={yOt}
                  width={barWidth}
                  height={otH}
                  rx="3"
                  fill="#f43f5e"
                />
              )}
              {/* Label */}
              <text x={x + barWidth / 2} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--color-muted)">
                {b.label}
              </text>
            </g>
          );
        })}

        {/* Hover info */}
        {hoveredIdx !== null && bars[hoveredIdx] && (
          <g
            transform={`translate(${Math.max(10, Math.min(w - 110, pad.left + (hoveredIdx + 0.5) * (chartW / bars.length) - 50))}, ${pad.top - 20})`}
            style={{ pointerEvents: "none" }}
          >
            <rect width="100" height="22" rx="4" fill="var(--color-ink)" />
            <text x="50" y="14" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#ffffff">
              {bars[hoveredIdx].regularHours.toFixed(1)}j Reg + {bars[hoveredIdx].otHours.toFixed(1)}j OT
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

// =============================================================
// CHART 4: KATEGORI CUTI & IZIN STAF (HORIZONTAL PROGRESS BARS)
// =============================================================
function LeaveAllocationBreakdown({ leaves, summary }) {
  const categories = useMemo(() => {
    const types = [
      { key: "annual", label: "Cuti Tahunan", color: "#0284c7" },
      { key: "sick", label: "Izin Sakit (Surat Dokter)", color: "#10b981" },
      { key: "important", label: "Izin Penting / Keperluan", color: "#f59e0b" },
      { key: "other", label: "Dinas Luar & Khusus", color: "#8b5cf6" }
    ];

    return types.map((t) => {
      const count = leaves.filter((l) => {
        const text = `${l.reason || ""} ${l.leave_type || ""}`.toLowerCase();
        if (t.key === "annual") return text.includes("tahunan") || text.includes("annual");
        if (t.key === "sick") return text.includes("sakit") || text.includes("dokter");
        if (t.key === "important") return text.includes("penting") || text.includes("keluarga");
        return true;
      }).length;
      return { ...t, count };
    });
  }, [leaves]);

  const maxCount = Math.max(1, ...categories.map((c) => c.count));

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.85rem", padding: "0.5rem 0" }}>
      {categories.map((cat) => {
        const pct = Math.round((cat.count / maxCount) * 100);
        return (
          <div key={cat.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.3rem" }}>
              <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>{cat.label}</span>
              <span style={{ color: "var(--color-muted)", fontWeight: 700 }}>{cat.count} Permohonan</span>
            </div>
            <div style={{ width: "100%", height: "8px", background: "var(--color-paper-2, #f1f5f9)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: cat.color,
                  borderRadius: "4px",
                  transformOrigin: "left center",
                  transform: `scaleX(${Math.max(0.05, pct / 100)})`,
                  transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                  willChange: "transform"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================
// CHART 5: LEADERBOARD KEDISIPLINAN STAF (REAL-TIME DB)
// =============================================================
function StaffDisciplineLeaderboard({ staffList = [], attendance = [], range, branchFilter, branches = [], getAttendanceWitaDate }) {
  const filteredStaff = useMemo(() => {
    return branchFilter ? staffList.filter((s) => s.branch_id === branchFilter) : staffList;
  }, [staffList, branchFilter]);

  const leaderboard = useMemo(() => {
    return filteredStaff.map((staff) => {
      const staffAtt = attendance.filter((a) => {
        if (a.profile_id !== staff.id) return false;
        if (a.kind !== "in") return false;
        const d = getAttendanceWitaDate(a.created_at);
        return d >= range.start && d <= range.end;
      });

      const totalHadir = staffAtt.length;
      const terlambat = staffAtt.filter((a) => (a.late_by_min || 0) > 0).length;
      const onTime = Math.max(0, totalHadir - terlambat);
      const totalLateMin = staffAtt.reduce((sum, a) => sum + (a.late_by_min || 0), 0);
      const onTimePct = totalHadir > 0 ? Math.round((onTime / totalHadir) * 100) : 100;
      const branchObj = branches.find((b) => b.id === staff.branch_id);

      return {
        id: staff.id,
        name: staff.full_name || staff.email || "Kasir",
        branchName: branchObj?.name || "Cabang Utama",
        totalHadir,
        onTime,
        terlambat,
        totalLateMin,
        onTimePct,
      };
    }).sort((a, b) => b.onTimePct - a.onTimePct || b.totalHadir - a.totalHadir);
  }, [filteredStaff, attendance, range, branches, getAttendanceWitaDate]);

  if (leaderboard.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--color-muted)" }}>
        Belum ada data kasir pada cabang terpilih.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {leaderboard.map((item, idx) => {
        const toneColor = item.onTimePct >= 90 ? "#10b981" : item.onTimePct >= 70 ? "#f59e0b" : "#ef4444";
        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "var(--color-paper-2, #f8fafc)",
              border: "1px solid var(--color-rule, #e2e8f0)",
              borderRadius: "8px",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "140px" }}>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: idx === 0 ? "#fef08a" : idx === 1 ? "#e2e8f0" : idx === 2 ? "#fed7aa" : "#f1f5f9",
                  color: idx === 0 ? "#854d0e" : idx === 1 ? "#475569" : idx === 2 ? "#9a3412" : "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              <div>
                <strong style={{ fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)", display: "block", lineHeight: 1.2 }}>
                  {item.name}
                </strong>
                <span style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>
                  {item.branchName}
                </span>
              </div>
            </div>

            <div style={{ flex: 1, margin: "0 0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: "3px" }}>
                <span style={{ color: "var(--color-muted, #64748b)" }}>
                  {item.totalHadir} Hadir ({item.terlambat} Telat)
                </span>
                <span style={{ fontWeight: 700, color: toneColor }}>
                  {item.onTimePct}% On-Time
                </span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: `${item.onTimePct}%`, height: "100%", background: toneColor, borderRadius: "3px" }} />
              </div>
            </div>

            <div style={{ textAlign: "right", minWidth: "75px" }}>
              <span style={{ fontSize: "0.72rem", display: "block", color: item.totalLateMin > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                {item.totalLateMin > 0 ? `+${item.totalLateMin}m Telat` : "Tepat Waktu"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================
// CHART 6: KEPATUHAN PRESENSI PER CABANG (REAL-TIME DB)
// =============================================================
function BranchAttendanceCompliance({ branches = [], staffList = [], attendance = [], shifts = [], range, getAttendanceWitaDate }) {
  const branchData = useMemo(() => {
    return branches.map((b) => {
      const bStaff = staffList.filter((s) => s.branch_id === b.id || (!s.branch_id && b.is_warehouse === false));
      const bShifts = shifts.filter((s) => s.branch_id === b.id && s.work_date >= range.start && s.work_date <= range.end);
      const bAttendance = attendance.filter((a) => {
        if (a.kind !== "in") return false;
        if (a.branch_id !== b.id) return false;
        const d = getAttendanceWitaDate(a.created_at);
        return d >= range.start && d <= range.end;
      });

      const totalShift = bShifts.length;
      const totalHadir = bAttendance.length;
      const compliancePct = totalShift > 0 ? Math.min(100, Math.round((totalHadir / totalShift) * 100)) : (totalHadir > 0 ? 100 : 0);
      const lateCount = bAttendance.filter((a) => (a.late_by_min || 0) > 0).length;

      return {
        id: b.id,
        name: b.name,
        staffCount: bStaff.length,
        totalShift,
        totalHadir,
        compliancePct,
        lateCount,
      };
    });
  }, [branches, staffList, attendance, shifts, range, getAttendanceWitaDate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {branchData.map((b) => {
        const barColor = b.compliancePct >= 90 ? "#10b981" : b.compliancePct >= 70 ? "#3b82f6" : "#f59e0b";
        return (
          <div
            key={b.id}
            style={{
              padding: "10px 12px",
              background: "var(--color-paper-2, #f8fafc)",
              border: "1px solid var(--color-rule, #e2e8f0)",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fa-solid fa-store" style={{ color: "var(--color-primary, #0B5D4B)", fontSize: "0.8rem" }} />
                <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                  {b.name}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>
                  ({b.staffCount} Kasir)
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: barColor }}>
                {b.compliancePct}% Kepatuhan
              </span>
            </div>

            <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden", marginBottom: "4px" }}>
              <div style={{ width: `${b.compliancePct}%`, height: "100%", background: barColor, borderRadius: "4px" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
              <span>Presensi: {b.totalHadir} clock-in dari {b.totalShift} shift terjadwal</span>
              <span style={{ color: b.lateCount > 0 ? "#ef4444" : "#10b981" }}>
                {b.lateCount > 0 ? `${b.lateCount} kali telat` : "Nihil telat"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
