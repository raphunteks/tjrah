import { useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { permOf, FEATURE_NAME } from "../../../lib/rbac.js";
import { ROLE_LABEL } from "../../../lib/rbac-matrix.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Modal, Field, useAsync, Empty } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";

const KIND = {
  all: "Semua Kategori",
  void: "Void Nota (F6)",
  po: "Purchase Order (F9)",
  sto: "Transfer Stok / STO (F10)",
  payroll: "Payroll Karyawan (F14)",
  leave: "Cuti & Izin (SDM)",
  swap: "Tukar Shift (SDM)",
  loan: "Kasbon Staf (SDM)",
  supplies: "Tijarah Supplies"
};

const KIND_TONE = {
  void: "danger",
  po: "accent",
  sto: "warn",
  payroll: "ok",
  leave: "ok",
  swap: "accent",
  loan: "warn",
  supplies: "accent"
};

const STATUS = {
  pending: ["Menunggu", "warn"],
  approved: ["Disetujui", "ok"],
  rejected: ["Ditolak", "danger"]
};

export default function Approvals() {
  const { api, role, tenantId } = useAuth();
  const [tab, setTab] = useState("pending"); // "pending" | "done"
  const [kindFilter, setKindFilter] = useState("all");

  const r = useAsync(async () => {
    // Fase 2.1: void yang melewati batas waktu GM dinaikkan ke Owner (dipersistenkan di transaksi terpisah dari keputusan).
    try { await api.rpc?.("escalate_stale_approvals", {}); } catch { /* fungsi belum terpasang → abaikan */ }
    const [list, summary] = await Promise.all([
      api.listApprovals({ tenantId, kind: kindFilter }),
      api.approvalSummary ? api.approvalSummary(tenantId) : null,
    ]);
    return { list, summary };
  }, [api, tenantId, kindFilter]);

  useLive(["approvals"], r.reload);

  const [act, setAct] = useState(null); // { item, decision }
  const [detailItem, setDetailItem] = useState(null);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [option, setOption] = useState("waste");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const rawList = r.data?.list ?? [];
  const summary = r.data?.summary ?? {
    total_pending: 0,
    pending_void: 0,
    pending_po: 0,
    pending_sto: 0,
    pending_payroll: 0,
    pending_supplies: 0,
    total_amount_pending: 0
  };

  const rows = useMemo(() => {
    return rawList.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending"));
  }, [rawList, tab]);

  const perm = act ? permOf(role, act.item.feature) : null;

  const openDecision = (item, decision) => {
    setAct({ item, decision });
    setNote("");
    setPin("");
    setOption("waste");
    setErr(null);
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.decideApproval(
        act.item.id,
        act.decision,
        note,
        pin,
        act.item.kind === "void" && act.decision === "approved" ? option : null
      );
      setAct(null);
      r.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Fase 1.5 · Pusat Persetujuan Terpadu"
        title="Pusat Persetujuan"
        desc="Hub otorisasi tunggal lintas 5 alur bisnis: Void Nota (F6), Purchase Order (F9), Transfer Stok / STO (F10), Payroll (F14), dan Supplies (F20)."
        actions={
          <div className="d-seg" role="radiogroup" aria-label="Status">
            <button type="button" role="radio" aria-checked={tab === "pending"} onClick={() => setTab("pending")}>
              Menunggu Keputusan ({summary.total_pending ?? rows.length})
            </button>
            <button type="button" role="radio" aria-checked={tab === "done"} onClick={() => setTab("done")}>
              Riwayat Selesai
            </button>
          </div>
        }
      />

      {/* RINGKASAN REKAP STATISTIK PER KATEGORI (4 JEJER HORIZONTAL DESKTOP) */}
      <section className="d-stats" aria-label="Rekap Persetujuan" style={{ marginBottom: "1.25rem" }}>
        <Stat
          title="Total Menunggu"
          value={summary.total_pending ?? 0}
          note={rupiah(summary.total_amount_pending ?? 0)}
          tone="warn"
        />
        <Stat
          title="Void Kasir (F6)"
          value={summary.pending_void ?? 0}
          note="Otorisasi PIN GM / Owner"
          tone="danger"
        />
        <Stat
          title="Pengadaan & STO"
          value={(summary.pending_po ?? 0) + (summary.pending_sto ?? 0) + (summary.pending_supplies ?? 0)}
          note="PO, Transfer & Supplies"
          tone="accent"
        />
        <Stat
          title="Payroll SDM (F14)"
          value={summary.pending_payroll ?? 0}
          note="Persetujuan gaji karyawan"
          tone="ok"
        />
      </section>

      {/* FILTER KATEGORI / ALUR BISNIS */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {Object.entries(KIND).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`d-btn d-btn--sm ${kindFilter === k ? "d-btn--primary" : "d-btn--ghost"}`}
            onClick={() => setKindFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <Panel title={tab === "pending" ? "Daftar Permintaan Menunggu Otorisasi" : "Arsip Riwayat Keputusan"}>
        {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : rows.length === 0 ? (
          <Empty title={tab === "pending" ? "Semua beres! Tidak ada permintaan yang menunggu otorisasi." : "Belum ada riwayat keputusan persetujuan."} />
        ) : (
          <ul className="d-approvals">
            {rows.map((a) => {
              const p = permOf(role, a.feature);
              const [statusLabel, statusTone] = STATUS[a.status];
              const kindTone = KIND_TONE[a.kind] ?? "accent";
              const escalated = a.status === "pending" && a.kind === "void" && a.detail?.escalated_to_owner;
              const heldByOwner = escalated && role === "gm";   // GM tidak berwenang memutuskan void yang naik ke Owner
              return (
                <li key={a.id} className="d-approval" style={{ padding: "1.1rem 1.25rem" }}>
                  <div className="d-approval__main">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <Badge tone={kindTone}>{KIND[a.kind] ?? a.kind}</Badge>
                      {escalated && <Badge tone="warn">Eskalasi Owner{a.detail?.escalation_reason ? ` · ${a.detail.escalation_reason}` : ""}</Badge>}
                      {a.status === "pending" && (Date.now() - new Date(a.requested_at).getTime()) > 24 * 3600e3 && (
                        <Badge tone="danger">SLA Overdue (&gt; 24 Jam)</Badge>
                      )}
                      <span className="d-mono" style={{ fontSize: "0.85rem", color: "var(--d-muted)" }}>{a.ref}</span>
                      {a.status === "pending" && (Date.now() - new Date(a.requested_at).getTime()) <= 24 * 3600e3 && (
                        <span style={{ fontSize: "0.78rem", color: "var(--color-muted)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <i className="fa-regular fa-clock" />
                          Menunggu {Math.max(1, Math.round((Date.now() - new Date(a.requested_at).getTime()) / 3600e3))} jam
                        </span>
                      )}

                    </div>

                    <p className="d-list__title" style={{ fontSize: "1.05rem", fontWeight: "600", margin: "0 0 0.35rem 0" }}>
                      {a.title}
                    </p>

                    <p className="d-list__meta" style={{ margin: 0 }}>
                      <strong>{a.branch?.name ?? "Seluruh Cabang"}</strong>
                      {a.requester && <> · diajukan oleh <em>{a.requester.full_name}</em> ({ROLE_LABEL[a.requester.role] ?? a.requester.role})</>}
                      <> · {dateTime(a.requested_at)}</>
                    </p>

                    {a.decision_note && (
                      <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.85rem", color: "var(--d-muted)", fontStyle: "italic" }}>
                        Catatan keputusan: "{a.decision_note}" {a.decided_at && <>({dateTime(a.decided_at)})</>}
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    {a.amount != null && (
                      <p className="d-approval__amt" style={{ fontSize: "1.15rem", fontWeight: "700", marginBottom: "0.5rem" }}>
                        {rupiah(a.amount)}
                      </p>
                    )}

                    <div className="d-approval__act" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        onClick={() => setDetailItem(a)}
                      >
                        Detail
                      </button>

                      {heldByOwner ? (
                        <Badge tone="warn">Menunggu Owner</Badge>
                      ) : a.status === "pending" && p?.a ? (
                        <>
                          <button
                            type="button"
                            className="d-btn d-btn--danger-ghost d-btn--sm"
                            onClick={() => openDecision(a, "rejected")}
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            className="d-btn d-btn--primary d-btn--sm"
                            onClick={() => openDecision(a, "approved")}
                          >
                            Setujui
                          </button>
                        </>
                      ) : (
                        <Badge tone={statusTone}>{statusLabel}</Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* MODAL KEPUTUSAN (SETUJUI / TOLAK) */}
      <Modal
        open={Boolean(act)}
        title={act?.decision === "approved" ? "Setujui Permintaan" : "Tolak Permintaan"}
        onClose={() => setAct(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setAct(null)}>Batal</button>
          <button
            type="button"
            className={`d-btn ${act?.decision === "approved" ? "d-btn--primary" : "d-btn--danger"}`}
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Memproses…" : act?.decision === "approved" ? `Konfirmasi Setujui ${act?.item.amount ? rupiah(act?.item.amount) : ""}` : "Konfirmasi Tolak"}
          </button>
        </>}
      >
        {act && (
          <div className="d-form">
            <div style={{ background: "var(--d-surface-alt)", padding: "0.85rem", borderRadius: "6px" }}>
              <p style={{ margin: "0 0 0.25rem 0" }}><strong>{act.item.title}</strong></p>
              <span className="d-mono d-muted" style={{ fontSize: "0.85rem" }}>{act.item.ref} · {KIND[act.item.kind]}</span>
            </div>

            <Field label={act.item.kind === "void" ? "Catatan Alasan Otorisasi (Wajib)" : "Catatan Keputusan (Opsional)"} id="ap-note">
              <textarea id="ap-note" rows="3" value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="Tulis catatan pertimbangan keputusan..." />
            </Field>

            {act.item.detail?.alasan && (
              <p className="d-text" style={{ fontSize: "0.9rem" }}>
                Alasan Pengaju: <strong>{act.item.detail.alasan}</strong>
                {act.item.detail.catatan && <> ({act.item.detail.catatan})</>}
              </p>
            )}

            {act.item.kind === "void" && act.decision === "approved" && (
              <fieldset className="d-fieldset">
                <legend>Perlakuan Bahan Baku yang Terpotong Resep:</legend>
                <label className="d-check">
                  <input type="radio" name="void-opt" checked={option === "restock"} onChange={() => setOption("restock")} />
                  <span><strong>Kembalikan ke Stok</strong> (pesanan belum dimasak / dibatalkan awal)</span>
                </label>
                <label className="d-check">
                  <input type="radio" name="void-opt" checked={option === "waste"} onChange={() => setOption("waste")} />
                  <span><strong>Catat sebagai Waste</strong> (makanan sudah rusak / terbuang)</span>
                </label>
              </fieldset>
            )}

            {perm?.pin && (
              <Field label="PIN Otorisasi Mandatori" id="ap-pin" hint="Approval ber-PIN (GM: 246810)">
                <input
                  id="ap-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 digit PIN"
                />
              </Field>
            )}

            {err && <p className="d-field__error" role="alert">{err}</p>}
          </div>
        )}
      </Modal>

      {/* MODAL RINCIAN DETAIL DOKUMEN */}
      <Modal
        open={Boolean(detailItem)}
        title="Rincian Dokumen Persetujuan"
        onClose={() => setDetailItem(null)}
        footer={<button type="button" className="d-btn d-btn--ghost" onClick={() => setDetailItem(null)}>Tutup</button>}
      >
        {detailItem && (
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <Badge tone={KIND_TONE[detailItem.kind] ?? "accent"}>{KIND[detailItem.kind]}</Badge>
              <h3 style={{ margin: "0.5rem 0 0.25rem 0" }}>{detailItem.title}</h3>
              <p className="d-mono d-muted" style={{ margin: 0 }}>Nomor Referensi: {detailItem.ref}</p>
            </div>

            <div style={{ background: "var(--d-surface-alt)", padding: "1rem", borderRadius: "8px", fontSize: "0.9rem" }}>
              <p style={{ margin: "0 0 0.5rem 0" }}><strong>Cabang:</strong> {detailItem.branch?.name ?? "Semua Cabang"}</p>
              <p style={{ margin: "0 0 0.5rem 0" }}><strong>Diajukan Pada:</strong> {dateTime(detailItem.requested_at)}</p>
              {detailItem.amount != null && <p style={{ margin: "0 0 0.5rem 0" }}><strong>Nominal Total:</strong> {rupiah(detailItem.amount)}</p>}
              {detailItem.decision_note && <p style={{ margin: "0 0 0.5rem 0" }}><strong>Catatan Keputusan:</strong> {detailItem.decision_note}</p>}
            </div>

            {detailItem.detail && Object.keys(detailItem.detail).length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <p className="d-eyebrow">Data Metadata Dokumen</p>
                <pre style={{ background: "rgba(0,0,0,0.3)", padding: "0.75rem", borderRadius: "6px", fontSize: "0.85rem", overflowX: "auto" }}>
                  {JSON.stringify(detailItem.detail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
