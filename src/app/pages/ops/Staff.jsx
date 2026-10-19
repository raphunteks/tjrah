import { useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { ROLE_LABEL } from "../../../lib/rbac-matrix.js";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Empty, Badge, clearAsyncCache } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex, useBranch, useLive } from "../../ops.jsx";
import { generateTempPassword, copyToClipboard } from "../../../lib/passwordGenerator.js";
import AssignBranches from "../service/AssignBranches.jsx";
import { branchesOfPerson } from "../service/shared.jsx";
import { useAccountLang, t } from "../account/i18n.js";

// RFC 5322 email regex validator
const RFC5322_EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const SHIFT_ROTATION_MODELS = [
  {
    id: "model_a",
    name: "Model A · Rolling Mingguan (Bertukar Shift Tiap Minggu)",
    desc: "Minggu 1: Kasir A Pagi & Kasir B Closing. Minggu 2: Otomatis bertukar (Kasir A Closing & Kasir B Pagi). Standar kafe/resto terpopuler.",
  },
  {
    id: "model_b",
    name: "Model B · Selang-Seling Harian (1-1)",
    desc: "Hari ini Kasir A Pagi & Kasir B Closing. Besoknya langsung bertukar: Kasir A Closing & Kasir B Pagi.",
  },
  {
    id: "model_c",
    name: "Model C · 5 Hari Kerja + 1 Hari Libur Bergilir",
    desc: "Siklus 5 hari kerja dan 1 hari libur bergantian antar staf agar outlet tidak pernah kekurangan kasir.",
  },
  {
    id: "model_d",
    name: "Model D · Rotasi Maju 3 Shift 24 Jam (Pagi - Siang - Malam - Libur)",
    desc: "Siklus rotasi maju 4 hari untuk gerai/apotek 24 jam. Jam biologis staf tetap segar karena rotasi selalu maju.",
  },
  {
    id: "model_e",
    name: "Model E · Pola Kontinental 2-2-3 (Coffee Shop & Hospitality)",
    desc: "2 hari Pagi, 2 hari Closing, 3 hari Libur. Menjamin staf dapat jatah long weekend 3 hari bergantian tiap 2 minggu.",
  },
  {
    id: "model_f",
    name: "Model F · Khusus Beban Puncak Weekend (Jumat - Minggu)",
    desc: "Senin-Kamis ritme santai dengan libur bergilir hari biasa. Jumat-Minggu full team turun serentak di jam sibuk.",
  },
  {
    id: "model_g",
    name: "Model G · Jam Sibuk Terbelah (Split Shift Resto 2-Peak)",
    desc: "Masuk saat Lunch Rush (10:30-14:30), istirahat 3 jam, lalu masuk Dinner Rush (17:30-21:30). Efisiensi staf rumah makan.",
  },
  {
    id: "model_h",
    name: "Model H · Rotasi Adil Libur Hari Minggu",
    desc: "Setiap kasir mendapat jatah libur hari Minggu secara bergiliran adil setiap minggunya tanpa kecemburuan.",
  },
];

export function generateRollingShifts({
  staffIds = [],
  branchId,
  tenantId,
  startDate,
  daysCount = 30,
  model = "model_a",
  shiftSlots = [],
  lateTolMinutes = 15,
  autoClockout = true,
  autoDelayMinutes = 30,
}) {
  const shifts = [];
  const start = new Date(startDate);
  const nStaff = staffIds.length;
  if (nStaff === 0) return [];

  for (let d = 0; d < daysCount; d++) {
    const curDate = new Date(start);
    curDate.setDate(curDate.getDate() + d);
    const dateStr = curDate.toISOString().slice(0, 10);
    const dayOfWeek = curDate.getDay(); // 0=Min, 1=Sen, ..., 6=Sab
    const weekIdx = Math.floor(d / 7);

    staffIds.forEach((staffId, staffIdx) => {
      let assignedShift = null;

      if (model === "model_a") {
        // Model A · Rolling Mingguan: Bertukar tiap Senin
        if (dayOfWeek !== 0) {
          const sIdx = (staffIdx + weekIdx) % shiftSlots.length;
          assignedShift = shiftSlots[sIdx];
        }
      } else if (model === "model_b") {
        // Model B · Selang-seling Harian (1-1)
        if (dayOfWeek !== 0) {
          const sIdx = (staffIdx + d) % shiftSlots.length;
          assignedShift = shiftSlots[sIdx];
        }
      } else if (model === "model_c") {
        // Model C · 5 Hari Kerja + 1 Hari Libur Bergilir (siklus 6 hari)
        const isOff = (d + staffIdx * 2) % 6 === 5;
        if (!isOff) {
          const sIdx = (staffIdx + weekIdx) % shiftSlots.length;
          assignedShift = shiftSlots[sIdx];
        }
      } else if (model === "model_d") {
        // Model D · Rotasi Maju 3 Shift 24 Jam (Pagi, Siang, Malam, Libur - siklus 4 hari)
        const phase = (d + staffIdx) % 4;
        if (phase < 3 && shiftSlots[phase]) {
          assignedShift = shiftSlots[phase];
        }
      } else if (model === "model_e") {
        // Model E · Pola Kontinental 2-2-3 (siklus 14 hari)
        const pattern = ["pagi", "pagi", "closing", "closing", "off", "off", "off", "off", "off", "pagi", "pagi", "closing", "closing", "closing"];
        const dayInCycle = (d + staffIdx * 7) % 14;
        const code = pattern[dayInCycle];
        if (code === "pagi") assignedShift = shiftSlots[0];
        else if (code === "closing") assignedShift = shiftSlots[1] || shiftSlots[0];
      } else if (model === "model_f") {
        // Model F · Khusus Beban Puncak Weekend (Jumat-Minggu full team)
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
        if (isWeekend) {
          const sIdx = staffIdx % shiftSlots.length;
          assignedShift = shiftSlots[sIdx];
        } else {
          const offStaffIdx = (dayOfWeek - 1) % nStaff;
          if (staffIdx !== offStaffIdx) {
            assignedShift = shiftSlots[0];
          }
        }
      } else if (model === "model_g") {
        // Model G · Jam Sibuk Terbelah (Split Shift)
        if (dayOfWeek !== 0) {
          assignedShift = { start_time: "10:30:00", end_time: "21:30:00", label: "Split Shift (Lunch & Dinner)" };
        }
      } else if (model === "model_h") {
        // Model H · Rotasi Adil Libur Hari Minggu
        const isSunday = dayOfWeek === 0;
        if (isSunday) {
          const offStaffThisSun = weekIdx % nStaff;
          if (staffIdx !== offStaffThisSun) {
            assignedShift = shiftSlots[staffIdx % shiftSlots.length];
          }
        } else {
          const sIdx = (staffIdx + weekIdx) % shiftSlots.length;
          assignedShift = shiftSlots[sIdx];
        }
      }

      if (assignedShift) {
        shifts.push({
          tenant_id: tenantId,
          profile_id: staffId,
          branch_id: branchId,
          work_date: dateStr,
          start_time: assignedShift.start_time,
          end_time: assignedShift.end_time,
          late_tolerance_min: lateTolMinutes,
          auto_clockout: autoClockout,
          auto_clockout_delay_min: autoDelayMinutes,
        });
      }
    });
  }
  return shifts;
}

