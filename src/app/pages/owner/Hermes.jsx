import { useAuth } from "../../../auth/AuthProvider.jsx";
import { dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Badge, useAsync, Empty } from "../../ui/index.jsx";

const KIND = { z_report: "Z-Report", low_stock: "Stok minimum", void_alert: "Alert void", margin_drop: "Marjin turun", inquiry: "Pertanyaan" };
const STATUS = { sent: ["Terkirim", "ok"], failed: ["Gagal", "danger"], queued: ["Antre", "neutral"], simulated: ["Simulasi", "warn"] };

export default function Hermes() {
  const { api, tenantId } = useAuth();
  const r = useAsync(() => api.listHermes(tenantId), [api, tenantId]);
  return (
    <>
      <PageHead
        eyebrow="Fitur 2 · Hermes Agent"
        title="Laporan Hermes"
        desc="Pesan yang dikirim Hermes ke WhatsApp dan Discord. Status “Simulasi” berarti webhook Hermes belum dikonfigurasi."
      />
      <Panel>
        {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : r.data.length === 0 ? (
          <Empty title="Belum ada pesan">Hermes mengirim Z-Report saat shift ditutup dan alert saat stok di bawah minimum.</Empty>
        ) : (
          <ol className="d-feed">
            {r.data.map((h) => (
              <li key={h.id} className={`d-feed__item d-feed__item--${h.channel}`}>
                <p className="d-feed__meta">
                  <span className="d-mono">{h.channel === "whatsapp" ? "WhatsApp" : "Discord"} → {h.target}</span>
                  <Badge tone="accent">{KIND[h.kind] ?? h.kind}</Badge>
                  <Badge tone={STATUS[h.status][1]}>{STATUS[h.status][0]}</Badge>
                  <time dateTime={h.created_at}>{dateTime(h.created_at)}</time>
                </p>
                <p className="d-feed__msg">{h.message}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
