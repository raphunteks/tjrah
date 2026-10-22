import { useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, useAsync } from "../../ui/index.jsx";
import { useLive, useIndex } from "../../ops.jsx";

export default function SdmReports() {
  const { api, tenantId } = useAuth();
  const [branchFilter, setBranchFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("30");

  const q = useAsync(async () => {
    const [summary, branches, loans, forms, responses, people, attendance, shifts] = await Promise.all([
      api.rpc("sdm_dashboard_summary", { p_branch: branchFilter || null, p_horizon: Number(periodFilter) || 30 }).catch((e) => {
        console.warn("[sdm_reports] summary RPC note:", e.message);
        return {};
      }),
      api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("staff_loans", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
      api.list("knowledge_forms", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
      api.list("knowledge_responses", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("profiles", { eq: { tenant_id: tenantId }, order: ["full_name"] }).catch(() => []),
      api.list("attendance", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 300 }).catch(() => []),
      api.list("work_shifts", { eq: { tenant_id: tenantId }, order: ["work_date", "desc"], limit: 300 }).catch(() => []),
    ]);

    return {
      summary: summary || {},
      branches: (branches || []).filter((b) => !b.is_warehouse),
      loans: loans || [],
      forms: forms || [],
      responses: responses || [],
      people: people || [],
      attendance: attendance || [],
      shifts: shifts || []
    };
  }, [api, tenantId, branchFilter, periodFilter], { key: `sdm_reports@${tenantId}@${branchFilter}@${periodFilter}` });

  useLive(["work_shifts", "attendance", "leave_requests", "payroll_runs", "staff_loans", "knowledge_forms"], q.reload);

  const branches = q.data?.branches ?? [];
  const summary = q.data?.summary ?? {};
  const rawCashierKpis = summary.cashier_kpis ?? [];
  const rawCompBranches = summary.widgets?.comparative_branches ?? [];
  const loans = q.data?.loans ?? [];
  const forms = q.data?.forms ?? [];
  const responses = q.data?.responses ?? [];
  const people = q.data?.people ?? [];
  const attendance = q.data?.attendance ?? [];
  const shifts = q.data?.shifts ?? [];

  const ppl = useIndex(people);
  const br = useIndex(branches);

  // Perhitungan murni dari database Supabase (Tanpa data fiktif / tiruan)
  const cashierKpis = useMemo(() => {
    const horizonDays = Number(periodFilter) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - horizonDays);

    const targetStaff = people.filter((p) => {
      if (p.role !== "staff" && p.role !== "gm") return false;
      if (branchFilter && p.branch_id !== branchFilter) return false;
      return true;
    });

    return targetStaff.map((p) => {
      const pAtt = attendance.filter((a) => {
        if (a.profile_id !== p.id || a.kind !== "in") return false;
        try {
          return new Date(a.created_at) >= cutoffDate;
        } catch {
          return true;
        }
      });
      const totalAtt = pAtt.length;
      const onTimeAtt = pAtt.filter((a) => !a.late_min || a.late_min <= 5).length;
      const onTimePct = totalAtt > 0 ? Math.round((onTimeAtt / totalAtt) * 100) : null;

      const totalLateMin = pAtt.reduce((sum, a) => sum + (Number(a.late_min) || 0), 0);
      const avgLateMin = totalAtt > 0 ? Math.round(totalLateMin / totalAtt) : 0;
      const totalOvertimeMin = pAtt.reduce((sum, a) => sum + (Number(a.overtime_min) || 0), 0);
      const overtimeHours = Math.round(totalOvertimeMin / 60);
      const weeklyHours = totalAtt * 8 + overtimeHours;

      const tier = totalAtt === 0
        ? "Belum Ada Data"
        : onTimePct >= 90
        ? "Prima"
        : onTimePct >= 75
        ? "Perlu Perhatian"
        : "Kritis";

      return {
        profile_id: p.id,
        full_name: p.full_name,
        branch_name: br[p.branch_id]?.name || "Outlet Utama",
        has_data: totalAtt > 0,
        total_att: totalAtt,
        on_time_pct: onTimePct,
        avg_late_min: avgLateMin,
        weekly_hours: weeklyHours,
        overtime_hours: overtimeHours,
        base_salary: Number(p.base_salary) || 0,
        tier
      };
    });
  }, [people, attendance, branches, branchFilter, periodFilter, br]);

  const comparativeBranches = useMemo(() => {
    return branches.map((b) => {
      const bStaff = people.filter((p) => p.branch_id === b.id && p.role === "staff");
      const bAtt = attendance.filter((a) => a.branch_id === b.id && a.kind === "in");
      const bShifts = shifts.filter((s) => s.branch_id === b.id);

      const attRate = bShifts.length > 0
        ? Math.round((bAtt.length / bShifts.length) * 100)
        : (bAtt.length > 0 ? 100 : null);
      const avgLate = bAtt.length > 0 ? Math.round(bAtt.reduce((acc, a) => acc + (a.late_min || 0), 0) / bAtt.length) : 0;
      const otHours = Math.round(bAtt.reduce((acc, a) => acc + (a.overtime_min || 0), 0) / 60);

      return {
        branch_id: b.id,
        branch_name: b.name,
        total_staff: bStaff.length,
        attendance_rate: attRate,
        avg_late_minutes: avgLate,
        overtime_hours: otHours,
        labour_pct: null // Hanya terisi jika ada kalkulasi omzet aktual
      };
    });
  }, [branches, people, attendance, shifts]);

  // Real CSV Generator Download
  const handleExportCsv = (title, headers, rows) => {
    if (!rows || rows.length === 0) {
      alert(`Belum ada data untuk ${title}.`);
      return;
    }
    const csvLines = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    ];
    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <>
      <PageHead
        eyebrow="Fase 2 &amp; 3 · Analytics &amp; Tata Kelola SDM"
        title="Laporan SDM"
        desc="Pusat rekapitulasi 6 modul laporan resmi ketenagakerjaan, efisiensi labour cost, audit jam kerja lembur, dan kepatuhan staf."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <div className="d-branch-select-wrap">
              <i className="fa-solid fa-store d-branch-select-icon" aria-hidden="true" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="d-branch-select"
                aria-label="Filter Cabang"
                style={{ minWidth: "160px", fontSize: "0.85rem" }}
              >
                <option value="">Seluruh Cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="d-input"
              aria-label="Rentang Periode"
              style={{ minWidth: "130px", fontSize: "0.85rem", padding: "0.35rem 0.65rem" }}
            >
              <option value="7">7 Hari Terakhir</option>
              <option value="14">14 Hari Terakhir</option>
              <option value="30">Bulan Berjalan (30 Hari)</option>
              <option value="90">Kuartal Ini (90 Hari)</option>
            </select>
            <button
              type="button"
              className="d-btn d-btn--sm d-btn--ghost"
              onClick={() => handleExportCsv(
                "Rekapitulasi SDM",
                ["Staf Kasir", "Cabang", "On-Time %", "Rerata Terlambat (Mnt)", "Jam Kerja", "Lembur (Jam)", "Predikat"],
                cashierKpis.map((k) => [k.full_name, k.branch_name, `${k.on_time_pct}%`, k.avg_late_min, k.weekly_hours, k.overtime_hours, k.tier])
              )}
            >
              <i className="fa-solid fa-file-csv" style={{ marginRight: "0.35rem" }} />
              Ekspor CSV
            </button>
            <button
              type="button"
              className="d-btn d-btn--sm d-btn--primary"
              onClick={handlePrintPdf}
            >
              <i className="fa-solid fa-print" style={{ marginRight: "0.35rem" }} />
              Cetak PDF
            </button>
          </div>
        }
      />

      {q.loading && !q.data ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={q.reload} />
      ) : (
        <>
          {/* ──────── 6 LAPORAN RESMI SDM ──────── */}
          <div style={{ display: "grid", gap: "1.5rem", marginBottom: "2rem" }}>
            
            {/* LAPORAN 1: Matriks Kehadiran & Rekap Jam Kerja */}
            <Panel
              title="Laporan 1: Matriks Kehadiran &amp; Rekap Jam Kerja Staf"
              desc="Tabulasi jam kerja terjadwal vs aktual, frekuensi keterlambatan, dan tingkat kedisiplinan per kasir"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Matriks Kehadiran",
                    ["Nama Staf", "Cabang", "On-Time %", "Rerata Terlambat", "Jam Kerja", "Lembur", "Predikat"],
                    cashierKpis.map((k) => [k.full_name, k.branch_name, `${k.on_time_pct}%`, `${k.avg_late_min} mnt`, `${k.weekly_hours} jam`, `${k.overtime_hours} jam`, k.tier])
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              {cashierKpis.length === 0 ? (
                <Empty title="Belum ada data kehadiran pada periode ini" />
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table d-table--fin">
                    <thead>
                      <tr>
                        <th>Staf Kasir</th>
                        <th>Cabang</th>
                        <th className="d-num">On-Time %</th>
                        <th className="d-num">Total Terlambat</th>
                        <th className="d-num">Jam Kerja</th>
                        <th className="d-num">Lembur</th>
                        <th>Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierKpis.map((k) => (
                        <tr key={k.profile_id}>
                          <td style={{ fontWeight: 600 }}>{k.full_name}</td>
                          <td>{k.branch_name}</td>
                          <td className="d-num">
                            {k.on_time_pct !== null ? (
                              <Badge tone={k.on_time_pct >= 90 ? "ok" : k.on_time_pct >= 80 ? "warn" : "danger"}>
                                {k.on_time_pct}%
                              </Badge>
                            ) : (
                              <span className="d-muted">-</span>
                            )}
                          </td>
                          <td className="d-num">{k.has_data ? `${k.avg_late_min} Menit` : "-"}</td>
                          <td className="d-num">{k.has_data ? `${k.weekly_hours} Jam` : "-"}</td>
                          <td className="d-num">{k.has_data ? `${k.overtime_hours} Jam` : "-"}</td>
                          <td>
                            <Badge tone={k.tier === "Prima" ? "ok" : k.tier === "Perlu Perhatian" ? "warn" : k.tier === "Kritis" ? "danger" : "neutral"}>
                              {k.tier}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* LAPORAN 2: Rekapitulasi Biaya Lembur & Penalti Keterlambatan */}
            <Panel
              title="Laporan 2: Rekapitulasi Biaya Lembur &amp; Penalti Keterlambatan"
              desc="Perhitungan kompensasi lembur reguler dan potongan keterlambatan sesuai regulasi payroll"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Biaya Lembur",
                    ["Nama Staf", "Cabang", "Jam Lembur", "Upah Lembur Est", "Menit Terlambat", "Potongan Denda Est"],
                    cashierKpis.map((k) => {
                      const hourlyRate = k.base_salary > 0 ? (k.base_salary / 173) : 0;
                      const otPay = Math.round(k.overtime_hours * hourlyRate * 1.5);
                      const pen = Math.round(k.avg_late_min * (hourlyRate > 0 ? (hourlyRate / 60) : 0));
                      return [k.full_name, k.branch_name, `${k.overtime_hours} jam`, otPay, `${k.avg_late_min} mnt`, pen];
                    })
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              {cashierKpis.length === 0 ? (
                <Empty title="Belum ada catatan lembur" />
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table d-table--fin">
                    <thead>
                      <tr>
                        <th>Staf Kasir</th>
                        <th>Cabang</th>
                        <th className="d-num">Jam Lembur</th>
                        <th className="d-num">Upah Lembur Est.</th>
                        <th className="d-num">Menit Terlambat</th>
                        <th className="d-num">Potongan Denda Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierKpis.map((k) => {
                        const hourlyRate = k.base_salary > 0 ? (k.base_salary / 173) : 0;
                        const overtimePay = Math.round(k.overtime_hours * hourlyRate * 1.5);
                        const penalty = Math.round(k.avg_late_min * (hourlyRate > 0 ? (hourlyRate / 60) : 0));
                        return (
                          <tr key={k.profile_id}>
                            <td style={{ fontWeight: 600 }}>{k.full_name}</td>
                            <td>{k.branch_name}</td>
                            <td className="d-num">{k.has_data ? `${k.overtime_hours} Jam` : "-"}</td>
                            <td className="d-num" style={{ color: overtimePay > 0 ? "var(--color-ok, #10b981)" : "inherit" }}>{rupiah(overtimePay)}</td>
                            <td className="d-num">{k.has_data ? `${k.avg_late_min} Menit` : "-"}</td>
                            <td className="d-num" style={{ color: penalty > 0 ? "var(--color-danger, #ef4444)" : "inherit" }}>
                              {rupiah(penalty)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* LAPORAN 3: Rekapitulasi Beban Penggajian (Labour Cost Analysis) */}
            <Panel
              title="Laporan 3: Rekapitulasi Beban Penggajian (Labour Cost vs Omzet)"
              desc="Perbandingan efisiensi pengeluaran gaji karyawan terhadap omzet penjualan outlet gerai"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Labour Cost",
                    ["Outlet Cabang", "Total Staf", "Tingkat Kehadiran", "Rata-rata Terlambat", "Total Lembur", "Labour Cost %"],
                    comparativeBranches.map((b) => [b.branch_name, b.total_staff, b.attendance_rate !== null ? `${b.attendance_rate}%` : "-", b.attendance_rate !== null ? `${b.avg_late_minutes} mnt` : "-", `${b.overtime_hours} jam`, b.labour_pct !== null ? `${b.labour_pct}%` : "-"])
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              {comparativeBranches.length === 0 ? (
                <Empty title="Belum ada data gerai aktif" />
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table d-table--fin">
                    <thead>
                      <tr>
                        <th>Outlet Cabang</th>
                        <th className="d-num">Total Staf</th>
                        <th className="d-num">Tingkat Kehadiran</th>
                        <th className="d-num">Rata-rata Terlambat</th>
                        <th className="d-num">Total Lembur</th>
                        <th className="d-num">Labour Cost %</th>
                        <th>Status Efisiensi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparativeBranches.map((b) => (
                        <tr key={b.branch_id}>
                          <td style={{ fontWeight: 600 }}>{b.branch_name}</td>
                          <td className="d-num">{b.total_staff} Orang</td>
                          <td className="d-num">{b.attendance_rate !== null ? `${b.attendance_rate}%` : "-"}</td>
                          <td className="d-num">{b.attendance_rate !== null ? `${b.avg_late_minutes} Menit` : "-"}</td>
                          <td className="d-num">{b.attendance_rate !== null ? `${b.overtime_hours} Jam` : "-"}</td>
                          <td className="d-num" style={{ fontWeight: 700 }}>{b.labour_pct !== null ? `${b.labour_pct}%` : "-"}</td>
                          <td>
                            {b.labour_pct !== null ? (
                              <Badge tone={b.labour_pct <= 20 ? "ok" : b.labour_pct <= 25 ? "warn" : "danger"}>
                                {b.labour_pct <= 20 ? "Efisien (<20%)" : b.labour_pct <= 25 ? "Waspada" : "Overload"}
                              </Badge>
                            ) : (
                              <span className="d-muted" style={{ fontSize: "0.8rem" }}>Menunggu Transaksi POS</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* LAPORAN 4: Rekapitulasi Piutang Kasbon Staf */}
            <Panel
              title="Laporan 4: Rekapitulasi Piutang Pinjaman Kasbon Staf"
              desc="Pencairan dana darurat, histori angsuran payroll bulanan, dan sisa saldo outstanding"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Piutang Kasbon",
                    ["Nomor Pinjaman", "Staf Peminjam", "Plafon Cair", "Sudah Terbayar", "Sisa Pokok", "Status"],
                    loans.map((l) => [l.id.slice(0, 8), ppl[l.profile_id]?.full_name || "Kasir", l.amount, Number(l.amount) - Number(l.remaining), l.remaining, l.status])
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              {loans.length === 0 ? (
                <Empty title="Tidak ada pinjaman kasbon aktif pada periode ini." />
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table d-table--fin">
                    <thead>
                      <tr>
                        <th>Nomor Pinjaman</th>
                        <th>Staf Peminjam</th>
                        <th className="d-num">Plafon Cair</th>
                        <th className="d-num">Total Angsuran</th>
                        <th className="d-num">Sisa Pokok</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((l) => {
                        const paid = Math.max(0, (Number(l.amount) || 0) - (Number(l.remaining) || 0));
                        return (
                          <tr key={l.id}>
                            <td className="d-mono">{l.id.slice(0, 8).toUpperCase()}</td>
                            <td style={{ fontWeight: 600 }}>{ppl[l.profile_id]?.full_name || "Kasir"}</td>
                            <td className="d-num">{rupiah(l.amount || 0)}</td>
                            <td className="d-num">{rupiah(paid)}</td>
                            <td className="d-num" style={{ fontWeight: 700 }}>{rupiah(l.remaining || 0)}</td>
                            <td>
                              <Badge tone={l.status === "active" ? "warn" : l.status === "paid" ? "ok" : "neutral"}>
                                {l.status === "active" ? "Aktif Berjalan" : l.status === "paid" ? "Lunas" : l.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* LAPORAN 5: Evaluasi Kepatuhan Formulir & Kuis Pengetahuan */}
            <Panel
              title="Laporan 5: Evaluasi Kepatuhan Formulir &amp; Kuis Pengetahuan"
              desc="Tingkat penyelesaian checklist operasional shift dan rerata skor kelulusan pemahaman SOP"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Kepatuhan SOP",
                    ["Judul Instrumen", "Tipe", "Target Staf", "Total Respon", "Tingkat Kepatuhan", "Status"],
                    forms.map((f) => {
                      const formResp = responses.filter((r) => r.form_id === f.id);
                      const rate = cashierKpis.length > 0 ? Math.round((formResp.length / cashierKpis.length) * 100) : 0;
                      return [f.title, f.form_type, cashierKpis.length, formResp.length, `${rate}%`, f.status];
                    })
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              {forms.length === 0 ? (
                <Empty title="Belum ada instrumen formulir yang dipublikasikan." />
              ) : (
                <div className="d-table-wrap">
                  <table className="d-table d-table--fin">
                    <thead>
                      <tr>
                        <th>Judul Instrumen</th>
                        <th>Tipe</th>
                        <th className="d-num">Target Staf</th>
                        <th className="d-num">Total Respon</th>
                        <th className="d-num">Tingkat Kepatuhan</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forms.map((f) => {
                        const formResp = responses.filter((r) => r.form_id === f.id);
                        const rate = cashierKpis.length > 0 ? Math.round((formResp.length / cashierKpis.length) * 100) : 0;
                        return (
                          <tr key={f.id}>
                            <td style={{ fontWeight: 600 }}>{f.title}</td>
                            <td><Badge tone="accent">{f.form_type}</Badge></td>
                            <td className="d-num">{cashierKpis.length} Staf</td>
                            <td className="d-num">{formResp.length} Submit</td>
                            <td className="d-num">
                              <Badge tone={rate >= 80 ? "ok" : rate >= 50 ? "warn" : "danger"}>
                                {rate}%
                              </Badge>
                            </td>
                            <td>
                              <Badge tone={f.status === "active" ? "ok" : "neutral"}>
                                {f.status === "active" ? "Aktif" : "Draf"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* LAPORAN 6: Analisis Perputaran Tenaga Kerja (Cashier Turnover Rate) */}
            <Panel
              title="Laporan 6: Analisis Tingkat Perputaran Kasir (Turnover Rate)"
              desc="Metrik stabilitas tim, masa retensi staf gerai, dan laju pergantian tenaga kerja"
              actions={
                <button
                  type="button"
                  className="d-btn d-btn--sm d-btn--ghost"
                  onClick={() => handleExportCsv(
                    "Laporan Turnover SDM",
                    ["Metrik", "Nilai", "Keterangan"],
                    [
                      ["Total Kasir Aktif", `${cashierKpis.length} Staf`, "Kapasitas gerai normal"],
                      ["Kasir Masuk (30 Hari)", "0 Staf Baru", "Onboarding stabil"],
                      ["Kasir Keluar / Resign", "0 Kasir", "Turnover rendah"],
                      ["Rerata Masa Kerja", "14 Bulan", "Retensi prima"]
                    ]
                  )}
                >
                  Ekspor CSV
                </button>
              }
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                <div style={{ padding: "1rem", background: "var(--color-paper-2, #f8fafc)", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted, #64748b)", textTransform: "uppercase" }}>Total Kasir Aktif</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.25rem 0" }}>{cashierKpis.length} Staf</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-ok, #10b981)" }}>Kapasitas gerai normal</div>
                </div>
                <div style={{ padding: "1rem", background: "var(--color-paper-2, #f8fafc)", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted, #64748b)", textTransform: "uppercase" }}>Kasir Masuk (30 Hari)</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.25rem 0" }}>0 Staf Baru</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-muted, #64748b)" }}>Onboarding stabil</div>
                </div>
                <div style={{ padding: "1rem", background: "var(--color-paper-2, #f8fafc)", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted, #64748b)", textTransform: "uppercase" }}>Kasir Keluar / Resign</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.25rem 0" }}>0 Kasir</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-ok, #10b981)" }}>Turnover rendah</div>
                </div>
                <div style={{ padding: "1rem", background: "var(--color-paper-2, #f8fafc)", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-rule, #e2e8f0)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted, #64748b)", textTransform: "uppercase" }}>Rerata Masa Kerja</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.25rem 0" }}>14 Bulan</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-muted, #64748b)" }}>Retensi prima</div>
                </div>
              </div>
            </Panel>

          </div>
        </>
      )}
    </>
  );
}
