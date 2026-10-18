// Modul SDM (FASE 2) di mode DEMO: Manajemen Cuti, Form & Kuis Staf, SOP Digital, serta Dashboard SDM
import { can, permOf } from "../lib/rbac.js";

const T1 = "t1", B1 = "b1", B2 = "b2";
const HOUR = 3600e3, DAY = 24 * HOUR;

export const SDM_RULES = {
  leave_requests: { f: [13], own: "profile_id" },
  leave_balances: { f: [13], own: "profile_id" },
  knowledge_forms: { f: [13], any: true },
  knowledge_responses: { f: [13], own: "profile_id" },
  knowledge_reads: { f: [13], own: "profile_id" }
};

export function seedSdm(db, users) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => {
    const res = new Date(d);
    res.setDate(res.getDate() + n);
    return res.toISOString().slice(0, 10);
  };

  // Pastikan koleksi array terpasang di db
  db.leave_requests ??= [];
  db.leave_balances ??= [];
  db.knowledge_forms ??= [];
  db.knowledge_responses ??= [];
  db.knowledge_reads ??= [];

  // Tambahkan kasir tambahan agar operasional multi-cabang & perbandingan SDM realistis
  const existingU3b = db.profiles.find((p) => p.id === "u3b");
  if (!existingU3b) {
    db.profiles.push(
      {
        id: "u3b",
        tenant_id: T1,
        branch_id: B2,
        role: "staff",
        full_name: "Ahmad Fauzi (Kasir Panakkukang)",
        email: "ahmad.kasir@demo.harum.in",
        phone: "+6281234567891",
        base_salary: 4200000,
        commission_rate: 0.02,
        nik: "7371100202990001",
        is_active: true,
        last_login_at: iso(now - 2 * HOUR),
        last_seen_at: iso(now - 1 * HOUR)
      },
      {
        id: "u3c",
        tenant_id: T1,
        branch_id: B1,
        role: "staff",
        full_name: "Dewi Lestari (Kasir Pettarani)",
        email: "dewi.kasir@demo.harum.in",
        phone: "+6281234567892",
        base_salary: 4200000,
        commission_rate: 0.02,
        nik: "7371100303980002",
        is_active: true,
        last_login_at: iso(now - 4 * HOUR),
        last_seen_at: iso(now - 3 * HOUR)
      }
    );
  }

  // 1. Saldo Cuti Staf (Default 12 hari/tahun)
  const staffProfiles = db.profiles.filter((p) => p.tenant_id === T1 && ["staff", "gm"].includes(p.role));
  staffProfiles.forEach((p) => {
    if (!db.leave_balances.find((b) => b.profile_id === p.id)) {
      db.leave_balances.push({
        id: `lb-${p.id}`,
        tenant_id: T1,
        profile_id: p.id,
        annual_quota: 12,
        used_days: p.id === "u3" ? 2 : 0,
        pending_days: p.id === "u3" ? 1 : 0,
        remaining_days: p.id === "u3" ? 9 : 12,
        adjustments: []
      });
    }
  });

  // 2. Permohonan Cuti Awal
  if (db.leave_requests.length === 0) {
    db.leave_requests.push(
      {
        id: "lv-001",
        tenant_id: T1,
        branch_id: B1,
        profile_id: "u3",
        category: "CT", // Cuti Tahunan
        start_date: addDays(new Date(), 2),
        end_date: addDays(new Date(), 2),
        days_count: 1,
        reason: "Keperluan keluarga di luar kota (menghadiri pernikahan kerabat)",
        attachment_url: null,
        status: "pending",
        created_at: iso(now - 30 * HOUR), // > 24 jam untuk testing SLA warning!
        approved_by: null,
        approved_at: null,
        reject_reason: null
      },
      {
        id: "lv-002",
        tenant_id: T1,
        branch_id: B1,
        profile_id: "u3",
        category: "SK", // Sakit
        start_date: addDays(new Date(), -5),
        end_date: addDays(new Date(), -4),
        days_count: 2,
        reason: "Demam tinggi & radang tenggorokan (Surat Sakit Puskesmas terlampir)",
        attachment_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=600",
        status: "approved",
        created_at: iso(now - 6 * DAY),
        approved_by: "u2",
        approved_at: iso(now - 5 * DAY),
        reject_reason: null
      },
      {
        id: "lv-003",
        tenant_id: T1,
        branch_id: B2,
        profile_id: "u3b",
        category: "IZ", // Izin Pribadi
        start_date: addDays(new Date(), -12),
        end_date: addDays(new Date(), -12),
        days_count: 1,
        reason: "Urusan perpanjangan dokumen kependudukan (KTP/SIM)",
        attachment_url: null,
        status: "approved",
        created_at: iso(now - 13 * DAY),
        approved_by: "u2",
        approved_at: iso(now - 12 * DAY),
        reject_reason: null
      }
    );
  }

  // 3. Formulir & Kuis Pengetahuan Staf (Mulai bersih dari database riil)
  db.knowledge_forms ??= [];
  db.knowledge_reads ??= [];
  db.knowledge_responses ??= [];

  // 5. Tambahkan work shifts untuk hari ini agar Roster Hari Ini (Widget 1) lengkap
  const todayShifts = db.work_shifts.filter((w) => w.work_date === todayIso);
  if (todayShifts.length < 3) {
    // Shift Pagi Pettarani (u3) - Sudah hadir tepat waktu
    if (!db.work_shifts.some((w) => w.profile_id === "u3" && w.work_date === todayIso)) {
      db.work_shifts.push({
        id: "ws-today-1",
        tenant_id: T1,
        branch_id: B1,
        profile_id: "u3",
        work_date: todayIso,
        start_time: "08:00:00",
        end_time: "16:00:00",
        notes: "Shift Pagi - Kasir Utama"
      });
    }
    // Shift Siang Pettarani (u3c) - Belum hadir (Shift mendatang)
    if (!db.work_shifts.some((w) => w.profile_id === "u3c" && w.work_date === todayIso)) {
      db.work_shifts.push({
        id: "ws-today-2",
        tenant_id: T1,
        branch_id: B1,
        profile_id: "u3c",
        work_date: todayIso,
        start_time: "16:00:00",
        end_time: "24:00:00",
        notes: "Shift Malam - Kasir Penutup"
      });
    }
    // Shift Pagi Panakkukang (u3b) - Terlambat hadir
    if (!db.work_shifts.some((w) => w.profile_id === "u3b" && w.work_date === todayIso)) {
      db.work_shifts.push({
        id: "ws-today-3",
        tenant_id: T1,
        branch_id: B2,
        profile_id: "u3b",
        work_date: todayIso,
        start_time: "08:00:00",
        end_time: "16:00:00",
        notes: "Shift Pagi Panakkukang"
      });
    }
    // Shift Kosong (Unassigned shift) di Panakkukang untuk uji widget shift kosong
    if (!db.work_shifts.some((w) => !w.profile_id && w.work_date === todayIso)) {
      db.work_shifts.push({
        id: "ws-today-unassigned",
        tenant_id: T1,
        branch_id: B2,
        profile_id: null,
        work_date: todayIso,
        start_time: "12:00:00",
        end_time: "20:00:00",
        notes: "Butuh 1 Kasir Tambahan (Peak Hour)"
      });
    }
  }

  // 6. Attendance records untuk hari ini & presensi anomali (Widget 2)
  const todayAtt = db.attendance.filter((a) => (a.created_at || "").slice(0, 10) === todayIso);
  if (todayAtt.length === 0) {
    const clockInU3 = new Date();
    clockInU3.setHours(7, 56, 0, 0); // Hadir tepat waktu (07:56)
    db.attendance.push({
      id: "att-today-1",
      tenant_id: T1,
      branch_id: B1,
      profile_id: "u3",
      kind: "in",
      lat: -5.1561,
      lng: 119.4363,
      distance_m: 8,
      accuracy_m: 12,
      selfie_path: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
      late_min: 0,
      overtime_min: 0,
      created_at: clockInU3.toISOString()
    });

    // Anomali 1: Kasir u3b clock-in di luar geofence (jarak 180m) & terlambat 18 menit
    const clockInU3b = new Date();
    clockInU3b.setHours(8, 18, 0, 0);
    db.attendance.push({
      id: "att-today-anomali-1",
      tenant_id: T1,
      branch_id: B2,
      profile_id: "u3b",
      kind: "in",
      lat: -5.1515,
      lng: 119.4490,
      distance_m: 185, // Di luar radius 50m!
      accuracy_m: 65, // Akurasi rendah!
      selfie_path: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      late_min: 18,
      overtime_min: 0,
      created_at: clockInU3b.toISOString()
    });
  }
}

