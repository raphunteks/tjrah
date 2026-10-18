import { lazy, Suspense } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Loading, ErrorNote, useAsync } from "../../ui/index.jsx";

// Kode tampilan boleh publik; ISI blueprint hanya datang dari tabel blueprint_docs (RLS: Superadmin).
const BlueprintDoc = lazy(() => import("../../../blueprint/BlueprintDoc.jsx"));

export default function Blueprint() {
  const { api } = useAuth();
  const r = useAsync(() => api.getBlueprint(), [api]);
  if (r.loading) return <Loading label="Memuat blueprint privat…" />;
  if (r.error) return <ErrorNote error={r.error} onRetry={r.reload} />;
  return (
    <div className="d-bleed">
      <Suspense fallback={<Loading />}>
        <BlueprintDoc doc={r.data} />
      </Suspense>
    </div>
  );
}
