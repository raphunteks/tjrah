import { useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";

const INSTRUMENT_TYPES = {
  checklist: { label: "Checklist Shift", icon: "fa-list-check", tone: "ok", desc: "Daftar periksa kepatuhan harian / pembukaan & penutupan gerai." },
  quiz: { label: "Kuis Kompetensi", icon: "fa-pen-to-square", tone: "accent", desc: "Uji pemahaman SOP & sistem POS dengan penilaian skor otomatis." },
  sop: { label: "SOP Standar Toko", icon: "fa-book-open", tone: "ok", desc: "Instruksi kerja resmi yang mewajibkan konfirmasi baca (Acknowledge)." },
  survey: { label: "Survei & Laporan", icon: "fa-chart-column", tone: "neutral", desc: "Audit fasilitas gerai, masukan staf, atau laporan logistik." }
};


export default function KnowledgeForms() {
  const { api, tenantId, role, profile } = useAuth();
  const [tab, setTab] = useState(role === "staff" ? "my_tasks" : "forms"); // "forms" | "sop_library" | "my_tasks"
  const [showBuilder, setShowBuilder] = useState(false);
  const [evalModal, setEvalModal] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [taskAnswers, setTaskAnswers] = useState({});
  const [taskResult, setTaskResult] = useState(null);
  const [busy, setBusy] = useState(false);

  // Form Builder State
  const [builderForm, setBuilderForm] = useState({
    title: "",
    description: "",
    form_type: "checklist",
    target_type: "all",
    target_branch_id: "",
    passing_grade: 80,
    frequency: "daily",
    deadline: "",
    questions: [
      { id: "q1", text: "Periksa kebersihan area kasir & mesin POS", type: "checkbox", required: true }
    ]
  });

  const q = useAsync(async () => {
    const [forms, responses, reads, profiles, branches] = await Promise.all([
      api.list("knowledge_forms", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
      api.list("knowledge_responses", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("knowledge_reads", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("profiles", { eq: { tenant_id: tenantId } }).catch(() => []),
      api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => [])
    ]);
    return { forms, responses, reads, profiles, branches };
  }, [api, tenantId]);

  useLive(["knowledge_forms", "knowledge_responses", "knowledge_reads"], q.reload);

  const forms = q.data?.forms ?? [];
  const responses = q.data?.responses ?? [];
  const reads = q.data?.reads ?? [];
  const profiles = q.data?.profiles ?? [];
  const branches = q.data?.branches ?? [];

  const staffCount = useMemo(
    () => profiles.filter((p) => ["staff", "gm"].includes(p.role) && p.is_active !== false).length,
    [profiles]
  );

  const isManager = ["owner", "gm", "superadmin"].includes(role);

  // Tambah butir pertanyaan di Form Builder
  const addQuestion = (type = "checkbox") => {
    const newId = `q${Date.now()}`;
    setBuilderForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: newId,
          text: "",
          type,
          required: true,
          options: type === "radio" ? ["Pilihan A", "Pilihan B"] : [],
          correct_index: 0,
          points: 25
        }
      ]
    }));
  };

  const removeQuestion = (idx) => {
    setBuilderForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx)
    }));
  };

  const updateQuestion = (idx, patch) => {
    setBuilderForm((prev) => {
      const qList = [...prev.questions];
      qList[idx] = { ...qList[idx], ...patch };
      return { ...prev, questions: qList };
    });
  };

  const handleOpenNewForm = () => {
    setBuilderForm({
      title: "",
      description: "",
      form_type: "checklist",
      target_type: "all",
      target_branch_id: "",
      passing_grade: 80,
      frequency: "daily",
      deadline: "",
      questions: [
        { id: `q_${Date.now()}`, text: "Periksa kebersihan area kasir & mesin POS", type: "checkbox", required: true }
      ]
    });
    setShowBuilder(true);
  };

  const handleEditForm = (f) => {
    setBuilderForm({
      id: f.id,
      title: f.title || "",
      description: f.description || "",
      form_type: f.form_type || "checklist",
      target_type: f.target_type || "all",
      target_branch_id: f.target_branch_id || "",
      passing_grade: f.passing_grade ?? 80,
      frequency: f.frequency || "daily",
      deadline: f.deadline || "",
      questions: Array.isArray(f.questions) && f.questions.length > 0
        ? structuredClone(f.questions)
        : [{ id: `q_${Date.now()}`, text: "Periksa kesiapan", type: "checkbox", required: true }]
    });
    setShowBuilder(true);
  };

  const handleDeleteForm = async (f) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus formulir "${f.title}"?`)) return;
    setBusy(true);
    try {
      try {
        await api.rpc("delete_knowledge_form", { p_id: f.id });
      } catch (e) {
        console.warn("[knowledge] RPC fallback delete:", e.message);
        await api.remove("knowledge_forms", f.id);
      }
      q.reload();
    } catch (err) {
      alert("Gagal menghapus formulir: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Simpan Form Baru atau Ubah Form
  const handleSaveForm = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      try {
        await api.rpc("save_knowledge_form", { p_form: builderForm });
      } catch (rpcErr) {
        console.warn("[knowledge] RPC fallback to insert/update:", rpcErr.message);
        if (builderForm.id) {
          await api.update("knowledge_forms", builderForm.id, {
            ...builderForm,
            updated_at: new Date().toISOString(),
          });
        } else {
          await api.insert("knowledge_forms", {
            ...builderForm,
            tenant_id: tenantId,
            created_by: profile?.id,
            status: "active",
          });
        }
      }
      setShowBuilder(false);
      setBuilderForm({
        title: "",
        description: "",
        form_type: "checklist",
        target_type: "all",
        target_branch_id: "",
        passing_grade: 80,
        frequency: "daily",
        deadline: "",
        questions: [{ id: `q_${Date.now()}`, text: "Periksa kebersihan kasir", type: "checkbox", required: true }]
      });
      q.reload();
    } catch (err) {
      alert("Gagal menyimpan formulir: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Konfirmasi Acknowledge SOP (Saya telah membaca)
  const handleAcknowledgeSop = async (sopId) => {
    setBusy(true);
    try {
      try {
        await api.rpc("acknowledge_sop", { p_sop_id: sopId });
      } catch (rpcErr) {
        console.warn("[knowledge] RPC fallback acknowledge:", rpcErr.message);
        await api.insert("knowledge_reads", {
          tenant_id: tenantId,
          sop_id: sopId,
          profile_id: profile?.id,
          read_at: new Date().toISOString(),
        });
      }
      q.reload();
    } catch (err) {
      alert("Gagal mencatat konfirmasi: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Jawaban Tugas Saya (Kasir View)
  const handleSubmitTask = async (e) => {
    e.preventDefault();
    if (!activeTask) return;
    setBusy(true);
    try {
      let res;
      try {
        res = await api.rpc("submit_knowledge_response", {
          p_form_id: activeTask.id,
          p_answers: taskAnswers
        });
      } catch (rpcErr) {
        console.warn("[knowledge] RPC fallback submit:", rpcErr.message);
        let score = 100;
        let passed = true;
        if (activeTask.form_type === "quiz") {
          let totalPts = 0;
          let earnedPts = 0;
          (activeTask.questions || []).forEach((q) => {
            const pts = Number(q.points) || 25;
            totalPts += pts;
            if (String(taskAnswers[q.id]) === String(q.correct_index)) {
              earnedPts += pts;
            }
          });
          score = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : 100;
          passed = score >= (activeTask.passing_grade || 80);
        }
        res = await api.insert("knowledge_responses", {
          tenant_id: tenantId,
          form_id: activeTask.id,
          profile_id: profile?.id,
          branch_id: profile?.branch_id || null,
          answers: taskAnswers,
          score,
          passed,
          submitted_at: new Date().toISOString(),
        });
      }
      setTaskResult(res);
      q.reload();
    } catch (err) {
      alert("Gagal mengirimkan tugas: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Fase 2 · Pengetahuan &amp; Formulir Staf"
        title="Pengetahuan &amp; Form Staf"
        desc="Pusat perancangan instrumen kerja dinamis, standar operasional prosedur (SOP) digital dengan acknowledge engine, kuis kompetensi, dan checklist shift."
        actions={
          isManager && (
            <button
              type="button"
              className="d-btn d-btn--sm d-btn--primary"
              onClick={handleOpenNewForm}
            >
              + Buat Formulir / Kuis Baru
            </button>
          )
        }
      />

      {/* ──────── TAB SELEKTOR UTAMA (RESPONSIF MOBILE DENGAN SCROLL HALUS) ──────── */}
      <div className="d-subtabs">
        {isManager && (
          <button
            type="button"
            className={`d-btn d-btn--sm ${tab === "forms" ? "d-btn--primary" : "d-btn--ghost"}`}
            onClick={() => setTab("forms")}
          >
            <i className="fa-solid fa-folder-open" style={{ marginRight: "0.4rem" }} />
            Direktori Formulir &amp; Builder ({forms.length})
          </button>
        )}
        <button
          type="button"
          className={`d-btn d-btn--sm ${tab === "sop_library" ? "d-btn--primary" : "d-btn--ghost"}`}
          onClick={() => setTab("sop_library")}
        >
          <i className="fa-solid fa-book-open" style={{ marginRight: "0.4rem" }} />
          Pustaka SOP &amp; Pengetahuan Toko
        </button>
        <button
          type="button"
          className={`d-btn d-btn--sm ${tab === "my_tasks" ? "d-btn--primary" : "d-btn--ghost"}`}
          onClick={() => setTab("my_tasks")}
        >
          <i className="fa-solid fa-clipboard-check" style={{ marginRight: "0.4rem" }} />
          Tugas Saya ({forms.filter((f) => f.status === "active").length})
        </button>
      </div>

      {q.loading && !q.data ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={q.reload} />
      ) : tab === "forms" && isManager ? (
        /* ──────── TAB A: MANAJEMEN FORMULIR & BUILDER (SISI GM/OWNER) ──────── */
        <Panel title="Daftar Formulir, Checklist &amp; Kuis" desc="Instrumen aktif yang ditugaskan ke staf gerai cabang">
          {forms.length === 0 ? (
            <Empty title="Belum ada instrumen formulir yang dibuat">
              Buat formulir pertama Anda untuk memastikan kepatuhan SOP gerai kasir.
            </Empty>
          ) : (
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Judul Instrumen</th>
                    <th>Tipe</th>
                    <th>Frekuensi</th>
                    <th>Target Audiens</th>
                    <th className="d-num">Respons Terkumpul</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((f) => {
                    const typeInfo = INSTRUMENT_TYPES[f.form_type] ?? { label: f.form_type, tone: "neutral", icon: "fa-file-lines" };
                    const formResponses = responses.filter((r) => r.form_id === f.id);
                    const branch = branches.find((b) => b.id === f.target_branch_id);

                    return (
                      <tr key={f.id}>
                        <td>
                          <strong>{f.title}</strong>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{f.description}</div>
                        </td>
                        <td>
                          <Badge tone={typeInfo.tone}>
                            <i className={`fa-solid ${typeInfo.icon}`} style={{ marginRight: "0.3rem" }} />
                            {typeInfo.label}
                          </Badge>
                        </td>
                        <td>
                          <span style={{ textTransform: "capitalize", fontSize: "0.85rem" }}>
                            {f.frequency === "daily" ? "Harian" : f.frequency === "weekly" ? "Mingguan" : "Sekali Saja"}
                          </span>
                        </td>
                        <td>
                          {f.target_type === "all" ? "Seluruh Kasir" : branch?.name ?? "Cabang Tertentu"}
                        </td>
                        <td className="d-num" style={{ fontWeight: 600 }}>
                          {formResponses.length} Staf
                        </td>
                        <td>
                          <Badge tone={f.status === "active" ? "ok" : "neutral"}>
                            {f.status === "active" ? "Aktif" : "Draf"}
                          </Badge>
                        </td>

                        <td className="d-row-actions">
                          <div style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className="d-btn d-btn--sm d-btn--ghost"
                              onClick={() => setEvalModal(f)}
                            >
                              Hasil ({formResponses.length})
                            </button>
                            {isManager && (
                              <>
                                <button
                                  type="button"
                                  className="d-btn d-btn--sm d-btn--ghost"
                                  onClick={() => handleEditForm(f)}
                                >
                                  Ubah
                                </button>
                                <button
                                  type="button"
                                  className="d-btn d-btn--sm d-btn--danger-ghost"
                                  onClick={() => handleDeleteForm(f)}
                                >
                                  Hapus
                                </button>
                              </>
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
      ) : tab === "sop_library" ? (
        /* ──────── TAB B: PUSTAKA SOP & PENGETAHUAN TOKO (ACKNOWLEDGE ENGINE) ──────── */
        <Panel title="Pustaka Standar Operasional Prosedur (SOP)" desc="Instruksi resmi toko yang mewajibkan konfirmasi pemahaman baca dari staf">
          <div style={{ display: "grid", gap: "1rem" }}>
            {forms.filter((f) => f.form_type === "sop").length === 0 ? (
              <Empty title="Belum ada dokumen SOP yang dipublikasikan" />
            ) : (
              forms
                .filter((f) => f.form_type === "sop")
                .map((sop) => {
                  const sopReads = reads.filter((r) => r.sop_id === sop.id);
                  const hasRead = reads.some((r) => r.sop_id === sop.id && r.profile_id === profile?.id);
                  const readPct = staffCount > 0 ? Math.round((sopReads.length / staffCount) * 100) : 100;

                  return (
                    <div
                      key={sop.id}
                      style={{
                        padding: "1.25rem",
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--color-rule)",
                        background: "var(--color-paper-2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{sop.title}</div>
                          <div style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginTop: "0.2rem" }}>
                            {sop.description}
                          </div>
                        </div>
                        <Badge tone={hasRead ? "ok" : "warn"}>
                          {hasRead ? "Telah Membaca" : "Wajib Dibaca"}
                        </Badge>
                      </div>

                      {/* Isi butir SOP */}
                      <div style={{ padding: "0.75rem 1rem", background: "var(--color-paper)", borderRadius: "var(--radius-md)", fontSize: "0.88rem" }}>
                        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                          {sop.questions?.map((q, idx) => (
                            <li key={q.id || idx} style={{ margin: "0.35rem 0" }}>
                              {q.text}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Status Acknowledge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--color-rule)" }}>
                        <div style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>
                          <strong>{sopReads.length} dari {staffCount} staf</strong> telah mengonfirmasi pemahaman ({readPct}% kepatuhan)
                        </div>
                        <div>
                          {!hasRead ? (
                            <button
                              type="button"
                              className="d-btn d-btn--sm d-btn--primary"
                              disabled={busy}
                              onClick={() => handleAcknowledgeSop(sop.id)}
                            >
                              Saya Telah Membaca &amp; Memahami SOP Ini
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.82rem", color: "var(--color-ok)", fontWeight: 600 }}>
                              Terverifikasi di audit jejak sistem
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Panel>
      ) : (
        /* ──────── TAB C: TUGAS SAYA (MOBILE-FIRST VIEW KASIR/STAF L3) ──────── */
        <Panel title="Tugas &amp; Checklist Saya" desc="Lengkapi checklist harian atau kuis kompetensi sebelum mengakhiri shift">
          {forms.filter((f) => f.status === "active").length === 0 ? (
            <Empty title="Tidak ada tugas tertunda saat ini. Semua beres!" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
              {forms
                .filter((f) => f.status === "active")
                .map((f) => {
                  const type = INSTRUMENT_TYPES[f.form_type] ?? { label: f.form_type, icon: "fa-file-lines", tone: "neutral" };
                  const myResponse = responses.find((r) => r.form_id === f.id && r.profile_id === profile?.id);

                  return (
                    <div
                      key={f.id}
                      style={{
                        padding: "1.1rem",
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--color-rule)",
                        background: "var(--color-paper-2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: "1rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <i className={`fa-solid ${type.icon}`} style={{ color: "var(--color-accent)" }} />
                            <span>{f.title}</span>
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "var(--color-muted)", marginTop: "0.2rem" }}>
                            {f.description}
                          </div>
                        </div>
                        <Badge tone={myResponse ? "ok" : "warn"}>
                          {myResponse ? "Selesai" : "Pending"}
                        </Badge>
                      </div>

                      <div style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>
                        Tipe: <strong>{type.label}</strong> · {f.questions?.length ?? 0} Pertanyaan
                        {f.form_type === "quiz" && ` · Batas Lulus: ${f.passing_grade}%`}
                      </div>

                      {myResponse ? (
                        <div style={{ padding: "0.6rem 0.8rem", background: "var(--color-paper)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem" }}>
                          <span style={{ color: "var(--color-ok)", fontWeight: 600 }}>
                            {f.form_type === "quiz"
                              ? `Skor Anda: ${myResponse.score}% (${myResponse.passed ? "LULUS" : "BELUM LULUS"})`
                              : "Checklist berhasil disubmit"}
                          </span>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.15rem" }}>
                            Dikirim pada {dateTime(myResponse.submitted_at)}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="d-btn d-btn--sm d-btn--primary"
                          onClick={() => {
                            setActiveTask(f);

                            setTaskAnswers({});
                            setTaskResult(null);
                          }}
                        >
                          Mulai Kerjakan Tugas →
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </Panel>
      )}

      {/* ──────── MODAL FORM BUILDER (GM / OWNER) ──────── */}
      {showBuilder && (
        <Modal open={showBuilder} title={builderForm.id ? "Ubah Instrumen & Form" : "Penyusun Instrumen & Form"} onClose={() => setShowBuilder(false)}>
          <form onSubmit={handleSaveForm} className="d-form">
            <Field label="Judul Instrumen" id="fb-title">
              <input
                type="text"
                id="fb-title"
                value={builderForm.title}
                onChange={(e) => setBuilderForm({ ...builderForm, title: e.target.value })}
                placeholder="Contoh: Checklist Buka Laci Kasir Pagi..."
                required
              />
            </Field>

            <Field label="Petunjuk Pengisian" id="fb-desc">
              <textarea
                id="fb-desc"
                rows="2"
                value={builderForm.description}
                onChange={(e) => setBuilderForm({ ...builderForm, description: e.target.value })}
                placeholder="Petunjuk teknis untuk kasir..."
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Field label="Tipe Instrumen" id="fb-type">
                <select
                  id="fb-type"
                  value={builderForm.form_type}
                  onChange={(e) => setBuilderForm({ ...builderForm, form_type: e.target.value })}
                >
                  <option value="checklist">Checklist Kepatuhan Shift</option>
                  <option value="quiz">Kuis Kompetensi Berpenilaian</option>
                  <option value="sop">Standar Operasional (SOP)</option>
                  <option value="survey">Survei &amp; Laporan</option>
                </select>
              </Field>

              <Field label="Frekuensi Pengisian" id="fb-freq">
                <select
                  id="fb-freq"
                  value={builderForm.frequency}
                  onChange={(e) => setBuilderForm({ ...builderForm, frequency: e.target.value })}
                >
                  <option value="daily">Harian (Setiap Shift)</option>
                  <option value="weekly">Mingguan</option>
                  <option value="one_off">Sekali Saja (One-off)</option>
                </select>
              </Field>
            </div>

            {builderForm.form_type === "quiz" && (
              <Field label="Passing Grade Kelulusan (%)" id="fb-grade" hint="Skor minimum untuk dinyatakan lulus">
                <input
                  type="number"
                  id="fb-grade"
                  min="50"
                  max="100"
                  value={builderForm.passing_grade}
                  onChange={(e) => setBuilderForm({ ...builderForm, passing_grade: Number(e.target.value) })}
                  required
                />
              </Field>
            )}

            {/* Editor Pertanyaan Dinamis */}
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>Daftar Butir Pertanyaan ({builderForm.questions.length})</strong>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="button" className="d-btn d-btn--sm d-btn--ghost" onClick={() => addQuestion("checkbox")}>
                    + Checklist
                  </button>
                  <button type="button" className="d-btn d-btn--sm d-btn--ghost" onClick={() => addQuestion("radio")}>
                    + Pilihan Ganda (Kuis)
                  </button>
                  <button type="button" className="d-btn d-btn--sm d-btn--ghost" onClick={() => addQuestion("text")}>
                    + Teks
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "300px", overflowY: "auto", paddingRight: "0.25rem" }}>
                {builderForm.questions.map((q, idx) => (
                  <div key={q.id || idx} style={{ padding: "0.75rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Butir #{idx + 1} ({q.type})</span>
                      {builderForm.questions.length > 1 && (
                        <button type="button" className="d-btn d-btn--sm d-btn--danger-ghost" onClick={() => removeQuestion(idx)}>
                          Hapus
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="d-input"
                      value={q.text}
                      onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                      placeholder="Tuliskan pertanyaan atau poin checklist…"
                      required
                    />

                    {/* Jika pilihan ganda / kuis */}
                    {q.type === "radio" && (
                      <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--color-paper)", borderRadius: "var(--radius-sm)" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--color-muted)", display: "block", marginBottom: "0.3rem" }}>
                          Opsi Jawaban &amp; Kunci Jawaban Benar:
                        </span>
                        {(q.options || ["Opsi A", "Opsi B", "Opsi C", "Opsi D"]).map((opt, optIdx) => (
                          <div key={optIdx} style={{ display: "flex", alignItems: "center", gap: "0.4rem", margin: "0.25rem 0" }}>
                            <input
                              type="radio"
                              name={`correct_${q.id}`}
                              checked={q.correct_index === optIdx}
                              onChange={() => updateQuestion(idx, { correct_index: optIdx })}
                            />
                            <input
                              type="text"
                              className="d-input"
                              style={{ fontSize: "0.82rem", padding: "0.2rem 0.4rem" }}
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(q.options || ["Opsi A", "Opsi B", "Opsi C", "Opsi D"])];
                                newOpts[optIdx] = e.target.value;
                                updateQuestion(idx, { options: newOpts });
                              }}
                            />
                            {q.correct_index === optIdx && (
                              <Badge tone="ok" style={{ fontSize: "0.72rem" }}>Kunci Benar</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="d-form__actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setShowBuilder(false)}>
                Batal
              </button>
              <button type="submit" className="d-btn d-btn--primary" disabled={busy || builderForm.title.trim().length < 3}>
                {busy ? "Menyimpan…" : "Publikasikan Instrumen"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ──────── MODAL MENGERJAKAN TUGAS (MOBILE-FIRST KASIR) ──────── */}
      {activeTask && (
        <Modal open={Boolean(activeTask)} title={`${activeTask.title}`} onClose={() => setActiveTask(null)}>
          {taskResult ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
                <i
                  className={`fa-solid ${taskResult.passed ? "fa-circle-check" : "fa-triangle-exclamation"}`}
                  style={{ color: taskResult.passed ? "var(--color-ok)" : "var(--color-warn)" }}
                />
              </div>

              <h3 style={{ margin: "0 0 0.5rem 0" }}>
                {activeTask.form_type === "quiz"
                  ? taskResult.passed
                    ? "Selamat! Anda Lulus Kuis!"
                    : "Belum Mencapai Nilai Kelulusan"
                  : "Checklist Selesai Dikerjakan!"}
              </h3>
              {activeTask.form_type === "quiz" && (
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: taskResult.passed ? "var(--color-ok)" : "var(--color-danger)" }}>
                  Skor Anda: {taskResult.score}%
                </div>
              )}
              <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
                Jawaban Anda telah terkunci permanen di sistem demi kepatuhan audit operasional gerai.
              </p>
              <div style={{ marginTop: "1.25rem" }}>
                <button type="button" className="d-btn d-btn--primary" onClick={() => setActiveTask(null)}>
                  Tutup
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitTask} className="d-form">
              <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", margin: "0 0 0.75rem 0" }}>
                {activeTask.description}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "360px", overflowY: "auto", paddingRight: "0.25rem" }}>
                {activeTask.questions?.map((q, idx) => (
                  <div key={q.id} style={{ padding: "0.75rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
                      {idx + 1}. {q.text} {q.required && <span style={{ color: "var(--color-danger)" }}>*</span>}
                    </div>

                    {q.type === "checkbox" && (
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(taskAnswers[q.id])}
                          onChange={(e) => setTaskAnswers({ ...taskAnswers, [q.id]: e.target.checked })}
                          required={q.required}
                        />
                        <span>Sudah diperiksa &amp; sesuai standar</span>
                      </label>
                    )}

                    {q.type === "radio" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {(q.options || []).map((opt, optIdx) => (
                          <label key={optIdx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}>
                            <input
                              type="radio"
                              name={`ans_${q.id}`}
                              value={optIdx}
                              checked={Number(taskAnswers[q.id]) === optIdx}
                              onChange={() => setTaskAnswers({ ...taskAnswers, [q.id]: optIdx })}
                              required={q.required}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "text" && (
                      <input
                        type="text"
                        className="d-input"
                        value={taskAnswers[q.id] || ""}
                        onChange={(e) => setTaskAnswers({ ...taskAnswers, [q.id]: e.target.value })}
                        required={q.required}
                        placeholder="Ketik jawaban..."
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="d-form__actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" className="d-btn d-btn--ghost" onClick={() => setActiveTask(null)}>
                  Batal
                </button>
                <button type="submit" className="d-btn d-btn--primary" disabled={busy}>
                  {busy ? "Mengirimkan…" : "Submit Jawaban Sekarang"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ──────── MODAL HASIL RESPONS (GM VIEW) ──────── */}
      {evalModal && (
        <Modal open={Boolean(evalModal)} title={`Rekapitulasi Respon · ${evalModal.title}`} onClose={() => setEvalModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ padding: "0.6rem 0.8rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", fontSize: "0.85rem" }}>
              Total Respons Terkumpul: <strong>{responses.filter((r) => r.form_id === evalModal.id).length} Kasir</strong>
            </div>

            <div className="d-table-wrap" style={{ maxHeight: "300px", overflowY: "auto" }}>
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Kasir</th>
                    <th>Waktu Submit</th>
                    {evalModal.form_type === "quiz" && <th className="d-num">Skor</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.filter((r) => r.form_id === evalModal.id).map((r) => {
                    const p = profiles.find((x) => x.id === r.profile_id);
                    return (
                      <tr key={r.id}>
                        <td><strong>{p?.full_name ?? "Kasir"}</strong></td>
                        <td className="d-mono">{dateTime(r.submitted_at)}</td>
                        {evalModal.form_type === "quiz" && (
                          <td className="d-num" style={{ fontWeight: 700 }}>{r.score}%</td>
                        )}
                        <td>
                          <Badge tone={r.passed ? "ok" : "danger"}>
                            {r.passed ? "Lulus" : "Belum Lulus"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
              <button type="button" className="d-btn d-btn--primary" onClick={() => setEvalModal(null)}>
                Tutup Rekap
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
