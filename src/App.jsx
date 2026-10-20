import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "./auth/AuthProvider.jsx";
import { useRouter } from "./lib/router.jsx";

const Landing = lazy(() => import("./landing/Landing.jsx"));
const Login = lazy(() => import("./auth/Login.jsx"));
const Register = lazy(() => import("./auth/Register.jsx"));
const ForgotPassword = lazy(() => import("./auth/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./auth/ResetPassword.jsx"));
const AppShell = lazy(() => import("./app/AppShell.jsx"));
const MemberShell = lazy(() => import("./member/MemberShell.jsx"));
const MemberAuth = lazy(() => import("./member/MemberAuth.jsx"));

// Bagian dalam /m yang bukan slug Tenant (Member sudah masuk).
const MEMBER_SECTIONS = new Set(["kartu", "riwayat", "profil", "privasi", "pesan", "reservasi"]);

// Indikator loading non-intrusif: progress bar tipis 2.5px di puncak layar tanpa menutupi halaman atau memblokir interaksi
function TopProgress() {
  return (
    <div
      role="status"
      aria-label="Memuat..."
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2.5px",
        zIndex: 99999,
        background: "rgba(16, 185, 129, 0.15)",
        overflow: "hidden",
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          width: "40%",
          height: "100%",
          background: "linear-gradient(90deg, var(--brand-emerald, #0B5D4B), var(--color-accent, #10B981))",
          borderRadius: "2px",
          animation: "top-progress-pulse 0.75s ease-in-out infinite alternate"
        }}
      />
      <style>{`
        @keyframes top-progress-pulse {
          from { transform: translateX(-60%); }
          to { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}

function Setup() {
  return (
    <main className="setup">
      <h1>Konfigurasi Supabase belum diisi</h1>
      <p>Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code>, lalu build ulang.</p>
    </main>
  );
}

export default function App() {
  const { path, navigate } = useRouter();
  const { ready, api, profile } = useAuth();
  
  // Normalisasi path agar "/masuk/", "/masuk", atau "/login" selalu mulus tanpa hambatan
  const cleanPath = (path || "/").replace(/\/+$/, "") || "/";
  const inApp = cleanPath.startsWith("/app");
  const inMember = cleanPath === "/m" || cleanPath.startsWith("/m/");
  const isMasuk = cleanPath === "/masuk" || cleanPath === "/login";
  const isRegistrasi = cleanPath === "/registrasi" || cleanPath === "/register";
  const isLupaSandi = cleanPath === "/lupa-kata-sandi" || cleanPath === "/forgot-password";
  const isResetSandi = cleanPath === "/reset-password" || cleanPath === "/atur-ulang-kata-sandi";
  const isAuthPage = isMasuk || isRegistrasi || isLupaSandi || isResetSandi;
  const isMember = profile?.role === "member";

  useEffect(() => {
    // Jangan redirect jika ada profil di state atau tersimpan di local cache
    if (ready && inApp && !profile) {
      try {
        const cached = localStorage.getItem("tijarah-auth-profile");
        if (!cached) navigate("/masuk", { replace: true });
      } catch {
        navigate("/masuk", { replace: true });
      }
    }
    if (ready && inApp && isMember) navigate("/m", { replace: true });       // Member tidak memakai dashboard operasional
    if (ready && inMember && profile && !isMember) navigate("/app", { replace: true });
    if (cleanPath === "/login") navigate("/masuk", { replace: true });
  }, [ready, inApp, inMember, cleanPath, profile, isMember, navigate]);

  if (inMember) {
    if (!ready && !profile) return <TopProgress />;
    if (api === null) return <Setup />;
    if (isMember) return <Suspense fallback={<TopProgress />}><MemberShell /></Suspense>;
    if (profile) return <TopProgress />;
    const seg = cleanPath.split("/")[2] ?? "";
    if (!seg || MEMBER_SECTIONS.has(seg)) return <main className="setup"><h1>Buka tautan Member dari tempat usaha Anda</h1><p>Tautan Member berbentuk <code>/m/nama-usaha</code>. Karyawan masuk lewat <a href="/masuk">halaman masuk</a>.</p></main>;
    return <Suspense fallback={<TopProgress />}><MemberAuth slug={seg} /></Suspense>;
  }
  if (cleanPath === "/" || (!inApp && !isAuthPage)) {
    return <Suspense fallback={<TopProgress />}><Landing /></Suspense>;
  }
  if (!ready && !profile) return <TopProgress />;
  if (api === null) return <Setup />;
  if (isMasuk) return <Suspense fallback={<TopProgress />}><Login /></Suspense>;
  if (isRegistrasi) return <Suspense fallback={<TopProgress />}><Register /></Suspense>;
  if (isLupaSandi) return <Suspense fallback={<TopProgress />}><ForgotPassword /></Suspense>;
  if (isResetSandi) return <Suspense fallback={<TopProgress />}><ResetPassword /></Suspense>;
  if (!profile || !api) return <TopProgress />;
  return <Suspense fallback={<TopProgress />}><AppShell /></Suspense>;
}
