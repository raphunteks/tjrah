import { createContext, useContext, useMemo } from "react";

const Ctx = createContext(null);

// `doc` berasal dari tabel blueprint_docs (RLS: hanya Superadmin), bukan dari bundle.
export function BlueprintProvider({ doc, children }) {
  const value = useMemo(() => {
    const { bab1, bab2, bab3, bab4, bab5 } = doc;
    const MODULE_PILLARS = Object.fromEntries(
      bab2.MODULE_LIST.map((m) => [m.id, bab1.PILLARS.filter((p) => p.modules.includes(m.id)).map((p) => p.code)])
    );
    return {
      ...bab1,
      ...bab2,
      ...bab3,
      ...bab4,
      ...bab5,
      MODULE_PILLARS,
      PILLAR_FILTERS: bab1.PILLARS.map((p) => ({ code: p.code, name: p.name })),
      RBAC_CHANGED: bab4.RBAC.reduce((n, row) => n + Object.keys(row.revisi || {}).length, 0),
    };
  }, [doc]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBP() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBP harus di dalam BlueprintProvider");
  return v;
}
