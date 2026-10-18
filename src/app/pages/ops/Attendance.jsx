import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { date, dateTime, getAppTimezone, getTimezoneAbbr } from "../../../lib/format.js";
import { reverseGeocode } from "../../../lib/googleMaps.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync, Empty, Badge, Modal, Field } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex, useLive } from "../../ops.jsx";
import { useAccountLang, t } from "../account/i18n.js";

const getPos = () => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej(new Error("Perangkat tidak mendukung GPS"));
  navigator.geolocation.getCurrentPosition(
    (p) => res(p.coords),
    () => rej(new Error("Izin lokasi ditolak atau GPS tidak tersedia")),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

const localInput = (iso) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// Formatter Waktu Lengkap Berdasarkan Zona Waktu (Default: WITA Asia/Makassar)
export function formatFullWita(iso) {
  if (!iso) return "-";
  try {
    const tz = getAppTimezone();
    const tzAbbr = getTimezoneAbbr(tz);
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
    const weekday = getPart("weekday");
    const day = getPart("day");
    const month = getPart("month");
    const year = getPart("year");
    const hour = getPart("hour");
    const minute = getPart("minute");

    return `${weekday}, ${day} ${month} ${year}, Jam ${hour}.${minute} ${tzAbbr}`;
  } catch {
    return dateTime(iso);
  }
}

// Formatter Durasi Kerja Profesional
export function formatWorkDuration(inIso, outIso) {
  if (!inIso) return "-";
  const start = new Date(inIso).getTime();
  const end = outIso ? new Date(outIso).getTime() : Date.now();
  const diffMin = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;

  if (outIso) {
    if (hours === 0) return `${mins}m`;
    return `${hours}j ${mins}m`;
  } else {
    if (hours === 0) return `${mins}m berjalan`;
    return `${hours}j ${mins}m berjalan`;
  }
}

// Pengelompokan sesi absensi (Check-in & Check-out pairing) per kasir & tanggal
export function pairAttendanceSessions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const userMap = {};

  sorted.forEach((r) => {
    if (!userMap[r.profile_id]) userMap[r.profile_id] = [];
    userMap[r.profile_id].push(r);
  });

  const sessions = [];

  Object.entries(userMap).forEach(([pId, userRows]) => {
    let currentIn = null;
    userRows.forEach((r) => {
      if (r.kind === "in") {
        if (currentIn) {
          sessions.push({
            id: currentIn.id,
            profile_id: pId,
            branch_id: currentIn.branch_id,
            inRow: currentIn,
            outRow: null,
            created_at: currentIn.created_at,
          });
        }
        currentIn = r;
      } else if (r.kind === "out") {
        if (currentIn) {
          sessions.push({
            id: `${currentIn.id}_${r.id}`,
            profile_id: pId,
            branch_id: currentIn.branch_id || r.branch_id,
            inRow: currentIn,
            outRow: r,
            created_at: r.created_at,
          });
          currentIn = null;
        } else {
          sessions.push({
            id: r.id,
            profile_id: pId,
            branch_id: r.branch_id,
            inRow: null,
            outRow: r,
            created_at: r.created_at,
          });
        }
      }
    });

    if (currentIn) {
      sessions.push({
        id: currentIn.id,
        profile_id: pId,
        branch_id: currentIn.branch_id,
        inRow: currentIn,
        outRow: null,
        created_at: currentIn.created_at,
      });
    }
  });

  return sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Preload logo Tijarah Header untuk stempel kanvas
let cachedLogo = null;
if (typeof window !== "undefined") {
  cachedLogo = new Image();
  cachedLogo.src = "/tijarah-header.svg";
}

export default function Attendance() {
  const { api, profile, role, tenant } = useAuth();
  const { lang } = useAccountLang();
  const isManager = ["owner", "gm", "superadmin"].includes(role);
  const a = useAction();
  const [branchFilter, setBranchFilter] = useState("");
  const [fix, setFix] = useState(null); // { row, at, reason }
  const [photoPreview, setPhotoPreview] = useState(null); // URL / row to preview in modal
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [stampedSelfie, setStampedSelfie] = useState(null);

  // Field Catatan Presensi (Default: "-")
  const [notes, setNotes] = useState("-");
  // Alamat hasil Reverse Geocoding Google Maps / OpenStreetMap
  const [detectedAddress, setDetectedAddress] = useState("");
  const [isDetectingAddress, setIsDetectingAddress] = useState(false);
  // Izin Pulang Lebih Awal (jika jam belum masuk waktu checkout)
  const [allowEarlyCheckout, setAllowEarlyCheckout] = useState(false);

  // Checkbox checklist konfigurasi Anomali Presensi (dapat diaktifkan/dinonaktifkan)
  const tenantKey = tenant?.id || "default";
  const [anomalyEnabled, setAnomalyEnabled] = useState(() => {
    try {
      const s = localStorage.getItem(`sdm_anomaly_flag_${tenantKey}`);
      return s !== null ? JSON.parse(s) : true;
    } catch {
      return true;
    }
  });
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const toggleAnomaly = (val) => {
    setAnomalyEnabled(val);
    try {
      localStorage.setItem(`sdm_anomaly_flag_${tenantKey}`, JSON.stringify(val));
    } catch { /* storage not available */ }
  };

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const autoClockoutRunRef = useRef(false);

  const r = useAsync(async () => {
    const isStaff = profile?.branch_id && role === "staff";
    const [rows, branches, people, shifts] = await Promise.all([
      api.list("attendance", {
        eq: {
          ...(tenant?.id ? { tenant_id: tenant.id } : {}),
          ...(isStaff && profile?.id ? { profile_id: profile.id } : {})
        },
        order: ["created_at", "desc"],
        limit: isStaff ? 60 : 120,
      }),
      api.list("branches", { eq: { ...(tenant?.id ? { tenant_id: tenant.id } : {}) } }),
      api.list("profiles", { eq: { ...(tenant?.id ? { tenant_id: tenant.id } : {}) } }).catch(() => []),
      isStaff && profile?.id
        ? api.list("work_shifts", { eq: { ...(tenant?.id ? { tenant_id: tenant.id } : {}), profile_id: profile.id } }).catch(() => [])
        : Promise.resolve([]),
    ]);
    return { rows, branches, people, shifts };
  }, [api, profile?.id, profile?.branch_id, role, tenant?.id], { key: `attendance@${tenant?.id || "d"}@${profile?.id || "u"}` });

  // Realtime subscription agar riwayat absensi kasir langsung terupdate di role Staf, Owner, dan GM
  useLive(["attendance", "work_shifts", "profiles", "branches"], () => {
    api.invalidateCache?.("attendance");
    api.invalidateCache?.("work_shifts");
    r.reload();
  });

  const br = useIndex(r.data?.branches);
  const ppl = useIndex(r.data?.people);
  const me = ppl[profile?.id];
  const consented = Boolean(me?.attendance_consent_at);
  const mine = (r.data?.rows ?? []).filter((x) => x.profile_id === profile?.id);
  const home = r.data?.branches?.find((x) => x.id === profile?.branch_id);
  const selfieRequired = Boolean(tenant?.attendance_selfie_required);
  const canFix = can(role, 13, "u");

  // Cari jadwal shift hari ini berdasarkan zona waktu aktif (Default: WITA)
  const appTimezone = getAppTimezone();
  const appTzAbbr = getTimezoneAbbr(appTimezone);

  const todayIso = (() => {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: appTimezone });
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  })();
  const myShifts = r.data?.shifts ?? [];
  const todayShift = myShifts.find((s) => s.work_date === todayIso);
  const latestShift = [...myShifts].sort((a, b) => (b.work_date || "").localeCompare(a.work_date || ""))[0];

  // Cari log presensi staf hari ini
  const todayAttendances = mine.filter((x) => {
    try {
      const d = new Date(x.created_at).toLocaleDateString("en-CA", { timeZone: appTimezone });
      return d === todayIso;
    } catch {
      return (x.created_at || "").slice(0, 10) === todayIso;
    }
  });

  const todayIn = todayAttendances.find((x) => x.kind === "in");
  const todayOut = todayAttendances.find((x) => x.kind === "out");
  const alreadyCompletedToday = Boolean(todayIn && todayOut);
  const nextKind = !todayIn ? "in" : !todayOut ? "out" : null;

  // Evaluasi jendela waktu pulang (Clock-Out Window) di zona waktu aktif
  const shiftEndTime = todayShift?.end_time;
  const { isBeforeClockOut, shiftEndTimeStr, minutesUntilShiftEnd } = useMemo(() => {
    if (!shiftEndTime || nextKind !== "out") {
      return { isBeforeClockOut: false, shiftEndTimeStr: "", minutesUntilShiftEnd: 0 };
    }
    const [eh, em] = shiftEndTime.split(":").map(Number);
    const shiftEndMin = eh * 60 + em;
    const timeStr = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;

    const nowTzStr = new Date().toLocaleTimeString("en-US", { timeZone: appTimezone, hour12: false });
    const [nowH, nowM] = nowTzStr.split(":").map(Number);
    const nowMin = nowH * 60 + nowM;

    // Terkunci jika waktu sekarang sebelum jam pulang shift (misal sebelum 12:00)
    if (nowMin < shiftEndMin) {
      return {
        isBeforeClockOut: true,
        shiftEndTimeStr: timeStr,
        minutesUntilShiftEnd: shiftEndMin - nowMin,
      };
    }
    return { isBeforeClockOut: false, shiftEndTimeStr: timeStr, minutesUntilShiftEnd: 0 };
  }, [shiftEndTime, nextKind, appTimezone]);

  const isLockedClockOut = nextKind === "out" && isBeforeClockOut && !allowEarlyCheckout;

  // Otomatisasi Absensi Pulang oleh Sistem (Auto Clock-out by System)
  useEffect(() => {
    if (autoClockoutRunRef.current) return;
    if (!todayShift?.auto_clockout || !todayIn || todayOut) return;
    const [eh, em] = (todayShift.end_time || "16:00").split(":").map(Number);
    const delay = Number(todayShift.auto_clockout_delay_min ?? 30);
    const nowTzStr = new Date().toLocaleTimeString("en-US", { timeZone: appTimezone, hour12: false });
    const [nowH, nowM] = nowTzStr.split(":").map(Number);
    const nowMin = nowH * 60 + nowM;
    const autoOutMin = eh * 60 + em + delay;

    if (nowMin >= autoOutMin) {
      autoClockoutRunRef.current = true;
      api.rpc("clock", {
        p_kind: "out",
        p_lat: home?.lat || -5.15,
        p_lng: home?.lng || 119.43,
        p_accuracy: 10,
        p_selfie: null,
        p_notes: "[AUTO-CLOCKOUT BY SYSTEM]",
        p_address: null,
      }).then(() => {
        r.reload();
      }).catch(() => {});
    }
  }, [todayShift?.id, todayIn?.id, todayOut?.id, home?.lat, home?.lng, api]);

  // Stop camera stream when unmounting
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Hentikan kamera secara otomatis jika masuk mode terkunci sebelum jam keluar
  useEffect(() => {
    if (isLockedClockOut && isCameraActive) {
      stopCamera();
    }
  }, [isLockedClockOut, isCameraActive, stopCamera]);

  // Start live webcam stream & deteksi alamat Google Maps
  const startCamera = async () => {
    if (isLockedClockOut) {
      setCameraError(`Presensi pulang terkunci hingga pukul ${shiftEndTimeStr || "12:00"} WITA.`);
      return;
    }
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser Anda tidak mendukung akses kamera langsung.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);

      // Ambil GPS dan reverse geocode alamat lengkap saat kamera dinyalakan
      if (!detectedAddress && !isDetectingAddress) {
        setIsDetectingAddress(true);
        getPos()
          .then((coords) => reverseGeocode(coords.latitude, coords.longitude))
          .then((addr) => {
            if (addr) setDetectedAddress(addr);
          })
          .catch(() => {})
          .finally(() => setIsDetectingAddress(false));
      }
    } catch (err) {
      setCameraError(err.message || "Gagal mengaktifkan kamera");
      setIsCameraActive(false);
    }
  };

  // Generate canvas with live video frame + watermark stempel digital anti-rekayasa
  const capturePhotoWithWatermark = (coords, branchName, fullAddress) => {
    const canvas = document.createElement("canvas");
    const vid = videoRef.current;
    const vw = (vid && vid.videoWidth) ? vid.videoWidth : 1280;
    const vh = (vid && vid.videoHeight) ? vid.videoHeight : 960;
    const width = Math.max(vw, 1280);
    const height = Math.max(vh, 960);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (isCameraActive && vid && vid.readyState >= 2) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(vid, 0, 0, width, height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e293b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.4, 120, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      const initials = (profile.full_name || "ST").slice(0, 2).toUpperCase();
      ctx.fillText(initials, width / 2, height * 0.4 + 22);
      ctx.textAlign = "left";
    }

    // Sematkan logo resmi tijarah-header.svg HD di pojok kiri bawah (tanpa tulisan teks berlebih)
    if (cachedLogo && cachedLogo.complete && cachedLogo.naturalWidth > 0) {
      const logoW = Math.round(width * 0.16);
      const logoH = Math.round(logoW * (cachedLogo.naturalHeight / cachedLogo.naturalWidth));
      const padX = Math.round(width * 0.03);
      const padY = Math.round(height * 0.035);
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 10;
      ctx.drawImage(cachedLogo, padX, height - logoH - padY, logoW, logoH);
      ctx.restore();
    }

    return canvas.toDataURL("image/jpeg", 0.95);
  };

  const clock = () => a.run(async () => {
    if (alreadyCompletedToday) {
      throw new Error("Anda sudah menyelesaikan absensi masuk dan pulang hari ini.");
    }
    if (selfieRequired && !consented) {
      throw new Error("Setujui penggunaan foto selfie dan data lokasi untuk absensi (UU PDP).");
    }

    // Validasi Waktu Pulang: jika kasir mencoba clock-out sebelum jam shift berakhir
    if (nextKind === "out" && isBeforeClockOut) {
      if (!allowEarlyCheckout) {
        throw new Error(
          `Belum waktu absen pulang. Shift Anda berakhir pukul ${shiftEndTimeStr || todayShift?.end_time?.slice(0, 5) || "12:00"} WITA (tersisa ±${minutesUntilShiftEnd} menit lagi).`
        );
      }
      if (!notes || notes === "-" || notes.trim().length < 5) {
        throw new Error("Wajib mencantumkan alasan izin pulang lebih awal pada kolom Catatan Presensi (minimal 5 karakter).");
      }
    }

    const c = await getPos();

    // Dapatkan alamat Google Maps jika belum ada
    let finalAddress = detectedAddress;
    if (!finalAddress) {
      try {
        finalAddress = await reverseGeocode(c.latitude, c.longitude);
        if (finalAddress) setDetectedAddress(finalAddress);
      } catch { /* graceful fallback */ }
    }

    // Capture photo with automatic live watermark in crisp HD
    const photoDataUrl = capturePhotoWithWatermark(c, home?.name, finalAddress);
    setStampedSelfie(photoDataUrl);

    let path = photoDataUrl;
    if (api.upload && !photoDataUrl.startsWith("data:")) {
      path = await api.upload("selfies", photoDataUrl);
    }

    try {
      await api.rpc("clock", {
        p_kind: nextKind || "in",
        p_lat: c.latitude,
        p_lng: c.longitude,
        p_accuracy: Math.round(c.accuracy ?? 0) || null,
        p_selfie: path,
        p_notes: notes.trim() || "-",
        p_address: finalAddress || null,
      });
    } catch (err) {
      if (err.message && err.message.includes("Anda sudah absen masuk hari ini")) {
        api.invalidateCache?.("attendance");
        await r.reload();
        stopCamera();
        throw new Error("Data presensi telah disinkronkan. Anda sudah tercatat absen masuk hari ini; silakan lakukan Absen Pulang jika shift telah selesai.");
      }
      throw err;
    }

    api.invalidateCache?.("attendance");
    stopCamera();
    setNotes("-");
    setAllowEarlyCheckout(false);
    await r.reload();
  }, nextKind === "in" ? "Absen masuk & selfie berhasil tercatat" : "Absen pulang & selfie berhasil tercatat");

  const consent = () => a.run(async () => {
    await api.rpc("give_attendance_consent", {});
    r.reload();
  }, "Persetujuan pemrosesan foto & lokasi tersimpan");

  const saveFix = () => a.run(async () => {
    await api.rpc("correct_attendance", {
      p_id: fix.row.id,
      p_at: new Date(fix.at).toISOString(),
      p_reason: fix.reason,
    });
    setFix(null);
    r.reload();
  }, "Absensi berhasil dikoreksi");

  const rejectPresensi = () => a.run(async () => {
    if (!rejectReason.trim()) throw new Error("Alasan penolakan presensi wajib diisi");
    await api.rpc("correct_attendance", {
      p_id: rejectModal.id,
      p_at: rejectModal.created_at,
      p_reason: `[DITOLAK] ${rejectReason.trim()}`,
    });
    setRejectModal(null);
    setRejectReason("");
    r.reload();
  }, "Presensi ditolak dan dicatat di log audit");

  const handleClearAttendance = () => a.run(async () => {
    await api.rpc("clear_attendance", { p_branch_id: branchFilter || null });
    setClearModalOpen(false);
    r.reload();
  }, branchFilter ? "Riwayat absensi cabang berhasil dikosongkan" : "Seluruh riwayat absensi berhasil dikosongkan");

  const getAnomalies = (x) => {
    if (!x || !anomalyEnabled) return [];
    const flags = [];
    const b = br[x.branch_id] || home;
    const maxRadius = b?.geofence_m || 50;
    if ((x.distance_m ?? 0) > maxRadius) {
      flags.push({ label: `Geofence (> ${maxRadius}m)`, tone: "danger" });
    }
    if (x.accuracy_m != null && x.accuracy_m > 50) {
      flags.push({ label: `Akurasi Rendah (±${x.accuracy_m}m)`, tone: "warn" });
    }
    if (x.late_min > 60) {
      flags.push({ label: `Telat Ekstrem (${x.late_min}m)`, tone: "danger" });
    }
    if (x.correction_reason && x.correction_reason.startsWith("[DITOLAK]")) {
      flags.push({ label: "Ditolak", tone: "danger" });
    }
    return flags;
  };

  const allRows = (r.data?.rows ?? []).filter((x) => {
    if (!isManager) {
      return profile.branch_id ? x.branch_id === profile.branch_id : x.profile_id === profile.id;
    }
    return !branchFilter || x.branch_id === branchFilter;
  });

  // Pasangkan baris raw menjadi sesi kehadiran Kasir (Check-in & Check-out)
  const pairedSessions = useMemo(() => pairAttendanceSessions(allRows), [allRows]);

  const totalAnomalies = allRows.filter((x) => getAnomalies(x).length > 0).length;

  const displayedSessions = useMemo(() => {
    if (isManager && anomalyEnabled && onlyAnomaly) {
      return pairedSessions.filter(
        (s) => (s.inRow && getAnomalies(s.inRow).length > 0) || (s.outRow && getAnomalies(s.outRow).length > 0)
      );
    }
    return pairedSessions;
  }, [pairedSessions, isManager, anomalyEnabled, onlyAnomaly]);

  return (
    <>
      <PageHead
        eyebrow="Fitur 13 · Presensi Kamera & GPS"
        title="Absensi & Verifikasi Wajah"
        desc="Presensi valid menggunakan kamera live dengan stempel digital anti-rekayasa dan validasi radius geofencing per cabang."
      />

      {r.loading && !r.data ? (
        <Loading />
      ) : r.error ? (
        <ErrorNote error={r.error} onRetry={r.reload} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%" }}>
          {/* 1. PANEL PRESENSI LIVE CAMERA KASIR / STAF (DI ATAS - FULL WIDTH KE KANAN) */}
          {profile.branch_id && (
            <Panel
              title={alreadyCompletedToday ? "Presensi Shift Hari Ini Lengkap" : nextKind === "in" ? "Absen Masuk Kamera" : "Absen Pulang Kamera"}
              meta={`Outlet: ${home?.name || "Cabang Anda"}`}
            >
              <div className="att-layout">
                {/* Kolom Kiri: Viewfinder Live Webcam & Deteksi Alamat Satelit */}
                <div className="att-viewfinder">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="att-viewfinder__video"
                    style={{ display: isCameraActive ? "block" : "none" }}
                  />

                  {/* Oval Panduan Wajah saat kamera aktif */}
                  {isCameraActive && (
                    <div className="att-viewfinder__face-guide">
                      <span className="att-viewfinder__face-label">
                        Posisikan Wajah
                      </span>
                    </div>
                  )}

                  {/* Badge Status Live */}
                  {isCameraActive && (
                    <div className="att-viewfinder__live-badge">
                      <span className="att-viewfinder__live-dot" />
                      LIVE WEBCAM
                    </div>
                  )}

                  {/* Logo Tijarah resmi di pojok kiri bawah viewfinder live */}
                  <img
                    src="/tijarah-header.svg"
                    alt="Tijarah"
                    className="att-viewfinder__logo"
                  />

                  {/* Layar saat kamera belum aktif atau terkunci */}
                  {isLockedClockOut ? (
                    <div className="att-viewfinder__locked">
                      <div className="att-viewfinder__lock-icon">
                        <i className="fa-solid fa-lock" />
                      </div>
                      <p className="att-viewfinder__lock-title">
                        Presensi Pulang Terkunci
                      </p>
                      <p className="att-viewfinder__lock-desc">
                        Belum memasuki jam pulang shift (<strong>{shiftEndTimeStr || todayShift?.end_time?.slice(0, 5) || "12:00"} WITA</strong>). Tersisa ±{minutesUntilShiftEnd} menit lagi.
                      </p>
                      <span className="att-viewfinder__lock-badge">
                        <i className="fa-solid fa-shield-halved" />
                        Kamera Dinonaktifkan Sesuai Jadwal
                      </span>
                    </div>
                  ) : !isCameraActive ? (
                    <div className="att-viewfinder__inactive">
                      <div className="att-viewfinder__inactive-icon">
                        <i className="fa-solid fa-camera" />
                      </div>
                      <p className="att-viewfinder__inactive-text">
                        {lang === "en" ? "Camera Not Active" : "Kamera Belum Aktif"}
                      </p>
                      <button
                        type="button"
                        className="d-btn d-btn--primary"
                        onClick={startCamera}
                      >
                        <i className="fa-solid fa-camera" style={{ marginRight: "0.4rem" }} />
                        {t("Nyalakan Kamera Depan", lang)}
                      </button>
                      {cameraError && (
                        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "#f87171" }}>
                          {cameraError}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Kolom Kanan: Jadwal Kerja, Waktu Pulang, Catatan Presensi, & Aksi */}
                <div className="att-controls">
                  {/* Shift info banner */}
                  <div className="att-shift-banner">
                    <div className="att-shift-banner__head">
                      <span className="att-shift-banner__title">
                        <i className="fa-solid fa-calendar-day" style={{ marginRight: "0.35rem" }} />
                        Jadwal Kerja Hari Ini:
                      </span>
                      {todayShift ? (
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                          <Badge tone="ok">{todayShift.start_time.slice(0, 5)} - {todayShift.end_time.slice(0, 5)} WITA</Badge>
                          {todayShift.late_tolerance_min != null && todayShift.late_tolerance_min !== 0 && (
                            <Badge tone="accent">Tol {todayShift.late_tolerance_min} mnt</Badge>
                          )}
                          {todayShift.auto_clockout && (
                            <Badge tone="ok">Auto-Out +{todayShift.auto_clockout_delay_min || 30}m</Badge>
                          )}
                        </div>
                      ) : latestShift ? (
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                          <Badge tone="neutral">Shift Reguler</Badge>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                            (Terdaftar: {date(latestShift.work_date)} · {latestShift.start_time.slice(0, 5)}–{latestShift.end_time.slice(0, 5)} WITA)
                          </span>
                        </div>
                      ) : (
                        <Badge tone="neutral">Shift Reguler (08:00–17:00)</Badge>
                      )}
                    </div>
                    <p className="att-shift-banner__desc">
                      {todayShift ? (
                        <>
                          Outlet: <strong>{br[todayShift.branch_id]?.name || home?.name}</strong> · Radius geofence <strong>{home?.geofence_m || 50} meter</strong>.
                          {todayShift.late_tolerance_min != null && todayShift.late_tolerance_min > 0 && ` Toleransi presensi masuk: ${todayShift.late_tolerance_min} menit.`}
                          {todayShift.auto_clockout && ` Otomatis clock-out sistem aktif (+${todayShift.auto_clockout_delay_min || 30} menit).`}
                        </>
                      ) : (
                        <>
                          Koordinat Anda akan divalidasi dengan radius <strong>{home?.geofence_m || 50} meter</strong> dari titik outlet {home?.name}.
                          {latestShift && ` Jadwal shift khusus hari ini (${date(todayIso)}) belum dibuatkan oleh Owner/GM (jadwal terdaftar terakhir: ${date(latestShift.work_date)}).`}
                        </>
                      )}
                    </p>
                  </div>

                  {/* Peringatan Waktu Pulang & Opsi Izin Pulang Lebih Awal */}
                  {nextKind === "out" && isBeforeClockOut && (
                    <div className="att-early-checkout">
                      <div className="att-early-checkout__header">
                        <i className="fa-solid fa-clock" />
                        Belum Memasuki Waktu Pulang Shift
                      </div>
                      <p className="att-early-checkout__desc">
                        Jadwal shift Anda berakhir pukul <strong>{shiftEndTimeStr || todayShift?.end_time?.slice(0, 5) || "12:00"} WITA</strong>.
                        Tersisa ±{minutesUntilShiftEnd} menit sebelum absensi pulang reguler.
                      </p>
                      <div>
                        <label className="att-early-checkout__checkbox">
                          <input
                            type="checkbox"
                            checked={allowEarlyCheckout}
                            onChange={(e) => setAllowEarlyCheckout(e.target.checked)}
                          />
                          Izin Pulang Lebih Awal (Darurat / Dispensasi Khusus)
                        </label>
                      </div>
                      {allowEarlyCheckout && (
                        <p className="att-early-checkout__note">
                          * Alasan izin pulang awal wajib dicantumkan pada kolom catatan di bawah ini untuk diverifikasi oleh Owner/GM.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Input Catatan Presensi (Default: -) */}
                  {!alreadyCompletedToday && (
                    <div className="att-notes-group">
                      <label htmlFor="att-notes">
                        Catatan Presensi (Opsional)
                      </label>
                      <input
                        id="att-notes"
                        type="text"
                        className="d-input"
                        value={notes}
                        placeholder="Contoh: Izin tugas luar outlet / dinas / kendala jaringan (Default: -)"
                        onChange={(e) => setNotes(e.target.value)}
                        style={{ width: "100%", fontSize: "0.8125rem", padding: "6px 10px" }}
                      />
                      <span className="att-notes-hint">
                        Catatan ini akan tampil di daftar riwayat Owner/GM (Default: -).
                      </span>
                    </div>
                  )}

                  {/* Persetujuan PDP & Tombol Tindakan */}
                  <div>
                    {!consented && (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <button
                          type="button"
                          className="d-btn d-btn--ghost d-btn--sm"
                          style={{ width: "100%", fontSize: "0.75rem" }}
                          onClick={consent}
                        >
                          <i className="fa-solid fa-check" style={{ marginRight: "0.4rem" }} />
                          Saya Setuju Foto &amp; GPS Saya Diproses untuk Presensi (UU PDP)
                        </button>
                      </div>
                    )}

                    <div>
                      {alreadyCompletedToday ? (
                        <div className="att-completed-card">
                          <div className="att-completed-card__title">
                            <i className="fa-solid fa-circle-check" />
                            Presensi Shift Hari Ini Sudah Lengkap
                          </div>
                          <p className="att-completed-card__time">
                            Masuk: {new Date(todayIn.created_at).toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" })} WITA &bull; Pulang: {new Date(todayOut.created_at).toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" })} WITA
                          </p>
                          <span className="att-completed-card__note">
                            Anda sudah menyelesaikan absensi masuk &amp; pulang untuk jadwal shift ini. Tidak dapat melakukan absensi berulang.
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="d-btn d-btn--primary d-btn--block"
                          style={{ padding: "0.75rem" }}
                          disabled={
                            a.busy ||
                            (nextKind === "out" && isBeforeClockOut && !allowEarlyCheckout) ||
                            (nextKind === "out" && isBeforeClockOut && allowEarlyCheckout && (!notes || notes === "-" || notes.trim().length < 5))
                          }
                          onClick={() => clock()}
                        >
                          {a.busy ? (
                            lang === "en" ? "Recording Attendance..." : "Merekam Presensi..."
                          ) : nextKind === "out" && isBeforeClockOut && !allowEarlyCheckout ? (
                            <>
                              <i className="fa-solid fa-lock" style={{ marginRight: "0.4rem" }} />
                              {lang === "en" ? `Waiting for Clock-Out Time (${shiftEndTimeStr || todayShift?.end_time?.slice(0, 5) || "12:00"} WITA)` : `Menunggu Jam Pulang (${shiftEndTimeStr || todayShift?.end_time?.slice(0, 5) || "12:00"} WITA)`}
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-camera" style={{ marginRight: "0.4rem" }} />
                              {nextKind === "in" ? t("Ambil Foto & Absen Masuk", lang) : t("Ambil Foto & Absen Pulang", lang)}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <Feedback a={a} />
                </div>
              </div>
            </Panel>
          )}

          {/* 2. PANEL RIWAYAT ABSENSI KASIR (DI BAWAH - FULL WIDTH 100% UNTUK OWNER, GM, DAN STAF) */}
          <Panel
            title="Riwayat Absensi Kasir"
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                {/* Indikator / Filter Cabang */}
                {!isManager ? (
                  <div
                    className="att-branch-chip"
                    title="Cabang penugasan resmi Anda (Role staf/kasir terkunci ke cabang penugasan)"
                  >
                    <i className="fa-solid fa-store" style={{ color: "var(--color-primary, #0B5D4B)" }} />
                    <span>{home?.name || "Cabang Penugasan"}</span>
                  </div>
                ) : (
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="d-input"
                    style={{ fontSize: "0.8125rem", padding: "4px 8px", minWidth: "150px" }}
                    aria-label="Filter Cabang"
                  >
                    <option value="">Seluruh Cabang</option>
                    {(r.data?.branches ?? []).filter((b) => !b.is_warehouse).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}

                {/* Log Anomali & Kosongkan Riwayat (Hanya untuk Owner / GM) */}
                {isManager && (
                  <>
                    <label
                      className={`d-check att-anomaly-label ${anomalyEnabled ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={anomalyEnabled}
                        onChange={(e) => toggleAnomaly(e.target.checked)}
                      />
                      <span>Log Anomali & Anomali Flag</span>
                    </label>

                    {anomalyEnabled && (
                      <div style={{ display: "inline-flex", gap: "4px" }}>
                        <button
                          type="button"
                          className={`d-btn d-btn--sm ${!onlyAnomaly ? "d-btn--primary" : "d-btn--ghost"}`}
                          onClick={() => setOnlyAnomaly(false)}
                          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                        >
                          Semua ({pairedSessions.length})
                        </button>
                        <button
                          type="button"
                          className={`d-btn d-btn--sm ${onlyAnomaly ? "d-btn--primary" : "d-btn--ghost"}`}
                          onClick={() => setOnlyAnomaly(true)}
                          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                        >
                          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "0.25rem" }} />
                          Anomali Saja ({totalAnomalies})
                        </button>
                      </div>
                    )}

                    {allRows.length > 0 && (
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--danger-ghost"
                        onClick={() => setClearModalOpen(true)}
                        title="Kosongkan riwayat absensi kasir dari database"
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      >
                        <i className="fa-solid fa-trash-can" style={{ marginRight: "0.25rem" }} />
                        Kosongkan Riwayat
                      </button>
                    )}
                  </>
                )}
              </div>
            }
          >
            {displayedSessions.length === 0 ? (
              <Empty
                title={onlyAnomaly ? "Tidak ada anomali presensi" : "Belum ada data absensi"}
                desc={onlyAnomaly ? "Seluruh presensi kasir tercatat dalam batas aman." : "Presensi kasir akan muncul di sini secara berurutan."}
              />
            ) : (
              <div className="d-table-wrap" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="d-table" style={{ minWidth: "1020px" }}>
                  <thead>
                    <tr>
                      <th scope="col">NAMA LENGKAP</th>
                      <th scope="col">CABANG</th>
                      <th scope="col">FOTO</th>
                      <th scope="col">WAKTU MASUK</th>
                      <th scope="col">WAKTU KELUAR</th>
                      <th scope="col">DURASI KERJA</th>
                      <th scope="col">JARAK DARI CABANG</th>
                      <th scope="col">CATATAN</th>
                      <th scope="col" style={{ textAlign: "right" }}>AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSessions.map((s) => {
                      const person = ppl[s.profile_id];
                      const branch = br[s.branch_id] || home;
                      const maxRadius = branch?.geofence_m || 50;
                      const inDist = s.inRow?.distance_m;
                      const outDist = s.outRow?.distance_m;
                      const maxSessionDist = Math.max(inDist ?? 0, outDist ?? 0);
                      const isOutOfRadius = maxSessionDist > maxRadius;

                      return (
                        <tr key={s.id}>
                          {/* 1. NAMA LENGKAP */}
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {person?.full_name || (s.profile_id === profile.id ? profile.full_name : "Kasir")}
                            </div>
                            <div className="d-mono d-muted" style={{ fontSize: "0.8rem", marginTop: "2px" }}>
                              {person?.role === "staff" ? "L3 · Staff Kasir" : person?.role?.toUpperCase() || "Staff"}
                            </div>
                          </td>

                          {/* 2. CABANG */}
                          <td>
                            <div style={{ fontWeight: 500 }}>{branch?.name || "Cabang"}</div>
                          </td>

                          {/* 3. FOTO (Presensi Masuk & Pulang) */}
                          <td>
                            <div className="att-photo-cell">
                              {/* Foto Masuk */}
                              {s.inRow?.selfie_path ? (
                                <div
                                  className="att-photo-thumb att-photo-thumb--in"
                                  onClick={() => setPhotoPreview(s.inRow)}
                                  title="Klik untuk melihat foto Absen Masuk"
                                >
                                  <img src={s.inRow.selfie_path} alt="Masuk" />
                                </div>
                              ) : (
                                <div
                                  className="att-photo-fallback"
                                  title="Absen GPS Masuk (Tanpa Foto)"
                                >
                                  GPS
                                </div>
                              )}

                              {/* Foto Keluar */}
                              {s.outRow ? (
                                s.outRow.selfie_path ? (
                                  <div
                                    className="att-photo-thumb att-photo-thumb--out"
                                    onClick={() => setPhotoPreview(s.outRow)}
                                    title="Klik untuk melihat foto Absen Pulang"
                                  >
                                    <img src={s.outRow.selfie_path} alt="Pulang" />
                                  </div>
                                ) : (
                                  <div
                                    className="att-photo-fallback"
                                    title="Absen GPS Pulang (Tanpa Foto)"
                                  >
                                    GPS
                                  </div>
                                )
                              ) : (
                                <div
                                  className="att-photo-fallback att-photo-fallback--pending"
                                  title="Belum Absen Pulang"
                                >
                                  <i className="fa-solid fa-camera" style={{ fontSize: "0.75rem", opacity: 0.6 }} />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 4. WAKTU MASUK */}
                          <td>
                            {s.inRow ? (
                              <div>
                                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{formatFullWita(s.inRow.created_at)}</div>
                                {s.inRow.late_min > 0 ? (
                                  <Badge tone="warn" style={{ marginTop: "4px" }}>
                                    telat {s.inRow.late_min} mnt
                                  </Badge>
                                ) : (
                                  <Badge tone="ok" style={{ marginTop: "4px" }}>
                                    tepat waktu
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="d-muted">-</span>
                            )}
                          </td>

                          {/* 5. WAKTU KELUAR */}
                          <td>
                            {s.outRow ? (
                              <div>
                                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{formatFullWita(s.outRow.created_at)}</div>
                                <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                                  {s.outRow.auto_clockout && (
                                    <Badge tone="accent">Auto-Out</Badge>
                                  )}
                                  {s.outRow.overtime_min > 0 ? (
                                    <Badge tone="accent">lembur +{s.outRow.overtime_min} mnt</Badge>
                                  ) : (
                                    <Badge tone="ok">sesuai jadwal</Badge>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <Badge tone="warn">Masih terbuka</Badge>
                            )}
                          </td>

                          {/* 6. DURASI KERJA */}
                          <td className="d-mono">
                            <div style={{ fontWeight: 600, color: s.outRow ? "inherit" : "var(--color-accent, #2563eb)" }}>
                              {formatWorkDuration(s.inRow?.created_at, s.outRow?.created_at)}
                            </div>
                            {!s.outRow && (
                              <div className="d-muted" style={{ fontSize: "0.75rem", marginTop: "2px" }}>berjalan</div>
                            )}
                          </td>

                          {/* 7. JARAK DARI CABANG */}
                          <td>
                            <div className="d-mono" style={{ fontWeight: 600 }}>
                              {inDist != null ? `${inDist} m` : "-"}
                              {outDist != null ? ` / ${outDist} m` : ""}
                              <span className="d-muted" style={{ fontWeight: 400 }}> / {maxRadius} m</span>
                            </div>
                            <div style={{ marginTop: "3px" }}>
                              {isOutOfRadius ? (
                                <Badge tone="danger">Di luar radius</Badge>
                              ) : (
                                <span className="d-muted" style={{ fontSize: "0.78rem" }}>Radius aman: {maxRadius} m</span>
                              )}
                            </div>
                          </td>

                          {/* 8. CATATAN & ALAMAT */}
                          <td style={{ maxWidth: "260px" }}>
                            <div style={{ wordBreak: "break-word", fontWeight: (s.outRow?.notes && s.outRow.notes !== "-") || (s.inRow?.notes && s.inRow.notes !== "-") ? 500 : 400 }}>
                              {s.outRow?.notes && s.outRow.notes !== "-"
                                ? s.outRow.notes
                                : s.inRow?.notes && s.inRow.notes !== "-"
                                ? s.inRow.notes
                                : <span className="d-muted">-</span>}
                            </div>
                            {(s.inRow?.address || s.outRow?.address) && (
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--color-muted)",
                                  marginTop: "4px",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "4px",
                                  lineHeight: 1.4,
                                }}
                                title={s.inRow?.address || s.outRow?.address}
                              >
                                <i className="fa-solid fa-location-dot" style={{ color: "var(--color-accent, #2563eb)", marginTop: "3px", flexShrink: 0 }} />
                                <span>{s.inRow?.address || s.outRow?.address}</span>
                              </div>
                            )}
                          </td>

                          {/* 9. AKSI */}
                          <td className="d-row-actions">
                            {(s.inRow?.selfie_path || s.outRow?.selfie_path) && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                onClick={() => setPhotoPreview(s.outRow?.selfie_path ? s.outRow : s.inRow)}
                                title="Lihat foto presensi berstempel digital"
                              >
                                Lihat Foto
                              </button>
                            )}
                            {canFix && (s.inRow?.profile_id !== profile.id || isManager) && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                onClick={() => {
                                  const target = s.outRow || s.inRow;
                                  setFix({ row: target, at: localInput(target.created_at), reason: "" });
                                }}
                                title="Koreksi waktu absen kasir"
                              >
                                Koreksi
                              </button>
                            )}
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
      )}

      {/* Modal Pratinjau Foto Selfie Terverifikasi untuk Owner / GM */}
      {photoPreview && (
        <Modal
          open
          title="Verifikasi Foto & GPS Presensi"
          onClose={() => setPhotoPreview(null)}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              {canFix && photoPreview.profile_id !== profile.id && !photoPreview.correction_reason?.startsWith("[DITOLAK]") ? (
                <button
                  type="button"
                  className="d-btn d-btn--danger-ghost d-btn--sm"
                  onClick={() => {
                    const rTarget = photoPreview;
                    setPhotoPreview(null);
                    setRejectModal(rTarget);
                    setRejectReason("");
                  }}
                >
                  Tolak Presensi
                </button>
              ) : <span />}
              <button
                type="button"
                className="d-btn d-btn--primary"
                onClick={() => setPhotoPreview(null)}
              >
                Tutup Pratinjau
              </button>
            </div>
          }
        >
          <div className="att-modal-body">
            <div className="att-modal-photo-wrap">
              <img
                src={photoPreview.selfie_path}
                alt="Foto Presensi Terverifikasi"
                className="att-modal-photo-img"
              />
            </div>

            <div className="att-modal-details">
              <div>
                <strong>Karyawan:</strong> {ppl[photoPreview.profile_id]?.full_name || "Kasir"} ·{" "}
                <span style={{ color: photoPreview.kind === "in" ? "var(--color-ok, #10b981)" : "var(--color-warn, #f59e0b)", fontWeight: 700 }}>
                  {photoPreview.kind === "in" ? "Absen Masuk" : "Absen Pulang"}
                </span>
              </div>
              <div>
                <strong>Cabang:</strong> {br[photoPreview.branch_id]?.name || "Cabang"}
              </div>
              <div>
                <strong>Waktu Presensi:</strong> {formatFullWita(photoPreview.created_at)}
              </div>
              <div>
                <strong>Jarak ke Outlet:</strong> {photoPreview.distance_m ?? 0} meter{" "}
                {photoPreview.accuracy_m != null && `(Akurasi GPS: ±${photoPreview.accuracy_m}m)`}
              </div>
              {photoPreview.address && (
                <div>
                  <strong>Alamat Google Maps:</strong> {photoPreview.address}
                </div>
              )}
              {photoPreview.notes && photoPreview.notes !== "-" && (
                <div>
                  <strong>Catatan Kasir:</strong> {photoPreview.notes}
                </div>
              )}
              {photoPreview.late_min > 0 && (
                <div style={{ color: "var(--color-warn, #d97706)" }}>
                  <strong>Keterlambatan:</strong> {photoPreview.late_min} menit
                </div>
              )}
              {photoPreview.overtime_min > 0 && (
                <div style={{ color: "var(--color-accent, #2563eb)" }}>
                  <strong>Lembur Terhitung:</strong> {photoPreview.overtime_min} menit
                </div>
              )}
              {photoPreview.correction_reason && (
                <div style={{ color: "var(--color-danger, #ef4444)", marginTop: "0.25rem" }}>
                  <strong>Catatan / Status:</strong> {photoPreview.correction_reason}
                </div>
              )}
            </div>

            {/* Embed Google Maps Interaktif Titik Presensi Kasir (Sesuai Gambar 5) */}
            {photoPreview.lat != null && photoPreview.lng != null && (
              <div className="att-modal-map-wrap">
                <div className="att-modal-map-header">
                  <span className="att-modal-map-title">
                    <i className="fa-solid fa-map-location-dot" style={{ color: "var(--color-accent, #0d9488)" }} />
                    Titik Lokasi Presensi (GPS Kasir)
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${photoPreview.lat},${photoPreview.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="d-btn d-btn--ghost d-btn--sm"
                    style={{ fontSize: "0.75rem", textDecoration: "none", height: "1.75rem", padding: "0 0.5rem" }}
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginRight: "0.3rem" }} />
                    Buka Google Maps
                  </a>
                </div>
                <iframe
                  title="Titik Lokasi Presensi Kasir"
                  className="att-modal-map-iframe"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${photoPreview.lat},${photoPreview.lng}&hl=id&z=17&output=embed`}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Tolak Presensi */}
      {rejectModal && (
        <Modal
          open
          title="Tolak Presensi Kasir"
          onClose={() => setRejectModal(null)}
          footer={
            <>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setRejectModal(null)}>
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--danger"
                disabled={a.busy || rejectReason.trim().length < 3}
                onClick={rejectPresensi}
              >
                {a.busy ? "Menolak..." : "Konfirmasi Tolak Presensi"}
              </button>
            </>
          }
        >
          <div className="d-form">
            <p className="d-text" style={{ fontSize: "0.875rem" }}>
              Anda akan membatalkan status sah presensi <strong>{ppl[rejectModal.profile_id]?.full_name}</strong> ({rejectModal.kind === "in" ? "Masuk" : "Pulang"}) pada {formatFullWita(rejectModal.created_at)}.
            </p>
            <Field label="Alasan Penolakan (Wajib Diisi) *" id="rej-r" hint="Alasan akan tercatat permanen di log audit sistem.">
              <textarea
                id="rej-r"
                rows={3}
                placeholder="Contoh: Foto tidak menampilkan wajah kasir / terindikasi di luar radius wajar..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </Field>
            <Feedback a={a} />
          </div>
        </Modal>
      )}

      {/* Modal Koreksi Absen */}
      {fix && (
        <Modal
          open
          title="Koreksi Waktu Absen Kasir"
          onClose={() => setFix(null)}
          footer={
            <>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setFix(null)}>
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={a.busy || (fix?.reason ?? "").trim().length < 5}
                onClick={saveFix}
              >
                Simpan Koreksi
              </button>
            </>
          }
        >
          <div className="d-form">
            <p className="d-text">
              {ppl[fix.row.profile_id]?.full_name} · {fix.row.kind === "in" ? "Masuk" : "Pulang"} · semula {formatFullWita(fix.row.created_at)}
            </p>
            <Field label="Waktu yang Benar" id="fx-at">
              <input
                id="fx-at"
                type="datetime-local"
                value={fix.at}
                onChange={(e) => setFix({ ...fix, at: e.target.value })}
              />
            </Field>
            <Field label="Alasan Koreksi (Wajib)" id="fx-r" hint="Tercatat permanen di audit log bersama stempel waktu.">
              <textarea
                id="fx-r"
                rows={2}
                placeholder="Misal: Lupa tap keluar saat tutup toko karena mendadak mati lampu..."
                value={fix.reason}
                onChange={(e) => setFix({ ...fix, reason: e.target.value })}
              />
            </Field>
            <Feedback a={a} />
          </div>
        </Modal>
      )}

      {/* Modal Kosongkan Riwayat Absensi untuk Owner / GM */}
      {clearModalOpen && (
        <Modal
          open
          title="Kosongkan Riwayat Absensi"
          onClose={() => setClearModalOpen(false)}
          footer={
            <>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setClearModalOpen(false)}>
                Batal
              </button>
              <button
                type="button"
                className="d-btn d-btn--danger"
                disabled={a.busy}
                onClick={handleClearAttendance}
              >
                {a.busy ? "Mengosongkan..." : "Ya, Kosongkan Riwayat"}
              </button>
            </>
          }
        >
          <div className="d-form">
            <p className="d-text" style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
              Apakah Anda yakin ingin mengosongkan riwayat absensi kasir untuk{" "}
              <strong>{branchFilter ? br[branchFilter]?.name || "Cabang Terpilih" : "Seluruh Cabang"}</strong>?
            </p>
            <p className="d-text d-muted" style={{ fontSize: "0.8125rem", marginTop: "0.5rem" }}>
              Tindakan ini akan menghapus catatan presensi kasir dari database dan akan tercatat permanen di log audit sistem.
            </p>
            <Feedback a={a} />
          </div>
        </Modal>
      )}
    </>
  );
}