// Pengelompokan cerdas Roster Jadwal Shift Kasir (Menyatukan rotasi multi-shift per staf dalam 1 baris ringkas terpadu)
export function groupShiftsBySchedule(shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) return [];

  // Urutkan berdasarkan profil, cabang, dan tanggal kerja
  const sorted = [...shifts].sort((a, b) => {
    if (a.profile_id !== b.profile_id) return (a.profile_id || "").localeCompare(b.profile_id || "");
    if (a.branch_id !== b.branch_id) return (a.branch_id || "").localeCompare(b.branch_id || "");
    const dateA = typeof a.work_date === "string" ? a.work_date.slice(0, 10) : "";
    const dateB = typeof b.work_date === "string" ? b.work_date.slice(0, 10) : "";
    return dateA.localeCompare(dateB);
  });

  const groups = [];

  sorted.forEach((shift) => {
    const sDate = typeof shift.work_date === "string" ? shift.work_date.slice(0, 10) : "";

    // Kelompokkan per kasir (profile_id) & cabang (branch_id) dalam satu rangkaian roster
    // (JANGAN pisahkan grup berdasarkan jam kerja agar rotasi harian/mingguan Model A-H tetap dalam 1 roster kasir terpadu)
    const existing = groups.find((g) => {
      if (g.profile_id !== shift.profile_id || g.branch_id !== shift.branch_id) {
        return false;
      }
      const lastDate = new Date(g.dates[g.dates.length - 1]);
      const curDate = new Date(sDate);
      const diffDays = Math.round((curDate - lastDate) / (1000 * 60 * 60 * 24));
      return diffDays <= 14;
    });

    if (existing) {
      existing.shifts.push(shift);
      if (!existing.dates.includes(sDate)) {
        existing.dates.push(sDate);
      }
    } else {
      groups.push({
        id: `grp_${shift.profile_id}_${shift.branch_id}_${shift.id}`,
        profile_id: shift.profile_id,
        branch_id: shift.branch_id,
        late_tolerance_min: shift.late_tolerance_min,
        auto_clockout: shift.auto_clockout,
        auto_clockout_delay_min: shift.auto_clockout_delay_min,
        shifts: [shift],
        dates: [sDate],
      });
    }
  });

  const today = (() => {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();

  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    try {
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  })();

  return groups.map((g) => {
    const minDate = g.dates[0];
    const maxDate = g.dates[g.dates.length - 1];
    const totalDaysSpan = Math.max(1, Math.round((new Date(maxDate) - new Date(minDate)) / (1000 * 60 * 60 * 24)) + 1);
    const count = g.shifts.length;

    // Kumpulkan seluruh jam kerja unik dalam roster ini
    const timeMap = {};
    g.shifts.forEach((s) => {
      const startTime = (s.start_time || "").slice(0, 5);
      const endTime = (s.end_time || "").slice(0, 5);
      const key = `${startTime} - ${endTime}`;
      timeMap[key] = (timeMap[key] || 0) + 1;
    });

    const distinctTimes = Object.entries(timeMap).map(([timeStr, shiftCount]) => ({
      time: timeStr,
      count: shiftCount,
    }));

    const isRotating = distinctTimes.length > 1;

    let durationLabel = "";
    if (totalDaysSpan >= 80) durationLabel = `3 Bulan (${totalDaysSpan} Hari)`;
    else if (totalDaysSpan >= 25) durationLabel = `1 Bulan (${totalDaysSpan} Hari)`;
    else if (totalDaysSpan >= 12) durationLabel = `2 Minggu (${totalDaysSpan} Hari)`;
    else if (totalDaysSpan >= 6) durationLabel = `1 Minggu (${totalDaysSpan} Hari)`;
    else if (count === 1) durationLabel = `1 Hari (Harian)`;
    else durationLabel = `${totalDaysSpan} Hari`;

    // Cek penugasan shift hari ini & besok
    const todayShift = g.shifts.find((s) => (s.work_date || "").slice(0, 10) === today);
    const tomorrowShift = g.shifts.find((s) => (s.work_date || "").slice(0, 10) === tomorrow);

    let statusLabel = "";
    let statusTone = "neutral";
    let statusDesc = "";

    if (today >= minDate && today <= maxDate) {
      const passedDays = Math.max(1, Math.round((new Date(today) - new Date(minDate)) / (1000 * 60 * 60 * 24)) + 1);
      if (todayShift) {
        statusLabel = "Aktif · Berjalan";
        statusTone = "ok";
        statusDesc = `Hari ke-${passedDays} dari ${totalDaysSpan} hari · Shift: ${(todayShift.start_time || "").slice(0, 5)} - ${(todayShift.end_time || "").slice(0, 5)}`;
      } else {
        statusLabel = "Aktif (Libur Roster)";
        statusTone = "accent";
        statusDesc = `Hari ke-${passedDays} dari ${totalDaysSpan} hari · Hari ini libur`;
      }
    } else if (today < minDate) {
      const daysUntil = Math.round((new Date(minDate) - new Date(today)) / (1000 * 60 * 60 * 24));
      statusLabel = "Akan Datang";
      statusTone = "warn";
      statusDesc = daysUntil === 1 ? "Dimulai besok" : `Dimulai dalam ${daysUntil} hari lagi`;
    } else {
      statusLabel = "Selesai / Terlewat";
      statusTone = "neutral";
      statusDesc = `Berakhir pada ${date(maxDate)}`;
    }

    // Mini strip 7 hari ke depan (H+0 s/d H+6)
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const curDateStr = (() => {
        try {
          return d.toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
        } catch {
          return d.toISOString().slice(0, 10);
        }
      })();
      const dayName = (() => {
        try {
          return d.toLocaleDateString("id-ID", { weekday: "short", timeZone: "Asia/Makassar" });
        } catch {
          return ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][d.getDay()];
        }
      })();
      const dayDateNum = d.getDate();
      const s = g.shifts.find((x) => (x.work_date || "").slice(0, 10) === curDateStr);
      next7Days.push({
        dateStr: curDateStr,
        dayName,
        dayDateNum,
        isToday: i === 0,
        shiftTime: s ? `${(s.start_time || "").slice(0, 5)}-${(s.end_time || "").slice(0, 5)}` : null,
      });
    }

    return {
      ...g,
      minDate,
      maxDate,
      totalDaysSpan,
      shiftCount: count,
      offDaysCount: Math.max(0, totalDaysSpan - count),
      durationLabel,
      distinctTimes,
      isRotating,
      todayShift,
      tomorrowShift,
      next7Days,
      statusLabel,
      statusTone,
      statusDesc,
    };
  }).sort((a, b) => b.maxDate.localeCompare(a.maxDate));
}

