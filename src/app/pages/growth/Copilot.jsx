import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Field, Stat, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const IDEAS = [
  "Cabang mana yang paling perlu perhatian bulan ini?",
  "Menu apa yang sebaiknya dievaluasi?",
  "Apakah kas saya aman 30 hari ke depan?",
];

export default function Copilot() {
  const { api, tenantId, tenant } = useAuth();
  const [q, setQ] = useState("");
  const [ans, setAns] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copiedLatest, setCopiedLatest] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [search, setSearch] = useState("");
  const a = useAction();

  const logs = useAsync(
    () => api.list("copilot_logs", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 50 }),
    [api, tenantId]
  );
  const use = useAsync(() => api.rpc("ai_usage_summary"), [api, tenantId]);
  const plans = useAsync(() => api.listPlans(), [api]);

  useLive(["copilot_logs", "ai_usage", "tenants", "plans"], () => {
    logs.reload();
    use.reload();
    plans.reload();
  });

  const ask = () => {
    if (!q.trim() || a.busy) return;
    return a.run(async () => {
      const r = await api.copilotAsk(q.trim());
      setAns(r);
      setQ("");
      setCopiedLatest(false);
      await Promise.all([logs.reload(), use.reload()]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, "Analisis Copilot selesai");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
      e.preventDefault();
      ask();
    }
  };

  const reAsk = (questionText) => {
    setQ(questionText);
    const input = document.getElementById("cp-q");
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const copyText = (text, id = null) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      } else {
        setCopiedLatest(true);
        setTimeout(() => setCopiedLatest(false), 2500);
      }
    });
  };

  const toggleExpand = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter riwayat berdasarkan kata kunci pencarian
  const filteredLogs = useMemo(() => {
    const list = logs.data ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (l) => l.question?.toLowerCase().includes(term) || l.answer?.toLowerCase().includes(term)
    );
  }, [logs.data, search]);

  // Sinkronisasi realtime terhadap kuota & log percakapan aktual bulan berjalan
  const currentMonthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthLogsCount = useMemo(() => {
    if (!logs.data || !Array.isArray(logs.data)) return 0;
    return logs.data.filter((l) => l.created_at && l.created_at.startsWith(currentMonthPrefix)).length;
  }, [logs.data, currentMonthPrefix]);

  // Deteksi paket tenant aktif secara realtime
  const tenantPlan = plans.data?.find((p) => p.id === tenant?.plan_id);
  const planCode = tenantPlan?.code || (tenant?.plan_id?.includes("p1") ? "starter" : tenant?.plan_id?.includes("p3") ? "enterprise" : "growth");
  const isEnterprise = planCode === "enterprise" || tenantPlan?.ai_unlimited || use.data?.quota === null;
  const isStarter = planCode === "starter" || (!isEnterprise && tenantPlan?.ai_quota_tokens === 0);

  // Kuota realtime: prioritaskan nilai resmi dari database RPC ai_usage_summary
  const hasDbQuota = use.data && typeof use.data === "object" && "quota" in use.data;
  const quota = hasDbQuota 
    ? use.data.quota 
    : (isEnterprise ? null : isStarter ? 0 : (tenantPlan?.ai_quota_tokens != null ? Number(tenantPlan.ai_quota_tokens) : 250));

  // Selalu gunakan angka aktual terbesar antara RPC ai_usage dan log percakapan riil bulan ini
  const totalCalls = Math.max(use.data?.calls ?? 0, monthLogsCount);
  const usedTokens = Math.max(use.data?.tokens ?? 0, monthLogsCount);
  const remainingQuestions = quota != null ? Math.max(0, quota - usedTokens) : null;
  const isQuotaExhausted = quota !== null && remainingQuestions <= 0;

  const usedPct = quota != null && quota > 0 
    ? (Math.min(100, (usedTokens / quota) * 100)).toFixed(1) 
    : isStarter ? "100" : "0";

  return (
    <>
      <PageHead
        eyebrow="Fitur 2 · Owner Copilot"
        title="Owner Copilot"
        desc="Asisten analisis bisnis pemilik usaha berbasis snapshot angka riil (KPI, kas, menu, stok, void). 1 pertanyaan = 1 token kuota berkurang."
      />

      <div className="d-grid" style={{ gap: "1.5rem" }}>
        <div className="d-stats d-stats--3">
          <Stat
            label="Sisa Kuota Pertanyaan"
            value={isEnterprise ? "Tanpa Batas" : `${remainingQuestions.toLocaleString("id-ID")} Pertanyaan`}
            sub={
              isEnterprise 
                ? "Paket Enterprise (Unlimited Pertanyaan AI)" 
                : isStarter 
                  ? "Paket Starter (0 Kuota AI / bulan)" 
                  : `Dari total kuota ${Number(quota).toLocaleString("id-ID")} / bulan`
            }
          />
          <Stat
            label="Pertanyaan Digunakan"
            value={`${totalCalls.toLocaleString("id-ID")} Pertanyaan`}
            sub="1 pertanyaan mengurangi 1 token"
          />
          <Stat
            label="Persentase Terpakai"
            value={isEnterprise ? "0% (Unlimited)" : `${usedPct}%`}
            sub="Reset otomatis tanggal 1 awal bulan (UTC)"
          />
        </div>

        <Panel title="Tanya Copilot">
          <div className="d-form">
            {isStarter && (
              <div className="d-note d-note--warn" style={{ marginBottom: "1rem" }} role="alert">
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: "0.5rem" }} />
                <strong>Paket Starter (0 Kuota AI):</strong> Toko Anda saat ini menggunakan paket Starter yang tidak menyertakan kuota Copilot AI. Silakan beralih ke <strong>Paket Growth (250 Pertanyaan/Bulan)</strong> atau <strong>Enterprise (Unlimited)</strong> pada menu Langganan.
              </div>
            )}

            {!isStarter && isQuotaExhausted && (
              <div className="d-note d-note--warn" style={{ marginBottom: "1rem" }} role="alert">
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "0.5rem" }} />
                <strong>Kuota Pertanyaan AI Bulan Ini Telah Habis ({totalCalls}/{quota} Pertanyaan):</strong> Kuota Anda akan otomatis di-reset pada tanggal 1 awal bulan depan, atau Anda dapat mengajukan penambahan kuota melalui Superadmin.
              </div>
            )}

            <div className="d-chips" role="group" aria-label="Contoh pertanyaan">
              {IDEAS.map((i) => (
                <button key={i} type="button" className="d-chip" onClick={() => setQ(i)}>
                  {i}
                </button>
              ))}
            </div>

            <Field label="Pertanyaan Bisnis" id="cp-q">
              <textarea
                id="cp-q"
                rows="3"
                maxLength={1000}
                placeholder="Tulis pertanyaan seputar performa cabang, menu terlaris, arus kas, efisiensi bahan, atau rekomendasi..."
                value={q}
                disabled={a.busy || isQuotaExhausted}
                onKeyDown={handleKeyDown}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>

            <div
              className="d-form__actions"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="d-muted" style={{ fontSize: "0.8125rem" }}>
                {a.busy ? "Sedang menganalisis snapshot database..." : "Tekan Enter atau Ctrl+Enter untuk mengirim"}
              </span>
              <button
                type="button"
                className="d-btn d-btn--primary"
                disabled={a.busy || q.trim().length < 3 || isQuotaExhausted}
                onClick={ask}
              >
                {a.busy ? "Menganalisis…" : isQuotaExhausted ? "Kuota Habis" : "Tanya (-1 Kuota)"}
              </button>
            </div>
            <Feedback a={a} />
          </div>

          {ans && (
            <div
              className="d-note"
              role="status"
              style={{
                marginTop: "1.25rem",
                padding: "1.25rem",
                borderRadius: "var(--radius-md, 8px)",
                background: "var(--color-paper-2, #f8fafc)",
                border: "1px solid var(--color-rule, #e2e8f0)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem",
                  paddingBottom: "0.5rem",
                  borderBottom: "1px solid var(--color-rule, #e2e8f0)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ fontSize: "1rem" }}>Hasil Analisis Copilot Terkini</strong>
                  <span
                    className="d-role-chip d-role-chip--plain"
                    style={{ fontSize: "0.75rem", background: "var(--color-rule, #e2e8f0)" }}
                  >
                    -1 Kuota
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {ans.model && (
                    <span className="d-role-chip d-role-chip--plain" style={{ fontSize: "0.75rem" }}>
                      Model: {ans.model}
                    </span>
                  )}
                  <button
                    type="button"
                    className="d-btn d-btn--subtle"
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                    onClick={() => copyText(ans.answer)}
                  >
                    {copiedLatest ? "✓ Tersalin" : "Salin Jawaban"}
                  </button>
                </div>
              </div>

              <p
                className="d-text"
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.65,
                  fontSize: "0.9375rem",
                  color: "var(--color-ink, #0f172a)",
                }}
              >
                {ans.answer}
              </p>

              {ans.snapshot_at && (
                <div
                  className="d-muted"
                  style={{
                    marginTop: "0.75rem",
                    paddingTop: "0.5rem",
                    borderTop: "1px dashed var(--color-rule, #e2e8f0)",
                    fontSize: "0.75rem",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Data snapshot per {dateTime(ans.snapshot_at)}</span>
                  <span>Sumber: Database Tijarah (KPI, Kas, Menu, Stok, Void)</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span>Riwayat Analisis Bisnis</span>
              <span className="d-badge d-badge--neutral" style={{ fontSize: "0.75rem" }}>
                {filteredLogs.length} Tanya Jawab
              </span>
            </div>
          }
        >
          {logs.loading && !logs.data ? (
            <Loading />
          ) : logs.error ? (
            <ErrorNote error={logs.error} onRetry={logs.reload} />
          ) : (logs.data?.length ?? 0) === 0 ? (
            <Empty
              title="Belum ada riwayat pertanyaan"
              desc="Pilih salah satu saran pertanyaan di atas atau ketik pertanyaan seputar bisnis Anda."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  paddingBottom: "0.25rem",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "26rem",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg
                    style={{
                      position: "absolute",
                      left: "0.75rem",
                      width: "15px",
                      height: "15px",
                      color: "var(--color-muted, #94a3b8)",
                      pointerEvents: "none",
                    }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input
                    type="search"
                    placeholder="Cari riwayat pertanyaan atau jawaban..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                      fontSize: "0.875rem",
                      border: "1px solid var(--color-rule, #cbd5e1)",
                      borderRadius: "var(--radius-md, 8px)",
                      background: "var(--color-paper, #ffffff)",
                      color: "var(--color-ink, #0f172a)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    }}
                  />
                </div>
                {search && (
                  <button
                    type="button"
                    className="d-btn d-btn--subtle"
                    style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", borderRadius: "var(--radius-sm, 6px)" }}
                    onClick={() => setSearch("")}
                  >
                    Reset Filter ({filteredLogs.length} hasil)
                  </button>
                )}
              </div>

              <div
                className="d-table-wrap d-table-wrap--contained"
                style={{
                  margin: "0",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--color-rule, #e2e8f0)",
                  overflowX: "auto",
                }}
              >
                <table className="d-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--color-paper-2, #f1f5f9)" }}>
                      <th scope="col" style={{ width: "13%", whiteSpace: "nowrap" }}>WAKTU & BIAYA</th>
                      <th scope="col" style={{ width: "27%" }}>PERTANYAAN OWNER</th>
                      <th scope="col" style={{ width: "45%" }}>HASIL ANALISIS COPILOT</th>
                      <th scope="col" style={{ width: "15%", textAlign: "right" }}>AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, idx) => {
                      const isExpanded = Boolean(expandedRows[l.id]);
                      const isLong = (l.answer?.length ?? 0) > 180;
                      const displayText = isLong && !isExpanded ? `${l.answer.slice(0, 180)}…` : l.answer;

                      return (
                        <tr
                          key={l.id}
                          style={{
                            borderBottom: "1px solid var(--color-rule, #e2e8f0)",
                            background: idx % 2 === 0 ? "transparent" : "var(--color-paper-2, #fafafa)",
                            verticalAlign: "top",
                          }}
                        >
                          <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-ink, #0f172a)" }}>
                              {dateTime(l.created_at)}
                            </div>
                            <div style={{ marginTop: "0.35rem" }}>
                              <span
                                className="d-role-chip d-role-chip--plain"
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.45rem",
                                  background: "var(--color-rule, #e2e8f0)",
                                }}
                              >
                                -1 Kuota
                              </span>
                            </div>
                          </td>

                          <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                            <p
                              style={{
                                margin: 0,
                                fontWeight: 600,
                                fontSize: "0.875rem",
                                color: "var(--color-ink, #0f172a)",
                                lineHeight: 1.45,
                              }}
                            >
                              {l.question}
                            </p>
                          </td>

                          <td style={{ padding: "0.875rem var(--space-md, 1rem)" }}>
                            <div
                              style={{
                                background: "var(--color-paper, #ffffff)",
                                padding: "0.75rem",
                                borderRadius: "var(--radius-sm, 6px)",
                                border: "1px solid var(--color-rule, #e2e8f0)",
                              }}
                            >
                              <p
                                className="d-text"
                                style={{
                                  margin: 0,
                                  whiteSpace: "pre-wrap",
                                  fontSize: "0.8125rem",
                                  lineHeight: 1.6,
                                  color: "var(--color-ink, #334155)",
                                }}
                              >
                                {displayText}
                              </p>
                              {isLong && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(l.id)}
                                  style={{
                                    marginTop: "0.4rem",
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    color: "var(--color-primary, #2563eb)",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                >
                                  {isExpanded ? "▲ Sembunyikan" : "▼ Lihat Selengkapnya"}
                                </button>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: "0.875rem var(--space-md, 1rem)", textAlign: "right" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
                              <button
                                type="button"
                                className="d-btn d-btn--subtle"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "5.5rem", textAlign: "center" }}
                                onClick={() => reAsk(l.question)}
                                title="Ketikkan kembali pertanyaan ini"
                              >
                                Tanya Ulang
                              </button>
                              <button
                                type="button"
                                className="d-btn d-btn--subtle"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "5.5rem", textAlign: "center" }}
                                onClick={() => copyText(l.answer, l.id)}
                              >
                                {copiedId === l.id ? "✓ Tersalin" : "Salin"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
