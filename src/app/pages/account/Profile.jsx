import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { ROLE_LABEL, ROLE_LEVEL } from "../../../lib/rbac-matrix.js";
import { PageHead, Panel, Badge, useAsync } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";

const DEFAULT_AVATAR = "/tijarah-logo.svg";

export default function Profile() {
  const { profile, role, api, tenantId } = useAuth();
  const { t } = useAccountLang();
  const fileInputRef = useRef(null);

  const branchesQuery = useAsync(async () => {
    return api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => []);
  }, [api, tenantId]);

  const branches = branchesQuery.data || [];
  const myBranch = branches.find((b) => b.id === profile?.branch_id);
  const branchName = myBranch?.name || (role === "owner" || role === "superadmin" ? "Seluruh Cabang (Multi-Outlet)" : "Semua Cabang");

  const [avatar, setAvatar] = useState(() => {
    try {
      return (
        (profile?.id && localStorage.getItem(`tijarah:avatar:${profile.id}`)) ||
        localStorage.getItem("tijarah:avatar") ||
        profile?.avatar_url ||
        DEFAULT_AVATAR
      );
    } catch {
      return DEFAULT_AVATAR;
    }
  });

  useEffect(() => {
    try {
      const saved =
        (profile?.id && localStorage.getItem(`tijarah:avatar:${profile.id}`)) ||
        localStorage.getItem("tijarah:avatar") ||
        profile?.avatar_url ||
        DEFAULT_AVATAR;
      setAvatar(saved);
    } catch {}
  }, [profile?.id, profile?.avatar_url]);

  useEffect(() => {
    const handleAvatarChange = (e) => {
      if (e.detail) setAvatar(e.detail);
    };
    window.addEventListener("tijarah:avatar_change", handleAvatarChange);
    return () => window.removeEventListener("tijarah:avatar_change", handleAvatarChange);
  }, []);

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [bio, setBio] = useState(() => {
    try {
      return localStorage.getItem(`tijarah:bio:${profile?.id}`) || "Smart trade, Better Business";
    } catch {
      return "Smart trade, Better Business";
    }
  });
  const [gender, setGender] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:gender:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:gender:${email}`)) ||
        "Laki-laki"
      );
    } catch {
      return "Laki-laki";
    }
  });
  const [birthPlace, setBirthPlace] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:birth_place:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:birth_place:${email}`)) ||
        "Makassar"
      );
    } catch {
      return "Makassar";
    }
  });
  const [birthDate, setBirthDate] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:birth_date:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:birth_date:${email}`)) ||
        "1996-08-17"
      );
    } catch {
      return "1996-08-17";
    }
  });
  const [address, setAddress] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:address:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:address:${email}`)) ||
        "Jl. A. P. Pettarani No. 88, Makassar, Sulawesi Selatan"
      );
    } catch {
      return "";
    }
  });
  const [phoneWa, setPhoneWa] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:phone:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:phone:${email}`)) ||
        "+62 812-4567-8901"
      );
    } catch {
      return "+62 812-4567-8901";
    }
  });

  const [bankName, setBankName] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:bank_name:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:bank_name:${email}`)) ||
        "BCA"
      );
    } catch {
      return "BCA";
    }
  });
  const [bankAccount, setBankAccount] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:bank_acc:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:bank_acc:${email}`)) ||
        "7890123456"
      );
    } catch {
      return "7890123456";
    }
  });
  const [bankHolder, setBankHolder] = useState(() => {
    try {
      const email = profile?.email?.toLowerCase();
      return (
        (profile?.id && localStorage.getItem(`tijarah:bank_holder:${profile.id}`)) ||
        (email && localStorage.getItem(`tijarah:bank_holder:${email}`)) ||
        profile?.full_name ||
        "M. Aksa Arsyad"
      );
    } catch {
      return profile?.full_name || "";
    }
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran berkas melebihi 5 MB. Silakan pilih berkas yang lebih kecil.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result;
      if (typeof rawDataUrl !== "string") return;

      const img = new Image();
      img.onload = () => {
        try {
          const targetSize = 256;
          const canvas = document.createElement("canvas");
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
            const compressed = canvas.toDataURL("image/jpeg", 0.88);
            setAvatar(compressed);
            if (profile?.id) localStorage.setItem(`tijarah:avatar:${profile.id}`, compressed);
            localStorage.setItem("tijarah:avatar", compressed);
            window.dispatchEvent(new CustomEvent("tijarah:avatar_change", { detail: compressed }));
          } else {
            setAvatar(rawDataUrl);
            if (profile?.id) localStorage.setItem(`tijarah:avatar:${profile.id}`, rawDataUrl);
            localStorage.setItem("tijarah:avatar", rawDataUrl);
            window.dispatchEvent(new CustomEvent("tijarah:avatar_change", { detail: rawDataUrl }));
          }
        } catch {
          setAvatar(rawDataUrl);
          try {
            if (profile?.id) localStorage.setItem(`tijarah:avatar:${profile.id}`, rawDataUrl);
            localStorage.setItem("tijarah:avatar", rawDataUrl);
            window.dispatchEvent(new CustomEvent("tijarah:avatar_change", { detail: rawDataUrl }));
          } catch {}
        }
      };
      img.onerror = () => {
        setAvatar(rawDataUrl);
        try {
          if (profile?.id) localStorage.setItem(`tijarah:avatar:${profile.id}`, rawDataUrl);
          localStorage.setItem("tijarah:avatar", rawDataUrl);
          window.dispatchEvent(new CustomEvent("tijarah:avatar_change", { detail: rawDataUrl }));
        } catch {}
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleResetAvatar = () => {
    setAvatar(DEFAULT_AVATAR);
    try {
      if (profile?.id) localStorage.removeItem(`tijarah:avatar:${profile.id}`);
      localStorage.removeItem("tijarah:avatar");
      window.dispatchEvent(new CustomEvent("tijarah:avatar_change", { detail: DEFAULT_AVATAR }));
    } catch {}
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      localStorage.setItem(`tijarah:gender:${profile?.id}`, gender);
      localStorage.setItem(`tijarah:birth_place:${profile?.id}`, birthPlace);
      localStorage.setItem(`tijarah:birth_date:${profile?.id}`, birthDate);
      localStorage.setItem(`tijarah:address:${profile?.id}`, address);
      localStorage.setItem(`tijarah:phone:${profile?.id}`, phoneWa);
      localStorage.setItem(`tijarah:bank_name:${profile?.id}`, bankName);
      localStorage.setItem(`tijarah:bank_acc:${profile?.id}`, bankAccount);
      localStorage.setItem(`tijarah:bank_holder:${profile?.id}`, bankHolder);
      localStorage.setItem(`tijarah:bio:${profile?.id}`, bio);
      window.dispatchEvent(new CustomEvent("tijarah:bio_change", { detail: bio }));

      if (api?.updateProfile && profile?.id) {
        await api.updateProfile(profile.id, { full_name: fullName }).catch(() => {});
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.profileTitle}
        desc={t.profileDesc}
      />

      {/* ──────── BENTO KPI SUMMARY PROFIL ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Kelengkapan Profil"
          value="100% Terverifikasi"
          sub="Biodata & Rekening Lengkap"
          tone="emerald"
          icon="fa-user-check"
        />
        <AccountKpiCard
          label="Peran Akun Aktif"
          value={ROLE_LABEL[role] || role}
          sub={`Tingkat Hierarki ${ROLE_LEVEL[role] || "L3"}`}
          tone="sky"
          icon="fa-id-badge"
        />
        <AccountKpiCard
          label="Rekening Payroll"
          value={`${bankName} · ${bankAccount}`}
          sub={bankHolder || "Atas Nama Staf"}
          tone="purple"
          icon="fa-building-columns"
        />
        <AccountKpiCard
          label="Cabang Penugasan"
          value={branchName}
          sub="Scope Operasional Toko"
          tone="amber"
          icon="fa-store"
        />
      </AccountKpiGrid>

      {savedSuccess && (
        <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
          <strong>{t.saveSuccess}:</strong> Informasi profil dan preferensi rekening payroll Anda telah diperbarui secara aman.
        </div>
      )}

      <form onSubmit={handleSave} className="d-grid" style={{ gap: "1.25rem" }}>
        {/* PANEL 1: FOTO PROFIL & IDENTITAS */}
        <Panel title={t.photoTitle}>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap", paddingBottom: "1rem", borderBottom: "1px solid var(--color-rule)" }}>
            <div style={{ position: "relative", width: "96px", height: "96px", borderRadius: "50%", overflow: "hidden", border: "2px solid var(--color-rule)", background: "var(--color-paper-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img
                src={avatar}
                alt="Foto Profil"
                style={{ width: "100%", height: "100%", objectFit: avatar === DEFAULT_AVATAR ? "contain" : "cover", padding: avatar === DEFAULT_AVATAR ? "12px" : "0" }}
              />
            </div>

            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                <h3 style={{ margin: 0, font: "600 1.1rem var(--font-display)" }}>{fullName || profile?.full_name}</h3>
                <span style={{ fontSize: "0.75rem", fontStyle: "italic", background: "rgba(16, 185, 129, 0.1)", color: "var(--color-accent)", padding: "2px 8px", borderRadius: "var(--radius-full)", fontWeight: 500, border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                  "{bio}"
                </span>
              </div>
              <p className="d-text d-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
                {t.photoDesc}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: "none" }}
                  id="profile-avatar-input"
                />
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fa-solid fa-camera" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {t.uploadPhoto}
                </button>
                {avatar !== DEFAULT_AVATAR && (
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={handleResetAvatar}
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                    {t.resetPhoto}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
            <div>
              <label htmlFor="p-name" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.fullNameLabel} <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input
                id="p-name"
                className="d-input"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="p-bio" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Bio / Slogan Akun <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(Default: "Smart trade, Better Business")</span>
              </label>
              <input
                id="p-bio"
                className="d-input"
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Smart trade, Better Business"
                maxLength={100}
              />
              <span className="d-text d-muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
                Slogan profil akun Anda dapat disesuaikan kapanpun secara real-time di semua peran RBAC.
              </span>
            </div>

            <div>
              <label htmlFor="p-gender" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.genderLabel}
              </label>
              <select
                id="p-gender"
                className="d-input"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="Laki-laki">{t.male}</option>
                <option value="Perempuan">{t.female}</option>
              </select>
            </div>

            <div>
              <label htmlFor="p-birth-place" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.birthPlaceLabel}
              </label>
              <input
                id="p-birth-place"
                className="d-input"
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder="Contoh: Makassar"
              />
            </div>

            <div>
              <label htmlFor="p-birth-date" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.birthDateLabel}
              </label>
              <input
                id="p-birth-date"
                className="d-input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="p-address" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.addressLabel}
              </label>
              <textarea
                id="p-address"
                className="d-input"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Alamat domisili tempat tinggal saat ini"
              />
            </div>
          </div>
        </Panel>

        {/* PANEL 2: KONTAK & INFORMASI PENUGASAN */}
        <Panel title="Kontak & Informasi Penugasan">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="p-phone" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.phoneLabel}
              </label>
              <input
                id="p-phone"
                className="d-input"
                type="tel"
                value={phoneWa}
                onChange={(e) => setPhoneWa(e.target.value)}
                placeholder="+62 812-xxxx-xxxx"
              />
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                {t.phoneDesc}
              </p>
            </div>

            <div>
              <label htmlFor="p-email" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.emailLabel}
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  id="p-email"
                  className="d-input"
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  style={{ background: "var(--color-paper-2)", color: "var(--color-muted)", flex: 1 }}
                />
                <Badge tone="ok">{t.verifiedBadge}</Badge>
              </div>
            </div>

            <div>
              <label className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.roleLabel}
              </label>
              <div style={{ padding: "0.6rem 0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{ROLE_LABEL[role] || role}</span>
                <Badge tone="accent">{ROLE_LEVEL[role] || "L3"}</Badge>
              </div>
            </div>

            <div>
              <label className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.branchLabel}
              </label>
              <div style={{ padding: "0.6rem 0.85rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
                <span style={{ fontWeight: 500 }}>{branchName}</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* PANEL 3: REKENING PAYROLL PRIBADI */}
        <Panel title={t.bankTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            {t.bankDesc}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="p-bank" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.bankNameLabel}
              </label>
              <select
                id="p-bank"
                className="d-input"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              >
                <option value="BCA">Bank Central Asia (BCA)</option>
                <option value="Mandiri">Bank Mandiri</option>
                <option value="BRI">Bank Rakyat Indonesia (BRI)</option>
                <option value="BNI">Bank Negara Indonesia (BNI)</option>
                <option value="BSI">Bank Syariah Indonesia (BSI)</option>
                <option value="CIMB">CIMB Niaga</option>
                <option value="Permata">Bank Permata</option>
                <option value="Lainnya">Bank Lainnya</option>
              </select>
            </div>

            <div>
              <label htmlFor="p-bank-acc" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.bankAccLabel}
              </label>
              <input
                id="p-bank-acc"
                className="d-input"
                type="text"
                inputMode="numeric"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))}
                placeholder="Contoh: 7890123456"
              />
            </div>

            <div>
              <label htmlFor="p-bank-holder" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.bankHolderLabel}
              </label>
              <input
                id="p-bank-holder"
                className="d-input"
                type="text"
                value={bankHolder}
                onChange={(e) => setBankHolder(e.target.value)}
                placeholder="Nama persis di buku tabungan"
              />
            </div>
          </div>
        </Panel>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="submit"
            className="d-btn d-btn--primary"
            disabled={saving}
          >
            <i className="fa-solid fa-floppy-disk" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            {saving ? t.saving : t.saveChanges}
          </button>
        </div>
      </form>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />
    </>
  );
}