export default function Staff() {
  const { api, role, tenantId } = useAuth();
  const { lang } = useAccountLang();
  const isOwner = role === "owner";

  const r = useAsync(async () => {
    const [people, branches, shifts, att, mb] = await Promise.all([
      api.list("profiles", { eq: { tenant_id: tenantId }, order: ["full_name"], force: true }),
      api.list("branches", { eq: { tenant_id: tenantId } }),
      api.list("work_shifts", { eq: { tenant_id: tenantId }, order: ["work_date"], force: true }),
      api.list("attendance", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 30, force: true }),
      api.list("member_branches", { eq: { tenant_id: tenantId }, force: true }).catch(() => []),
    ]);
    return { people, branches, shifts, att, mb };
  }, [api, tenantId], { key: `staff@${tenantId}` });

  // Realtime subscription ke tabel profil, jadwal shift, dan absensi
  useLive(["profiles", "branches", "work_shifts", "attendance", "member_branches", "staff_invites"], () => {
    api.invalidateCache?.("profiles");
    api.invalidateCache?.("work_shifts");
    api.invalidateCache?.("attendance");
    r.reload();
  });

  const [ws, setWs] = useState(null);
  const [sal, setSal] = useState({});
  const [assign, setAssign] = useState(null); // { person, ids: Set }
  const [inv, setInv] = useState(null); // modal undang kasir baru
  const [invErr, setInvErr] = useState("");
  const [successModal, setSuccessModal] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [shiftViewMode, setShiftViewMode] = useState("summary"); // "summary" | "full"
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState(null);
  const [rosterModal, setRosterModal] = useState(null);

  const mine = useBranch();
  const branchesOf = (p) => branchesOfPerson(p, r.data?.mb ?? []);
  const canAssign = (p) => can(role, 13, "u") && ["gm", "staff", "dokter"].includes(p.role) && !(role === "gm" && p.role === "gm");
  const a = useAction();
  const ppl = useIndex(r.data?.people), br = useIndex(r.data?.branches);

  const toggleGroupExpand = (groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const groupedShifts = useMemo(() => {
    return groupShiftsBySchedule(r.data?.shifts || []);
  }, [r.data?.shifts]);

  const deleteGroupShifts = (group) => a.run(async () => {
    if (!group || !group.shifts || group.shifts.length === 0) return;
    const shiftIds = group.shifts.map((s) => s.id);
    if (api.removeMany) {
      await api.removeMany("work_shifts", shiftIds);
    } else {
      for (const sId of shiftIds) {
        await api.remove("work_shifts", sId).catch(() => {});
      }
    }
    clearAsyncCache(`staff@${tenantId}`);
    api.invalidateCache?.("work_shifts");
    setGroupDeleteConfirm(null);
    r.reload();
  }, `Berhasil menghapus ${group.shifts.length} jadwal shift untuk ${ppl[group.profile_id]?.full_name || "Kasir"}`);

  const openInvite = () => {
    const defaultBranch = mine.options.find((x) => !x.is_warehouse)?.id || mine.options[0]?.id || "";
    setInv({ name: "", email: "", phone: "+62", branch_id: defaultBranch });
    setInvErr("");
  };

  const todayMakassar = (() => {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  })();

  const [rolling, setRolling] = useState(null);

  const openNewShift = () => {
    const defaultBranch = r.data?.branches?.find((x) => !x.is_warehouse)?.id || r.data?.branches?.[0]?.id || "";
    setWs({
      profile_id: "",
      branch_id: defaultBranch,
      work_date: todayMakassar,
      start_time: "08:00",
      end_time: "16:00",
      late_tolerance_val: 15,
      late_tolerance_unit: "min",
      auto_clockout: false,
      auto_clockout_delay_val: 30,
      auto_clockout_delay_unit: "min",
      is_recurring: false,
      recurring_duration: "1month",
      recurring_days: [1, 2, 3, 4, 5, 6], // Sen - Sab
    });
  };

  const openEditShift = (s) => {
    const tolMin = s.late_tolerance_min ?? 15;
    const isTolHour = tolMin > 0 && tolMin % 60 === 0;
    const delayMin = s.auto_clockout_delay_min ?? 30;
    const isDelayHour = delayMin > 0 && delayMin % 60 === 0;

    setWs({
      id: s.id,
      profile_id: s.profile_id,
      branch_id: s.branch_id,
      work_date: s.work_date,
      start_time: s.start_time?.slice(0, 5) || "08:00",
      end_time: s.end_time?.slice(0, 5) || "16:00",
      late_tolerance_val: isTolHour ? tolMin / 60 : tolMin,
      late_tolerance_unit: isTolHour ? "hour" : "min",
      auto_clockout: Boolean(s.auto_clockout),
      auto_clockout_delay_val: isDelayHour ? delayMin / 60 : delayMin,
      auto_clockout_delay_unit: isDelayHour ? "hour" : "min",
      is_recurring: false,
      recurring_duration: "1month",
      recurring_days: [1, 2, 3, 4, 5, 6],
    });
  };

  const openAutoRolling = () => {
    const defaultBranch = r.data?.branches?.find((x) => !x.is_warehouse)?.id || r.data?.branches?.[0]?.id || "";
    const activeStaff = r.data?.people?.filter((p) => p.role === "staff") || [];

    setRolling({
      branch_id: defaultBranch,
      staff_ids: activeStaff.map((p) => p.id),
      start_date: todayMakassar,
      duration: "1month",
      model: "model_a",
      shift_slots: [
        { id: "1", label: "Shift Pagi", start_time: "08:00", end_time: "16:00" },
        { id: "2", label: "Shift Closing / Sore", start_time: "15:00", end_time: "23:00" },
      ],
      late_tolerance_val: 15,
      late_tolerance_unit: "min",
      auto_clockout: true,
      auto_clockout_delay_val: 30,
      auto_clockout_delay_unit: "min",
    });
  };

  // Buka modal untuk mengubah roster dan mensinkronkan seluruh staf dalam kelompok rotasi
  const handleEditGroupRoster = (group) => {
    const branchId = group.branch_id;
    const minD = group.minDate;
    const maxD = group.maxDate;

    // Temukan semua kelompok roster di cabang ini yang beririsan rentang tanggalnya (cohort rotasi bersama)
    const overlappingGroups = groupedShifts.filter((other) => {
      if (other.branch_id !== branchId) return false;
      return other.minDate <= maxD && other.maxDate >= minD;
    });

    const cohortStaffIds = Array.from(new Set(overlappingGroups.map((og) => og.profile_id)));
    if (!cohortStaffIds.includes(group.profile_id)) {
      cohortStaffIds.push(group.profile_id);
    }

    const shiftIdsToReplace = overlappingGroups.flatMap((og) => (og.shifts || []).map((s) => s.id));

    const times = group.distinctTimes || [];
    let shiftSlots = [];
    if (times.length > 0) {
      shiftSlots = times.map((t, idx) => {
        const parts = t.time.split(" - ");
        return {
          id: String(idx + 1),
          label: t.label || (idx === 0 ? "Shift Pagi" : idx === 1 ? "Shift Closing / Sore" : `Shift ${idx + 1}`),
          start_time: parts[0] || "08:00",
          end_time: parts[1] || "16:00",
        };
      });
    } else {
      shiftSlots = [
        { id: "1", label: "Shift Pagi", start_time: "08:00", end_time: "16:00" },
        { id: "2", label: "Shift Closing / Sore", start_time: "15:00", end_time: "23:00" },
      ];
    }

    const totalDays = group.totalDaysSpan || 30;
    let durationKey = "1month";
    let customDays = totalDays;
    if (totalDays === 7) durationKey = "1week";
    else if (totalDays === 14) durationKey = "2weeks";
    else if (totalDays === 30 || totalDays === 29 || totalDays === 31) durationKey = "1month";
    else if (totalDays === 60) durationKey = "2months";
    else {
      durationKey = "custom";
      customDays = totalDays;
    }

    setRolling({
      is_edit: true,
      original_group_id: group.id,
      shift_ids_to_replace: shiftIdsToReplace,
      branch_id: branchId,
      start_date: minD,
      staff_ids: cohortStaffIds,
      model: group.isRotating ? "model_b" : "model_a",
      duration: durationKey,
      custom_days: customDays,
      shift_slots: shiftSlots,
      late_tolerance_val: group.todayShift?.late_tolerance_min ?? 15,
      late_tolerance_unit: "min",
      auto_clockout: Boolean(group.todayShift?.auto_clockout),
      auto_clockout_delay_val: group.todayShift?.auto_clockout_delay_min ?? 30,
      auto_clockout_delay_unit: "min",
    });
  };

  const applyAutoRolling = () => a.run(async () => {
    if (!rolling) return;
    if (!rolling.branch_id) throw new Error("Pilih cabang outlet terlebih dahulu");
    if (!rolling.staff_ids || rolling.staff_ids.length < 2) {
      throw new Error("Pilih minimal 2 kasir/staf untuk rotasi selang-seling");
    }
    if (!rolling.start_date) throw new Error("Tanggal mulai rotasi wajib ditentukan");

    // Jika mode ubah/edit, hapus seluruh shift lama yang digantikan secara batch
    if (rolling.is_edit && rolling.shift_ids_to_replace && rolling.shift_ids_to_replace.length > 0) {
      if (api.removeMany) {
        await api.removeMany("work_shifts", rolling.shift_ids_to_replace);
      } else {
        for (const sId of rolling.shift_ids_to_replace) {
          await api.remove("work_shifts", sId).catch(() => {});
        }
      }
    }

    const daysCount = rolling.duration === "custom"
      ? Math.max(1, Number(rolling.custom_days || 30))
      : (rolling.duration === "1week" ? 7 : rolling.duration === "2weeks" ? 14 : rolling.duration === "2months" ? 60 : 30);

    const shiftSlots = (rolling.shift_slots && rolling.shift_slots.length > 0)
      ? rolling.shift_slots.map((s, idx) => ({
          start_time: (s.start_time || "08:00").length === 5 ? `${s.start_time}:00` : s.start_time,
          end_time: (s.end_time || "16:00").length === 5 ? `${s.end_time}:00` : s.end_time,
          label: s.label || `Shift ${idx + 1}`,
        }))
      : [
          { start_time: "08:00:00", end_time: "16:00:00", label: "Pagi" },
          { start_time: "15:00:00", end_time: "23:00:00", label: "Closing" },
        ];

    const lateTolMinutes = rolling.late_tolerance_unit === "hour"
      ? Math.round(Number(rolling.late_tolerance_val || 0) * 60)
      : Math.round(Number(rolling.late_tolerance_val || 0));

    const autoDelayMinutes = rolling.auto_clockout_delay_unit === "hour"
      ? Math.round(Number(rolling.auto_clockout_delay_val || 0) * 60)
      : Math.round(Number(rolling.auto_clockout_delay_val || 0));

    const shifts = generateRollingShifts({
      staffIds: rolling.staff_ids,
      branchId: rolling.branch_id,
      tenantId: tenantId,
      startDate: rolling.start_date,
      daysCount: daysCount,
      model: rolling.model,
      shiftSlots: shiftSlots,
      lateTolMinutes,
      autoClockout: Boolean(rolling.auto_clockout),
      autoDelayMinutes,
    });

    if (shifts.length === 0) throw new Error("Tidak ada jadwal yang dapat di-generate untuk parameter ini");

    // Insert batch ke database (dipaketkan dalam chunk 50 per request)
    if (api.insertMany) {
      for (let i = 0; i < shifts.length; i += 50) {
        const chunk = shifts.slice(i, i + 50);
        await api.insertMany("work_shifts", chunk);
      }
    } else {
      for (let i = 0; i < shifts.length; i += 20) {
        const chunk = shifts.slice(i, i + 20);
        await Promise.all(chunk.map((s) => api.insert("work_shifts", s)));
      }
    }

    clearAsyncCache(`staff@${tenantId}`);
    setRolling(null);
    r.reload();
  }, rolling?.is_edit ? "Jadwal roster berhasil disinkronkan & diperbarui!" : "Auto-Rolling jadwal shift berhasil diterapkan!");

  const saveShift = () => a.run(async () => {
    if (!ws.profile_id) throw new Error("Pilih kasir/staf terlebih dahulu");
    if (!ws.work_date) throw new Error("Tanggal shift wajib diisi");
    if (!ws.start_time || !ws.end_time) throw new Error("Jam mulai dan jam selesai wajib diisi");
    if (!ws.branch_id) throw new Error("Cabang outlet wajib dipilih");

    const lateTolMinutes = ws.late_tolerance_unit === "hour"
      ? Math.round(Number(ws.late_tolerance_val || 0) * 60)
      : Math.round(Number(ws.late_tolerance_val || 0));

    const autoDelayMinutes = ws.auto_clockout_delay_unit === "hour"
      ? Math.round(Number(ws.auto_clockout_delay_val || 0) * 60)
      : Math.round(Number(ws.auto_clockout_delay_val || 0));

    const basePayload = {
      profile_id: ws.profile_id,
      branch_id: ws.branch_id,
      start_time: ws.start_time.length === 5 ? `${ws.start_time}:00` : ws.start_time,
      end_time: ws.end_time.length === 5 ? `${ws.end_time}:00` : ws.end_time,
      late_tolerance_min: lateTolMinutes,
      auto_clockout: Boolean(ws.auto_clockout),
      auto_clockout_delay_min: autoDelayMinutes,
    };

    if (ws.id) {
      await api.update("work_shifts", ws.id, { ...basePayload, work_date: ws.work_date });
    } else if (ws.is_recurring) {
      const daysCount = ws.recurring_duration === "1week" ? 7 : ws.recurring_duration === "2weeks" ? 14 : ws.recurring_duration === "3months" ? 90 : 30;
      const start = new Date(ws.work_date);
      const activeDays = new Set(ws.recurring_days || [1, 2, 3, 4, 5, 6]);
      const rowsToInsert = [];

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        if (activeDays.has(d.getDay())) {
          const dateStr = d.toISOString().slice(0, 10);
          rowsToInsert.push({
            ...basePayload,
            tenant_id: tenantId,
            work_date: dateStr,
          });
        }
      }

      if (rowsToInsert.length === 0) throw new Error("Pilih minimal satu hari kerja untuk pola berulang");

      for (const row of rowsToInsert) {
        await api.insert("work_shifts", row);
      }
      clearAsyncCache(`staff@${tenantId}`);
    } else {
      await api.insert("work_shifts", { ...basePayload, work_date: ws.work_date, tenant_id: tenantId });
      clearAsyncCache(`staff@${tenantId}`);
    }
    setWs(null);
    r.reload();
  }, ws?.id ? "Jadwal shift berhasil diperbarui" : ws?.is_recurring ? "Jadwal shift berulang berhasil dibuat dan diterapkan" : "Jadwal shift berhasil ditambahkan");

  const handlePhoneChange = (val) => {
    let clean = val.replace(/[^\d+]/g, "");
    if (!clean.startsWith("+62")) {
      clean = clean.replace(/^\+?62?|^0/, "");
      clean = "+62" + clean;
    }
    setInv((prev) => ({ ...prev, phone: clean }));
  };

  const submitInvite = () => a.run(async () => {
    if (!inv.name.trim()) throw new Error("Nama lengkap kasir wajib diisi");
    if (!RFC5322_EMAIL.test(inv.email.trim())) throw new Error("Format email tidak valid (sesuai standar RFC 5322)");
    if (!inv.branch_id) throw new Error("Wajib memilih satu cabang penugasan tunggal untuk kasir");

    const tempPass = generateTempPassword();
    const cleanEmail = inv.email.trim().toLowerCase();
    const cleanName = inv.name.trim();
    const targetBranch = r.data?.branches?.find((b) => b.id === inv.branch_id);
    const branchName = targetBranch?.name || "Cabang Penugasan";

    let emailStatus = "";

    // 1. Coba provision akun resmi & kirim email SMTP via endpoint server
    try {
      const invitePayload = {
        email: cleanEmail,
        fullName: cleanName,
        role: "staff",
        phone: inv.phone && inv.phone.length > 4 ? inv.phone : null,
        tenantId: tenantId,
        tenantName: "Tijarah Merchant",
        branches: [inv.branch_id],
        branchNames: [branchName],
        tempPassword: tempPass,
        loginUrl: window.location.origin + "/masuk",
        senderName: isOwner ? "Owner Usaha" : "General Manager"
      };

      const resp = await fetch("/api/invite-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invitePayload)
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.ok) {
        emailStatus = data.emailSent
          ? `Email kredensial terkirim ke ${cleanEmail}.`
          : `Akun aktif; kirim email (${data.emailError || "kendala SMTP"}).`;
      } else {
        // Fallback jika API invite mengembalikan error atau offline
        throw new Error(data?.error || "Gagal memproses via server invite");
      }
    } catch (srvErr) {
      // 2. Fallback pembuatan via Supabase RPC bila server Vite offline
      console.warn("[Staff] Fallback create_invite RPC:", srvErr.message);
      try {
        await api.rpc("create_invite", {
          p_email: cleanEmail,
          p_full_name: cleanName,
          p_role: "staff",
          p_branches: [inv.branch_id],
          p_phone: inv.phone && inv.phone.length > 4 ? inv.phone : null,
        });
      } catch (rpcErr) {
        // Jika sudah terdaftar, perbarui branch_id pada profile langsung
        if (rpcErr.message && rpcErr.message.includes("sudah terdaftar")) {
          const existing = r.data?.people?.find((p) => p.email?.toLowerCase() === cleanEmail);
          if (existing) {
            await api.update("profiles", existing.id, { branch_id: inv.branch_id, role: "staff" });
          } else {
            throw rpcErr;
          }
        } else {
          throw rpcErr;
        }
      }
      emailStatus = `Akun dibuat di database.`;
    }

    // 3. Trigger WhatsApp Hermes alert jika nomor telepon disertakan
    if (inv.phone && inv.phone.length > 8) {
      try {
        await fetch("/api/hermes-dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "invite_staff",
            name: cleanName,
            email: cleanEmail,
            phone: inv.phone,
            branch: branchName,
            role: "Kasir / Staff",
            tempPassword: tempPass,
            loginUrl: window.location.origin + "/masuk"
          })
        }).catch(() => {});
      } catch {}
    }

    api.invalidateCache?.("profiles");
    api.invalidateCache?.("member_branches");
    api.invalidateCache?.("staff_invites");

    // Tampilkan modal sukses kredensial akun kasir baru
    setSuccessModal({
      open: true,
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: inv.phone,
        branchName: branchName,
        tempPassword: tempPass,
        role: "Staff Kasir",
        loginUrl: window.location.origin + "/masuk"
      }
    });

    setInv(null);
    clearAsyncCache(`staff@${tenantId}`);
    await r.reload();
    return `Akun kasir ${cleanName} berhasil ditambahkan! ${emailStatus}`;
  }, (m) => m);

  return (
    <>
      <PageHead
        eyebrow={`Fitur 13 · ${permOf(role, 13)?.label}`}
        title="Kelola Kasir & Penugasan"
        desc="Direktori kasir, penugasan cabang tunggal, jadwal shift kerja, dan ringkasan absensi."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {can(role, 13, "c") && (
              <button
                type="button"
                className="d-btn d-btn--secondary"
                disabled={!r.data}
                onClick={openAutoRolling}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <i className="fa-solid fa-arrows-rotate" />
                {t("Auto-Rolling Shift (1-Click)", lang)}
              </button>
            )}
            {can(role, 13, "c") && (
              <button
                type="button"
                className="d-btn d-btn--secondary"
                disabled={!r.data}
                onClick={openNewShift}
              >
                {t("+ Tambah jadwal", lang)}
              </button>
            )}
            {can(role, 13, "c") && (
              <button
                type="button"
                className="d-btn d-btn--primary"
                onClick={openInvite}
              >
                {t("+ Undang Kasir Baru", lang)}
              </button>
            )}
          </div>
        }
      />

      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorNote error={r.error} onRetry={r.reload} />
      ) : (
        <div className="d-grid">
          <Panel
            title="Direktori Kasir & Staf"
            meta={`${r.data.people.filter((p) => p.role === "staff").length} Kasir terdaftar`}
          >
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th scope="col">Nama Kasir</th>
                    <th scope="col">Peran</th>
                    <th scope="col">Cabang Penugasan</th>
                    <th scope="col" className="d-num">Gaji Pokok</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.people.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 600 }}>{p.full_name}</span>
                          {p.role === "staff" && <Badge tone="accent">Kasir</Badge>}
                        </div>
                        <p className="d-list__meta" style={{ margin: "2px 0 0" }}>
                          {p.role === "owner" && !isOwner ? (
                            <span style={{ color: "var(--color-muted, #64748b)", fontStyle: "italic", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                              <i className="fa-solid fa-lock" style={{ fontSize: "0.7rem" }} />
                              Email Terproteksi (Privasi Owner)
                            </span>
                          ) : (
                            p.email
                          )}
                        </p>
                      </td>
                      <td>{ROLE_LABEL[p.role]}</td>
                      <td>
                        {(() => {
                          const ids = branchesOf(p);
                          return ids ? ids.map((id) => br[id]?.name).filter(Boolean).join(", ") || "—" : "Semua cabang";
                        })()}
                        {canAssign(p) && (
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--sm d-cell-btn"
                            onClick={() => setAssign({ person: p, ids: new Set(branchesOf(p) ?? []) })}
                          >
                            Atur cabang
                          </button>
                        )}
                      </td>
                      <td className="d-num">
                        {/* INVARIAN ARSITEKTUR: Gaji Pokok hanya boleh diedit oleh Owner (L1). GM berstatus Read-Only */}
                        {isOwner && p.role !== "owner" ? (
                          <span className="d-row-actions">
                            <input
                              className="d-cell-input"
                              inputMode="numeric"
                              aria-label={`Gaji pokok ${p.full_name}`}
                              value={sal[p.id] ?? p.base_salary ?? 0}
                              onChange={(e) => setSal({ ...sal, [p.id]: e.target.value.replace(/\D/g, "") })}
                            />
                            {sal[p.id] !== undefined && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                onClick={() => a.run(async () => {
                                  await api.update("profiles", p.id, { base_salary: Number(sal[p.id]) });
                                  setSal((s) => { const n = { ...s }; delete n[p.id]; return n; });
                                  r.reload();
                                }, "Gaji disimpan")}
                              >
                                Simpan
                              </button>
                            )}
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <span>{rupiah(p.base_salary)}</span>
                            {!isOwner && (
                              <span
                                title="Perubahan nominal gaji pokok hanya dapat dilakukan oleh Owner (L1)"
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--color-muted, #64748b)",
                                  background: "var(--color-paper-2, #f1f5f9)",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid var(--color-rule, #e2e8f0)",
                                  cursor: "help",
                                }}
                              >
                                <i className="fa-solid fa-lock" style={{ marginRight: "0.25rem" }} />
                                Read-Only
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Feedback a={a} />
          </Panel>

          <Panel
            title="Jadwal Shift Kasir"
            desc="Alokasi penugasan jadwal kerja kasir & staf aktif gerai"
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ display: "inline-flex", background: "var(--color-paper-2, #f1f5f9)", borderRadius: "6px", padding: "2px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                  <button
                    type="button"
                    className={`d-btn d-btn--sm ${shiftViewMode === "summary" ? "d-btn--primary" : "d-btn--ghost"}`}
                    style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                    onClick={() => setShiftViewMode("summary")}
                  >
                    <i className="fa-solid fa-layer-group" style={{ marginRight: "0.35rem" }} />
                    Ringkasan Roster ({groupedShifts.length} Staf)
                  </button>
                  <button
                    type="button"
                    className={`d-btn d-btn--sm ${shiftViewMode === "full" ? "d-btn--primary" : "d-btn--ghost"}`}
                    style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                    onClick={() => setShiftViewMode("full")}
                  >
                    <i className="fa-solid fa-calendar-days" style={{ marginRight: "0.35rem" }} />
                    Daftar Harian ({r.data.shifts.length} Shift)
                  </button>
                </div>
              </div>
            }
          >
            {r.data.shifts.length === 0 ? (
              <Empty title="Belum ada jadwal shift" desc="Gunakan tombol '+ Tambah jadwal' atau 'Auto-Rolling Shift (1-Click)' di atas untuk menjadwalkan shift kasir." />
            ) : shiftViewMode === "summary" ? (
              /* TAMPILAN RINGKASAN ROSTER JADWAL SHIFT KASIR TERPADU (Sederhana, Bersih, Anti-Pecah Baris) */
              <div className="d-table-wrap">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th scope="col">Nama Kasir / Staf</th>
                      <th scope="col">Cabang Penugasan</th>
                      <th scope="col">Durasi &amp; Rentang Roster</th>
                      <th scope="col">Pola Jam Kerja Shift</th>
                      <th scope="col">Shift Hari Ini &amp; Besok</th>
                      <th scope="col">Status Roster</th>
                      <th scope="col" style={{ textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedShifts.map((g) => {
                      const person = ppl[g.profile_id];
                      const branch = br[g.branch_id];

                      return (
                        <tr key={g.id}>
                          <td>
                            <strong>{person?.full_name || "-"}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                              {ROLE_LABEL[person?.role] || "Kasir / Staf"}
                            </div>
                          </td>
                          <td>{branch?.name || "-"}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--color-text, #0f172a)" }}>
                              {g.durationLabel}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)", marginTop: "2px" }}>
                              {date(g.minDate)} – {date(g.maxDate)}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--color-primary, #0B5D4B)", fontWeight: 500, marginTop: "2px" }}>
                              {g.shiftCount} Hari Kerja Aktif{g.offDaysCount > 0 ? ` · ${g.offDaysCount} Hari Libur` : ""}
                            </div>
                          </td>
                          <td>
                            {g.isRotating ? (
                              <div>
                                <Badge tone="accent">
                                  <i className="fa-solid fa-arrows-rotate" style={{ marginRight: "0.3rem" }} />
                                  Rotasi Selang-Seling ({g.distinctTimes.length} Shift)
                                </Badge>
                                <div style={{ fontSize: "0.72rem", color: "var(--color-muted, #64748b)", marginTop: "3px" }}>
                                  {g.distinctTimes.map((t) => `${t.time} (${t.count}x)`).join(" · ")}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <Badge tone="accent">
                                  <i className="fa-regular fa-clock" style={{ marginRight: "0.25rem" }} />
                                  {g.distinctTimes[0]?.time || "08:00 - 16:00"}
                                </Badge>
                                <div style={{ fontSize: "0.72rem", color: "var(--color-muted, #64748b)", marginTop: "3px" }}>
                                  Shift Tetap ({g.shiftCount} Hari)
                                </div>
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              <div style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <span style={{ color: "var(--color-muted, #64748b)", minWidth: "50px" }}>Hari Ini:</span>
                                {g.todayShift ? (
                                  <Badge tone="ok" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                                    <i className="fa-solid fa-circle-play" style={{ marginRight: "0.25rem" }} />
                                    {g.todayShift.start_time.slice(0, 5)} - {g.todayShift.end_time.slice(0, 5)}
                                  </Badge>
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #94a3b8)", fontStyle: "italic" }}>
                                    Libur Roster
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <span style={{ color: "var(--color-muted, #64748b)", minWidth: "50px" }}>Besok:</span>
                                {g.tomorrowShift ? (
                                  <Badge tone="accent" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                                    <i className="fa-regular fa-clock" style={{ marginRight: "0.25rem" }} />
                                    {g.tomorrowShift.start_time.slice(0, 5)} - {g.tomorrowShift.end_time.slice(0, 5)}
                                  </Badge>
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #94a3b8)", fontStyle: "italic" }}>
                                    Libur / Selesai
                                  </span>
                                )}
                              </div>

                              {/* Mini Pratinjau 7 Hari Kerja */}
                              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                                {g.next7Days.map((d) => (
                                  <span
                                    key={d.dateStr}
                                    style={{
                                      fontSize: "0.65rem",
                                      padding: "1px 4px",
                                      borderRadius: "4px",
                                      background: d.isToday ? "var(--color-ok-soft, #dcfce7)" : d.shiftTime ? "var(--color-paper-2, #f1f5f9)" : "transparent",
                                      border: d.isToday ? "1px solid var(--color-ok, #10b981)" : "1px solid var(--color-rule, #e2e8f0)",
                                      color: d.isToday ? "var(--color-ok, #15803d)" : d.shiftTime ? "var(--color-text, #0f172a)" : "var(--color-muted, #94a3b8)",
                                      fontWeight: d.isToday ? 600 : 400,
                                    }}
                                    title={`${d.dayName} (${d.dateStr}): ${d.shiftTime || "Libur"}`}
                                  >
                                    {d.dayName}: {d.shiftTime ? d.shiftTime.slice(0, 5) : "Lib"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge tone={g.statusTone} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                              <i className={g.statusTone === "ok" ? "fa-solid fa-circle-play" : g.statusTone === "accent" ? "fa-solid fa-mug-hot" : g.statusTone === "warn" ? "fa-solid fa-clock" : "fa-solid fa-calendar-check"} />
                              {g.statusLabel}
                            </Badge>
                            <div style={{ fontSize: "0.72rem", color: "var(--color-muted, #64748b)", marginTop: "3px" }}>
                              {g.statusDesc}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                              <button
                                type="button"
                                className="d-btn d-btn--secondary d-btn--sm"
                                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                onClick={() => setRosterModal(g)}
                                title="Lihat kalender jadwal lengkap 30 hari"
                              >
                                <i className="fa-solid fa-calendar-days" style={{ marginRight: "0.25rem" }} />
                                Roster ({g.shiftCount})
                              </button>
                              {can(role, 13, "u") && (
                                <button
                                  type="button"
                                  className="d-btn d-btn--ghost d-btn--sm"
                                  style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                  onClick={() => handleEditGroupRoster(g)}
                                  title="Ubah rotasi shift & sinkronkan antar staf"
                                >
                                  <i className="fa-solid fa-pen-to-square" style={{ marginRight: "0.25rem" }} />
                                  Ubah
                                </button>
                              )}
                              {can(role, 13, "d") && (
                                <button
                                  type="button"
                                  className="d-btn d-btn--danger-ghost d-btn--sm"
                                  style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                  onClick={() => setGroupDeleteConfirm(g)}
                                  title="Hapus seluruh rangkaian jadwal ini"
                                >
                                  Hapus
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
            ) : (
              /* TAMPILAN DAFTAR HARIAN PENUH (Flat List) */
              <div className="d-table-wrap">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th>Nama Kasir / Staf</th>
                      <th>Cabang Penugasan</th>
                      <th>Tanggal Shift</th>
                      <th>Jam Kerja Shift</th>
                      <th>Toleransi &amp; Auto-Out</th>
                      <th style={{ textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.data.shifts.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{ppl[s.profile_id]?.full_name || "-"}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                            {ROLE_LABEL[ppl[s.profile_id]?.role] || "Kasir"}
                          </div>
                        </td>
                        <td>{br[s.branch_id]?.name || "-"}</td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{date(s.work_date)}</span>
                        </td>
                        <td>
                          <Badge tone="accent">
                            <i className="fa-regular fa-clock" style={{ marginRight: "0.25rem" }} />
                            {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                          </Badge>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                            {s.late_tolerance_min != null && s.late_tolerance_min !== 0 ? (
                              <Badge tone="accent">Tol {s.late_tolerance_min} mnt</Badge>
                            ) : (
                              <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>Tepat waktu</span>
                            )}
                            {s.auto_clockout && (
                              <Badge tone="ok">Auto-Out +{s.auto_clockout_delay_min || 30}m</Badge>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            {can(role, 13, "u") && (
                              <button
                                type="button"
                                className="d-btn d-btn--secondary d-btn--sm"
                                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                onClick={() => openEditShift(s)}
                              >
                                <i className="fa-solid fa-pen-to-square" style={{ marginRight: "0.25rem" }} />
                                Ubah
                              </button>
                            )}
                            {can(role, 13, "d") && (
                              <button
                                type="button"
                                className="d-btn d-btn--danger-ghost d-btn--sm"
                                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                onClick={() => a.run(async () => { await api.remove("work_shifts", s.id); r.reload(); })}
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Modal Tambah / Ubah Jadwal Shift */}
      <Modal
        open={Boolean(ws)}
        title={ws?.id ? "Ubah Jadwal Shift" : "Tambah Jadwal Shift"}
        onClose={() => setWs(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setWs(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={a.busy || !ws?.profile_id || !ws?.work_date || !ws?.start_time || !ws?.end_time || !ws?.branch_id}
              onClick={saveShift}
            >
              {ws?.id ? "Perbarui Jadwal" : "Simpan Jadwal"}
            </button>
          </>
        }
      >
        {ws && (
          <div className="d-form">
            <Field label="Kasir / Staf" id="ws-p">
              <select
                id="ws-p"
                value={ws.profile_id}
                onChange={(e) => setWs({ ...ws, profile_id: e.target.value, branch_id: ppl[e.target.value]?.branch_id ?? ws.branch_id })}
              >
                <option value="">Pilih kasir…</option>
                {r.data.people.filter((p) => p.role !== "owner").map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({ROLE_LABEL[p.role]})</option>
                ))}
              </select>
            </Field>

            {/* Pilihan Cepat Template Shift (Sistem Standar Majoo / Olsera) */}
            <div style={{ marginBottom: "0.75rem", background: "var(--color-paper-2, #f8fafc)", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "block", marginBottom: "0.35rem" }}>
                Pilihan Cepat Template Shift:
              </span>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                  onClick={() => setWs({ ...ws, start_time: "08:00", end_time: "16:00" })}
                >
                  Pagi (08:00 - 16:00)
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                  onClick={() => setWs({ ...ws, start_time: "12:00", end_time: "20:00" })}
                >
                  Siang (12:00 - 20:00)
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                  onClick={() => setWs({ ...ws, start_time: "15:00", end_time: "23:00" })}
                >
                  Closing (15:00 - 23:00)
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                  onClick={() => setWs({ ...ws, start_time: "08:00", end_time: "20:00" })}
                >
                  Full Day (08:00 - 20:00)
                </button>
              </div>
            </div>

            <div className="d-form__row d-form__row--3">
              <Field label={ws.is_recurring ? "Tanggal Mulai Shift" : "Tanggal"} id="ws-d">
                <input id="ws-d" type="date" value={ws.work_date} onChange={(e) => setWs({ ...ws, work_date: e.target.value })} />
              </Field>
              <Field label="Jam Mulai" id="ws-s">
                <input id="ws-s" type="time" value={ws.start_time} onChange={(e) => setWs({ ...ws, start_time: e.target.value })} />
              </Field>
              <Field label="Jam Selesai" id="ws-e">
                <input id="ws-e" type="time" value={ws.end_time} onChange={(e) => setWs({ ...ws, end_time: e.target.value })} />
              </Field>
            </div>

            {/* Opsi Jadwal Berulang Otomatis (Recurring Schedule) */}
            {!ws.id && (
              <div style={{ marginBottom: "0.75rem", background: ws.is_recurring ? "#f0fdf4" : "var(--color-paper-2, #f8fafc)", padding: "10px 12px", borderRadius: "8px", border: ws.is_recurring ? "1px solid #22c55e" : "1px solid var(--color-rule, #e2e8f0)", transition: "all 0.2s" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(ws.is_recurring)}
                    onChange={(e) => setWs({ ...ws, is_recurring: e.target.checked })}
                    style={{ marginTop: "3px" }}
                  />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                      Jadwalkan Berulang Otomatis (Tanpa Input Tanggal Tiap Hari)
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                      Cukup tentukan tanggal mulai di atas, sistem langsung menjadwalkan shift untuk staf ini secara otomatis.
                    </p>
                  </div>
                </label>

                {ws.is_recurring && (
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed var(--color-rule, #cbd5e1)" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "block", marginBottom: "0.35rem" }}>
                      Durasi Jadwal Berulang:
                    </label>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                      {[
                        { id: "1week", label: "1 Minggu (7 Hari)" },
                        { id: "2weeks", label: "2 Minggu (14 Hari)" },
                        { id: "1month", label: "1 Bulan (30 Hari)" },
                        { id: "3months", label: "3 Bulan (90 Hari)" },
                      ].map((dur) => (
                        <button
                          key={dur.id}
                          type="button"
                          className={`d-btn d-btn--sm ${ws.recurring_duration === dur.id ? "d-btn--primary" : "d-btn--ghost"}`}
                          style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                          onClick={() => setWs({ ...ws, recurring_duration: dur.id })}
                        >
                          {dur.label}
                        </button>
                      ))}
                    </div>

                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "block", marginBottom: "0.35rem" }}>
                      Hari Kerja Aktif:
                    </label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      {[
                        { day: 1, label: "Sen" },
                        { day: 2, label: "Sel" },
                        { day: 3, label: "Rab" },
                        { day: 4, label: "Kam" },
                        { day: 5, label: "Jum" },
                        { day: 6, label: "Sab" },
                        { day: 0, label: "Min" },
                      ].map((d) => {
                        const active = (ws.recurring_days || [1, 2, 3, 4, 5, 6]).includes(d.day);
                        return (
                          <button
                            key={d.day}
                            type="button"
                            className={`d-btn d-btn--sm ${active ? "d-btn--primary" : "d-btn--ghost"}`}
                            style={{ minWidth: "40px", fontSize: "0.75rem", padding: "4px 6px" }}
                            onClick={() => {
                              const curr = new Set(ws.recurring_days || [1, 2, 3, 4, 5, 6]);
                              if (curr.has(d.day)) {
                                if (curr.size > 1) curr.delete(d.day);
                              } else {
                                curr.add(d.day);
                              }
                              setWs({ ...ws, recurring_days: Array.from(curr) });
                            }}
                          >
                            {active ? <i className="fa-solid fa-check" style={{ marginRight: "3px" }} /> : null}
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                      <span
                        style={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => setWs({ ...ws, recurring_days: [1, 2, 3, 4, 5, 6] })}
                      >
                        Senin - Sabtu (6 Hari)
                      </span>
                      <span>·</span>
                      <span
                        style={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => setWs({ ...ws, recurring_days: [1, 2, 3, 4, 5] })}
                      >
                        Senin - Jumat (5 Hari)
                      </span>
                      <span>·</span>
                      <span
                        style={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => setWs({ ...ws, recurring_days: [0, 1, 2, 3, 4, 5, 6] })}
                      >
                        Setiap Hari (7 Hari)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Field label="Cabang Outlet" id="ws-b">
              <select id="ws-b" value={ws.branch_id} onChange={(e) => setWs({ ...ws, branch_id: e.target.value })}>
                {r.data.branches.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </Field>

            {/* Toleransi Keterlambatan Presensi Masuk (Grace Period) */}
            <div style={{ marginTop: "0.75rem", background: "var(--color-paper-2, #f8fafc)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <label htmlFor="ws-tol" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <i className="fa-solid fa-hourglass-half" style={{ color: "var(--color-primary, #0B5D4B)" }} />
                  Toleransi Presensi "Masuk"
                </label>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent, #2563eb)" }}>
                  {ws.late_tolerance_unit === "hour" ? `${ws.late_tolerance_val} Jam (${Number(ws.late_tolerance_val || 1) * 60} mnt)` : `${ws.late_tolerance_val} Menit`}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <input
                  id="ws-tol"
                  type="number"
                  min="0"
                  max={ws.late_tolerance_unit === "hour" ? 12 : 720}
                  value={ws.late_tolerance_val ?? 15}
                  onChange={(e) => setWs({ ...ws, late_tolerance_val: Math.max(0, Number(e.target.value)) })}
                  className="d-input"
                  style={{ width: "95px", padding: "4px 8px", fontSize: "0.875rem" }}
                />
                <select
                  value={ws.late_tolerance_unit ?? "min"}
                  onChange={(e) => setWs({ ...ws, late_tolerance_unit: e.target.value })}
                  className="d-input"
                  style={{ width: "105px", padding: "4px 8px", fontSize: "0.875rem" }}
                >
                  <option value="min">Menit</option>
                  <option value="hour">Jam</option>
                </select>
              </div>

              {/* Preset Cepat Toleransi Masuk */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 0, late_tolerance_unit: "min" })}
                >
                  0 mnt (Tepat)
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 5, late_tolerance_unit: "min" })}
                >
                  5 mnt
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 10, late_tolerance_unit: "min" })}
                >
                  10 mnt
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 15, late_tolerance_unit: "min" })}
                >
                  15 mnt (Standar)
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 30, late_tolerance_unit: "min" })}
                >
                  30 mnt
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => setWs({ ...ws, late_tolerance_val: 1, late_tolerance_unit: "hour" })}
                >
                  1 Jam
                </button>
              </div>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                Staf yang absen masuk melewati jam mulai shift hingga batas toleransi ini tidak akan dicatat terlambat (late_min = 0).
              </p>
            </div>

            {/* Checkbox Checklist: Otomatis Absensi/Presensi dari Sistem (Auto Clock-out by System) */}
            <div style={{ marginTop: "0.75rem", background: ws.auto_clockout ? "#eff6ff" : "var(--color-paper-2, #f8fafc)", padding: "10px 12px", borderRadius: "8px", border: ws.auto_clockout ? "1px solid #3b82f6" : "1px solid var(--color-rule, #e2e8f0)", transition: "all 0.2s" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={Boolean(ws.auto_clockout)}
                  onChange={(e) => setWs({ ...ws, auto_clockout: e.target.checked })}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                    Otomatis Absensi Pulang dari Sistem (Auto Clock-out by System)
                  </span>
                  <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                    Default nonaktif. Bila dicentang, sistem otomatis mencatatkan absensi pulang jika kasir/staf lupa absen pulang setelah shift berakhir.
                  </p>
                </div>
              </label>

              {ws.auto_clockout && (
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed var(--color-rule, #cbd5e1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <label htmlFor="ws-auto-tol" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                      Toleransi Waktu Auto Clock-out Setelah Shift Selesai:
                    </label>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent, #2563eb)" }}>
                      +{ws.auto_clockout_delay_unit === "hour" ? `${ws.auto_clockout_delay_val} Jam` : `${ws.auto_clockout_delay_val} Menit`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                    <input
                      id="ws-auto-tol"
                      type="number"
                      min="0"
                      max={ws.auto_clockout_delay_unit === "hour" ? 24 : 1440}
                      value={ws.auto_clockout_delay_val ?? 30}
                      onChange={(e) => setWs({ ...ws, auto_clockout_delay_val: Math.max(0, Number(e.target.value)) })}
                      className="d-input"
                      style={{ width: "95px", padding: "4px 8px", fontSize: "0.875rem" }}
                    />
                    <select
                      value={ws.auto_clockout_delay_unit ?? "min"}
                      onChange={(e) => setWs({ ...ws, auto_clockout_delay_unit: e.target.value })}
                      className="d-input"
                      style={{ width: "105px", padding: "4px 8px", fontSize: "0.875rem" }}
                    >
                      <option value="min">Menit</option>
                      <option value="hour">Jam</option>
                    </select>
                  </div>

                  {/* Preset Cepat Toleransi Auto Clock-out */}
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                    <button
                      type="button"
                      className="d-btn d-btn--sm d-btn--ghost"
                      style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                      onClick={() => setWs({ ...ws, auto_clockout_delay_val: 15, auto_clockout_delay_unit: "min" })}
                    >
                      15 Menit
                    </button>
                    <button
                      type="button"
                      className="d-btn d-btn--sm d-btn--ghost"
                      style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                      onClick={() => setWs({ ...ws, auto_clockout_delay_val: 30, auto_clockout_delay_unit: "min" })}
                    >
                      30 Menit (Standar)
                    </button>
                    <button
                      type="button"
                      className="d-btn d-btn--sm d-btn--ghost"
                      style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                      onClick={() => setWs({ ...ws, auto_clockout_delay_val: 1, auto_clockout_delay_unit: "hour" })}
                    >
                      1 Jam
                    </button>
                    <button
                      type="button"
                      className="d-btn d-btn--sm d-btn--ghost"
                      style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                      onClick={() => setWs({ ...ws, auto_clockout_delay_val: 2, auto_clockout_delay_unit: "hour" })}
                    >
                      2 Jam
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                    Sistem otomatis melakukan clock-out pulang {ws.auto_clockout_delay_unit === "hour" ? `${ws.auto_clockout_delay_val} jam` : `${ws.auto_clockout_delay_val} menit`} setelah jam selesai shift ({ws.end_time || '16:00'}).
                  </p>
                </div>
              )}
            </div>

            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Undang Kasir Baru (Spesifikasi Menu 2 SDM) */}
      <Modal
        open={Boolean(inv)}
        title="Undang Kasir Baru"
        onClose={() => setInv(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" }}>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setInv(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={a.busy || !inv?.name || !inv?.email || !inv?.branch_id}
              onClick={submitInvite}
            >
              {a.busy ? "Mengirim..." : "Kirim Undangan Kasir"}
            </button>
          </div>
        }
      >
        {inv && (
          <div className="d-form" style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: "4px" }}>
            <p className="d-text" style={{ fontSize: "0.8125rem", color: "var(--color-muted, #64748b)", margin: "0 0 1rem" }}>
              Undang kasir untuk bertugas di cabang outlet. Kasir hanya dapat ditugaskan pada <strong>satu cabang tunggal</strong> guna menjaga integritas laci kasir POS.
            </p>

            <Feedback a={a} />

            <Field label="Nama Lengkap Kasir *" id="inv-name" hint="Sesuai kartu identitas resmi">
              <input
                id="inv-name"
                placeholder="Contoh: Muhammad Fajrin"
                value={inv.name}
                onChange={(e) => setInv({ ...inv, name: e.target.value })}
              />
            </Field>

            <Field label="Alamat Email (Kredensial Login) *" id="inv-email" hint="Format RFC 5322 valid (contoh: kasir@merchant.com)">
              <input
                id="inv-email"
                type="email"
                placeholder="kasir.outlet@domain.com"
                value={inv.email}
                onChange={(e) => setInv({ ...inv, email: e.target.value })}
              />
            </Field>

            <Field label="Nomor WhatsApp (Hermes Alert)" id="inv-phone" hint="Awalan otomatis terkunci +62 untuk notifikasi jadwal & slip">
              <input
                id="inv-phone"
                type="tel"
                placeholder="+628123456789"
                value={inv.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
              />
            </Field>

            {/* Field Penugasan Cabang: Wajib Radio Button (Pilihan Tunggal) */}
            <fieldset style={{ border: "1px solid var(--color-rule, #e2e8f0)", padding: "0.875rem", borderRadius: "8px", background: "var(--color-paper-2, #f8fafc)" }}>
              <legend style={{ padding: "0 6px", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text, #0f172a)" }}>
                Cabang Penugasan (Pilihan Tunggal Radio Button) *
              </legend>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                Dilarang memilih multi-cabang untuk kasir agar tidak bentrok shift dan pencatatan shift POS.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {mine.options.map((b) => (
                  <label
                    key={b.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.625rem",
                      cursor: "pointer",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "6px",
                      background: inv.branch_id === b.id ? "var(--color-accent-soft, #eff6ff)" : "transparent",
                      border: inv.branch_id === b.id ? "1px solid var(--color-accent, #3b82f6)" : "1px solid transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="inv_branch_radio"
                      value={b.id}
                      checked={inv.branch_id === b.id}
                      onChange={() => setInv({ ...inv, branch_id: b.id })}
                    />
                    <span style={{ fontSize: "0.875rem", fontWeight: inv.branch_id === b.id ? 600 : 400 }}>
                      {b.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {invErr && (
              <p style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
                {invErr}
              </p>
            )}

            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Auto-Rolling Shift Kasir & Staf (1-Click Roster) */}
      <Modal
        open={Boolean(rolling)}
        title={rolling?.is_edit ? "Ubah & Sinkronkan Roster Jadwal Kasir" : "Auto-Rolling Shift Kasir & Staf (1-Click Roster)"}
        onClose={() => setRolling(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
              {rolling?.staff_ids?.length || 0} kasir terpilih · {
                rolling?.duration === "custom"
                  ? `${rolling?.custom_days || 30} hari`
                  : (rolling?.duration === "1week" ? "7 hari" : rolling?.duration === "2weeks" ? "14 hari" : rolling?.duration === "2months" ? "60 hari" : "30 hari")
              } rotasi
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setRolling(null)}>
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={a.busy || !rolling?.branch_id || !rolling?.staff_ids || rolling.staff_ids.length < 2 || !rolling?.start_date}
                onClick={applyAutoRolling}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <i className="fa-solid fa-arrows-rotate" />
                {a.busy ? "Menyimpan..." : (rolling?.is_edit ? "Simpan Perubahan & Sinkronkan" : "Terapkan Auto-Rolling (1-Click)")}
              </button>
            </div>
          </div>
        }
      >
        {rolling && (
          <div className="d-form" style={{ maxHeight: "calc(100dvh - 9rem)", overflowY: "auto", overflowX: "hidden", paddingRight: "2px", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>

            <div className="d-form__row d-form__row--2">
              <Field label="Cabang Outlet *" id="roll-branch">
                <select
                  id="roll-branch"
                  value={rolling.branch_id}
                  onChange={(e) => {
                    const bId = e.target.value;
                    const bStaff = r.data.people.filter((p) => p.role !== "owner" && (!bId || p.branch_id === bId || !p.branch_id));
                    setRolling({
                      ...rolling,
                      branch_id: bId,
                      staff_ids: bStaff.map((p) => p.id),
                    });
                  }}
                >
                  {r.data.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tanggal Mulai Rotasi *" id="roll-start">
                <input
                  id="roll-start"
                  type="date"
                  value={rolling.start_date}
                  onChange={(e) => setRolling({ ...rolling, start_date: e.target.value })}
                />
              </Field>
            </div>

            {/* Checklist Staf yang Terlibat */}
            <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-rule, #e2e8f0)", borderRadius: "8px", padding: "8px 10px", background: "var(--color-paper, #ffffff)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Pilih Staf / Kasir Terlibat ({rolling.staff_ids.length} Staf Terpilih) *
                </span>
                <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.72rem" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--sm d-btn--ghost"
                    style={{ padding: "2px 6px" }}
                    onClick={() => {
                      const allStaff = r.data.people.filter((p) => p.role !== "owner" && (!rolling.branch_id || p.branch_id === rolling.branch_id || !p.branch_id));
                      setRolling({ ...rolling, staff_ids: allStaff.map((p) => p.id) });
                    }}
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--sm d-btn--ghost"
                    style={{ padding: "2px 6px" }}
                    onClick={() => setRolling({ ...rolling, staff_ids: [] })}
                  >
                    Hapus Pilihan
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(125px, 1fr))", gap: "0.4rem", maxHeight: "140px", overflowY: "auto", padding: "4px 0" }}>
                {r.data.people.filter((p) => p.role !== "owner").map((p) => {
                  const isChecked = rolling.staff_ids.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: isChecked ? "#eff6ff" : "var(--color-paper-2, #f8fafc)",
                        border: isChecked ? "1px solid #3b82f6" : "1px solid var(--color-rule, #e2e8f0)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? rolling.staff_ids.filter((x) => x !== p.id)
                            : [...rolling.staff_ids, p.id];
                          setRolling({ ...rolling, staff_ids: next });
                        }}
                      />
                      <span style={{ fontWeight: isChecked ? 600 : 400, color: "var(--color-ink, #0f172a)" }}>
                        {p.full_name}
                      </span>
                    </label>
                  );
                })}
              </div>
              {rolling.staff_ids.length < 2 && (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "var(--color-danger, #ef4444)" }}>
                  Pilih minimal 2 staf/kasir untuk membuat rotasi selang-seling.
                </p>
              )}
            </div>

            {/* Pilihan Model Rotasi Shift (Model A - Model H) */}
            <Field label="Model Pola Rotasi Shift *" id="roll-model">
              <select
                id="roll-model"
                value={rolling.model}
                onChange={(e) => setRolling({ ...rolling, model: e.target.value })}
              >
                {SHIFT_ROTATION_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>

            {/* Durasi Roster */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "block", marginBottom: "0.35rem" }}>
                Rentang Waktu Roster (Durasi):
              </label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                {[
                  { id: "1week", label: "1 Minggu (7 Hari)" },
                  { id: "2weeks", label: "2 Minggu (14 Hari)" },
                  { id: "1month", label: "1 Bulan (30 Hari) · Standar" },
                  { id: "2months", label: "2 Bulan (60 Hari)" },
                  { id: "custom", label: "Kustom..." },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`d-btn d-btn--sm ${rolling.duration === d.id ? "d-btn--primary" : "d-btn--ghost"}`}
                    style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                    onClick={() => setRolling({ ...rolling, duration: d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {rolling.duration === "custom" && (
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <label htmlFor="roll-custom-days" style={{ fontSize: "0.75rem", color: "var(--color-ink, #0f172a)", fontWeight: 500 }}>
                    Jumlah Hari:
                  </label>
                  <input
                    id="roll-custom-days"
                    type="number"
                    min="1"
                    max="365"
                    className="d-input"
                    style={{ width: "90px", padding: "4px 8px", fontSize: "0.8125rem" }}
                    value={rolling.custom_days ?? 30}
                    onChange={(e) => setRolling({ ...rolling, custom_days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                    hari (1 - 365 hari rotasi)
                  </span>
                </div>
              )}
            </div>

            {/* Pengaturan Jam Shift Dinamis (Dapat ditambah tanpa batas) */}
            <div style={{ background: "var(--color-paper-2, #f8fafc)", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>
                  Alokasi Jam Shift ({(rolling.shift_slots || []).length} Slot Shift):
                </span>
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  style={{ fontSize: "0.75rem", padding: "3px 8px", color: "var(--color-primary, #0B5D4B)" }}
                  onClick={() => {
                    const currentSlots = rolling.shift_slots || [];
                    const nextNum = currentSlots.length + 1;
                    const defaultTemplates = [
                      { label: "Shift Pagi", start_time: "08:00", end_time: "16:00" },
                      { label: "Shift Closing / Sore", start_time: "15:00", end_time: "23:00" },
                      { label: "Shift Siang / Mid", start_time: "11:00", end_time: "19:00" },
                      { label: "Shift Malam", start_time: "23:00", end_time: "07:00" },
                    ];
                    const template = defaultTemplates[nextNum - 1] || { label: `Shift ${nextNum}`, start_time: "09:00", end_time: "17:00" };
                    setRolling({
                      ...rolling,
                      shift_slots: [
                        ...currentSlots,
                        { id: String(Date.now()), label: template.label, start_time: template.start_time, end_time: template.end_time },
                      ],
                    });
                  }}
                >
                  <i className="fa-solid fa-plus" style={{ marginRight: "0.3rem" }} />
                  + Tambah Slot Shift
                </button>
              </div>

              {(rolling.shift_slots || []).map((slot, sIdx) => (
                <div
                  key={slot.id || sIdx}
                  style={{
                    background: "var(--color-paper, #ffffff)",
                    border: "1px solid var(--color-rule, #e2e8f0)",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1, minWidth: "130px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-muted, #64748b)" }}>
                        #{sIdx + 1}
                      </span>
                      <input
                        type="text"
                        className="d-input"
                        value={slot.label}
                        placeholder={`Nama Shift ${sIdx + 1}`}
                        style={{ fontSize: "0.78rem", fontWeight: 600, padding: "2px 6px", width: "100%", maxWidth: "160px" }}
                        onChange={(e) => {
                          const updated = [...(rolling.shift_slots || [])];
                          updated[sIdx] = { ...updated[sIdx], label: e.target.value };
                          setRolling({ ...rolling, shift_slots: updated });
                        }}
                      />
                    </div>
                    {(rolling.shift_slots || []).length > 1 && (
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--ghost"
                        style={{ padding: "2px 6px", color: "var(--color-danger, #ef4444)", fontSize: "0.75rem" }}
                        title="Hapus slot shift ini"
                        onClick={() => {
                          const updated = (rolling.shift_slots || []).filter((_, i) => i !== sIdx);
                          setRolling({ ...rolling, shift_slots: updated });
                        }}
                      >
                        <i className="fa-solid fa-trash-can" style={{ marginRight: "0.25rem" }} />
                        Hapus Slot
                      </button>
                    )}
                  </div>

                  <div className="d-form__row d-form__row--2" style={{ margin: 0 }}>
                    <Field label="Jam Mulai" id={`slot-s-${sIdx}`}>
                      <input
                        type="time"
                        id={`slot-s-${sIdx}`}
                        value={slot.start_time}
                        onChange={(e) => {
                          const updated = [...(rolling.shift_slots || [])];
                          updated[sIdx] = { ...updated[sIdx], start_time: e.target.value };
                          setRolling({ ...rolling, shift_slots: updated });
                        }}
                      />
                    </Field>
                    <Field label="Jam Selesai" id={`slot-e-${sIdx}`}>
                      <input
                        type="time"
                        id={`slot-e-${sIdx}`}
                        value={slot.end_time}
                        onChange={(e) => {
                          const updated = [...(rolling.shift_slots || [])];
                          updated[sIdx] = { ...updated[sIdx], end_time: e.target.value };
                          setRolling({ ...rolling, shift_slots: updated });
                        }}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            {/* Toleransi & Auto-Clockout */}
            <div style={{ background: "var(--color-paper-2, #f8fafc)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink, #0f172a)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <i className="fa-solid fa-hourglass-half" style={{ color: "var(--color-primary, #0B5D4B)" }} />
                  Toleransi Masuk (Grace Period)
                </label>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent, #2563eb)" }}>
                  {rolling.late_tolerance_unit === "hour" ? `${rolling.late_tolerance_val} Jam` : `${rolling.late_tolerance_val} Menit`}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <input
                  type="number"
                  min="0"
                  value={rolling.late_tolerance_val ?? 15}
                  onChange={(e) => setRolling({ ...rolling, late_tolerance_val: Math.max(0, Number(e.target.value)) })}
                  className="d-input"
                  style={{ width: "95px", padding: "4px 8px", fontSize: "0.875rem" }}
                />
                <select
                  value={rolling.late_tolerance_unit ?? "min"}
                  onChange={(e) => setRolling({ ...rolling, late_tolerance_unit: e.target.value })}
                  className="d-input"
                  style={{ width: "105px", padding: "4px 8px", fontSize: "0.875rem" }}
                >
                  <option value="min">Menit</option>
                  <option value="hour">Jam</option>
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", userSelect: "none", marginTop: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={Boolean(rolling.auto_clockout)}
                  onChange={(e) => setRolling({ ...rolling, auto_clockout: e.target.checked })}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                    Aktifkan Auto Clock-out Pulang (+{rolling.auto_clockout_delay_val} {rolling.auto_clockout_delay_unit === "hour" ? "jam" : "menit"})
                  </span>
                  <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--color-muted, #64748b)" }}>
                    Sistem otomatis mengabsenkan pulang jika kasir lupa clock-out setelah jam selesai shift.
                  </p>
                </div>
              </label>
            </div>

            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* Modal Sukses Akun Kasir Baru */}
      <Modal
        open={Boolean(successModal)}
        title="Akun Kasir Berhasil Dibuat & Aktif"
        onClose={() => setSuccessModal(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" }}>
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={() => setSuccessModal(null)}
            >
              Selesai &amp; Tutup
            </button>
          </div>
        }
      >
        {successModal?.data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ background: "var(--color-ok-soft, #dcfce7)", border: "1px solid var(--color-ok, #10b981)", borderRadius: "8px", padding: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, color: "var(--color-ok, #15803d)", marginBottom: "0.35rem" }}>
                <i className="fa-solid fa-circle-check" />
                <span>Akun Kasir Berhasil Didaftarkan</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                Akun kasir untuk <strong>{successModal.data.name}</strong> telah aktif dan terdaftar di cabang <strong>{successModal.data.branchName}</strong>. Bagikan kredensial login berikut ke kasir yang bersangkutan.
              </p>
            </div>

            <div style={{ background: "var(--color-paper-2, #f8fafc)", border: "1px solid var(--color-rule, #e2e8f0)", borderRadius: "8px", padding: "0.875rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", rowGap: "0.5rem", columnGap: "0.75rem", fontSize: "0.8125rem" }}>
                <span style={{ color: "var(--color-muted, #64748b)" }}>Nama Lengkap:</span>
                <strong>{successModal.data.name}</strong>

                <span style={{ color: "var(--color-muted, #64748b)" }}>Email Login:</span>
                <span className="d-mono">{successModal.data.email}</span>

                <span style={{ color: "var(--color-muted, #64748b)" }}>Password Sementara:</span>
                <span className="d-mono" style={{ fontWeight: 700, color: "var(--color-primary, #0B5D4B)" }}>{successModal.data.tempPassword}</span>

                <span style={{ color: "var(--color-muted, #64748b)" }}>Cabang Penugasan:</span>
                <span>{successModal.data.branchName}</span>

                <span style={{ color: "var(--color-muted, #64748b)" }}>Link Portal Kasir:</span>
                <a href={successModal.data.loginUrl} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{successModal.data.loginUrl}</a>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="d-btn d-btn--secondary"
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
                onClick={() => {
                  const text = `Halo ${successModal.data.name},\nBerikut kredensial login akun Kasir Tijarah Anda:\n- Email: ${successModal.data.email}\n- Password Sementara: ${successModal.data.tempPassword}\n- Cabang: ${successModal.data.branchName}\n- Link Login: ${successModal.data.loginUrl}\n\nHarap segera login dan perbarui kata sandi Anda.`;
                  copyToClipboard(text);
                  setCopiedCreds(true);
                  setTimeout(() => setCopiedCreds(false), 2500);
                }}
              >
                <i className={`fa-solid ${copiedCreds ? "fa-check" : "fa-copy"}`} />
                {copiedCreds ? "Tersalin ke Clipboard!" : "Salin Kredensial Login"}
              </button>

              {successModal.data.phone && (
                <a
                  href={`https://wa.me/${successModal.data.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                    `Halo ${successModal.data.name},\nBerikut kredensial login akun Kasir Tijarah Anda:\nEmail: ${successModal.data.email}\nPassword Sementara: ${successModal.data.tempPassword}\nCabang: ${successModal.data.branchName}\nLink: ${successModal.data.loginUrl}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="d-btn d-btn--secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", textDecoration: "none" }}
                >
                  <i className="fa-brands fa-whatsapp" style={{ color: "#25D366" }} />
                  Kirim via WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Kalender Roster Jadwal Kasir Lengkap */}
      <Modal
        open={Boolean(rosterModal)}
        title={rosterModal ? `Kalender Roster: ${ppl[rosterModal.profile_id]?.full_name || "Kasir"}` : ""}
        onClose={() => setRosterModal(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            {can(role, 13, "d") && (
              <button
                type="button"
                className="d-btn d-btn--danger-ghost d-btn--sm"
                onClick={() => {
                  const target = rosterModal;
                  setRosterModal(null);
                  setGroupDeleteConfirm(target);
                }}
              >
                <i className="fa-solid fa-trash-can" style={{ marginRight: "0.35rem" }} />
                Hapus Seluruh Roster ({rosterModal?.shiftCount || 0} Shift)
              </button>
            )}
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={() => setRosterModal(null)}
            >
              Tutup
            </button>
          </div>
        }
      >
        {rosterModal && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
              <div style={{ padding: "8px 12px", background: "var(--color-paper-2, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>Cabang Penugasan</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-ink, #0f172a)" }}>{br[rosterModal.branch_id]?.name || "-"}</div>
              </div>
              <div style={{ padding: "8px 12px", background: "var(--color-paper-2, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>Total Durasi Roster</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-ink, #0f172a)" }}>{rosterModal.durationLabel} ({rosterModal.totalDaysSpan} Hari)</div>
              </div>
              <div style={{ padding: "8px 12px", background: "var(--color-paper-2, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>Hari Kerja Aktif</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-ok, #10b981)" }}>{rosterModal.shiftCount} Hari Masuk</div>
              </div>
              <div style={{ padding: "8px 12px", background: "var(--color-paper-2, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--color-muted, #64748b)" }}>Hari Libur Roster</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-muted, #64748b)" }}>{rosterModal.offDaysCount} Hari Libur</div>
              </div>
            </div>

            <div style={{ maxHeight: "380px", overflowY: "auto", border: "1px solid var(--color-rule, #e2e8f0)", borderRadius: "8px" }}>
              <table className="d-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Hari</th>
                    <th>Jam Shift Kerja</th>
                    <th>Toleransi &amp; Auto-Out</th>
                    <th>Status Hari</th>
                    <th style={{ textAlign: "right" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [];
                    const cur = new Date(rosterModal.minDate);
                    const end = new Date(rosterModal.maxDate);
                    while (cur <= end) {
                      const dStr = cur.toISOString().slice(0, 10);
                      const matchingShift = rosterModal.shifts.find((s) => (s.work_date || "").slice(0, 10) === dStr);
                      const isToday = dStr === todayMakassar;
                      const dayName = cur.toLocaleDateString("id-ID", { weekday: "long" });

                      rows.push(
                        <tr key={dStr} style={{ background: isToday ? "var(--color-ok-soft, #f0fdf4)" : undefined }}>
                          <td>
                            <strong>{date(dStr)}</strong>
                            {isToday && (
                              <Badge tone="ok" style={{ marginLeft: "0.4rem", fontSize: "0.65rem", padding: "1px 5px" }}>Hari Ini</Badge>
                            )}
                          </td>
                          <td>{dayName}</td>
                          <td>
                            {matchingShift ? (
                              <Badge tone="accent">
                                <i className="fa-regular fa-clock" style={{ marginRight: "0.25rem" }} />
                                {matchingShift.start_time.slice(0, 5)} - {matchingShift.end_time.slice(0, 5)} WITA
                              </Badge>
                            ) : (
                              <span style={{ color: "var(--color-muted, #94a3b8)", fontSize: "0.8125rem", fontStyle: "italic" }}>
                                Libur Roster
                              </span>
                            )}
                          </td>
                          <td>
                            {matchingShift?.late_tolerance_min ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>Tol {matchingShift.late_tolerance_min}m</span>
                            ) : matchingShift ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>Tepat waktu</span>
                            ) : "-"}
                          </td>
                          <td>
                            {matchingShift ? (
                              <Badge tone="ok">Masuk Shift</Badge>
                            ) : (
                              <Badge tone="neutral">Libur</Badge>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {matchingShift && can(role, 13, "d") && (
                              <button
                                type="button"
                                className="d-btn d-btn--danger-ghost d-btn--sm"
                                style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                                onClick={() => a.run(async () => {
                                  await api.remove("work_shifts", matchingShift.id);
                                  r.reload();
                                  setRosterModal((prev) => {
                                    if (!prev) return null;
                                    const nextShifts = prev.shifts.filter((x) => x.id !== matchingShift.id);
                                    if (nextShifts.length === 0) return null;
                                    return { ...prev, shifts: nextShifts, shiftCount: nextShifts.length };
                                  });
                                }, `Berhasil menghapus jadwal tanggal ${date(dStr)}`)}
                              >
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                      cur.setDate(cur.getDate() + 1);
                    }
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Konfirmasi Hapus Roster Jadwal Shift */}
      <Modal
        open={Boolean(groupDeleteConfirm)}
        title="Hapus Roster Jadwal Shift"
        onClose={() => setGroupDeleteConfirm(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" }}>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setGroupDeleteConfirm(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--danger"
              disabled={a.busy}
              onClick={() => deleteGroupShifts(groupDeleteConfirm)}
            >
              {a.busy ? "Menghapus..." : `Ya, Hapus Semua (${groupDeleteConfirm?.shifts?.length || 0} Shift)`}
            </button>
          </div>
        }
      >
        {groupDeleteConfirm && (
          <div>
            <p style={{ margin: "0 0 1rem" }}>
              Apakah Anda yakin ingin menghapus seluruh <strong>{groupDeleteConfirm.shifts.length} jadwal shift</strong> untuk kasir <strong>{ppl[groupDeleteConfirm.profile_id]?.full_name || "Kasir"}</strong> pada rentang <strong>{groupDeleteConfirm.durationLabel} ({date(groupDeleteConfirm.minDate)} – {date(groupDeleteConfirm.maxDate)})</strong>?
            </p>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-danger, #ef4444)" }}>
              Tindakan ini tidak dapat dibatalkan. Jadwal kerja staf pada periode ini akan dihapus dari sistem.
            </p>
          </div>
        )}
      </Modal>

      {assign && (
        <AssignBranches
          person={assign.person}
          initial={assign.ids}
          options={mine.options}
          onClose={() => setAssign(null)}
          onSaved={r.reload}
        />
      )}
    </>
  );
}
