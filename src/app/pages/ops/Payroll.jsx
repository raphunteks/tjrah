import { printPayslip } from "../../../lib/payslip.js";
import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync, Badge, Empty, Field, Modal } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex } from "../../ops.jsx";
import { getWalletProfile, disbursePayrollBatch } from "../../../api/swallet.js";

const ST = {
  draft: ["Draf", "neutral"],
  pending: ["Menunggu Owner", "warn"],
  approved: ["Disahkan", "ok"],
  rejected: ["Ditolak", "danger"],
  disbursed: ["Dicairkan S-Wallet", "accent"]
};

const ALL_COLS = [
  ["base", "Gaji Pokok"],
  ["allowance", "Tunjangan"],
  ["overtime", "Lembur"],
  ["commission", "Komisi"],
  ["late_penalty", "Denda Telat"],
  ["kasbon", "Kasbon"]
];

export default function Payroll() {
  const { api, role, tenantId, profile, tenant } = useAuth();
  const [sel, setSel] = useState(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  // Checkbox checklist konfigurasi kolom & fitur kasbon (Default: Nonaktif)
  const tenantKey = tenantId || tenant?.id || "default";
  
  const [kasbonEnabled, setKasbonEnabled] = useState(() => {
    try {
      const s = localStorage.getItem(`sdm_kasbon_enabled_${tenantKey}`);
      return s !== null ? JSON.parse(s) : false; // Default nonaktif
    } catch {
      return false;
    }
  });

  const [allowanceEnabled, setAllowanceEnabled] = useState(() => {
    try {
      const s = localStorage.getItem(`sdm_allowance_enabled_${tenantKey}`);
      return s !== null ? JSON.parse(s) : false; // Default nonaktif
    } catch {
      return false;
    }
  });

  const [overtimeEnabled, setOvertimeEnabled] = useState(() => {
    try {
      const s = localStorage.getItem(`sdm_overtime_enabled_${tenantKey}`);
      return s !== null ? JSON.parse(s) : false; // Default nonaktif
    } catch {
      return false;
    }
  });

  const [commissionEnabled, setCommissionEnabled] = useState(() => {
    try {
      const s = localStorage.getItem(`sdm_commission_enabled_${tenantKey}`);
      return s !== null ? JSON.parse(s) : false; // Default nonaktif
    } catch {
      return false;
    }
  });

  const toggleKasbon = (val) => {
    setKasbonEnabled(val);
    try {
      localStorage.setItem(`sdm_kasbon_enabled_${tenantKey}`, JSON.stringify(val));
    } catch { /* storage not available */ }
  };

  const toggleAllowance = (val) => {
    setAllowanceEnabled(val);
    try {
      localStorage.setItem(`sdm_allowance_enabled_${tenantKey}`, JSON.stringify(val));
    } catch { /* storage not available */ }
  };

  const toggleOvertime = (val) => {
    setOvertimeEnabled(val);
    try {
      localStorage.setItem(`sdm_overtime_enabled_${tenantKey}`, JSON.stringify(val));
    } catch { /* storage not available */ }
  };

  const toggleCommission = (val) => {
    setCommissionEnabled(val);
    try {
      localStorage.setItem(`sdm_commission_enabled_${tenantKey}`, JSON.stringify(val));
    } catch { /* storage not available */ }
  };

  const r = useAsync(async () => {
    const [runs, lines, people, loans] = await Promise.all([
      api.list("payroll_runs", { eq: { tenant_id: tenantId }, order: ["period", "desc"] }).catch((e) => {
        console.warn("[payroll] payroll_runs query note:", e.message);
        return [];
      }),
      api.list("payroll_lines", { eq: { tenant_id: tenantId } }).catch((e) => {
        console.warn("[payroll] payroll_lines query note:", e.message);
        return [];
      }),
      api.list("profiles", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("staff_loans", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
    ]);
    return {
      runs: Array.isArray(runs) ? runs : [],
      lines: Array.isArray(lines) ? lines : [],
      people: Array.isArray(people) ? people : [],
      loans: Array.isArray(loans) ? loans : []
    };
  }, [api, tenantId], { key: `payroll@${tenantId}` });

  const a = useAction();
  const [lf, setLf] = useState({ profile_id: "", amount: "", installments: "4", note: "" });
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [disbursePin, setDisbursePin] = useState("");
  const [ownerWallet, setOwnerWallet] = useState(null);

  const openDisburseModal = async () => {
    const w = await getWalletProfile(api, profile?.id || "owner-demo");
    setOwnerWallet(w);
    setDisbursePin("");
    setDisburseOpen(true);
  };

  const ppl = useIndex(r.data?.people);
  const run = r.data?.runs?.find((x) => x.id === (sel ?? r.data?.runs?.[0]?.id));
  const lines = run ? (r.data?.lines ?? []).filter((l) => l.run_id === run.id) : [];
  const editable = run && ["draft", "rejected"].includes(run.status) && can(role, 14, "u");

  const setCell = (l, k, v) => a.run(async () => {
    await api.update("payroll_lines", l.id, { [k]: Number(v) || 0 });
    r.reload();
  });

  const activeCols = ALL_COLS.filter(([k]) => {
    if (k === "allowance") return allowanceEnabled;
    if (k === "overtime") return overtimeEnabled;
    if (k === "commission") return commissionEnabled;
    if (k === "kasbon") return kasbonEnabled;
    return true; // base & late_penalty
  });

  const net = (l) => {
    const base = Number(l.base) || 0;
    const allowance = allowanceEnabled ? (Number(l.allowance) || 0) : 0;
    const overtime = overtimeEnabled ? (Number(l.overtime) || 0) : 0;
    const commission = commissionEnabled ? (Number(l.commission) || 0) : 0;
    const latePenalty = Number(l.late_penalty) || 0;
    const kasbon = kasbonEnabled ? (Number(l.kasbon) || 0) : 0;
    return base + allowance + overtime + commission - latePenalty - kasbon;
  };

  const loansPanel = (r.data && kasbonEnabled) ? (
    <Panel
      title="Buku Besar Kasbon Karyawan"
      meta="Dipotong otomatis di payroll, tertua dulu"
    >
      {!kasbonEnabled ? (
        <div style={{ padding: "1.25rem", textAlign: "center", color: "var(--color-muted, #64748b)" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
            Fitur <strong>Kasbon Karyawan</strong> saat ini sedang <strong>dinonaktifkan</strong> untuk tenant ini.
          </p>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "var(--color-muted, #94a3b8)" }}>
            Aktifkan kembali checkbox checklist &quot;Fitur Kasbon&quot; di bagian atas jika ingin mencatat pinjaman kasbon kasir.
          </p>
          <button
            type="button"
            className="d-btn d-btn--subtle d-btn--sm"
            onClick={() => toggleKasbon(true)}
          >
            Aktifkan Fitur Kasbon
          </button>
        </div>
      ) : (
        <>
          {can(role, 14, "c") && (
            <div className="d-form" style={{ marginBottom: "1rem" }}>
              <Field label="Kasir / Staf" id="ln-p">
                <select
                  id="ln-p"
                  value={lf.profile_id}
                  onChange={(e) => setLf({ ...lf, profile_id: e.target.value })}
                >
                  <option value="">Pilih kasir…</option>
                  {r.data.people
                    .filter((x) => ["gm", "staff", "dokter"].includes(x.role) && x.is_active !== false && x.id !== profile?.id && !(role === "gm" && x.role === "gm"))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.full_name} · {x.role === "staff" ? "Kasir" : x.role.toUpperCase()}
                      </option>
                    ))}
                </select>
              </Field>

              <div className="d-form__row">
                <Field label="Nominal Pinjaman (Rp)" id="ln-a" hint="Maks 50% dari gaji pokok kasir">
                  <input
                    id="ln-a"
                    inputMode="numeric"
                    placeholder="Contoh: 500000"
                    value={lf.amount}
                    onChange={(e) => setLf({ ...lf, amount: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
                <Field label="Tenor Cicilan (Bulan)" id="ln-i" hint="Rentang 1 s.d. 24 bulan">
                  <input
                    id="ln-i"
                    type="number"
                    min="1"
                    max="24"
                    value={lf.installments}
                    onChange={(e) => setLf({ ...lf, installments: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Catatan Peruntukan Pinjaman" id="ln-n">
                <input
                  id="ln-n"
                  placeholder="Misal: Keperluan darurat keluarga..."
                  value={lf.note}
                  onChange={(e) => setLf({ ...lf, note: e.target.value })}
                />
              </Field>

              <div className="d-form__actions">
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  disabled={a.busy || !lf.profile_id || !lf.amount}
                  onClick={() => a.run(async () => {
                    await api.rpc("grant_loan", {
                      p_profile: lf.profile_id,
                      p_amount: Number(lf.amount),
                      p_installments: Number(lf.installments) || 1,
                      p_note: lf.note || null,
                    });
                    setLf({ profile_id: "", amount: "", installments: "4", note: "" });
                    r.reload();
                  }, "Kasbon kasir dicatat dan dijurnal")}
                >
                  Catat Kasbon Baru
                </button>
              </div>
            </div>
          )}

          {r.data.loans.length === 0 ? (
            <Empty title="Belum ada kasbon aktif" desc="Pinjaman kasbon kasir yang aktif akan ditampilkan di sini." />
          ) : (
            <ul className="d-list">
              {r.data.loans.map((l) => (
                <li key={l.id}>
                  <div>
                    <p className="d-list__title">
                      {ppl[l.profile_id]?.full_name} · {rupiah(l.amount)} ({l.installments} bulan)
                    </p>
                    <p className="d-list__meta">
                      Cicilan {rupiah(l.monthly)} / bln · Sisa saldo kewajiban {rupiah(l.remaining)}
                      {l.note && ` · “${l.note}”`}
                    </p>
                  </div>
                  <span className="d-row-actions">
                    <Badge tone={l.status === "active" ? "warn" : l.status === "paid" ? "ok" : "neutral"}>
                      {{ active: "Berjalan", paid: "Lunas", cancelled: "Dibatalkan" }[l.status]}
                    </Badge>
                    {l.status === "active" && Number(l.remaining) === Number(l.amount) && can(role, 14, "u") && (
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        disabled={a.busy}
                        onClick={() => a.run(async () => {
                          await api.rpc("cancel_loan", { p_loan: l.id });
                          r.reload();
                        }, "Kasbon dibatalkan")}
                      >
                        Batalkan
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Feedback a={a} />
    </Panel>
  ) : null;

  return (
    <>
      <PageHead
        eyebrow={`Fitur 14 · ${permOf(role, 14)?.label}`}
        title="Konsolidasi Penggajian & Upah Kasir"
        desc="Disusun GM, disahkan Owner. Penggajian kasir dan staf terintegrasi database."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {/* Checkbox Checklist Kolom Tunjangan, Lembur, Komisi & Kasbon */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              <label
                className="d-check"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: allowanceEnabled ? "var(--color-paper-2, #f1f5f9)" : "transparent",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                }}
              >
                <input
                  type="checkbox"
                  checked={allowanceEnabled}
                  onChange={(e) => toggleAllowance(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Tunjangan</span>
              </label>

              <label
                className="d-check"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: overtimeEnabled ? "var(--color-paper-2, #f1f5f9)" : "transparent",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                }}
              >
                <input
                  type="checkbox"
                  checked={overtimeEnabled}
                  onChange={(e) => toggleOvertime(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Lembur</span>
              </label>

              <label
                className="d-check"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: commissionEnabled ? "var(--color-paper-2, #f1f5f9)" : "transparent",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                }}
              >
                <input
                  type="checkbox"
                  checked={commissionEnabled}
                  onChange={(e) => toggleCommission(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Komisi</span>
              </label>

              <label
                className="d-check"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: kasbonEnabled ? "var(--color-paper-2, #f1f5f9)" : "transparent",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                }}
              >
                <input
                  type="checkbox"
                  checked={kasbonEnabled}
                  onChange={(e) => toggleKasbon(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Fitur Kasbon</span>
              </label>
            </div>

            {can(role, 14, "c") && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="month"
                  className="d-date"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  aria-label="Periode"
                />
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  disabled={a.busy}
                  onClick={() => a.run(async () => {
                    const x = await api.rpc("create_payroll_run", { p_period: `${period}-01` });
                    setSel(x.id);
                    r.reload();
                  }, "Payroll dibuat otomatis dari presensi")}
                >
                  <i className="fa-solid fa-calculator" style={{ marginRight: "0.35rem" }} />
                  Susun Payroll
                </button>
              </div>
            )}
          </div>
        }
      />

      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorNote error={r.error} onRetry={r.reload} />
      ) : r.data.runs.length === 0 ? (
        <div className="d-grid">
          <Empty title="Belum ada periode payroll">
            Pilih periode bulan di atas lalu klik &quot;Susun Payroll&quot; untuk mengagregasi gaji kasir.
          </Empty>
          {loansPanel}
        </div>
      ) : (
        <div className="d-grid">
          <div className="d-chips">
            {r.data.runs.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`d-chip${run?.id === x.id ? " is-on" : ""}`}
                aria-pressed={run?.id === x.id}
                onClick={() => setSel(x.id)}
              >
                {x.period.slice(0, 7)} · {ST[x.status][0]}
              </button>
            ))}
          </div>

          {run && (
            <Panel
              title={`Periode ${run.period.slice(0, 7)}`}
              meta={ST[run.status][0]}
              actions={
                <div style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {editable && (
                    <button
                      type="button"
                      className="d-btn d-btn--primary"
                      disabled={a.busy}
                      onClick={() => a.run(async () => {
                        await api.rpc("submit_payroll", { p_run: run.id });
                        r.reload();
                      }, "Draf payroll diajukan ke Owner untuk disahkan")}
                    >
                      Ajukan ke Owner
                    </button>
                  )}
                  {(run.status === "pending" || run.status === "approved" || role === "owner" || role === "superadmin") && (
                    <button
                      type="button"
                      className="d-btn d-btn--primary"
                      style={{ background: "var(--brand-emerald)", borderColor: "var(--brand-emerald)" }}
                      disabled={a.busy || lines.length === 0}
                      onClick={openDisburseModal}
                    >
                      <i className="fa-solid fa-money-bill-transfer" style={{ marginRight: "0.4rem" }} />
                      Cairkan via S-Wallet
                    </button>
                  )}
                </div>
              }
            >
              <div className="d-table-wrap">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th scope="col">Kasir / Staf</th>
                      {activeCols.map(([k, l]) => (
                        <th key={k} scope="col" className="d-num">{l}</th>
                      ))}
                      <th scope="col" className="d-num">Gaji Bersih</th>
                      <th scope="col"><span className="sr-only">Slip</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{ppl[l.profile_id]?.full_name}</strong>
                          <p className="d-list__meta" style={{ margin: "2px 0 0" }}>
                            {ppl[l.profile_id]?.role === "staff" ? "Kasir" : ppl[l.profile_id]?.role?.toUpperCase()}
                          </p>
                        </td>
                        {activeCols.map(([k]) => (
                          <td key={k} className="d-num">
                            {editable && k !== "kasbon" ? (
                              <input
                                className="d-cell-input"
                                inputMode="numeric"
                                defaultValue={l[k]}
                                aria-label={`${k} ${ppl[l.profile_id]?.full_name}`}
                                onBlur={(e) => Number(e.target.value) !== Number(l[k]) && setCell(l, k, e.target.value)}
                              />
                            ) : (
                              rupiah(l[k])
                            )}
                          </td>
                        ))}
                        <td className="d-num">
                          <strong style={{ color: "var(--color-ok, #059669)" }}>
                            {rupiah(net(l))}
                          </strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--sm"
                            onClick={() => printPayslip({
                              tenant,
                              employee: ppl[l.profile_id],
                              period: run.period,
                              line: l,
                              status: ST[run.status][0]
                            })}
                          >
                            Cetak slip
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="is-total">
                      <td>Total Penggajian</td>
                      {activeCols.map(([k]) => <td key={k} />)}
                      <td className="d-num">
                        <strong>{rupiah(lines.reduce((s, l) => s + net(l), 0))}</strong>
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <Feedback a={a} />
            </Panel>
          )}

          {loansPanel}
        </div>
      )}

      {/* MODAL 1-CLICK BULK PAYROLL DISBURSEMENT VIA S-WALLET */}
      <Modal
        open={disburseOpen}
        title="1-Click Bulk Payroll Disbursement via S-Wallet"
        onClose={() => setDisburseOpen(false)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setDisburseOpen(false)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              style={{ background: "var(--brand-emerald)", borderColor: "var(--brand-emerald)" }}
              disabled={a.busy || (ownerWallet?.balance ?? 0) < lines.reduce((s, l) => s + net(l), 0) || disbursePin.length < 6}
              onClick={() => a.run(async () => {
                const totalAmt = lines.reduce((s, l) => s + net(l), 0);
                const recipients = lines.map((l) => ({
                  id: l.id,
                  profile_id: l.profile_id,
                  name: ppl[l.profile_id]?.full_name,
                  amount: net(l)
                }));
                const res = await disbursePayrollBatch({
                  ownerUserId: profile?.id || "owner-demo",
                  runId: run.id,
                  period: run.period,
                  recipients
                });
                if (!res.ok) throw new Error(res.error || "Gagal mencairkan gaji");
                if (api?.update) {
                  await api.update("payroll_runs", run.id, { status: "disbursed" }).catch(() => {});
                }
                setDisburseOpen(false);
                r.reload();
                return res;
              }, (res) => `Gaji ${res.count} staf (${rupiah(res.total_disbursed)}) berhasil dicairkan ke S-Wallet!`)}
            >
              {a.busy ? "Mencairkan..." : `Cairkan ${rupiah(lines.reduce((s, l) => s + net(l), 0))}`}
            </button>
          </>
        }
      >
        <div className="d-form">
          <p className="d-text" style={{ margin: "0 0 1rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Saldo akan dipotong langsung dari S-Wallet Owner dan dikreditkan detik ini juga ke rekening S-Wallet masing-masing staf tanpa biaya transfer antar bank.
          </p>

          <dl className="pos-sum" style={{ background: "var(--color-paper-2)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
            <div><dt>Periode Payroll</dt><dd><strong>{run?.period?.slice(0, 7)}</strong></dd></div>
            <div><dt>Jumlah Karyawan</dt><dd>{lines.length} staf</dd></div>
            <div className="is-total"><dt>Total Gaji Bersih</dt><dd style={{ color: "var(--brand-emerald)" }}>{rupiah(lines.reduce((s, l) => s + net(l), 0))}</dd></div>
            <div><dt>Saldo S-Wallet Owner</dt><dd>{rupiah(ownerWallet?.balance ?? 0)}</dd></div>
            <div>
              <dt>Status Saldo</dt>
              <dd>
                {(ownerWallet?.balance ?? 0) >= lines.reduce((s, l) => s + net(l), 0) ? (
                  <Badge tone="ok">Saldo Mencukupi</Badge>
                ) : (
                  <Badge tone="danger">Saldo Kurang</Badge>
                )}
              </dd>
            </div>
          </dl>

          {(ownerWallet?.balance ?? 0) < lines.reduce((s, l) => s + net(l), 0) && (
            <p className="d-field__error" style={{ margin: "0.5rem 0" }}>
              Saldo S-Wallet Owner tidak mencukupi untuk pembayaran seluruh karyawan. Silakan top-up saldo S-Wallet terlebih dahulu di menu Akun &gt; S-Wallet.
            </p>
          )}

          <Field label="PIN Finansial Owner (6 Digit)" id="disburse-pin">
            <input
              id="disburse-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Masukkan 6 Digit PIN"
              value={disbursePin}
              onChange={(e) => setDisbursePin(e.target.value.replace(/\D/g, ""))}
              className="swallet-code-input"
              style={{ width: "100%", height: "42px", fontSize: "1.2rem", letterSpacing: "0.2em", textAlign: "center" }}
            />
          </Field>
          <Feedback a={a} />
        </div>
      </Modal>
    </>
  );
}