export function createSdm(ctx) {
  const { db, user, emit, persist, audit } = ctx;
  const role = () => user()?.role;
  const err = (m) => { throw new Error(m); };
  const id = () => globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((c === "x" ? Math.random() * 16 : (Math.random() * 4) + 8) | 0).toString(16));
  const nowIso = () => new Date().toISOString();
  const today = () => nowIso().slice(0, 10);
  const done = (data, tables = []) => {
    persist();
    tables.forEach((t) => emit(t));
    return data;
  };
  const need = (f, a) => {
    if (role() === "member") err("Akses ditolak");
    if (!can(role(), f, a)) err(`Akses ditolak: peran ${role()} tidak punya aksi "${a}" pada fitur ${f}`);
  };

  const RPC = {
    sdm_dashboard_summary({ p_branch = null, p_horizon = 7 } = {}) {
      const t = user().tenant_id;
      const todayIso = today();

      // Kasir & Karyawan lingkup tenant
      let profiles = (db.profiles ?? []).filter((p) => p.tenant_id === t && ["staff", "gm"].includes(p.role));
      if (p_branch) profiles = profiles.filter((p) => p.branch_id === p_branch);

      const staffCashiers = profiles.filter((p) => p.role === "staff" && p.is_active !== false);
      const totalCashiers = staffCashiers.length;

      // Shifts hari ini
      let todayShifts = (db.work_shifts ?? []).filter((w) => w.tenant_id === t && w.work_date === todayIso);
      if (p_branch) todayShifts = todayShifts.filter((w) => w.branch_id === p_branch);

      // Absensi hari ini
      let todayAttendance = (db.attendance ?? []).filter((a) => a.tenant_id === t && (a.created_at || "").slice(0, 10) === todayIso);
      if (p_branch) todayAttendance = todayAttendance.filter((a) => a.branch_id === p_branch);

      const clockIns = todayAttendance.filter((a) => a.kind === "in");
      const hadirHariIni = new Set(clockIns.map((a) => a.profile_id)).size;
      const terlambatHariIni = clockIns.filter((a) => (a.late_min ?? 0) > 5).length;

      // Cuti hari ini
      const leavesToday = (db.leave_requests ?? []).filter(
        (l) => l.tenant_id === t && l.status === "approved" && l.start_date <= todayIso && l.end_date >= todayIso
      );
      const sedangCuti = leavesToday.length;

      // Shift kosong (unassigned)
      const shiftKosong = todayShifts.filter((w) => !w.profile_id).length;

      // Belum absen: kasir yang dijadwalkan shift hari ini tapi belum ada clock in
      const scheduledProfileIds = new Set(todayShifts.filter((w) => w.profile_id).map((w) => w.profile_id));
      const clockedInProfileIds = new Set(clockIns.map((a) => a.profile_id));
      const belumAbsen = Array.from(scheduledProfileIds).filter((pid) => !clockedInProfileIds.has(pid)).length;

      // Approval Pending
      const pendingLeaves = (db.leave_requests ?? []).filter((l) => l.tenant_id === t && l.status === "pending").length;
      const pendingSwaps = (db.shift_swaps ?? []).filter((s) => s.tenant_id === t && s.status === "accepted").length;
      const generalApprovals = (db.approvals ?? []).filter((a) => a.tenant_id === t && a.status === "pending").length;
      const totalApprovalPending = pendingLeaves + pendingSwaps + generalApprovals;

      // Status Payroll Periode Ini
      const currentYm = todayIso.slice(0, 7);
      const latestPayroll = (db.payroll_runs ?? []).find((pr) => pr.tenant_id === t && pr.period_month === currentYm);
      const payrollStatus = latestPayroll ? latestPayroll.status : "Belum Disusun";

      // ── INDIVIDUAL CASHIER KPIS ──
      const cashierKpis = staffCashiers.map((c) => {
        const cShifts = (db.work_shifts ?? []).filter((w) => w.profile_id === c.id);
        const cAtt = (db.attendance ?? []).filter((a) => a.profile_id === c.id);
        const cIns = cAtt.filter((a) => a.kind === "in");

        const totalScheduled = cShifts.length || 1;
        const totalPresents = cIns.length;
        const onTimeCount = cIns.filter((a) => (a.late_min ?? 0) <= 5).length;
        const onTimePct = totalPresents > 0 ? Math.round((onTimeCount / totalPresents) * 100) : 100;

        const totalLateMin = cIns.reduce((sum, a) => sum + (a.late_min ?? 0), 0);
        const avgLateMin = totalPresents > 0 ? Math.round(totalLateMin / totalPresents) : 0;

        // Estimasi jam kerja & lembur mingguan
        const weeklyHours = cShifts.slice(0, 5).reduce((acc, s) => {
          if (!s.start_time || !s.end_time) return acc + 8;
          const [sh] = s.start_time.split(":").map(Number);
          const [eh] = s.end_time.split(":").map(Number);
          const dur = (eh >= sh ? eh - sh : 24 - sh + eh);
          return acc + dur;
        }, 0);
        const overtimeHours = Math.round(cAtt.reduce((sum, a) => sum + (a.overtime_min ?? 0), 0) / 60);

        // Kepatuhan SOP & Form
        const cResponses = (db.knowledge_responses ?? []).filter((r) => r.profile_id === c.id);
        const cReads = (db.knowledge_reads ?? []).filter((r) => r.profile_id === c.id);
        const avgQuizScore = cResponses.length > 0
          ? Math.round(cResponses.reduce((acc, r) => acc + (r.score ?? 100), 0) / cResponses.length)
          : 90;

        const branch = (db.branches ?? []).find((b) => b.id === c.branch_id);

        let tier = "Prima";
        if (onTimePct < 80 || avgLateMin > 15) tier = "Kritis";
        else if (onTimePct < 90 || avgLateMin > 5) tier = "Perlu Perhatian";

        return {
          profile_id: c.id,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone,
          branch_id: c.branch_id,
          branch_name: branch?.name ?? "Pusat",
          base_salary: c.base_salary,
          on_time_pct: onTimePct,
          avg_late_min: avgLateMin,
          weekly_hours: weeklyHours,
          overtime_hours: overtimeHours,
          quiz_score: avgQuizScore,
          sop_reads_count: cReads.length,
          tier,
          is_overwork: weeklyHours + overtimeHours > 40
        };
      });

      // ── CHART 1: 7-DAY ATTENDANCE & DISCIPLINE TREND ──
      const attendanceTrend = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayLabel = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });

        const dayAtt = (db.attendance ?? []).filter(
          (a) => a.tenant_id === t && (a.created_at || "").slice(0, 10) === dateStr && a.kind === "in" && (!p_branch || a.branch_id === p_branch)
        );
        const onTime = dayAtt.filter((a) => (a.late_min ?? 0) <= 5).length;
        const late = dayAtt.filter((a) => (a.late_min ?? 0) > 5).length;

        const dayLeaves = (db.leave_requests ?? []).filter(
          (l) => l.tenant_id === t && l.status === "approved" && l.start_date <= dateStr && l.end_date >= dateStr && (!p_branch || l.branch_id === p_branch)
        );
        const leaveCount = dayLeaves.length;
        const totalExpected = Math.max(dayAtt.length + leaveCount, totalCashiers || 2);
        const absent = Math.max(0, totalExpected - dayAtt.length - leaveCount);

        attendanceTrend.push({
          date: dateStr,
          label: dayLabel,
          on_time: onTime,
          late,
          leave: leaveCount,
          absent
        });
      }

      // ── CHART 2: LABOUR COST % VS OMZET PER BRANCH ──
      const branchLabourStats = (db.branches ?? [])
        .filter((b) => b.tenant_id === t && !b.is_warehouse)
        .map((b) => {
          const bStaff = staffCashiers.filter((c) => c.branch_id === b.id);
          const monthlySalarySum = bStaff.reduce((sum, c) => sum + (c.base_salary || 4200000), 0);

          // Omzet cabang dari database orders
          const bOrders = (db.orders ?? []).filter((o) => o.branch_id === b.id && o.status === "paid");
          const bRevenue = bOrders.reduce((sum, o) => sum + (o.total || 0), 0) || (monthlySalarySum * 5.2);
          const labourPct = bRevenue > 0 ? Math.min(100, Math.round((monthlySalarySum / bRevenue) * 100)) : 0;

          return {
            branch_id: b.id,
            branch_name: b.name,
            total_staff: bStaff.length,
            total_salary: monthlySalarySum,
            revenue: bRevenue,
            labour_pct: labourPct,
            target_pct: 18,
            is_efficient: labourPct <= 22
          };
        });

      // ── 5 OPERATIONAL WIDGETS ──
      // Widget 1: Roster Operasional Hari Ini per Cabang
      const liveRoster = todayShifts.map((w) => {
        const staff = (db.profiles ?? []).find((p) => p.id === w.profile_id);
        const branch = (db.branches ?? []).find((b) => b.id === w.branch_id);
        const att = todayAttendance.find((a) => a.profile_id === w.profile_id && a.kind === "in");

        let statusColor = "gray"; // shift mendatang
        let statusText = "Shift Mendatang";
        let lateMin = 0;

        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = (w.start_time || "08:00").split(":").map(Number);
        const shiftStartMins = sh * 60 + sm;

        if (att) {
          if ((att.late_min ?? 0) > 5) {
            statusColor = "yellow";
            statusText = `Terlambat ${att.late_min}m`;
            lateMin = att.late_min;
          } else {
            statusColor = "green";
            statusText = "Hadir Tepat Waktu";
          }
        } else if (currentMins > shiftStartMins + 15) {
          statusColor = "pulsing-red";
          statusText = `Belum Hadir (> ${currentMins - shiftStartMins}m)`;
        }

        return {
          id: w.id,
          branch_name: branch?.name ?? "Semua",
          profile_id: w.profile_id,
          full_name: staff?.full_name ?? "Belum Ditugaskan (Shift Kosong)",
          shift_time: `${(w.start_time || "").slice(0, 5)} - ${(w.end_time || "").slice(0, 5)}`,
          status_color: statusColor,
          status_text: statusText,
          clock_in_at: att?.created_at ? new Date(att.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null,
          late_min: lateMin
        };
      });

      // Widget 2: Log Anomali Presensi
      const anomalyLogs = (db.attendance ?? [])
        .filter((a) => a.tenant_id === t && ((a.distance_m ?? 0) > 50 || (a.accuracy_m ?? 0) > 50 || (a.late_min ?? 0) > 15))
        .slice(0, 6)
        .map((a) => {
          const profile = (db.profiles ?? []).find((p) => p.id === a.profile_id);
          const branch = (db.branches ?? []).find((b) => b.id === a.branch_id);
          const reasons = [];
          if ((a.distance_m ?? 0) > 50) reasons.push(`Jarak ${a.distance_m}m (Luar Radius)`);
          if ((a.accuracy_m ?? 0) > 50) reasons.push(`Akurasi GPS Rendah (±${a.accuracy_m}m)`);
          if ((a.late_min ?? 0) > 15) reasons.push(`Terlambat Ekstrem (${a.late_min} menit)`);

          return {
            id: a.id,
            profile_id: a.profile_id,
            full_name: profile?.full_name ?? "Kasir",
            branch_name: branch?.name ?? "Cabang",
            kind: a.kind,
            time: new Date(a.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }),
            distance_m: a.distance_m,
            accuracy_m: a.accuracy_m,
            selfie_url: a.selfie_path,
            lat: a.lat,
            lng: a.lng,
            reasons
          };
        });

      // Widget 3: Antrean Persetujuan Cepat (Fast Approval Queue)
      const fastApprovals = [];
      (db.leave_requests ?? []).filter((l) => l.tenant_id === t && l.status === "pending").forEach((l) => {
        const p = (db.profiles ?? []).find((x) => x.id === l.profile_id);
        const ageHours = Math.round((Date.now() - new Date(l.created_at).getTime()) / HOUR);
        fastApprovals.push({
          id: l.id,
          type: "leave",
          title: `Permohonan Cuti (${l.category}) · ${p?.full_name ?? "Staf"}`,
          meta: `${l.start_date} s.d ${l.end_date} (${l.days_count} hari) — "${l.reason}"`,
          waiting_hours: ageHours,
          is_sla_overdue: ageHours >= 24,
          created_at: l.created_at
        });
      });
      (db.shift_swaps ?? []).filter((s) => s.tenant_id === t && s.status === "accepted").forEach((s) => {
        const req = (db.profiles ?? []).find((x) => x.id === s.requester_id);
        const tgt = (db.profiles ?? []).find((x) => x.id === s.target_id);
        const ageHours = Math.round((Date.now() - new Date(s.created_at).getTime()) / HOUR);
        fastApprovals.push({
          id: s.id,
          type: "swap",
          title: `Tukar Shift: ${req?.full_name ?? "Staf 1"} ⇄ ${tgt?.full_name ?? "Staf 2"}`,
          meta: `Alasan: "${s.reason ?? "Penyesuaian jadwal"}"`,
          waiting_hours: ageHours,
          is_sla_overdue: ageHours >= 24,
          created_at: s.created_at
        });
      });
      fastApprovals.sort((a, b) => b.waiting_hours - a.waiting_hours);

      // Widget 4: Compliance & Integrity Alerts
      const complianceAlerts = [];
      staffCashiers.forEach((c) => {
        const hasShift = (db.work_shifts ?? []).some((w) => w.profile_id === c.id);
        if (!hasShift) {
          complianceAlerts.push({
            id: `cmp-noshift-${c.id}`,
            level: "warn",
            message: `Kasir ${c.full_name} aktif namun belum memiliki jadwal shift kerja terdaftar.`
          });
        }
        if (!(c.base_salary > 0)) {
          complianceAlerts.push({
            id: `cmp-nosal-${c.id}`,
            level: "danger",
            message: `Kasir ${c.full_name} memiliki pengaturan gaji pokok Rp 0. Segera lengkapi oleh Owner.`
          });
        }
      });
      (db.staff_invites ?? []).filter((i) => i.tenant_id === t && !i.accepted_at && !i.revoked_at).forEach((i) => {
        const days = Math.round((Date.now() - new Date(i.sent_at).getTime()) / DAY);
        if (days >= 3) {
          complianceAlerts.push({
            id: `cmp-inv-${i.id}`,
            level: "warn",
            message: `Undangan kasir ${i.full_name} (${i.email}) pending lebih dari ${days} hari.`
          });
        }
      });

      // Widget 5: Analisis Komparatif Cabang
      const comparativeBranches = (db.branches ?? [])
        .filter((b) => b.tenant_id === t && !b.is_warehouse)
        .map((b) => {
          const bStaff = staffCashiers.filter((c) => c.branch_id === b.id);
          const bAtt = (db.attendance ?? []).filter((a) => a.branch_id === b.id && a.kind === "in");
          const bOnTime = bAtt.filter((a) => (a.late_min ?? 0) <= 5).length;
          const attendanceRate = bAtt.length > 0 ? Math.round((bOnTime / bAtt.length) * 100) : 100;
          const totalLateMin = bAtt.reduce((sum, a) => sum + (a.late_min ?? 0), 0);
          const avgLate = bAtt.length > 0 ? Math.round(totalLateMin / bAtt.length) : 0;
          const totalOvertimeHours = Math.round(bAtt.reduce((sum, a) => sum + (a.overtime_min ?? 0), 0) / 60);

          const lb = branchLabourStats.find((l) => l.branch_id === b.id);

          return {
            branch_id: b.id,
            branch_name: b.name,
            total_staff: bStaff.length,
            attendance_rate: attendanceRate,
            avg_late_minutes: avgLate,
            overtime_hours: totalOvertimeHours,
            labour_pct: lb?.labour_pct ?? 20
          };
        });

      return {
        metrics: {
          kasir_aktif: totalCashiers,
          hadir_hari_ini: hadirHariIni,
          belum_absen: belumAbsen,
          terlambat: terlambatHariIni,
          sedang_cuti: sedangCuti,
          shift_kosong: shiftKosong,
          approval_pending: totalApprovalPending,
          status_payroll: payrollStatus
        },
        cashier_kpis: cashierKpis,
        charts: {
          attendance_7d: attendanceTrend,
          labour_cost_branches: branchLabourStats,
          cashier_hours: cashierKpis.map((k) => ({
            name: k.full_name.split(" ")[0],
            regular_hours: Math.min(40, k.weekly_hours),
            overtime_hours: k.overtime_hours,
            is_overwork: k.is_overwork
          }))
        },
        widgets: {
          live_roster: liveRoster,
          anomalies: anomalyLogs,
          fast_approvals: fastApprovals.slice(0, 5),
          compliance_alerts: complianceAlerts,
          comparative_branches: comparativeBranches
        }
      };
    },

    // ── LEAVE MANAGEMENT RPCS ──
    request_leave({ p_category, p_start_date, p_end_date, p_days, p_reason, p_attachment = null, p_profile_id = null }) {
      need(13, "c");
      const t = user().tenant_id;
      const targetProfileId = (role() === "owner" || role() === "gm") && p_profile_id ? p_profile_id : user().id;
      const targetProfile = db.profiles.find((p) => p.id === targetProfileId);

      if (!["CT", "IZ", "SK", "ML", "IT", "PC", "DL", "TB"].includes(p_category)) err("Kategori cuti/izin tidak valid");
      if (!p_start_date || !p_end_date) err("Tanggal mulai dan tanggal selesai wajib diisi");
      if (p_start_date > p_end_date) err("Tanggal mulai tidak boleh melebihi tanggal selesai");
      if (!p_reason || p_reason.trim().length < 5) err("Alasan permohonan wajib diisi (minimal 5 karakter)");
      if (p_category === "SK" && !p_attachment) err("Surat Keterangan Dokter wajib dilampirkan untuk cuti sakit");

      const daysCount = Number(p_days) || 1;

      // Cek sisa kuota jika Cuti Tahunan (CT)
      const balance = db.leave_balances.find((b) => b.profile_id === targetProfileId);
      if (p_category === "CT" && balance && balance.remaining_days < daysCount) {
        err(`Sisa kuota cuti tahunan tidak mencukupi (${balance.remaining_days} hari tersisa, diajukan ${daysCount} hari)`);
      }

      const req = {
        id: id(),
        tenant_id: t,
        branch_id: targetProfile?.branch_id ?? B1,
        profile_id: targetProfileId,
        category: p_category,
        start_date: p_start_date,
        end_date: p_end_date,
        days_count: daysCount,
        reason: p_reason.trim(),
        attachment_url: p_attachment ?? null,
        status: "pending",
        created_at: nowIso(),
        approved_by: null,
        approved_at: null,
        reject_reason: null
      };

      db.leave_requests.unshift(req);

      // Mutasi saldo pending jika CT
      if (balance && p_category === "CT") {
        balance.pending_days += daysCount;
        balance.remaining_days = Math.max(0, balance.annual_quota - balance.used_days - balance.pending_days);
      }

      // Tambahkan ke unified approvals agar muncul di Pusat Persetujuan
      db.approvals ??= [];
      db.approvals.unshift({
        id: id(),
        tenant_id: t,
        branch_id: req.branch_id,
        feature: 13,
        kind: "leave",
        ref: `CUTI-${p_category}-${req.id.slice(0, 6).toUpperCase()}`,
        title: `Permohonan Cuti/Izin (${p_category}) · ${targetProfile?.full_name ?? "Staf"}`,
        amount: null,
        detail: {
          leave_id: req.id,
          category: p_category,
          start_date: p_start_date,
          end_date: p_end_date,
          days_count: daysCount,
          alasan: req.reason,
          attachment_url: req.attachment_url
        },
        status: "pending",
        requested_at: req.created_at,
        requested_by: targetProfileId
      });

      audit("leave_requested", "leave_requests", req.id, { category: p_category, days: daysCount, profile: targetProfileId }, t);
      return done(structuredClone(req), ["leave_requests", "leave_balances", "approvals"]);
    },

    decide_leave({ p_id, p_decision, p_reason = null }) {
      need(13, "u");
      if (!["approved", "rejected"].includes(p_decision)) err("Keputusan harus disetujui atau ditolak");
      if (p_decision === "rejected" && (!p_reason || p_reason.trim().length < 5)) err("Alasan penolakan wajib diisi (min. 5 karakter)");

      const req = (db.leave_requests ?? []).find((l) => l.id === p_id);
      if (!req) err("Permohonan cuti tidak ditemukan");
      if (req.status !== "pending") err("Permohonan cuti sudah diproses sebelumnya");

      const balance = (db.leave_balances ?? []).find((b) => b.profile_id === req.profile_id);

      req.status = p_decision;
      req.approved_by = user().id;
      req.approved_at = nowIso();
      req.reject_reason = p_decision === "rejected" ? p_reason.trim() : null;

      if (balance && req.category === "CT") {
        balance.pending_days = Math.max(0, balance.pending_days - req.days_count);
        if (p_decision === "approved") {
          balance.used_days += req.days_count;
        }
        balance.remaining_days = Math.max(0, balance.annual_quota - balance.used_days - balance.pending_days);
      }

      // Update item approvals yang bersesuaian jika ada
      const appItem = (db.approvals ?? []).find((a) => a.kind === "leave" && a.detail?.leave_id === req.id);
      if (appItem && appItem.status === "pending") {
        appItem.status = p_decision;
        appItem.decided_by = user().id;
        appItem.decided_at = nowIso();
        appItem.decision_note = p_reason;
      }

      // Jika disetujui, batalkan jadwal shift yang bentrok secara otomatis
      if (p_decision === "approved") {
        const conflictingShifts = (db.work_shifts ?? []).filter(
          (w) => w.profile_id === req.profile_id && w.work_date >= req.start_date && w.work_date <= req.end_date
        );
        conflictingShifts.forEach((w) => {
          w.profile_id = null;
          w.notes = `Dibatalkan otomatis: Kasir sedang cuti (${req.category})`;
        });
      }

      audit("leave_decided", "leave_requests", req.id, { decision: p_decision, reason: p_reason }, req.tenant_id);
      return done(structuredClone(req), ["leave_requests", "leave_balances", "work_shifts", "approvals"]);
    },

    adjust_leave_balance({ p_profile_id, p_delta, p_memo }) {
      need(13, "u");
      if (!p_memo || p_memo.trim().length < 5) err("Dasar memo penyesuaian cuti wajib dicantumkan");
      let b = (db.leave_balances ?? []).find((x) => x.profile_id === p_profile_id);
      if (!b) {
        b = {
          id: id(),
          tenant_id: user().tenant_id,
          profile_id: p_profile_id,
          annual_quota: 12,
          used_days: 0,
          pending_days: 0,
          remaining_days: 12,
          adjustments: []
        };
        db.leave_balances.push(b);
      }
      const deltaNum = Number(p_delta) || 0;
      b.annual_quota += deltaNum;
      b.remaining_days = Math.max(0, b.annual_quota - b.used_days - b.pending_days);
      b.adjustments.push({
        delta: deltaNum,
        memo: p_memo.trim(),
        adjusted_by: user().id,
        created_at: nowIso()
      });
      audit("leave_balance_adjusted", "leave_balances", b.id, { delta: deltaNum, memo: p_memo }, b.tenant_id);
      return done(structuredClone(b), ["leave_balances"]);
    },

    // ── KNOWLEDGE FORMS & QUIZ RPCS ──
    save_knowledge_form({ p_form }) {
      need(13, "c");
      if (!p_form.title || p_form.title.trim().length < 3) err("Judul formulir wajib diisi");
      if (!["checklist", "quiz", "sop", "survey"].includes(p_form.form_type)) err("Tipe formulir tidak valid");
      if (!Array.isArray(p_form.questions) || p_form.questions.length === 0) err("Formulir harus memiliki minimal 1 pertanyaan / butir periksa");

      const t = user().tenant_id;
      let formItem = p_form.id ? (db.knowledge_forms ?? []).find((f) => f.id === p_form.id) : null;
      if (formItem) {
        Object.assign(formItem, {
          title: p_form.title.trim(),
          description: p_form.description ?? "",
          form_type: p_form.form_type,
          target_type: p_form.target_type ?? "all",
          target_branch_id: p_form.target_branch_id ?? null,
          passing_grade: Number(p_form.passing_grade) || 80,
          frequency: p_form.frequency ?? "one_off",
          deadline: p_form.deadline ?? null,
          questions: p_form.questions,
          status: p_form.status ?? "active"
        });
      } else {
        formItem = {
          id: id(),
          tenant_id: t,
          title: p_form.title.trim(),
          description: p_form.description ?? "",
          form_type: p_form.form_type,
          target_type: p_form.target_type ?? "all",
          target_branch_id: p_form.target_branch_id ?? null,
          passing_grade: Number(p_form.passing_grade) || 80,
          frequency: p_form.frequency ?? "one_off",
          deadline: p_form.deadline ?? null,
          questions: p_form.questions,
          status: "active",
          created_by: user().id,
          created_at: nowIso()
        };
        db.knowledge_forms.unshift(formItem);
      }

      audit("knowledge_form_saved", "knowledge_forms", formItem.id, { title: formItem.title }, t);
      return done(structuredClone(formItem), ["knowledge_forms"]);
    },

    delete_knowledge_form({ p_id }) {
      need(13, "d");
      const t = user().tenant_id;
      const idx = (db.knowledge_forms ?? []).findIndex((f) => f.id === p_id && f.tenant_id === t);
      if (idx !== -1) {
        db.knowledge_forms.splice(idx, 1);
      }
      return done(true, ["knowledge_forms"]);
    },

    submit_knowledge_response({ p_form_id, p_answers }) {
      need(13, "c");
      const form = (db.knowledge_forms ?? []).find((f) => f.id === p_form_id);
      if (!form) err("Formulir tidak ditemukan");

      // Hitung skor jika kuis
      let score = 100;
      let passed = true;

      if (form.form_type === "quiz") {
        let earnedPoints = 0;
        let totalPossible = 0;

        form.questions.forEach((q) => {
          const pts = Number(q.points) || 25;
          totalPossible += pts;
          if (p_answers[q.id] !== undefined && Number(p_answers[q.id]) === Number(q.correct_index)) {
            earnedPoints += pts;
          }
        });

        score = totalPossible > 0 ? Math.round((earnedPoints / totalPossible) * 100) : 100;
        passed = score >= (form.passing_grade ?? 80);
      }

      const response = {
        id: id(),
        tenant_id: form.tenant_id,
        form_id: form.id,
        profile_id: user().id,
        answers: p_answers,
        score,
        passed,
        evaluator_note: null,
        submitted_at: nowIso()
      };

      db.knowledge_responses.unshift(response);
      audit("knowledge_response_submitted", "knowledge_responses", response.id, { form_id: form.id, score }, form.tenant_id);
      return done(structuredClone(response), ["knowledge_responses"]);
    },

    acknowledge_sop({ p_sop_id }) {
      need(13, "c");
      const sop = (db.knowledge_forms ?? []).find((f) => f.id === p_sop_id && f.form_type === "sop");
      if (!sop) err("Dokumen SOP tidak ditemukan");

      const already = (db.knowledge_reads ?? []).find((r) => r.sop_id === p_sop_id && r.profile_id === user().id);
      if (already) return done(structuredClone(already), ["knowledge_reads"]);

      const readRec = {
        id: id(),
        tenant_id: sop.tenant_id,
        sop_id: sop.id,
        profile_id: user().id,
        read_at: nowIso(),
        ip_address: "127.0.0.1 (Web Session)"
      };

      db.knowledge_reads.unshift(readRec);
      audit("sop_acknowledged", "knowledge_reads", readRec.id, { sop_id: sop.id }, sop.tenant_id);
      return done(structuredClone(readRec), ["knowledge_reads"]);
    }
  };

  return { RPC };
}
