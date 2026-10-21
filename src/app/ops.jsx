// Helper bersama ruang kerja operasional (FASE 2).
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { permOf } from "../lib/rbac.js";
import { useAsync } from "./ui/index.jsx";

/**
 * Cabang aktif mengikuti penugasan (Fase 0, sama dengan branch_ok() di SQL):
 * Owner/Superadmin semua cabang · GM semua atau hanya cabang yang ditugaskan · Staff/Dokter cabang utama + penugasan.
 * Hanya satu cabang yang diizinkan → terkunci.
 */
export function useBranch({ warehouses = false } = {}) {
  const { api, profile, role, tenantId } = useAuth();
  
  // Storage key untuk mengingat cabang aktif per tenant di perangkat (PWA / browser)
  const storageKey = tenantId ? `tijarah_active_branch_${tenantId}` : null;
  const [picked, setPicked] = useState(() => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      return localStorage.getItem(storageKey) || null;
    } catch {
      return null;
    }
  });

  const list = useAsync(async () => {
    if (!api || !tenantId) return { branches: [], mine: [] };
    let branches = [];
    try {
      branches = await api.list("branches", { eq: { tenant_id: tenantId }, order: ["name"] });
    } catch (err) {
      console.warn("[useBranch] Gagal memuat daftar cabang:", err?.message);
    }
    // Failsafe: jika branches kosong, bypass langsung ke api.listBranches atau force query Supabase
    if (!branches || branches.length === 0) {
      if (api.listBranches) {
        try {
          branches = await api.listBranches(tenantId);
        } catch (e) {
          console.warn("[useBranch] listBranches fallback:", e?.message);
        }
      }
      if (!branches || branches.length === 0) {
        try {
          branches = await api.list("branches", { eq: { tenant_id: tenantId }, order: ["name"], force: true });
        } catch {}
      }
    }
    const mine = profile?.id
      ? await api.list("member_branches", { eq: { profile_id: profile.id } }).catch(() => [])
      : [];
    return { branches: branches || [], mine: (mine || []).map((m) => m.branch_id) };
  }, [api, tenantId, profile?.id]);

  const all = list.data?.branches ?? [];
  const mine = list.data?.mine ?? [];
  const allowed = role === "superadmin" || role === "owner" ? null
    : role === "gm" ? (mine.length ? mine : null)
    : [...new Set([profile?.branch_id, ...mine].filter(Boolean))];
  const options = all.filter((b) => (warehouses || !b.is_warehouse) && (!allowed || allowed.includes(b.id)));

  const handleSelectBranch = (id) => {
    setPicked(id);
    if (storageKey && typeof window !== "undefined") {
      try {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      } catch {}
    }
  };

  const locked = Boolean(allowed) && options.length <= 1;
  const branchId = (picked && options.some((b) => b.id === picked) ? picked : null)
    ?? (allowed && profile?.branch_id && options.some((b) => b.id === profile.branch_id) ? profile.branch_id : null)
    ?? options[0]?.id
    ?? (role === "staff" || role === "dokter" ? profile?.branch_id : null)
    ?? null;

  // Sinkronkan ke local storage bila otomatis terpilih cabang pertama
  useEffect(() => {
    if (branchId && storageKey && !picked && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, branchId);
      } catch {}
    }
  }, [branchId, storageKey, picked]);

  const branch = all.find((b) => b.id === branchId) ?? null;

  return {
    branchId,
    branch,
    setBranch: handleSelectBranch,
    options,
    locked,
    all,
    loading: list.loading,
    error: list.error,
    reload: list.reload,
  };
}

export function BranchSelect({ b, label = "Cabang" }) {
  if (b.loading && !b.branchId) {
    return <span className="d-role-chip d-role-chip--plain">Memuat lokasi...</span>;
  }
  if (b.locked) return <span className="d-role-chip d-role-chip--plain">{b.branch?.name ?? "…"}</span>;
  if (!b.options || b.options.length === 0) {
    return <span className="d-role-chip d-role-chip--plain">Belum ada cabang</span>;
  }
  return (
    <label className="d-switch">
      <span className="d-switch__label">{label}</span>
      <select value={b.branchId ?? ""} onChange={(e) => b.setBranch(e.target.value)}>
        {!b.branchId && <option value="">-- Pilih {label} --</option>}
        {b.options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </label>
  );
}

/** Muat ulang saat tabel berubah (Supabase Realtime / bus demo). */
export function useLive(tables, reload) {
  const { api } = useAuth();
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    if (!api.subscribe) return;
    let t;
    const fire = () => { clearTimeout(t); t = setTimeout(() => ref.current(), 150); };
    const offs = tables.map((tb) => api.subscribe(tb, null, fire));
    return () => { clearTimeout(t); offs.forEach((o) => o()); };
  }, [api, tables.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Jam yang berdetak (untuk timer SLA dapur). */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Jalankan aksi async dengan status sibuk/galat yang konsisten. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const run = async (fn, okMsg) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await fn();
      if (okMsg) setOk(typeof okMsg === "function" ? okMsg(r) : okMsg);
      return r;
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, ok, run, setError, setOk };
}

export function Feedback({ a }) {
  if (a.error) return <p className="d-field__error" role="alert">{a.error}</p>;
  if (a.ok) return <p className="d-saved" role="status">{a.ok}</p>;
  return null;
}

export function usePerm(feature) {
  const { role } = useAuth();
  return permOf(role, feature) ?? {};
}

/** Peta cepat id → objek. */
export function useIndex(rows) {
  return useMemo(() => Object.fromEntries((rows ?? []).map((r) => [r.id, r])), [rows]);
}

export const qtyFmt = (n, unit) => `${Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${unit ?? ""}`.trim();
export const minutesSince = (iso, now) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
