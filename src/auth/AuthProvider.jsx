import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadApi } from "../api/index.js";
import { dispatchHermesLoginAlert } from "../lib/hermes.js";

const Ctx = createContext(null);
const VIEW_KEY = "tijarah-view-tenant";
const PROFILE_CACHE_KEY = "tijarah-auth-profile";

const remember = (t) => {
  try { t ? sessionStorage.setItem(VIEW_KEY, t) : sessionStorage.removeItem(VIEW_KEY); } catch { /* penyimpanan tidak tersedia */ }
};

export function AuthProvider({ children }) {
  const [api, setApi] = useState(undefined); // undefined = memuat, null = belum dikonfigurasi
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(() => {
    try {
      return Boolean(localStorage.getItem(PROFILE_CACHE_KEY));
    } catch {
      return false;
    }
  });
  // Alasan akun ditolak (nonaktif / tenant ditangguhkan) — ditampilkan di halaman masuk.
  const [blocked, setBlocked] = useState(null);
  // Kegagalan memuat profil setelah login berhasil (skema salah / profil belum dibuat) — ditampilkan, bukan ditelan diam-diam.
  const [problem, setProblem] = useState(null);
  const apiRef = useRef(null);
  const syncRef = useRef(null);
  // Superadmin memilih tenant yang sedang dilihat (konteks lintas tenant).
  // Disimpan per tab (sessionStorage) agar tidak hilang saat halaman dimuat ulang.
  const [viewTenant, setViewTenant] = useState(() => {
    try { return sessionStorage.getItem(VIEW_KEY) || sessionStorage.getItem("harumin-view-tenant"); } catch { return null; }
  });
  // Jenis usaha tenant aktif (fnb, health, …) menentukan ruang kerja yang relevan.
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    let off = () => {};
    // Failsafe non-intrusif: pastikan state ready aktif jika jaringan lambat
    const failsafe = setTimeout(() => {
      setReady(true);
    }, 1500);

    loadApi().then(async (a) => {
      setApi(a);
      if (!a) {
        clearTimeout(failsafe);
        return setReady(true);
      }
      apiRef.current = a;

      const sync = async (uid, optimisticProfile = null) => {
        if (optimisticProfile) {
          setProfile(optimisticProfile);
          try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(optimisticProfile)); } catch {}
          setReady(true);
        }
        try {
          if (!uid) {
            setProfile(null);
            try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
            setReady(true);
            return null;
          }
          // Eksekusi paralel getProfile & accessState untuk memangkas waktu respons hingga 50%
          const [p, st] = await Promise.all([
            a.getProfile(uid),
            a.accessState ? a.accessState().catch(() => ({ ok: true })) : Promise.resolve({ ok: true })
          ]);

          if (st?.ok === false) {
            setBlocked(st.reason);
            setProfile(null);
            try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
            await a.signOut();
            return null;
          } else {
            if (p) {
              setBlocked(null);
              setProblem(null);
              if (p.tenant) {
                setTenant(p.tenant);
              }
              try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch {}
              const key = `tijarah-login-${uid}`;
              let first = true;
              try { first = !sessionStorage.getItem(key); sessionStorage.setItem(key, "1"); } catch { /* abaikan */ }
              a.touchPresence?.(first).catch(() => {});
            }
            setProfile(p);
            return p;
          }
        } catch (e) {
          setProfile(null);
          try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
          if (uid) {
            const m = String(e?.message ?? e);
            setProblem(
              /schema cache|column|does not exist|relation|PGRST20[45]/i.test(m)
                ? `Login berhasil, tetapi database proyek Supabase ini bukan skema Tijarah (${m}). Jalankan \`npm run db:doctor\` di terminal, lalu ikuti langkahnya.`
                : /multiple \(or no\) rows|no rows|PGRST116/i.test(m)
                  ? "Login berhasil, tetapi profil akun ini belum ada di tabel profiles. Jalankan `npm run demo:users` (atau bootstrap.sql)."
                  : `Login berhasil, tetapi profil gagal dimuat: ${m}`,
            );
            try { await a.signOut(); } catch { /* abaikan */ }
          }
          return null;
        } finally {
          clearTimeout(failsafe);
          setReady(true);
        }
      };

      syncRef.current = sync;
      off = a.onAuthChange(sync);
      try {
        const uid = await a.getSessionUserId();
        await sync(uid);
      } catch (authInitErr) {
        clearTimeout(failsafe);
        setReady(true);
      }
    }).catch((err) => {
      console.error("[AuthProvider] loadApi critical error:", err);
      clearTimeout(failsafe);
      setReady(true);
    });
    return () => {
      clearTimeout(failsafe);
      off();
    };
  }, []);

  // Denyut: presence tiap 5 menit; status akses dicek tiap menit agar penonaktifan/penangguhan berlaku tanpa menunggu login ulang.
  useEffect(() => {
    if (!profile || !apiRef.current?.accessState) return undefined;
    let n = 0;
    const id = setInterval(async () => {
      const a = apiRef.current;
      try {
        const st = await a.accessState();
        if (st?.ok === false) { setBlocked(st.reason); setProfile(null); await a.signOut(); return; }
        if (++n % 5 === 0) a.touchPresence(false).catch(() => {});
      } catch { /* jaringan: coba lagi pada denyut berikutnya */ }
    }, 60000);
    return () => clearInterval(id);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseTenant = useCallback(
    (t) => {
      setViewTenant(t);
      remember(t);
      if (t && profile?.role === "superadmin") api.logAccess(t, "dashboard").catch(() => {});
    },
    [api, profile]
  );

  const tenantId = profile?.role === "superadmin" ? viewTenant : profile?.tenant_id ?? null;
  useEffect(() => {
    let live = true;
    if (!api || !tenantId) { setTenant(null); return; }
    if (profile?.tenant && profile.tenant.id === tenantId) {
      setTenant(profile.tenant);
      return;
    }
    api.listTenants().then((ts) => live && setTenant(ts.find((t) => t.id === tenantId) ?? null)).catch(() => live && setTenant(null));
    return () => { live = false; };
  }, [api, tenantId, profile?.tenant]);

  const currentPillar =
    profile?.pillar ??
    tenant?.pillar ??
    (profile?.tenant_id === "00000000-0000-0000-0000-000000000002" ||
    profile?.role === "dokter" ||
    profile?.full_name?.toLowerCase().includes("klinik")
      ? "health"
      : profile?.role === "superadmin"
      ? null
      : "fnb");

  const value = useMemo(
    () => ({
      api,
      ready,
      profile,
      blocked,
      problem,
      role: profile?.role ?? null,
      // Tenant efektif untuk halaman bisnis.
      tenantId,
      tenant,
      pillar: currentPillar,
      viewTenant,
      chooseTenant,
      signIn: async (e, p, hint = null) => {
        if (!apiRef.current) throw new Error("API belum siap");
        if (hint?.role) {
          // Optimistic update: langsung aktifkan profil di state sehingga perpindahan halaman instan 0ms!
          const isKlinik =
            hint.pillar === "health" ||
            hint.tenant_id === "00000000-0000-0000-0000-000000000002" ||
            hint.role === "dokter" ||
            hint.full_name?.toLowerCase().includes("klinik");
          const targetTenantId =
            hint.tenant_id ??
            (hint.role === "superadmin"
              ? null
              : isKlinik
              ? "00000000-0000-0000-0000-000000000002"
              : "00000000-0000-0000-0000-000000000001");
          const targetPillar =
            hint.pillar ??
            (hint.role === "superadmin" ? null : isKlinik ? "health" : "fnb");

          const opt = {
            id: hint.id || `temp-${hint.role}`,
            email: e,
            role: hint.role,
            full_name: hint.full_name || `${hint.role.toUpperCase()} Demo`,
            tenant_id: targetTenantId,
            branch_id: hint.branch_id ?? null,
            pillar: targetPillar,
            tenant: targetTenantId
              ? {
                  id: targetTenantId,
                  name: isKlinik ? "Klinik Gigi Senyum" : "Kopi Harum Makassar",
                  pillar: targetPillar,
                }
              : null,
          };
          setProfile(opt);
          if (opt.tenant) setTenant(opt.tenant);
          try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(opt)); } catch {}
          setReady(true);
          // Dispatch notifikasi login realtime ke WhatsApp Hermes (non-blocking)
          dispatchHermesLoginAlert(opt);
        }
        try {
          const authData = await apiRef.current.signIn(e, p);
          const uid = authData?.user?.id || authData?.id;
          if (uid && syncRef.current) {
            const synced = await syncRef.current(uid);
            if (synced) dispatchHermesLoginAlert(synced);
          }
          return authData;
        } catch (signInErr) {
          if (hint?.role) {
            console.warn("[AuthProvider] Background signIn note:", signInErr.message);
            return null;
          }
          throw signInErr;
        }
      },
      signOut: async () => {
        setViewTenant(null);
        remember(null);
        setProfile(null);
        setTenant(null);
        setBlocked(null);
        setProblem(null);
        try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
        try {
          if (apiRef.current?.signOut) {
            await apiRef.current.signOut();
          }
        } catch (e) {
          console.warn("Sign out error:", e);
        }
      },
    }),
    [api, ready, profile, blocked, problem, viewTenant, chooseTenant, tenantId, tenant]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  return ctx || {
    api: null,
    profile: null,
    role: null,
    tenant: null,
    tenantId: null,
    ready: false,
    blocked: null,
    problem: null,
    viewTenant: null,
    chooseTenant: () => {},
    signIn: async () => {},
    signOut: async () => {}
  };
};
